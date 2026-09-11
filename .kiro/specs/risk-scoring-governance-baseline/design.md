# Design Document — Risk Scoring and Governance Baseline

## Feature: risk-scoring-governance-baseline

> **Purpose:** This document describes the **current, as-implemented** architecture of TrustPrompt's Privacy Disclosure Risk Assessment Engine (PDRAE). It is a design-level reference for the behaviors documented in `requirements.md`. No improvements are prescribed.
>
> All behavioral statements reflect the codebase at the time of authoring. Findings and divergences are recorded as observed, not resolved.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Components and Interfaces](#3-components-and-interfaces)
4. [Data Models](#4-data-models)
5. [Scoring Model Tables](#5-scoring-model-tables)
   - 5.1 [BASE_SCORES](#51-base_scores)
   - 5.2 [ENTITY_TIER Mappings](#52-entity_tier-mappings)
   - 5.3 [SENSITIVE_CONTEXT_IDS](#53-sensitive_context_ids)
   - 5.4 [Multiplier Table](#54-multiplier-table)
   - 5.5 [Preliminary Classification Thresholds](#55-preliminary-classification-thresholds)
6. [Governance Rule Reference](#6-governance-rule-reference)
   - 6.1 [Rule 1 — Critical Entity Escalation](#61-rule-1--critical-entity-escalation)
   - 6.2 [Rule 2 — Sensitive Context Co-occurrence](#62-rule-2--sensitive-context-co-occurrence)
   - 6.3 [Rule 3 — Low-Impact Cap](#63-rule-3--Low-Impact Cap)
   - 6.4 [Rule 4 — No Rule Applies](#64-rule-4--no-rule-applies)
7. [Governance Rule Interaction Matrix](#7-governance-rule-interaction-matrix)
8. [Validated Flag State Table](#8-validated-flag-state-table)
9. [Path A Detection Eligibility Table](#9-path-a-detection-eligibility-table)
10. [Known Divergences Between Paths](#10-known-divergences-between-paths)
11. [Scoring Examples](#11-scoring-examples)
12. [Error Handling](#12-error-handling)
13. [Correctness Properties](#13-correctness-properties)
14. [Testing Strategy](#14-testing-strategy)
15. [Implementation Findings Summary](#15-implementation-findings-summary)

---

## Overview

The Privacy Disclosure Risk Assessment Engine (PDRAE) is the core scoring and governance pipeline in TrustPrompt. It takes raw prompt text, runs it through a multi-path detection engine, and produces a final privacy risk level (`none`, `low`, `moderate`, or `high`) with an associated numeric score and the name of the governance rule that determined the outcome.

### Execution Paths

The PDRAE is implemented in two files that share identical scoring logic but differ in how they run and in specific detection behaviors.

| Attribute | Primary Path (Worker) | Fallback Path (Main Thread) |
|---|---|---|
| File | `trust-worker.js` | `scanner.js` |
| Trigger | Launched at extension startup; handles all normal scans | Used only when worker times out or errors |
| `validated` assignment | Tier-based: Tier 1 and Tier 2 = `true`; Tier 3 = `false` (with structural override for `api_key`) | Fail-open: all Path A survivors = `validated: true` |
| Phone context filter | Not present | `isMeasurementContext()` applied to `phone_intl` |
| Path C NLP mode | Fallback only (`window` is undefined in worker; `COMPROMISE_AVAILABLE = false`) | Full NLP mode when `window.nlp` is available |

### Shared Components

Both paths use **identical** implementations of:
- `BASE_SCORES` lookup table
- `ENTITY_TIER` lookup table
- `SENSITIVE_CONTEXT_IDS` set
- `getMultiplier()` — distinct entity-type multiplier
- `preliminaryClass()` — threshold-based preliminary classification
- `evaluateGovernance()` — three-rule governance decision chain
- `finalClass()` — maps governance outcome to final risk level
- `computeRiskScore()` — top-level scoring orchestration
- `mergeAndDedupe()` — cross-path finding deduplication
- `suppressPlaceholders()` — known test-value suppression

Supporting modules shared across both paths:
- `normalizer.js` — `TrustNormalizer.normalize()` producing three text views
- `patterns.js` — `TRUSTPROMPT_PATTERNS`, `BASE_SCORES` (source of truth), entropy helpers, placeholder constants
- `gazetteer.js` — `TrustGazetteer.scan()` (Path B)
- `linguistic-detector.js` — `TrustLinguisticDetector.scan()` (Path C)
- `validator-wrapper.js` — `TrustValidator` (main thread only)
- `validator-wrapper-worker.js` — `TrustValidatorWorker` (worker only)
- `ph-address-db.js` — `PH_ADDRESS_DB.matchesAny()` for address validation

---

## Architecture

### Detection and Scoring Flow

```
rawText
  │
  ▼
TrustNormalizer.normalize(rawText)
  ├── masked       → display-only (shared layer only)
  ├── textRegex    → Path A input (shared + regex layer)
  └── textNLP      → Path B + Path C input (shared + linguistic layer)
  │
  ├── Path A: runPathA(textRegex)
  │     │
  │     ├── Iterate TRUSTPROMPT_PATTERNS
  │     ├── Skip if pattern.regex is null (ph_mobile, nlp_*)
  │     ├── Entropy pre-check (patterns with minEntropy: api_key, jwt)
  │     │     └── Extract value portion; discard if shannonEntropy < threshold
  │     │
  │     ├── [Main thread] TrustValidator.validate(pattern.validate, raw)
  │     │     ├── Returns boolean; false → discard
  │     │     └── Surviving findings: validated = true (always)
  │     │
  │     └── [Worker]     TrustValidatorWorker.validate(pattern.validate, raw)
  │           ├── Returns { passed, tier }; passed=false → discard
  │           ├── validated = (tier !== "3_regex_only")
  │           └── If validated=false AND pattern.structuralValidate(raw)=true
  │                 → validated = true (api_key vendor-prefix override)
  │
  ├── Path B: TrustGazetteer.scan(textNLP)
  │     ├── B1: runGazetteerScan() — pre-compiled combined regex per category
  │     │     └── medical / financial / nationality_religion
  │     ├── B2: runTriggerScan() — ~35 triggers, Levenshtein ≥ 0.80
  │     │     └── Extract value span (max 8 words, stops at stop-word)
  │     └── B3: grammarCheck() — heuristic confirmation of extracted span
  │
  └── Path C: TrustLinguisticDetector.scan(textNLP)
        ├── COMPROMISE_AVAILABLE check (false in worker: window undefined)
        ├── Full NLP mode (compromise.js present): while-loops, multiple matches
        └── Fallback mode (compromise.js absent): single exec() per entity type
  │
  ▼
mergeAndDedupe(pathA, pathB, pathC)
  └── Key: rawMatch.trim().toLowerCase()
      When duplicate: higher RISK_ORDER[f.risk] wins
  │
  ▼
suppressPlaceholders(merged)
  ├── PLACEHOLDER_SUPPRESSIONS lookup (per patternId, normalized value)
  └── PLACEHOLDER_PATTERNS structural regexes
  │
  ▼
computeRiskScore(findings)
  │
  ├── Step 1: Filter scorable: BASE_SCORES[f.patternId] > 0
  │     └── Empty scorable → return { score:0, riskLevel:"none", governance:"none" }
  │
  ├── Step 2: Deduplicate by patternId, sum one base score per distinct type
  │
  ├── Step 3: preScore = baseTotal × getMultiplier(distinctTypeCount)
  │
  ├── Step 4: preliminary = preliminaryClass(preScore)
  │
  ├── Step 5: governance = evaluateGovernance(ALL findings, preliminary)
  │     └── Receives full findings array including non-scorable (e.g. contextual)
  │
  └── Step 6: riskLevel = finalClass(preliminary, governance)
  │
  ▼
Return { score, riskLevel, governance }
```

### Text Normalization Detail

`TrustNormalizer.normalize()` in `normalizer.js` produces three views from the same input:

| View | Used by | Key transformations (beyond shared layer) |
|---|---|---|
| `masked` | Display (normalisedText in result) | Shared layer only: NFKC, invisible char strip, CRLF→LF, trim |
| `textRegex` | Path A | Shared + ASCII punctuation normalization + digit-separator sentinel protection + whitespace collapse + ALL-CAPS guard |
| `textNLP` | Path B, Path C | Shared + ASCII punctuation normalization + full whitespace collapse + sentence boundary injection + sentence case estimation + ALL-CAPS guard |

The ALL-CAPS guard fires when: `text.length > 10` AND `(uppercase alpha count / total alpha count) > 0.70`. Suppressed for strings matching `/^[A-Z]{1,4}[^a-z]*$/` (short tokens like "TIN", "API").

---

## Components and Interfaces

This section documents the public API surface of each module as currently implemented. No improvements are implied.

### TrustNormalizer (`normalizer.js`)

**Public method:** `TrustNormalizer.normalize(rawText: string)`

**Returns:**
```
{
  masked: string,        // display-safe text (shared layer only)
  textRegex: string,     // Path A input
  textNLP: string,       // Path B and Path C input
  wasCapsConverted: boolean  // true if ALL-CAPS guard fired
}
```

**Consumed by:** `scanner.js` and `trust-worker.js` at the start of every scan.

---

### TrustValidator (`validator-wrapper.js`) — Main Thread Only

**Public method:** `TrustValidator.validate(validatorName: string|null, rawMatch: string): boolean`

- Returns `true` unconditionally when `validatorName` is `null` (fail-open).
- Returns `true` or `false` based on the named validator.js function when `validatorName` is a string.
- All surviving findings from the main-thread path receive `validated: true`.

**Consumed by:** `scanner.js → runPathA()`

---

### TrustValidatorWorker (`validator-wrapper-worker.js`) — Worker Only

**Public method:** `TrustValidatorWorker.validate(validatorName: string|null, rawMatch: string): { passed: boolean, tier: string }`

- `tier` values: `"1_gazetteer"`, `"2_structural"`, `"3_regex_only"`.
- Findings with `tier === "3_regex_only"` receive `validated: false` unless the `api_key` structural override fires.

**Consumed by:** `trust-worker.js → runPathA()`

---

### TrustGazetteer (`gazetteer.js`)

**Public method:** `TrustGazetteer.scan(textNLP: string): Finding[]`

Executes three sub-steps:
- **B1** `runGazetteerScan()` — exact phrase matching against pre-compiled category regexes
- **B2** `runTriggerScan()` — fuzzy trigger matching (Levenshtein ≥ 0.80) + value extraction
- **B3** `grammarCheck()` — heuristic confirmation of extracted value spans

**Returns:** Array of findings with `source: "B1_gazetteer"` or `source: "B2_trigger"`. All Path B findings have `validated: false` (no `validated` field set to `true`).

**Consumed by:** `scanner.js → scan()` and `trust-worker.js → self.onmessage`

---

### TrustLinguisticDetector (`linguistic-detector.js`)

**Public method:** `TrustLinguisticDetector.scan(textNLP: string): Finding[]`

Operates in one of two modes determined at module initialization:
- **Full NLP mode** — when `window.nlp` (compromise.js) is available; uses `while` loops for multi-match extraction.
- **Fallback mode** — when `window` is `undefined` (Web Worker context); uses single `exec()` per entity type.

**Returns:** Array of findings with `source: "C_linguistic"`, `risk: "low"`, `validated: false`.

**Consumed by:** `scanner.js → scan()` and `trust-worker.js → self.onmessage`. Wrapped in try/catch — exceptions produce an empty array rather than propagating.

---

### computeRiskScore (`scanner.js`, `trust-worker.js`)

**Signature:** `computeRiskScore(findings: Finding[]): { score: number, riskLevel: string, governance: string }`

Top-level scoring orchestration. Accepts the merged-and-suppressed findings array. Executes Steps 1–6 of the scoring pipeline (filter scorable → deduplicate by patternId → multiply → preliminary class → governance → final class).

---

### evaluateGovernance (`scanner.js`, `trust-worker.js`)

**Signature:** `evaluateGovernance(findings: Finding[], preliminary: string): { rule: string, result: string|null }`

Evaluates governance rules in strict cascading order (Rule 1 → Rule 2 → Rule 3 → Rule 4). Returns on first match. The `rule` field in the return value is the audit-trail identifier; `result` is the governance-adjusted risk level string (`null` for Rule 3 and Rule 4 — final level is derived from preliminary by `finalClass()`).

---

### finalClass (`scanner.js`, `trust-worker.js`)

**Signature:** `finalClass(preliminary: string, governance: { rule: string, result: string|null }): string`

Maps governance outcome to the final risk level string (`"none"`, `"low"`, `"moderate"`, `"high"`).

---

### getMultiplier (`scanner.js`, `trust-worker.js`)

**Signature:** `getMultiplier(distinctTypeCount: number): number`

Returns the distinct entity-type multiplier for a given count of unique scorable patternIds. See [Section 5.4](#54-multiplier-table) for the exact table.

---

### mergeAndDedupe (`scanner.js`, `trust-worker.js`)

**Signature:** `mergeAndDedupe(pathA: Finding[], pathB: Finding[], pathC: Finding[]): Finding[]`

Deduplicates across all three path arrays by `rawMatch.trim().toLowerCase()`. When the same raw match appears in multiple paths, the finding with the higher `RISK_ORDER[f.risk]` value is retained.

---

### suppressPlaceholders (`scanner.js`, `trust-worker.js`)

**Signature:** `suppressPlaceholders(findings: Finding[]): Finding[]`

Removes findings that match known placeholder values or structural placeholder patterns. See RSG-005 in requirements.md for the full suppression list.

---

### PH_ADDRESS_DB (`ph-address-db.js`)

**Public method:** `PH_ADDRESS_DB.matchesAny(span: string): boolean`

Gazetteer lookup for Philippine place names used by Path A (`ph_address` validation) and Path B B3 grammar check (`trigger_location`).

---

## Data Models

### Finding Object

The common structure produced by all three detection paths and consumed by merge, suppression, and scoring functions.

```
{
  patternId:   string,   // e.g. "email", "gazetteer_medical", "nlp_person_name"
  label:       string,   // human-readable label (e.g. "Email Address")
  risk:        string,   // "none" | "low" | "moderate" | "high"
                         //   from patterns.js (Path A) or trigger entry (Path B)
                         //   always "low" for Path C
  rawMatch:    string,   // original matched text
  safeVersion: string,   // redacted replacement (from pattern.sanitize or "[REDACTED]")
  validated:   boolean,  // true = passed structural/mathematical confirmation
                         //   false = regex-shape only, NLP-inferred, or Tier 3
  source:      string    // "A_regex" | "B1_gazetteer" | "B2_trigger" | "C_linguistic"
}
```

**Note:** The `reason` field from `patterns.js` is NOT copied into finding objects by either execution path. See Finding RSG-042.

---

### computeRiskScore Return Object

```
{
  score:      number,   // rounded pre-governance score: Math.round(preScore * 100) / 100
  riskLevel:  string,   // final risk level: "none" | "low" | "moderate" | "high"
  governance: string    // governance rule that determined the outcome:
                        //   "critical_entity" | "sensitive_context" |
                        //   "low_impact_cap" | "none"
}
```

---

### evaluateGovernance Return Object

```
{
  rule:   string,       // "critical_entity" | "sensitive_context" |
                        //   "low_impact_cap" | "none"
  result: string|null   // "high" (Rule 1), raised level (Rule 2), null (Rule 3 or Rule 4)
}
```

---

### BASE_SCORES

A plain object (frozen) mapping `patternId` strings to integer base scores. Defined identically in `scanner.js` and `trust-worker.js`. Any patternId not present evaluates to `0` via `?? 0`. See [Section 5.1](#51-base_scores) for the full table.

---

### ENTITY_TIER

A plain object mapping `patternId` strings to tier strings (`"critical"`, `"significant"`, `"limited"`, `"container"`). Defined identically in `scanner.js` and `trust-worker.js`. PatternIds not present evaluate to `undefined`. See [Section 5.2](#52-entity_tier-mappings) for the full table.

---

### SENSITIVE_CONTEXT_IDS

A `Set<string>` containing the patternIds that qualify as sensitive context for Governance Rule 2. Defined identically in `scanner.js` and `trust-worker.js`. See [Section 5.3](#53-sensitive_context_ids) for the exact members.

---

### RISK_ORDER

An object used for ordinal comparison of risk level strings:

```javascript
{ none: 0, low: 1, moderate: 2, high: 3 }
```

Used in `mergeAndDedupe()` (conflict resolution) and `evaluateGovernance()` (Rule 2 raise logic).

---

### PLACEHOLDER_SUPPRESSIONS

A nested object keyed by patternId, then by normalized value string. Used by `suppressPlaceholders()` to drop known test-fixture values (Stripe test cards, AWS documentation example keys, jwt.io default token). See RSG-005 in requirements.md for the exact entries.

---

## 5. Scoring Model Tables

### 5.1 BASE_SCORES

Exact values from `scanner.js` and `trust-worker.js` (identical in both). Any patternId not present evaluates to `0` via `?? 0`.

| patternId | Base Score | Impact Category |
|---|---|---|
| `credit_card` | 10 | Critical |
| `jwt` | 10 | Critical |
| `api_key` | 10 | Critical |
| `id_label` | 10 | Critical |
| `email` | 5 | Significant |
| `ph_mobile` | 5 | Significant |
| `phone_intl` | 5 | Significant |
| `ph_address` | 5 | Significant |
| `ipv4` | 2 | Limited |
| `ipv6` | 2 | Limited |
| `mac_address` | 2 | Limited |
| `personal_label` | 2 | Limited |
| `trigger_person_name` | 2 | Limited |
| `trigger_age` | 2 | Limited |
| `trigger_dob` | 2 | Limited |
| `trigger_employer` | 2 | Limited |
| `trigger_location` | 2 | Limited |
| `trigger_health` | 0 | Contextual |
| `trigger_financial` | 0 | Contextual |
| `gazetteer_medical` | 0| Contextual |
| `gazetteer_financial` | 0 | Contextual |
| `nlp_person_name` | 2 | Limited |
| `nlp_job_title` | 2 | Limited |
| `nlp_organization` | 2 | Limited |
| `source_code` | 5 | Significant |

> **Finding RSG-050/RSG-051:** `gazetteer_nationality_religion` and `trigger_religion` are absent from `BASE_SCORES`. Their effective score is `0` via nullish coalescing.

### 5.2 ENTITY_TIER Mappings

Exact values from `scanner.js` and `trust-worker.js` (identical in both). Used by governance rules.

| Tier | patternIds | Count |
|---|---|---|
| `"critical"` | `credit_card`, `jwt`, `api_key`, `id_label` | 4 |
| `"significant"` | `email`, `ph_mobile`, `phone_intl`, `ph_address`, `souce_code` | 5 |
| `"limited"` | `ipv4`, `ipv6`, `mac_address`, `personal_label`, `trigger_person_name`, `trigger_age`, `trigger_dob`, `trigger_employer`, `trigger_location` | 9 | 
| `"limited"` |`trigger_health`, `trigger_financial`, `gazetteer_medical`, `gazetteer_financial`,  | 4 |

<!-- -----to be replaced with ethnic -->
| **undefined** | `gazetteer_nationality_religion`, `trigger_religion` (absent from table) | 2 |



> **Finding RSG-050/RSG-051:** `gazetteer_nationality_religion` and `trigger_religion` evaluate to `ENTITY_TIER[id] === undefined`. Under the current Low-Impact Cap logic (Rule 3), these findings have effective score 0 and are excluded from `scoredFindings`. They no longer prevent Rule 3 from firing. They remain absent from `SENSITIVE_CONTEXT_IDS` and do not contribute to Rule 2.

### 5.3 SENSITIVE_CONTEXT_IDS

The exact four-member set used by Rule 2. Identical in both `scanner.js` and `trust-worker.js`.

```
new Set([
  "gazetteer_medical",
  "gazetteer_financial",
  "trigger_health",
  "trigger_financial"
])
```

> `gazetteer_nationality_religion` and `gazetteer_nationality_*` are **not** in this set. Nationality/religion findings do not trigger Rule 2.

### 5.4 Multiplier Table

Applied to the summed base score. The count is the number of **distinct scorable patternIds** (not instance count).

| Distinct scorable patternId count | Multiplier | Diversity label |
|---|---|---|
| 1 | × 1.00 | Single-type |
| 2 | × 1.20 | Limited multi-type |
| 3 | × 1.40 | Moderate multi-type |
| 4 | × 1.70 | High multi-type |
| ≥ 5 | × 2.00 | Extensive multi-type |

**Formula:** `preScore = (Σ BASE_SCORES per distinct scorable patternId) × getMultiplier(distinctTypeCount)`

**Score rounding:** `Math.round(preScore * 100) / 100` (two decimal places via integer rounding).

### 5.5 Preliminary Classification Thresholds

Implemented in `preliminaryClass(score)`. Uses strict `>=` comparisons evaluated in descending order.

| Pre-governance score range | Preliminary classification |
|---|---|
| `>= 10` | `"high"` |
| `>= 5` and `< 10` | `"moderate"` |
| `>= 2` and `< 5` | `"low"` |
| `< 2` (or 0) | `"none"` |

---

## 6. Governance Rule Reference

Governance rules are evaluated in `evaluateGovernance(findings, preliminary)`. The function receives the **full merged-and-suppressed findings array** (including non-scorable findings like `source_code`). Rules are evaluated as a cascading `if / else if` chain — only the first matching rule applies.

### 6.1 Rule 1 — Critical Entity Escalation

**Condition:**
```javascript
findings.some(f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true)
```

**Input set:** ALL findings (scorable and non-scorable)

**Effect:** Returns `{ rule: "critical_entity", result: "high" }`. `finalClass()` returns `"high"` unconditionally.

**Precedence:** Checked first. If it fires, Rules 2 and 3 are never evaluated.

**Does NOT require** a specific preliminary score. A single validated critical entity escalates to `"high"` regardless of the pre-governance score.

**Fires on:**
- `api_key` with a vendor-prefix structural match (worker path — `structuralValidateApiKey()` override sets `validated: true`)
- `api_key` with label-prefix match on main thread (fail-open validator returns `true`)
- `jwt` with structural JSON-parse confirmation (Tier 2, worker and main thread both yield `validated: true`)
- `credit_card` with Luhn pass on main thread only (`validated: true` via `TrustValidator`)
- `id_label` on main thread only (fail-open: `validate: null` → `TrustValidator.validate(null) = true` → `validated: true`)

**Does NOT fire on:**
- `id_label` on the worker path (Tier 3 → `validated: false`)
- `credit_card` on the worker path (Tier 3 — Luhn unavailable → `validated: false`)
- `email` on the worker path (Tier 3 → `validated: false`)
- Any Path B or Path C findings (these never set `validated: true`)

> **Finding RSG-053:** `id_label` triggers Rule 1 on the main thread but not on the worker path, which is the dominant runtime path.

### 6.2 Rule 2 — Sensitive Context Co-occurrence

**Condition (both must be true):**
```javascript
const hasSignificantOrCritical = findings.some(
  f => ENTITY_TIER[f.patternId] === "critical" || ENTITY_TIER[f.patternId] === "significant"
);
const hasSensitiveContext = findings.some(
  f => SENSITIVE_CONTEXT_IDS.has(f.patternId)
);
```

**Input set:** ALL findings

**Effect:** Raises the preliminary level by one step:

| Preliminary | Rule 2 result |
|---|---|
| `"none"` | `"low"` |
| `"low"` | `"moderate"` |
| `"moderate"` | `"high"` |
| `"high"` | `"high"` (no change) |

Implementation: `RISK_ORDER[preliminary] + 1` mapped back via `Object.keys(RISK_ORDER).find(...)`. Capped at `"high"` by the condition `RISK_ORDER[preliminary] < RISK_ORDER["high"]`.

**Precedence:** Checked second. Only evaluated if Rule 1 did not fire.

**Important constraints:**
- Requires a `"significant"` or `"critical"` tier finding. Low-impact-entites only findings alongside sensitive context terms do **not** trigger Rule 2.
- `trigger_person_name` is tier `"limited"`, not `"significant"`. A prompt containing a name trigger and a medical term does NOT satisfy `hasSignificantOrCritical` and Rule 2 does not fire.
- `gazetteer_nationality_religion` is not in `SENSITIVE_CONTEXT_IDS`. Nationality/religion findings do not satisfy `hasSensitiveContext`.
- If Rule 1 would also fire (validated critical + sensitive context present), Rule 1 preempts Rule 2.

> **Alignment with manuscript intent:** The manuscript describes Rule 2 as firing for "personal entity + sensitive context." In the current implementation, `trigger_person_name` is classified as `"limited"` so a name-only prompt plus a medical term produces `hasSignificantOrCritical = true`, and Rule 2 is applied. 

### 6.3 Rule 3 — Low-Impact Cap

**Condition (both must be true):**
```javascript
const scoredFindings = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0);
const hasAnyScoredEntity = scoredFindings.length > 0;
const allLowImpact = scoredFindings.every(
  f => (BASE_SCORES[f.patternId] ?? 0) === 2
);
```

**Input set:** `scoredFindings` — only findings with `BASE_SCORES > 0`. Non-scorable findings (`contextual`, any patternId absent from `BASE_SCORES`) are excluded from this check.

**Effect:** Caps the final result at `"moderate"` if `preliminary > "moderate"`. Preliminaries of `"moderate"`, `"low"`, or `"none"` are retained unchanged.

```javascript
// finalClass() implementation:
return RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary;
```

**Rule name returned:** `"low_impact_cap"` (used as the `governance` field in the result object).

**Precedence:** Checked third. Only evaluated if Rules 1 and 2 did not fire.

**Design rationale:** Low-impact entities (personal names, job titles, organizations, IP/MAC addresses) are detected by heuristic methods — Compromise.js NLP and gazetteer fuzzy matching — that carry higher false-positive rates than regex+validator detection. When only these entities are present, the distinct-type multiplier can push the pre-governance score above 10, producing a preliminary of `"high"`. The cap prevents that multiplier-driven escalation from surfacing as a High-risk warning when no Moderate or Critical PII has actually been confirmed.

**Condition breakdown:**

- `hasAnyScoredEntity = true` — there is at least one scored finding. If no scored findings exist, the cap is irrelevant (score would be 0, preliminary `"none"`).
- `allLowImpact = true` — every scored entity has base score exactly 2. A single Moderate (score 5) or Critical (score 10) entity breaks this condition and Rule 3 does not fire.



**`gazetteer_nationality_religion` interaction:** This patternId is absent from `BASE_SCORES` (effective score 0 via `?? 0`). It is therefore excluded from `scoredFindings` and does not affect the `allLowImpact` check. Unlike the previous tier-based implementation, nationality/religion findings no longer prevent Rule 3 from firing.

### 6.4 Rule 4 — No Rule Applies

**Condition:** None of Rules 1, 2, or 3 matched.

**Effect:** Returns `{ rule: "none", result: null }`. `finalClass()` returns `preliminary` unchanged.

---

## 7. Governance Rule Interaction Matrix

| Condition combination | Can occur? | Rule fired | Final risk | Notes |
|---|---|---|---|---|
| No governance condition met | Yes | `none` | = preliminary | Standard case for mixed non-critical entities |
| Rule 1 only (validated critical, no sensitive context) | Yes | `critical_entity` | `"high"` | Preliminary is irrelevant; always high |
| Rule 1 + Rule 2 conditions simultaneously met | Yes | `critical_entity` | `"high"` | Rule 1 fires first; Rule 2 never evaluated; logged governance is `"critical_entity"` |
| Rule 1 + Rule 3 conditions simultaneously met | Effectively no* | `critical_entity` | `"high"` | If a validated critical entity is present, it has base score 10 so `allLowImpact` is `false`; Rule 3 cannot logically co-occur with Rule 1 |
| Rule 2 only (significant/critical present + sensitive context, no validated critical) | Yes | `sensitive_context` | preliminary + 1 | Worker path: `credit_card` is unvalidated (Tier 3) → does not trigger Rule 1 → may fall through to Rule 2 if sensitive context also present. Main thread: `credit_card` is validated → Rule 1 fires instead |
| Rule 2 + Rule 3 conditions simultaneously met | No | — | — | If `hasSignificantOrCritical` is true (Rule 2 condition), at least one entity has base score ≥ 5, so `allLowImpact` is false and Rule 3 cannot fire. Rule 2 also preempts Rule 3 in the cascade |
| Rule 3 only (all scored entities have base score = 2, at least one scored entity) | Yes | `low_impact_cap` | `min(preliminary, "moderate")` | Requires no Moderate or Critical entities. `gazetteer_nationality_religion` and `trigger_religion` (score 0) are excluded from the base-score check and no longer prevent Rule 3 from firing |
| All three conditions nominally met | No | `critical_entity` | `"high"` | If a validated critical entity is present (Rule 1), it has base score 10, so `allLowImpact` is false; Rule 3 logically cannot apply |



---

## 8. Validated Flag State Table

The `validated` boolean on each finding determines whether Rule 1 (critical entity escalation) fires. Only `"critical"` tier findings with `validated: true` trigger Rule 1.

| patternId | Main-thread (`scanner.js`) | Worker (`trust-worker.js`) | Rule 1 eligible? |
|---|---|---|---|
| `api_key` (vendor prefix: `sk-`, `ghp_`, `AKIA`, etc.) | `true` (fail-open) | `true` (Tier 3, structural override via `structuralValidateApiKey`) | Yes — both paths |
| `api_key` (labeled, no vendor prefix match) | `true` (fail-open) | `false` (Tier 3, no structural match) | Main thread only |
| `jwt` (structural JSON-parse confirmation) | `true` (`TrustValidator.isJWT`) | `true` (Tier 2 `_isJWT`) | Yes — both paths |
| `credit_card` (Luhn pass) | `true` (`TrustValidator.isCreditCard`) | `false` (Tier 3 — Luhn unavailable in worker) | Main thread only |
| `email` | `true` (`TrustValidator.isEmail`) | `false` (Tier 3 — RFC5322 unavailable in worker) | Main thread only (tier critical? No — `email` is `"significant"`, not applicable to Rule 1) |
| `id_label` | `true` (fail-open: `validate: null`) | `false` (Tier 3) | Main thread only |
| `personal_label` | `true` (fail-open: `validate: null`) | `false` (Tier 3) | Not applicable (tier is `"limited"`) |
| `ipv4` | `true` (`TrustValidator.isIP`) | `true` (Tier 2 `_isIPv4`) | Not applicable (tier is `"limited"`) |
| `ipv6` | `true` (`TrustValidator.isIPv6`) | `true` (Tier 2 `_isIPv6`) | Not applicable (tier is `"limited"`) |
| `mac_address` | `true` (`TrustValidator.isMACAddress`) | `true` (Tier 2 `_isMACAddress`) | Not applicable (tier is `"limited"`) |
| `ph_mobile` | N/A (no regex, not detected by Path A) | N/A | Not applicable |
| `phone_intl` | `true` (`TrustValidator.isMobilePhone`) | `true` (Tier 2 `_isMobilePhone`) | Not applicable (tier is `"significant"`) |
| `ph_address` | `true` (`TrustValidator.isPHAddress`) | `true` (Tier 1 `PH_ADDRESS_DB`) | Not applicable (tier is `"significant"`) |
| `source_code` | `true` (fail-open: `validate: null`) | `false` (Tier 3) | Not applicable (tier is `"container"`) |
| `nlp_*` (Path C findings) | `false` (Path C sets `validated: false` explicitly) | `false` | No |
| `gazetteer_*`, `trigger_*` (Path B findings) | `false` (Path B findings have no `validated` field set to true) | `false` | No |

---

## 9. Path A Detection Eligibility Table

Path A iterates `TRUSTPROMPT_PATTERNS` and skips entries where `pattern.regex` is null or undefined.

| patternId | Has regex? | Detected by Path A? | `validate` field | Main-thread validator | Worker tier |
|---|---|---|---|---|---|
| `credit_card` | Yes | Yes | `isCreditCard` | `validator.isCreditCard` (Luhn) | Tier 3 |
| `jwt` | Yes | Yes | `isJWT` | `validator.isJWT` | Tier 2 (structural JSON decode) |
| `api_key` | Yes | Yes | `null` | Fail-open (true always) | Tier 3 / structural override |
| `id_label` | Yes | Yes | `null` | Fail-open (true always) | Tier 3 |
| `personal_label` | Yes | Yes | `null` | Fail-open (true always) | Tier 3 |
| `email` | Yes | Yes | `isEmail` | `validator.isEmail` (RFC5322) | Tier 3 |
| `ph_mobile` | No (absent) | **Never** | `isMobilePhone_PH` | N/A | N/A |
| `phone_intl` | Yes | Yes | `isMobilePhone` | `validator.isMobilePhone` | Tier 2 (digit count) |
| `ipv4` | Yes | Yes | `isIP` | `validator.isIP(v, 4)` | Tier 2 (octet check) |
| `ipv6` | Yes | Yes | `isIPv6` | `validator.isIP(v, 6)` | Tier 2 (colon-hex check) |
| `mac_address` | Yes | Yes | `isMACAddress` | `validator.isMACAddress` | Tier 2 (hex-pair check) |
| `ph_address` | Yes | Yes | `isPHAddress` | `PH_ADDRESS_DB.matchesAny` | Tier 1 (gazetteer) |
| `source_code` | Yes | Yes | `null` | Fail-open (true always) | Tier 3 |
| `nlp_person_name` | No (`null`) | **Never** | `null` | N/A | N/A |
| `nlp_job_title` | No (`null`) | **Never** | `null` | N/A | N/A |
| `nlp_organization` | No (`null`) | **Never** | `null` | N/A | N/A |

> **Finding RSG-054:** `ph_mobile` has no `regex` field in `TRUSTPROMPT_PATTERNS`. It is skipped by Path A in both execution paths. Philippine mobile numbers are detectable only via Path B trigger phrases (e.g., "my number is").

> **Finding RSG-055:** `api_key` uses `validate: null`, meaning no mathematical validation via validator.js. The detection chain is: regex match → entropy pre-check (`minEntropy: 3.5`) → fail-open validator → Tier 3 on worker → structural override (`structuralValidateApiKey`) if vendor prefix matches.

---

## 10. Known Divergences Between Paths

Four confirmed behavioral differences exist between `scanner.js` (main thread) and `trust-worker.js` (worker).

### Divergence 1 — `validated` Flag Logic (RSG-040)

The most consequential divergence. Affects whether Governance Rule 1 fires for `credit_card`, `id_label`, and label-only `api_key`.

**Main thread (`scanner.js`):** `TrustValidator.validate()` returns a boolean. All surviving Path A findings receive `validated: true`. This includes patterns with `validate: null` (fail-open) and patterns like `credit_card` where Luhn validation is available.

**Worker (`trust-worker.js`):** `TrustValidatorWorker.validate()` returns `{ passed, tier }`. `validated = (tier !== "3_regex_only")`. Tier 3 patterns (`credit_card`, `email`, `null` validator patterns) receive `validated: false`. The `api_key` pattern adds a structural override: if `structuralValidateApiKey(raw)` returns `true`, `validated` is set to `true` regardless of tier.

**Practical effect:** Since the worker is the primary execution path, the dominant runtime behavior is:
- `credit_card` — does NOT trigger Rule 1 (Tier 3, no structural validate)
- `id_label` — does NOT trigger Rule 1 (Tier 3, no structural validate)
- `api_key` with vendor prefix — DOES trigger Rule 1 (structural override)
- `api_key` without vendor prefix — does NOT trigger Rule 1 (Tier 3 retained)
- `jwt` — DOES trigger Rule 1 (Tier 2 via `_isJWT`)

### Divergence 2 — Measurement-Unit Context Filtering for `phone_intl` (RSG-041)

**Main thread only:** `isMeasurementContext(raw, fullText, matchIndex)` is applied to `phone_intl` matches in `scanner.js`. It checks the 50 characters following the match for unit keywords (grams, liters, meters, seconds, watts, etc.). If a unit is found, the match is discarded.

**Worker:** No equivalent check exists in `trust-worker.js`. `phone_intl` matches on the worker path are not subject to measurement-unit context filtering.

### Divergence 3 — `reason` Field Absent from Findings (RSG-042)

**Both paths:** Neither `scanner.js` nor `trust-worker.js` copies the `reason` field from `TRUSTPROMPT_PATTERNS` entries into Path A finding objects. The `reason` field exists on each pattern definition in `patterns.js` but is not included in the finding object structure.

The UI (`ui.js`) maintains a separate `WHY` map keyed by `patternId` for display text. These two sources of "why flagged" text are independently maintained and may diverge over time.

### Divergence 4 — Path C NLP Mode in Worker (RSG-004, RSG-040)

**Main thread:** When compromise.js is loaded (`window.nlp` is available), `COMPROMISE_AVAILABLE = true` and `TrustLinguisticDetector.scan()` runs in full NLP mode, using `doc.people()`, `doc.organizations()`, and `while` loops for multi-match extraction.

**Worker:** `linguistic-detector.js` is loaded via `importScripts()` in `trust-worker.js`. However, the `COMPROMISE_AVAILABLE` check is:
```javascript
const COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined;
```
In a Web Worker, `window` is `undefined`. Therefore `COMPROMISE_AVAILABLE = false` in the worker, and Path C always runs in **fallback mode** — using single `exec()` calls per entity type, capturing at most one match per category per scan.

---

## 11. Scoring Examples

Worked examples using current code behavior. The last two rows illustrate a key discrepancy between manuscript-described intent and current implementation.

| Input description | Detected entities (patternIds) | BASE_SCORES sum | Distinct types | Multiplier | preScore | Preliminary | Governance rule | Final risk |
|---|---|---|---|---|---|---|---|---|
| Name only (via trigger phrase) | `trigger_person_name` | 2 | 1 | × 1.00 | 2.00 | `low` | Rule 3 fires (`hasAnyScoredEntity` = true, `allLowImpact` = true, preliminary ≤ moderate ceiling) | **`low`** (2.00 ≤ moderate; cap does not change it) |
| Email only | `email` | 5 | 1 | × 1.00 | 5.00 | `moderate` | Rule 4 (none): `email` has score 5 so `allLowImpact` = false; no sensitive context co-occurrence | **`moderate`** |
| Name + email | `trigger_person_name` + `email` | 2+5 = 7 | 2 | × 1.20 | 8.40 | `moderate` | Rule 4 (none): `email` score 5 breaks `allLowImpact`; no sensitive context | **`moderate`** |
| Email + org + job title | `email` + `nlp_organization` + `nlp_job_title` | 5+2+2 = 9 | 3 | × 1.40 | 12.60 | `high` | Rule 4 (none): `email` score 5 breaks `allLowImpact`; no sensitive context | **`high`** |
| Validated `api_key` (vendor prefix, worker) | `api_key` | 10 | 1 | × 1.00 | 10.00 | `high` | Rule 1 fires (`validated: true` via structural override) | **`high`** |
| Name + org + job title + department (4 low-score types) | `trigger_person_name` + `nlp_organization` + `nlp_job_title` + `trigger_employer` | 2+2+2+2 = 8 | 4 | × 1.70 | 13.60 | `high` | Rule 3 fires (`allLowImpact` = true, all scores = 2; preliminary > moderate) | **`moderate`** (capped by Low-Impact Cap) |
| Name + medical term | `trigger_person_name` + `gazetteer_medical` | 2+2 = 4 | 2 | × 1.20 | 4.80 | `low` | Rule 2? → `hasSignificantOrCritical` = **false** (`trigger_person_name` is limited, not Significant) → Rule 3 fires (`allLowImpact` = true) | **`low`** (preliminary ≤ moderate; cap does not change it) |
| Financial term only | `gazetteer_financial` | 2 | 1 | × 1.00 | 2.00 | `low` | Rule 3 fires (`allLowImpact` = true) | **`low`** |

### Key Discrepancy: Name + Medical Term

The manuscript governance model (Chapter 3) describes this scenario as producing `"moderate"` via Rule 2 (Sensitive Context Co-occurrence), because a personal entity is combined with a medical context term.

In the current implementation, `trigger_person_name` has `ENTITY_TIER = "limited"`. Rule 2's `hasSignificantOrCritical` condition requires tier `"critical"` or `"significant"`. Since `trigger_person_name` satisfies neither, `hasSignificantOrCritical = false` and Rule 2 does not fire. Rule 3 fires instead: both `trigger_person_name` and `gazetteer_medical` have base score 2, so `allLowImpact = true`. The preliminary of `"low"` is retained unchanged (the cap only lowers, never raises). The final risk is `"low"`, not `"moderate"`.

For Rule 2 to fire on a name + medical combination, the name would need to come from a `"significant"` tier entity — such as `email` or `ph_mobile` — alongside a `gazetteer_medical` or `trigger_health` finding.

---

## Error Handling

This section documents current error-handling behaviors as implemented. No improvements are implied.

### Fail-Open Validator (Main Thread)

`TrustValidator.validate(null, rawMatch)` returns `true` unconditionally when the `validate` field on a pattern is `null`. This means patterns that have no mathematical confirmation step (`api_key`, `id_label`, `personal_label`, `source_code`) always pass validation on the main thread. Every Path A finding that survives the regex step on the main thread receives `validated: true`, regardless of whether structural or mathematical confirmation was performed.

This fail-open behavior is the source of the `validated` flag divergence documented in Divergence 1 (Section 10) and Findings RSG-040, RSG-053, RSG-055.

### Path C Graceful Degradation

`TrustLinguisticDetector.scan()` is called inside a try/catch block in both `scanner.js` and `trust-worker.js`. If Path C throws an exception at scan time, the exception is caught and an empty array is returned in its place. Path A and Path B results are unaffected. The extension continues to function with reduced detection coverage.

### Worker Unavailability Fallback

When the Web Worker (`trust-worker.js`) fails to start, times out, or produces an error, the extension falls back to the main-thread path (`scanner.js`). The fallback path has different `validated` assignment semantics (fail-open) compared to the primary worker path. This means error conditions on the worker path can silently change scoring and governance behavior, specifically enabling Governance Rule 1 to fire for `credit_card` and `id_label` findings that would not trigger it on the worker path.

### Empty and Zero-Score Input Handling

`computeRiskScore()` checks whether the scorable findings array is empty after filtering. If it is, the function returns `{ score: 0, riskLevel: "none", governance: "none" }` immediately without proceeding to multiplier, preliminary, or governance steps. This handles: empty input text, input that produces only non-scorable findings (e.g., `source_code` only), and input where all findings were suppressed by `suppressPlaceholders()`.

### Entropy Pre-Check Discard

For patterns that define `minEntropy` (`api_key`, `jwt`), `computeRiskScore()` discards matches before they reach the validator if the Shannon entropy of the extracted value portion is below the threshold of `3.5`. This discard is silent — no error is raised, the match is simply not added to the findings array.

### Path B `requireGazetteer` Constraint

Trigger entries in `gazetteer.js` that define a `requireGazetteer` field will have their extracted value spans discarded if the span does not match the specified gazetteer category regex. This is a silent discard with no error or warning produced.

### Path C Compromise.js Absence

When compromise.js is not available (always the case in the Web Worker, and on the main thread if the library has not loaded), `COMPROMISE_AVAILABLE` is `false` and Path C runs in fallback mode. Fallback mode does not raise an error; it silently limits detection to at most one match per entity type. See Finding RSG-060.

---

## Correctness Properties

This section documents the correctness properties the current implementation maintains as observed, and highlights where the implementation deviates from the manuscript-specified properties. Since this is a baseline and analysis document, violations are recorded alongside the properties themselves.

### Property 1: Single Validated Critical Entity Always Produces High Risk

**Validates: Requirements 3.1, 4.1**
*For any* findings array containing at least one finding where `ENTITY_TIER[patternId] === "critical"` and `validated === true`, `computeRiskScore()` SHALL return `riskLevel: "high"` and `governance: "critical_entity"`.

**Observed status:** Holds on the main-thread path for `api_key`, `jwt`, `credit_card`, and `id_label`. On the worker path (dominant runtime), holds only for `jwt` and vendor-prefixed `api_key`. `credit_card` and `id_label` do not produce `validated: true` on the worker path and therefore do not trigger this property. See Findings RSG-040, RSG-053.

---

### Property 2: All-Low-Impact Findings Are Capped at Moderate

**Validates: Requirements 3.3, 4.2, 6.1, 6.2**
*For any* findings array in which every finding has `ENTITY_TIER[patternId] === "limited"`, the final risk level SHALL NOT exceed `"moderate"`.



---

### Property 3: Multiplier Is Monotonically Non-Decreasing in Distinct Type Count

**Validates: Requirements 2.3**
*For any* two distinct scorable patternId counts `n1 < n2`, `getMultiplier(n1) <= getMultiplier(n2)`.

**Observed status:** Holds. The multiplier table is strictly non-decreasing: 1.00 → 1.20 → 1.40 → 1.70 → 2.00.

---

### Property 4: Preliminary Classification Matches Score Thresholds

**Validates: Requirements 2.4**
*For any* pre-governance score `s`, `preliminaryClass(s)` returns `"high"` if `s >= 10`, `"moderate"` if `5 <= s < 10`, `"low"` if `2 <= s < 5`, and `"none"` if `s < 2`.

**Observed status:** Holds. Boundary values (exactly 2, 5, 10) are handled by strict `>=` comparisons evaluated in descending order.

---

### Property 5: Governance Rule 1 Preempts Rule 2

**Validates: Requirements 3.1, 4.4**
*For any* findings array where both Rule 1 and Rule 2 conditions are simultaneously satisfied, `evaluateGovernance()` SHALL return `rule: "critical_entity"` and SHALL NOT return `rule: "sensitive_context"`.

**Observed status:** Holds. The cascading `if / else if` structure ensures Rule 1 is checked first and returns immediately on match. Rule 2 is never evaluated when Rule 1 fires.

---

### Property 6: Score Deduplication — Repeated Entity Types Do Not Increase Base Total

**Validates: Requirements 2.2**
*For any* findings array containing multiple findings with the same `patternId`, the base total contribution of that patternId SHALL be its single `BASE_SCORES` value, regardless of how many individual findings share it.

**Observed status:** Holds. `computeRiskScore()` deduplicates by `patternId` before summing base scores.

---

### Property 7: Non-Scorable Findings Do Not Contribute to Score But Do Participate in Governance

**Validates: Requirements 2.2, 3.1**
*For any* findings array, findings with `BASE_SCORES[patternId] === 0` (e.g., `source_code`) SHALL contribute `0` to the base total but SHALL be included in the `evaluateGovernance()` input.

**Observed status:** Holds. `computeRiskScore()` filters scorable findings for the numeric calculation but passes the full findings array to `evaluateGovernance()`.

---

### Property 8: Sensitive Context Co-occurrence Requires Significant or Critical Entity

**Validates: Requirements 3.2, 4.3**
*For any* findings array containing only low-impact-tier findings alongside `SENSITIVE_CONTEXT_IDS` members, Rule 2 SHALL NOT fire.

**Observed status:** Holds. Rule 2 requires `hasSignificantOrCritical === true`. low-impact-tier findings (including `trigger_person_name`, `gazetteer_medical`) do not satisfy this condition. A prompt with a name trigger and a medical term bypasses Rule 2 and proceeds to Rule 3. See the key discrepancy in Section 11.

---

### Property 9: Final Risk Level Is One of Four Defined Values

**Validates: Requirements 3.1, 3.5**
*For any* input to `computeRiskScore()`, the returned `riskLevel` SHALL be one of: `"none"`, `"low"`, `"moderate"`, `"high"`.

**Observed status:** Holds for all code paths through `finalClass()` and the early-return zero-score path.

---

## Testing Strategy

This section documents the current test landscape as observed in the codebase. No improvements are prescribed.

### Current Test Files

| File | Type | Coverage |
|---|---|---|
| `test-normalizer.js` | Unit tests (Node.js, standalone) | `TrustNormalizer.normalize()` — 50+ assertions covering shared layer, regex layer, linguistic layer, CAPS guard, smart quotes, digit separators, code block preservation |
| `test-scanner-pathc.js` | Integration tests | `TrustScanner.scan()` with Path C enabled — ~10 test cases including NLP person detection with trigger phrases, organization detection, job title detection, mixed Path A + C, multi-entity detection, empty input |
| `test-regex-patterns.js` | Manual exploration script | Regex pattern matching exploration — no formal assertions |
| `test-linguistic-detector.js` | Not fully analyzed | Content not analyzed for this baseline |
| `test-phone-context.js` | Not fully analyzed | Content not analyzed for this baseline |
| `test-phone-fix.js` | Not fully analyzed | Content not analyzed for this baseline |
| `test-backward-compat.js` | Not fully analyzed | Content not analyzed for this baseline |

None of these files are loaded by the extension manifest. All are dev-only tools.

### Known Coverage Gaps

The following behaviors are not covered by any current test file:

1. **Scoring formula unit tests** — No file directly calls `computeRiskScore()` with controlled input findings arrays and asserts exact `{ score, riskLevel, governance }` tuples. The base total × multiplier → preliminary → governance → final pipeline has no isolated unit-level coverage.

2. **Governance boundary conditions** — No tests verify `preliminaryClass()` at exact boundary values: scores of 1.99, 2.00, 4.99, 5.00, 9.99, 10.00.

3. **Governance rule precedence** — No tests construct scenarios where both Rule 1 and Rule 2 conditions are simultaneously met and confirm that `governance: "critical_entity"` is returned (not `"sensitive_context"`).

<!-- 4. **gazetteer_nationality_religion tier interaction** — No tests verify that the presence of a `gazetteer_nationality_religion` finding in the findings array causes `allContextualOrContainer` to be `false` and prevents Rule 3 from firing. -->

<!-- 5. **trigger_religion score and tier** — No tests verify that `trigger_religion` findings contribute a score of 0 and have an undefined tier. -->

6. **Path divergence for validated flag** — No tests compare equivalent prompts through `scanner.js` and `trust-worker.js` to expose the `validated` flag divergence for `id_label` and `credit_card`.

7. **Placeholder suppression completeness** — No tests verify that each entry in `PLACEHOLDER_SUPPRESSIONS` and each `PLACEHOLDER_PATTERNS` regex correctly suppresses matching inputs.

8. **evaluateGovernance in isolation** — The governance rule function is not tested with explicit findings arrays and known preliminary values independent of the full scan pipeline.

### Test Execution

Test files are standalone Node.js scripts. They are not integrated into a test runner or CI pipeline as of the analyzed codebase. Execution is manual: `node test-normalizer.js`, `node test-scanner-pathc.js`, etc.

---

## 15. Implementation Findings Summary

All 11 findings from Section 6 of `requirements.md`, consolidated for quick reference.

<!-- | Finding ID | Category | Description | Files affected |
|---|---|---|---|
| RSG-050 | Potential Defect | `gazetteer_nationality_religion` has no entry in `BASE_SCORES` or `ENTITY_TIER`. Score = 0; tier = `undefined`. Its presence in findings causes `allContextualOrContainer` to evaluate `false`, preventing Rule 3 from firing. | `scanner.js`, `trust-worker.js` | -->
<!-- | RSG-051 | Potential Defect | `trigger_religion` has no entry in `BASE_SCORES` or `ENTITY_TIER`. Same structural consequences as RSG-050: score = 0, tier = `undefined`, breaks `allContextualOrContainer`. | `scanner.js`, `trust-worker.js` | -->

| RSG-053 | Confirmed Behavior | `id_label` has `validate: null`. On the main thread (fail-open), all matches get `validated: true` → Rule 1 escalates to `"high"`. On the worker path, `id_label` matches get `validated: false` (Tier 3) → Rule 1 does not fire. Since the worker is the primary path, Rule 1 effectively does not fire for `id_label` in normal operation. | `scanner.js`, `trust-worker.js` |
| RSG-054 | Confirmed Behavior | `ph_mobile` has no `regex` field in `TRUSTPROMPT_PATTERNS`. Both execution paths skip it in `runPathA()`. Philippine mobile numbers are only detectable via Path B trigger phrases. | `patterns.js` |
| RSG-055 | Confirmed Behavior | `api_key` uses `validate: null` and relies on entropy pre-check (`minEntropy: 3.5`) and `structuralValidateApiKey()` rather than mathematical validation. On the main thread, the structural validate function is not called (worker-only mechanism). On the worker, the structural override sets `validated: true` for vendor-prefixed keys, enabling Rule 1 escalation. | `patterns.js`, `trust-worker.js` |
| RSG-056 | Observation | `password_inline` pattern is present in `patterns.js` as a comment block. No `password_inline` findings are produced by the current implementation. | `patterns.js` |
| RSG-057 | Ambiguity | Two trigger entries in `gazetteer.js` have `risk: "high"`: `"my account number is"` and `"my card number is"`. These produce findings with `risk: "high"` on the finding object and `patternId: "trigger_financial"`. However, `BASE_SCORES["trigger_financial"] = 2` — the `risk` field does not affect the base score. The `risk: "high"` value on the finding object does affect `mergeAndDedupe()` conflict resolution for duplicate raw matches. | `gazetteer.js`, `scanner.js`, `trust-worker.js` |
| RSG-058 | Design Concern | `source_code` (tier `"container"`, score `0`) participates in the `allContextualOrContainer` check for Rule 3. A prompt with `source_code` plus contextual findings satisfies Rule 3. A prompt with only `source_code` (no contextual findings) does not satisfy Rule 3 (`hasAnyContextual` is false) and returns `riskLevel: "none"`. Whether `source_code` was intended to be compatible with the contextual ceiling is not documented. | `scanner.js`, `trust-worker.js` |
| RSG-059 | Design Concern | `COMMON_FIRST_NAMES` in `linguistic-detector.js` suppresses Path C detections for any name whose first word is in the set: `john`, `mary`, `james`, `david`, `robert`, `michael`, `william`, `richard`, `charles`, `joseph`, `thomas`, `alice`, `bob`, `charlie`, `example`, `user`, `test`, `demo`, `sample`, `admin`, `root`. This includes widely used real names (John, Mary, Alice). The suppression applies in both full NLP mode and fallback mode. | `linguistic-detector.js` |
| RSG-060 | Potential Defect | In Path C fallback mode (compromise.js unavailable — including all worker-path executions), person name, job title, and organization extraction each use a single `exec()` call, not a `while` loop. At most one match per entity type is captured per scan. Full NLP mode uses `while` loops and captures multiple matches. | `linguistic-detector.js` |
