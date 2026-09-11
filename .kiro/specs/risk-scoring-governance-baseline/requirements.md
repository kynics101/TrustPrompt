# Requirements Document

## Introduction

This spec records the **current, as-implemented behavior** of TrustPrompt's Privacy Disclosure Risk Assessment Engine (PDRAE) as it exists in the codebase at the time of authoring. Its sole purpose is to establish a traceable baseline of observed behavior — including scoring logic, governance rules, inter-path divergences, and anomalies — against which future changes or compliance reviews can be compared.

This document is analytical and descriptive. It does not prescribe improvements, does not resolve ambiguities, and does not validate the implementation against any external specification. When behavior is unclear, internally inconsistent, or potentially incorrect, it is recorded as a **Finding** and left unresolved. Findings are categorized as: Observation, Ambiguity, Potential Defect, Design Concern, or Confirmed Implementation Behavior.

All behavioral statements use the phrasing "The current implementation..." to distinguish documented behavior from normative requirements.

**Files covered:**
- `scanner.js` — main-thread fallback scanner and PDRAE implementation
- `trust-worker.js` — primary Web Worker scanner and PDRAE implementation
- `patterns.js` — detection pattern definitions (`TRUSTPROMPT_PATTERNS`)
- `gazetteer.js` — Path B detection (B1 gazetteer, B2 trigger phrases, B3 grammar check)
- `linguistic-detector.js` — Path C detection (NLP via compromise.js)
- `normalizer.js` — text normalization pipeline (three output views)
- `validator-wrapper.js` — main-thread validation adapter
- `validator-wrapper-worker.js` — worker-path validation adapter
- `review.md` — known issues register

---

## Glossary

- **PDRAE**: Privacy Disclosure Risk Assessment Engine — the scoring and governance pipeline implemented in `scanner.js` and `trust-worker.js`.
- **Path A**: Regex-based detection path using `TRUSTPROMPT_PATTERNS` + `TrustValidator` / `TrustValidatorWorker`.
- **Path B**: Gazetteer and trigger-phrase detection path using `TrustGazetteer.scan()` in `gazetteer.js`.
- **Path C**: Linguistic NLP detection path using `TrustLinguisticDetector.scan()` in `linguistic-detector.js`.
- **Finding**: A patternId-labeled detection result produced by Path A, B, or C.
- **Scorable finding**: A finding whose `patternId` maps to a `BASE_SCORES` value greater than 0.
- **patternId**: The machine-readable identifier string on each finding object (e.g., `"credit_card"`, `"gazetteer_medical"`, `"trigger_health"`).
- **validated**: A boolean field on each finding object. When `true`, the match has passed a mathematical or structural confirmation step. When `false`, the match is regex-shape only (or NLP-inferred).
- **ENTITY_TIER**: A lookup mapping `patternId` to one of `"critical"`, `"significant"`, `"limited"`.
- **SENSITIVE_CONTEXT_IDS**: A fixed `Set` of patternIds that qualify as sensitive context for governance Rule 2.
- **preliminary classification**: The risk level computed from the numeric pre-governance score before governance rules are applied.
- **final risk level**: The risk level after governance rules have been applied.
- **Main-thread path**: The `scanner.js` code path, used as a fallback when the worker times out or errors.
- **Worker path**: The `trust-worker.js` code path, which is the primary execution path.
- **Tier 1 / Tier 2 / Tier 3**: Validation reliability levels defined in `validator-wrapper-worker.js`.

---

## Requirements

---

### Section 1: Detection Pipeline

---

#### RSG-001 — Text Normalization: Three Output Views

**User Story:** As a reviewer, I want to understand what text is fed into each detection path, so that I can predict which patterns will or will not fire.

##### Acceptance Criteria

1. The current implementation normalizes raw input text through `TrustNormalizer.normalize()` in `normalizer.js` and produces three distinct string outputs: `masked`, `textRegex`, and `textNLP`.
2. The current implementation produces `masked` by applying the shared layer only: Unicode NFKC normalization, invisible character stripping (U+00AD, U+200B–U+200F, U+2060–U+2064, U+206A–U+206F, U+FEFF), CRLF→LF conversion, and `trim()`.
3. The current implementation produces `textRegex` (used by Path A) by applying, in order: the shared layer, ASCII punctuation normalization (smart quotes/dashes/exotic spaces), digit-separator protection (spaces and hyphens between digit groups replaced with private-use-area sentinels before whitespace collapse, then restored), prose whitespace collapse to a single space, and an ALL-CAPS guard.
4. The current implementation produces `textNLP` (used by Path B and Path C) by applying, in order: the shared layer, ASCII punctuation normalization, full whitespace collapse to a single space, punctuation normalization, sentence boundary detection (conservative period injection), sentence case estimation, and an ALL-CAPS guard.
5. The current implementation fires the ALL-CAPS guard when the input string length exceeds 10 characters AND the ratio of uppercase alpha characters to all alpha characters exceeds 0.70. When it fires, the text is converted to sentence case. The guard is suppressed for strings matching `/^[A-Z]{1,4}[^a-z]*$/` (short all-caps label tokens such as "TIN" or "API").
6. The current implementation returns `wasCapsConverted: true` in the `normalize()` result when the ALL-CAPS guard fires in either the regex layer or the linguistic layer.

> **Traceability:** `normalizer.js` → `sharedLayer()`, `regexLayer()`, `linguisticLayer()`, `normalize()`, `capsGuard()`

---

#### RSG-002 — Path A: Regex Detection and Validation

**User Story:** As a reviewer, I want to understand which regex patterns are active, how validation is applied, and which matches survive to become findings.

##### Acceptance Criteria

1. The current implementation runs Path A by iterating over `TRUSTPROMPT_PATTERNS` (a frozen array defined in `patterns.js`) and applying each pattern's `regex` field against `textRegex`.
2. The current implementation skips any pattern entry whose `regex` field is `null` or `undefined`. As of the analyzed codebase, `ph_mobile`, `nlp_person_name`, `nlp_job_title`, and `nlp_organization` all have `regex: null` and are therefore never detected by Path A.
3. The current implementation applies the entropy pre-check when a pattern defines `minEntropy`. It extracts the value portion of the match (after any `:` or `=` label prefix) and discards the match if `shannonEntropy(valueStr) < pattern.minEntropy`. The patterns `api_key` and `jwt` both define `minEntropy: 3.5`.
4. The current implementation, on the **main-thread path** (`scanner.js`), calls `TrustValidator.validate(pattern.validate, rawMatch)` which returns a boolean. If `false`, the match is discarded entirely. If `true` (including when `pattern.validate` is `null`, which returns `true` unconditionally), the finding is kept and assigned `validated: true`.
5. The current implementation, on the **worker path** (`trust-worker.js`), calls `TrustValidatorWorker.validate(pattern.validate, rawMatch)` which returns `{ passed: boolean, tier: string }`. If `passed` is `false`, the match is discarded. If `passed` is `true`, `validated` is set to `result.tier !== "3_regex_only"`. Tier 3 results receive `validated: false`.
6. The current implementation, on the **worker path**, applies an additional override: if `validated` is `false` AND `pattern.structuralValidate` is a function AND `pattern.structuralValidate(rawMatch)` returns `true`, then `validated` is set to `true`. The `api_key` pattern defines `structuralValidate: structuralValidateApiKey` which checks the value portion against a list of vendor-specific prefix regexes (OpenAI `sk-`, GitHub `ghp_`/`gho_`/`github_pat_`, Slack `xoxb-`/`xoxp-`, AWS `AKIA`, Google `AIza`/`ya29.`).
7. The current implementation applies context-aware filtering for `phone_intl` matches: if the text immediately following the match (up to 50 characters) matches a measurement unit pattern (grams, liters, meters, seconds, watts, etc.), the match is discarded. This check is present in `scanner.js` and absent from `trust-worker.js`.
8. The current implementation creates a finding object for each surviving Path A match containing: `patternId`, `label`, `risk`, `rawMatch`, `safeVersion` (from `pattern.sanitize(rawMatch)` or `"[REDACTED]"`), `validated` (boolean), and `source: "A_regex"`. The `reason` field from `patterns.js` is NOT copied into the finding object.

> **Traceability:** `scanner.js` → `runPathA()` | `trust-worker.js` → `runPathA()` | `patterns.js` → `TRUSTPROMPT_PATTERNS`, `shannonEntropy()`, `structuralValidateApiKey()` | `validator-wrapper.js` → `validate()` | `validator-wrapper-worker.js` → `validate()`

---

#### RSG-003 — Path B: Gazetteer and Trigger-Phrase Detection

**User Story:** As a reviewer, I want to understand how Path B detects natural-language PII mentions through word lists and trigger phrases.

##### Acceptance Criteria

1. The current implementation runs Path B by calling `TrustGazetteer.scan(textNLP)` in `gazetteer.js`, which executes three sub-steps: B1 (gazetteer scan), B2 (trigger-phrase fuzzy match + value extraction), and B3 (grammar check).
2. The current implementation (B1) matches input text against three pre-compiled combined alternation regexes: one for medical terms, one for financial terms, and one for nationality/religion terms. Each category has a separate word regex and phrase regex, both compiled once at module load time. Findings from B1 carry `source: "B1_gazetteer"` and patternIds `"gazetteer_medical"`, `"gazetteer_financial"`, or `"gazetteer_nationality_religion"`.
3. The current implementation (B1) deduplicates matches within each category so that a shorter word match is dropped if it is a substring of a longer phrase match in the same category.
4. The current implementation (B2) iterates over approximately 35 trigger phrases and applies fuzzy matching using Levenshtein similarity with a threshold of `0.80`. Matching is performed over a sliding word-window of the same length as the trigger phrase against the lowercased input text.
5. The current implementation (B2) extracts the value span following a matched trigger by collecting words until a stop word, sentence-ending punctuation, or an 8-word cap is reached. The extracted span is recapitalized using title-case rules before grammar checking.
6. The current implementation (B2) evaluates `requireGazetteer` constraints on trigger entries: for `"medical"`, the span must match the pre-compiled medical word or phrase regex; for `"nationality_religion"`, the span must match the pre-compiled nationality/religion word or phrase regex. If the gazetteer check fails, the trigger result is discarded.
7. The current implementation (B3) validates extracted spans by category: `person_name` requires length ≥ 2 and no leading digit; `age` requires leading digits; `dob` requires any digit; `location` requires a PH place name match (via `PH_ADDRESS_DB.matchesAny()`) or a non-stop-word of length ≥ 3; `health` requires a match in the medical word or phrase regex; `religion` requires a match in the nationality/religion word or phrase regex; `financial` requires a digit or a match in the financial word or phrase regex.
8. The current implementation produces trigger findings with `patternId: "trigger_" + trigger.category`, `source: "B2_trigger"`, and a `risk` value taken directly from the matching trigger entry's `risk` field. The trigger entry's `risk` field values vary across entries (some "low", some "moderate", some "high").
9. The current implementation produces B1 gazetteer findings with a `risk` value of `"moderate"` for `gazetteer_medical` and `gazetteer_financial`, and `"low"` for `gazetteer_nationality_religion`.

> **Traceability:** `gazetteer.js` → `scan()`, `runGazetteerScan()`, `runTriggerScan()`, `extractValue()`, `grammarCheck()`, `fuzzyMatchPhrase()`, `levenshtein()`, `_buildWordRegex()`, `_buildPhraseRegex()`

---

#### RSG-004 — Path C: Linguistic NLP Detection

**User Story:** As a reviewer, I want to understand how Path C uses NLP to detect person names, job titles, and organizations.

##### Acceptance Criteria

1. The current implementation runs Path C by calling `TrustLinguisticDetector.scan(textNLP)` in `linguistic-detector.js`, which is invoked only if `TrustLinguisticDetector` is defined and has a `scan` function. If it is unavailable or throws an exception, an empty array is used and execution continues.
2. The current implementation operates in two modes depending on whether `window.nlp` (compromise.js) is available at load time. Mode selection is determined once at module initialization via `COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined`.
3. The current implementation in **full NLP mode** (compromise.js available) uses `doc.people()` for person name extraction, regex trigger patterns (e.g., `/\bmy\s+name\s+is\s+([A-Za-z]+(?:\s+[A-Za-z]+)*)\b/gi`) for supplementary person detection, regex trigger patterns for job title extraction, and `doc.organizations()` plus regex trigger patterns for organization extraction. All three extraction steps use `while` loops to collect multiple matches.
4. The current implementation in **fallback mode** (compromise.js unavailable) uses a single `exec()` call (not a `while` loop) for person names, job titles, and organizations respectively. This means only the first match is captured for each entity type in fallback mode.
5. The current implementation filters potential person name matches against a hardcoded `COMMON_FIRST_NAMES` set that includes: `'john'`, `'mary'`, `'james'`, `'david'`, `'robert'`, `'michael'`, `'william'`, `'richard'`, `'charles'`, `'joseph'`, `'thomas'`, `'alice'`, `'bob'`, `'charlie'`, `'example'`, `'user'`, `'test'`, `'demo'`, `'sample'`, `'admin'`, `'root'`. Matches whose first word is in this set are discarded.
6. The current implementation filters potential job title matches against a hardcoded `COMMON_JOB_TITLES` set that includes: `'manager'`, `'engineer'`, `'developer'`, `'analyst'`, `'designer'`, `'director'`, `'coordinator'`, `'specialist'`, `'consultant'`, `'assistant'`, `'associate'`, `'person'`, `'people'`, `'employee'`, `'staff'`, `'worker'`.
7. The current implementation assigns all Path C findings: `risk: "low"`, `validated: false`, `source: "C_linguistic"`, and a `patternId` of `"nlp_person_name"`, `"nlp_job_title"`, or `"nlp_organization"`. The `reason` field from `patterns.js` is NOT copied into findings.
8. The current implementation deduplicates within Path C by `rawMatch.toLowerCase().trim()` before returning results.
9. The current implementation gracefully degrades: if Path C throws an exception at scan time, the exception is caught and an empty array is returned. Path A and Path B results are not affected.

> **Traceability:** `linguistic-detector.js` → `scan()`, `extractPersons()`, `extractJobTitles()`, `extractOrganizations()`, `deduplicateWithinPath()` | `scanner.js` → `scan()` | `trust-worker.js` → `self.onmessage`

---

#### RSG-005 — Merge, Deduplication, and Placeholder Suppression

**User Story:** As a reviewer, I want to understand how findings from all three paths are combined and filtered before scoring.

##### Acceptance Criteria

1. The current implementation merges findings from Path A, Path B, and Path C by iterating all three arrays in order (A first, then B, then C) and deduplicating by `rawMatch.trim().toLowerCase()`. When the same raw match appears in multiple paths, the finding with the higher `risk` value (as ordered by `RISK_ORDER: { none:0, low:1, moderate:2, high:3 }`) is retained. Earlier findings are replaced if a later finding has a strictly higher `RISK_ORDER` value.
2. The current implementation applies placeholder suppression after merge by calling `suppressPlaceholders()`. A finding is suppressed if `isKnownPlaceholder(f.patternId, f.rawMatch)` returns `true`. `isKnownPlaceholder` checks two conditions: (a) the normalized value (`rawValue.replace(/[\s\-]/g, "").toLowerCase()`) appears in the `PLACEHOLDER_SUPPRESSIONS` lookup for that `patternId`, or (b) the raw match (trimmed) matches any of the `PLACEHOLDER_PATTERNS` structural regexes.
3. The current implementation includes the following values in `PLACEHOLDER_SUPPRESSIONS`: for `credit_card` — seven Stripe test card numbers including `"4111111111111111"` and `"4242424242424242"`; for `api_key` — AWS documentation example key prefix `"akiaiosfodnn7example"` and suffix `"wjalkfsmuoi"`; for `jwt` — the lowercased base64url payload segment of the jwt.io default token.
4. The current implementation suppresses any match whose trimmed value matches one of the following `PLACEHOLDER_PATTERNS`: `/^<[A-Z_][A-Z0-9_]*>$/` (template placeholders), `/^YOUR_[A-Z][A-Z0-9_]*$/`, `/^x+$/i` (all-x strings), `/^0+$/` (all-zero), `/^1+$/` (all-one), or `/^(placeholder|example|test|demo|fake|dummy|sample|insert.?here|changeme)$/i`.
5. The current implementation passes the merged-and-suppressed findings array to `computeRiskScore()`. Suppressed findings do not appear in the final findings list and do not contribute to scoring.

> **Traceability:** `scanner.js` → `mergeAndDedupe()`, `suppressPlaceholders()` | `trust-worker.js` → `mergeAndDedupe()`, `suppressPlaceholders()` | `patterns.js` → `isKnownPlaceholder()`, `PLACEHOLDER_SUPPRESSIONS`, `PLACEHOLDER_PATTERNS`

---

### Section 2: Risk Scoring

---

#### RSG-010 — Base Score Assignment Per Entity Type

**User Story:** As a reviewer, I want to know the exact base score assigned to each patternId so that I can reproduce score calculations.

##### Acceptance Criteria

1. The current implementation assigns base scores per `patternId` via the `BASE_SCORES` lookup (identical in both `scanner.js` and `trust-worker.js`). The exact values are:

   | patternId | Base Score |
   |---|---|
   | `credit_card` | 10 |
   | `jwt` | 10 |
   | `api_key` | 10 |
   | `id_label` | 10 |
   | `email` | 5 |
   | `ph_mobile` | 5 |
   | `phone_intl` | 5 |
   | `ph_address` | 5 |
   | `ipv4` | 2 |
   | `ipv6` | 2 |
   | `mac_address` | 2 |
   | `personal_label` | 2 |
   | `trigger_person_name` | 2 |
   | `trigger_age` | 2 |
   | `trigger_dob` | 2 |
   | `trigger_employer` | 2 |
   | `trigger_location` | 2 |
   | `trigger_health` | 0 |
   | `trigger_financial` | 0 |
   | `gazetteer_medical` | 0 |
   | `gazetteer_financial` |0 |
   | `nlp_person_name` | 2 |
   | `nlp_job_title` | 2 |
   | `nlp_organization` | 2 |
   | `source_code` | 5 |

2. The current implementation treats any `patternId` not present in `BASE_SCORES` as having an effective base score of 0, via the `?? 0` nullish coalescing operator used at lookup time.
3. The current implementation defines `ENTITY_TIER` with the following mappings (identical in both `scanner.js` and `trust-worker.js`):
   - `"critical"`: `credit_card`, `jwt`, `api_key`, `id_label`,`source_code`
   - `"significant"`: `email`, `ph_mobile`, `phone_intl`, `ph_address`
   - `"limited"`: `ipv4`, `ipv6`, `mac_address`, `personal_label`, `trigger_person_name`, `trigger_age`, `trigger_dob`, `trigger_employer`, `trigger_location`, `nlp_person_name`, `nlp_job_title`, `nlp_organization`
   -`"contextual"`:`trigger_health`, `trigger_financial`, `gazetteer_medical`, `gazetteer_financial`, 
  
4. The current implementation defines `SENSITIVE_CONTEXT_IDS` as the set `{"gazetteer_medical", "gazetteer_financial", "trigger_health", "trigger_financial"}` (identical in both `scanner.js` and `trust-worker.js`).

> **Traceability:** `scanner.js` → `BASE_SCORES`, `ENTITY_TIER`, `SENSITIVE_CONTEXT_IDS` | `trust-worker.js` → `BASE_SCORES`, `ENTITY_TIER`, `SENSITIVE_CONTEXT_IDS`

---

#### RSG-011 — Scorable Filtering and Distinct-Type Deduplication

**User Story:** As a reviewer, I want to understand which findings contribute to the numeric score and how deduplication is applied.

##### Acceptance Criteria

1. The current implementation defines a "scorable" finding as one whose `patternId` maps to a `BASE_SCORES` value greater than 0. `source_code` findings (score 0) and any patternId not present in `BASE_SCORES` (effective score 0) are non-scorable.
2. The current implementation returns `{ score: 0, riskLevel: "none", governance: "none" }` immediately if the scorable findings array is empty.
3. The current implementation deduplicates by `patternId` when computing the base total: each distinct `patternId` contributes its base score exactly once, regardless of how many individual findings share that `patternId`. Multiple detections of the same entity type (e.g., two email addresses) do not increase the base total beyond one contribution.
4. The current implementation passes the full findings array (not the scorable-filtered array) to `evaluateGovernance()`. Non-scorable findings (including `source_code`) participate in governance rule evaluation.

> **Traceability:** `scanner.js` → `computeRiskScore()` | `trust-worker.js` → `computeRiskScore()`

---

#### RSG-012 — Distinct Entity-Type Multiplier

**User Story:** As a reviewer, I want to know the exact multiplier applied at each distinct entity type count so that I can reproduce pre-governance scores.

##### Acceptance Criteria

1. The current implementation applies a distinct entity-type multiplier to the summed base score via `getMultiplier(distinctTypeCount)`. The distinct type count is the count of unique `patternId` values among scorable findings. The exact multiplier table is:

   | Distinct scorable patternId count | Multiplier |
   |---|---|
   | 1 | 1.00 |
   | 2 | 1.20 |
   | 3 | 1.40 |
   | 4 | 1.70 |
   | ≥ 5 | 2.00 |

2. The current implementation computes `preScore = baseTotal × multiplier`, where `baseTotal` is the sum of one `BASE_SCORES[patternId]` per distinct scorable patternId.
3. The current implementation returns `score` as `Math.round(preScore * 100) / 100` (two decimal places via integer rounding).

> **Traceability:** `scanner.js` → `getMultiplier()`, `computeRiskScore()` | `trust-worker.js` → `getMultiplier()`, `computeRiskScore()`

---

#### RSG-013 — Preliminary Classification Thresholds

**User Story:** As a reviewer, I want to know the exact numeric thresholds that determine preliminary risk classification.

##### Acceptance Criteria

1. The current implementation maps `preScore` to a preliminary risk level via `preliminaryClass(score)` with the following exact thresholds (evaluated in order):
   - `score >= 10` → `"high"`
   - `score >= 5` → `"moderate"`
   - `score >= 2` → `"low"`
   - else → `"none"`
2. The current implementation uses strict `>=` comparisons, meaning a score of exactly 10 classifies as `"high"`, exactly 5 as `"moderate"`, and exactly 2 as `"low"`.
3. The current implementation uses the string values `"high"`, `"moderate"`, `"low"`, and `"none"` consistently across both `scanner.js` and `trust-worker.js`.

> **Traceability:** `scanner.js` → `preliminaryClass()` | `trust-worker.js` → `preliminaryClass()`

---

### Section 3: Governance Rules

---

#### RSG-020 — Governance Evaluation Entry Point and Rule Ordering

**User Story:** As a reviewer, I want to understand the structure and evaluation order of governance rules to reproduce governance decisions.

##### Acceptance Criteria

1. The current implementation evaluates governance rules in `evaluateGovernance(findings, preliminary)`. This function receives the full merged-and-suppressed findings array (ALL findings, including non-scorable ones), and the preliminary risk level string.
2. The current implementation evaluates rules in strict sequential order: Rule 1 (critical entity) is checked first; if it applies, the function returns immediately without checking Rules 2 or 3. Rule 2 (sensitive context) is checked second; if it applies, the function returns without checking Rule 3. Rule 3 (contextual ceiling) is checked third. If none apply, Rule 4 (no rule) is returned.
3. The current implementation encodes `RISK_ORDER` as `{ none: 0, low: 1, moderate: 2, high: 3 }` and uses it for comparisons in the sensitive-context raise logic.
4. The current implementation's `evaluateGovernance()` returns an object `{ rule: string, result: string|null }`. The `finalClass()` function consumes this object to produce the final risk level.

> **Traceability:** `scanner.js` → `evaluateGovernance()`, `finalClass()`, `RISK_ORDER` | `trust-worker.js` → `evaluateGovernance()`, `finalClass()`, `RISK_ORDER`

---

#### RSG-021 — Governance Rule 1: Critical Entity Escalation

**User Story:** As a reviewer, I want to understand exactly when Rule 1 fires and what effect it produces.

##### Acceptance Criteria

1. The current implementation fires Governance Rule 1 when `findings.some(f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true)` evaluates to `true`. Both conditions must be simultaneously true on a single finding.
2. The current implementation, when Rule 1 fires, returns `{ rule: "critical_entity", result: "high" }` from `evaluateGovernance()` and `finalClass()` returns `"high"` unconditionally.
3. The current implementation evaluates Rule 1 against ALL findings (not just scorable), meaning a `source_code` finding with `validated: true` would logically trigger Rule 1 if `ENTITY_TIER["source_code"]` were `"critical"` — but since `source_code` is tier `"container"`, this scenario does not arise in practice.
4. The current implementation does not require the preliminary score to be any particular value for Rule 1 to fire. A single validated critical entity escalates to `"high"` regardless of the pre-governance score.
5. The current implementation does not check whether the critical finding is from Path A, Path B, or Path C. Rule 1 fires on any finding with `ENTITY_TIER === "critical"` AND `validated === true`, regardless of source.

> **Traceability:** `scanner.js` → `evaluateGovernance()` | `trust-worker.js` → `evaluateGovernance()`

---

#### RSG-022 — Governance Rule 2: Sensitive Context Co-occurrence

**User Story:** As a reviewer, I want to understand exactly when Rule 2 fires and how the preliminary level is raised.

##### Acceptance Criteria

1. The current implementation fires Governance Rule 2 when `hasSignificantOrCritical` AND `hasSensitiveContext` are both `true`, where `hasSignificantOrCritical = findings.some(f => ENTITY_TIER[f.patternId] === "critical" || ENTITY_TIER[f.patternId] === "significant")` and `hasSensitiveContext = findings.some(f => SENSITIVE_CONTEXT_IDS.has(f.patternId))`.
2. The current implementation, when Rule 2 fires, raises the preliminary level by exactly one step using `RISK_ORDER[preliminary] + 1`, then looks up the corresponding level via `Object.keys(RISK_ORDER).find(k => RISK_ORDER[k] === raised)`. If `preliminary` is already `"high"`, the result is capped at `"high"` by the condition `RISK_ORDER[preliminary] < RISK_ORDER["high"]`.
3. The current implementation's effective raise table for Rule 2 is:
   - `preliminary = "none"` → result `"low"`
   - `preliminary = "low"` → result `"moderate"`
   - `preliminary = "moderate"` → result `"high"`
   - `preliminary = "high"` → result `"high"` (no change)
4. The current implementation evaluates Rule 2 only when Rule 1 has not fired (due to the cascading if/else-if structure). A prompt with both a validated critical entity and a sensitive context indicator will produce Rule 1 (not Rule 2), because Rule 1 is checked first.
5. The current implementation's `SENSITIVE_CONTEXT_IDS` set contains exactly: `"gazetteer_medical"`, `"gazetteer_financial"`, `"trigger_health"`, `"trigger_financial"`. A finding with `patternId = "gazetteer_nationality_religion"` or any `trigger_*` outside this set does NOT satisfy `hasSensitiveContext`.

> **Traceability:** `scanner.js` → `evaluateGovernance()`, `SENSITIVE_CONTEXT_IDS` | `trust-worker.js` → `evaluateGovernance()`, `SENSITIVE_CONTEXT_IDS`

---
#### RSG-023 — Governance Rule 3: Low-Impact Cap

**User Story:** As a reviewer, I want to understand exactly when Rule 3 fires and how the cap is applied, so that I can confirm aggregation of Low-impact entities alone never escalates to High risk.

##### Acceptance Criteria

1. The current implementation fires Governance Rule 3 — the Low-Impact Cap — when **both** of the following conditions are true:
   - (a) At least one scored entity is present: `scoredFindings.length > 0`, where `scoredFindings = findings.filter(f => (BASE_SCORES[f.patternId] ?? 0) > 0)`.
   - (b) Every scored entity has a base score of exactly 2: `scoredFindings.every(f => (BASE_SCORES[f.patternId] ?? 0) === 2)`.
   This means no Moderate-impact (score 5) or Critical-impact (score 10) entity is present among the scored findings.
2. The current implementation evaluates condition (a) and (b) against the **scored** findings only — entities with `BASE_SCORES > 0`. Non-scorable findings (`source_code` with score 0, any patternId absent from `BASE_SCORES`) are excluded from the Rule 3 base-score check and do not affect whether the cap fires.
3. The current implementation, when Rule 3 fires, returns `{ rule: "low_impact_cap", result: null }` and `finalClass()` applies: `RISK_ORDER[preliminary] > RISK_ORDER["moderate"] ? "moderate" : preliminary`. A preliminary of `"high"` (reached via the distinct-type multiplier on multiple Low-impact entities) is capped to `"moderate"`. Preliminaries of `"moderate"`, `"low"`, or `"none"` are retained unchanged.
4. The current implementation evaluates Rule 3 only when Rules 1 and 2 have not fired.
5. The rationale for this rule: Low-impact entities (names, job titles, organizations, IP addresses, MAC addresses) are detected by heuristic methods (Compromise.js NLP, gazetteer fuzzy matching) that are more prone to false positives than regex+validator detection. Capping at Moderate when only these entities are present prevents over-warning on prompts that carry no Moderate or Critical PII.

> **Traceability:** `scanner.js` → `evaluateGovernance()`, `finalClass()`, `BASE_SCORES` | `trust-worker.js` → `evaluateGovernance()`, `finalClass()`, `BASE_SCORES`
> **Traceability:** `scanner.js` → `evaluateGovernance()`, `finalClass()` | `trust-worker.js` → `evaluateGovernance()`, `finalClass()`

---

#### RSG-024 — Governance Rule 4: No Rule Applies

**User Story:** As a reviewer, I want to confirm the fallthrough behavior when no governance rule applies.

##### Acceptance Criteria

1. The current implementation, when no governance rule condition is met, returns `{ rule: "none", result: null }` from `evaluateGovernance()` and `finalClass()` returns `preliminary` unchanged.
2. The current implementation returns `governance: "none"` as a string in the final result object from `computeRiskScore()`. This string is used by `computeRiskScore()` which returns `governance: governance.rule`.

> **Traceability:** `scanner.js` → `evaluateGovernance()`, `finalClass()`, `computeRiskScore()` | `trust-worker.js` → corresponding functions

---

### Section 4: Governance Rule Interactions

---

#### RSG-030 — Rule Interaction: Single Validated Critical Entity

**User Story:** As a reviewer, I want to verify that a single validated critical entity always produces a final risk of "high".

##### Acceptance Criteria

1. The current implementation, given a single finding with `ENTITY_TIER = "critical"` and `validated = true` (e.g., a validated `credit_card` on the main thread, a vendor-prefix `api_key` on the worker, or a validated `jwt`), will fire Rule 1 and produce `riskLevel = "high"` regardless of the pre-governance score.
2. The current implementation, for such a single finding, computes `preScore = 10 × 1.00 = 10.00`, `preliminary = "high"`, and then Rule 1 fires and also returns `"high"`. The final result is `"high"` via two independent paths (threshold and Rule 1).

> **Traceability:** `scanner.js` → `evaluateGovernance()`, `computeRiskScore()` | `trust-worker.js` → corresponding

---

#### RSG-031 — Rule Interaction: Non-Scorable Findings Do Not Affect the Low-Impact Cap

**User Story:** As a reviewer, I want to confirm that non-scorable findings (unrecognised patternIds) do not prevent or trigger the Low-Impact Cap.

##### Acceptance Criteria

1. The current implementation, given a findings array containing only scored Low-impact findings (e.g., `nlp_person_name`, base score 2) with no Moderate or Critical entities, fires Rule 3 (if Rules 1 and 2 do not apply). A preliminary of `"high"` (reached by multiplier aggregation of multiple Low-impact types) would be capped to `"moderate"`.

2. The current implementation, given a mixed array containing any Moderate-impact or Critical-impact scored finding (e.g., `email` at score 5 or `credit_card` at score 10), does NOT fire Rule 3 because `allLowImpact` is `false`. The cap only applies when every scored entity has base score = 2.

> **Traceability:** `scanner.js` → `evaluateGovernance()`, `BASE_SCORES` | `trust-worker.js` → `evaluateGovernance()`, `BASE_SCORES`

---

#### RSG-032 — Rule Interaction: Rule 2 With No Direct/Critical Entity

**User Story:** As a reviewer, I want to confirm Rule 2 does not fire when only Low-impact entities are present alongside sensitive context indicators, and that Rule 3 fires instead.

##### Acceptance Criteria

1. The current implementation does NOT fire Rule 2 if the only findings are contextual-tier (e.g., `gazetteer_medical` alone), because `hasSignificantOrCritical` is `false`. A medical term without any direct or critical personal identifier satisfies `hasSensitiveContext` but not `hasSignificantOrCritical`, so Rule 2 does not apply.
2. The current implementation, given `gazetteer_medical` alone (base score 2, in `SENSITIVE_CONTEXT_IDS`), proceeds to Rule 3: `scoredFindings` contains one entry with base score 2, `hasAnyScoredEntity` is `true`, and `allLowImpact` is `true`, so Rule 3 fires and caps the preliminary at `"moderate"`.
3. The current implementation, given `email` (direct tier, score 5) plus `gazetteer_medical` (sensitive context), computes `preScore = (5+2) × 1.20 = 8.40`, `preliminary = "moderate"`, then Rule 2 fires and raises to `"high"`. Rule 3 does NOT fire in this case because `email` has base score 5, so `allLowImpact` is `false` — but Rule 2 preempts Rule 3 regardless (Rule 2 is checked first).

> **Traceability:** `scanner.js` → `evaluateGovernance()` | `trust-worker.js` → `evaluateGovernance()`

---

#### RSG-033 — Rule Interaction: Rule 1 Preempts Rule 2 When Both Could Apply

**User Story:** As a reviewer, I want to confirm that Rule 1 preempts Rule 2 when a validated critical entity co-occurs with a sensitive context indicator.

##### Acceptance Criteria

1. The current implementation, given a validated `api_key` finding (critical, validated) AND a `gazetteer_medical` finding, evaluates Rule 1 first and returns `"high"` immediately. Rule 2 is never evaluated in this case.
2. The current implementation's final risk level output is identical whether the result comes from Rule 1 or a scenario where Rule 2 would also produce `"high"`. The logged `governance.rule` value differs (`"critical_entity"` vs `"sensitive_context"`), preserving audit trail information about which rule fired.

> **Traceability:** `scanner.js` → `evaluateGovernance()` | `trust-worker.js` → `evaluateGovernance()`

---

### Section 5: Divergence Between scanner.js and trust-worker.js

---

#### RSG-040 — Validated Flag Divergence: Main Thread vs Worker

**User Story:** As a reviewer, I want to document the exact difference in how `validated` is set between the two execution paths.

##### Acceptance Criteria

1. The current implementation on the **main-thread path** (`scanner.js`) sets `validated: true` on ALL Path A findings that survive the `TrustValidator.validate()` call. Because `TrustValidator.validate()` returns a boolean (`true` = keep, `false` = discard), any surviving finding necessarily has `validated: true`. This includes findings for patterns with `validate: null` (which return `true` unconditionally).
2. The current implementation on the **worker path** (`trust-worker.js`) sets `validated: true` only for findings whose `TrustValidatorWorker.validate()` returns `tier !== "3_regex_only"`. Tier 3 findings survive with `validated: false`. Tier 3 applies to: `isCreditCard` (credit cards), `isEmail` (emails), and `null` validator patterns (`api_key` without structural match, `id_label`, `personal_label`, `source_code`).
3. The current implementation on the **worker path** overrides `validated` to `true` for API key findings that pass `structuralValidateApiKey()`. This affects vendor-prefixed keys (OpenAI, GitHub, Slack, AWS, Google formats).
4. The current implementation's divergence in `validated` logic affects governance Rule 1. On the main thread, any `id_label` regex match sets `validated: true`, enabling Rule 1 escalation to `"high"`. On the worker path, `id_label` matches set `validated: false`, so Rule 1 does NOT fire for `id_label` on the worker; these findings may still reach `"high"` via the score threshold (base score 10 → preliminary `"high"`) but Rule 1 is not the mechanism.
5. The current implementation's divergence means that on the main thread, a `credit_card` finding that passes Luhn gets `validated: true` and triggers Rule 1. On the worker path, `credit_card` always receives `validated: false` (Tier 3 — Luhn not available in worker), so Rule 1 never fires for credit cards on the worker path. These findings may still reach preliminary `"high"` via the score of 10.

> **Traceability:** `scanner.js` → `runPathA()` | `trust-worker.js` → `runPathA()` | `validator-wrapper.js` → `validate()` | `validator-wrapper-worker.js` → `validate()`

---

#### RSG-041 — Context-Aware Phone Filtering: Main Thread Only

**User Story:** As a reviewer, I want to document that measurement-unit context filtering for phone numbers exists only on the main thread.

##### Acceptance Criteria

1. The current implementation applies `isMeasurementContext()` filtering to `phone_intl` matches in `scanner.js` (main-thread path). This function checks the 50 characters following a match for measurement unit keywords (weight, volume, distance, time, electrical, temperature, digital storage, speed units).
2. The current implementation in `trust-worker.js` does NOT contain `isMeasurementContext()` or any equivalent check. `phone_intl` matches on the worker path are not subject to measurement-unit context filtering.

> **Traceability:** `scanner.js` → `runPathA()`, `isMeasurementContext()` | `trust-worker.js` → `runPathA()`

---

#### RSG-042 — Reason Field Absence in Findings

**User Story:** As a reviewer, I want to confirm that the reason field from patterns.js is not in findings objects.

##### Acceptance Criteria

1. The current implementation does NOT copy the `reason` field from `TRUSTPROMPT_PATTERNS` entries into Path A finding objects in either `scanner.js` or `trust-worker.js`.
2. The current implementation in `ui.js` provides display text for findings via an internal `WHY` map keyed by `patternId`, independent of the `reason` field in `patterns.js`. The two sources of "why flagged" text are maintained separately and may diverge.

> **Traceability:** `scanner.js` → `runPathA()` | `trust-worker.js` → `runPathA()` | `patterns.js` → `TRUSTPROMPT_PATTERNS[*].reason` | `review.md` → Known Issue #8

---

### Section 6: Implementation Findings

---

#### RSG-050 — Finding: gazetteer_nationality_religion Has No Score or Tier

**Category:** Potential Defect

**User Story:** As a reviewer, I want this anomaly formally recorded because it affects both scoring and governance behavior.

##### Acceptance Criteria

1. The current implementation does NOT include `"gazetteer_nationality_religion"` in `BASE_SCORES` in either `scanner.js` or `trust-worker.js`. Access via `BASE_SCORES["gazetteer_nationality_religion"] ?? 0` returns `0`, making these findings non-scorable.
2. The current implementation does NOT include `"gazetteer_nationality_religion"` in `ENTITY_TIER`. `ENTITY_TIER["gazetteer_nationality_religion"]` evaluates to `undefined`.
3. The current implementation's Low-Impact Cap (Rule 3) filters findings to `scoredFindings` using `BASE_SCORES > 0`. Because `gazetteer_nationality_religion` has effective score 0, it is excluded from `scoredFindings` entirely and does NOT affect whether Rule 3 fires. A findings array containing only `gazetteer_nationality_religion` plus Low-impact scored entities (score 2) satisfies `allLowImpact = true` and Rule 3 fires normally.
4. The current implementation does NOT include `"gazetteer_nationality_religion"` in `SENSITIVE_CONTEXT_IDS`, so these findings do not contribute to Rule 2 co-occurrence.

> **Traceability:** `scanner.js` → `BASE_SCORES`, `ENTITY_TIER` | `trust-worker.js` → `BASE_SCORES`, `ENTITY_TIER` | `gazetteer.js` → `runGazetteerScan()`

---

#### RSG-051 — Finding: trigger_religion Has No Score or Tier

**Category:** Potential Defect

**User Story:** As a reviewer, I want this anomaly formally recorded.

##### Acceptance Criteria

1. The current implementation does NOT include `"trigger_religion"` in `BASE_SCORES` or `ENTITY_TIER` in either `scanner.js` or `trust-worker.js`. Trigger findings for the `religion` category (patternId `"trigger_religion"`) have an effective score of 0 and an undefined tier.
2. The current implementation's Low-Impact Cap (Rule 3) filters findings to `scoredFindings` using `BASE_SCORES > 0`. Because `trigger_religion` has effective score 0, it is excluded from `scoredFindings` and does NOT prevent Rule 3 from firing. This is a behavior change from the previous tier-based implementation, where `undefined` ENTITY_TIER caused `allLowImpact` to evaluate `false`.

> **Traceability:** `scanner.js` → `BASE_SCORES`, `ENTITY_TIER` | `trust-worker.js` → `BASE_SCORES`, `ENTITY_TIER` | `gazetteer.js` → `TRIGGERS`, `CATEGORY_META`

---

#### RSG-052 — Finding: patterns.js Risk Label vs Scoring Tier Discrepancy

**Category:** Ambiguity

**User Story:** As a reviewer, I want the label-vs-scoring discrepancy for ipv4, ipv6, mac_address, and source_code formally recorded.

##### Acceptance Criteria

1. The current implementation assigns `risk: "moderate"` in `patterns.js` to `ipv4`, `ipv6`, and `mac_address`, but assigns all three a base score of `2` in `BASE_SCORES` and places them in the `"contextual"` tier in `ENTITY_TIER`. The `"moderate"` risk label on the pattern object is not aligned with the scoring model's treatment of these entities.
2. The current implementation assigns `risk: "low"` in `patterns.js` to `source_code`, but assigns it a base score of `0` and places it in the `"container"` tier. The `"low"` label does not reflect the zero-contribution treatment in scoring.
3. The current implementation uses the `risk` field from finding objects in the merge/deduplicate step (`RISK_ORDER[f.risk]`). A finding from Path A for `ipv4` would carry `risk: "moderate"` from `patterns.js`. This affects deduplication behavior: if Path A and Path B produce the same raw match with different risk labels, the `"moderate"` label from Path A would win over a `"low"` label from Path B.

> **Traceability:** `patterns.js` → `TRUSTPROMPT_PATTERNS` | `scanner.js` → `BASE_SCORES`, `ENTITY_TIER`, `mergeAndDedupe()` | `trust-worker.js` → `BASE_SCORES`, `ENTITY_TIER`, `mergeAndDedupe()`

---

#### RSG-053 — Finding: id_label Rule 1 Eligibility Divergence

**Category:** Confirmed Implementation Behavior

**User Story:** As a reviewer, I want the id_label governance behavior documented per path.

##### Acceptance Criteria

1. The current implementation defines `id_label` in `patterns.js` with `validate: null`. On the **main-thread path**, `TrustValidator.validate(null, raw)` returns `true` (fail-open), and the finding is assigned `validated: true`. This means any `id_label` regex match that survives the regex step will have `validated: true` and will trigger Governance Rule 1 escalation to `"high"`.
2. The current implementation on the **worker path** processes `id_label` through `TrustValidatorWorker.validate(null, raw)` which returns `{ passed: true, tier: "3_regex_only" }`. `validated` is set to `result.tier !== "3_regex_only"` = `false`. The `id_label` pattern does not define `structuralValidate`, so the override check does not apply. Therefore, `id_label` findings on the worker path have `validated: false` and do NOT trigger Rule 1. These findings may still produce a preliminary of `"high"` via the score threshold (base score 10 → preScore 10.00).

> **Traceability:** `scanner.js` → `runPathA()` | `trust-worker.js` → `runPathA()` | `patterns.js` → `TRUSTPROMPT_PATTERNS[id_label]` | `validator-wrapper.js` → `validate()` | `validator-wrapper-worker.js` → `validate()`

---

#### RSG-054 — Finding: ph_mobile Path A Absence

**Category:** Confirmed Implementation Behavior

**User Story:** As a reviewer, I want it documented that ph_mobile is never detected by Path A.

##### Acceptance Criteria

1. The current implementation defines `ph_mobile` in `patterns.js` with no `regex` field (field is absent from the entry). Both `scanner.js` and `trust-worker.js` `runPathA()` functions check `if (!pattern.regex) continue` before applying the regex. Therefore, `ph_mobile` is never detected by Path A in either execution path.
2. The current implementation can detect Philippine mobile numbers only via Path B trigger phrases (e.g., triggers for "my number is" or similar phrases that extract a following value). Significant instances of a mobile number without a trigger phrase are not detected.

> **Traceability:** `patterns.js` → `TRUSTPROMPT_PATTERNS[ph_mobile]` | `scanner.js` → `runPathA()` | `trust-worker.js` → `runPathA()`

---

#### RSG-055 — Finding: api_key validate: null Behavior

**Category:** Confirmed Implementation Behavior

**User Story:** As a reviewer, I want the api_key validation chain documented.

##### Acceptance Criteria

1. The current implementation defines `api_key` in `patterns.js` with `validate: null`, `minEntropy: 3.5`, and `structuralValidate: structuralValidateApiKey`. The null validator means the regex match is not subjected to mathematical validation via validator.js.
2. The current implementation on the **main-thread path** calls `TrustValidator.validate(null, raw)` which returns `true` unconditionally, then assigns `validated: true`. The entropy check and structural check are present but the entropy check is the only secondary filter on the main thread (structural validate is not called on the main thread path — it is a worker-only mechanism).
3. The current implementation on the **worker path** applies: (1) entropy pre-check (`minEntropy: 3.5`), then (2) `TrustValidatorWorker.validate(null, raw)` which returns `{ passed: true, tier: "3_regex_only" }`, setting initial `validated: false`, then (3) `structuralValidateApiKey(raw)` which, if it returns `true`, overrides `validated` to `true`.

> **Traceability:** `patterns.js` → `TRUSTPROMPT_PATTERNS[api_key]`, `structuralValidateApiKey()` | `scanner.js` → `runPathA()` | `trust-worker.js` → `runPathA()`

---

#### RSG-056 — Finding: password_inline Is Commented Out

**Category:** Observation

**User Story:** As a reviewer, I want the absence of password detection formally recorded.

##### Acceptance Criteria

1. The current implementation does NOT include an active `password_inline` pattern in `TRUSTPROMPT_PATTERNS`. The pattern definition is present in `patterns.js` as a comment block. No finding with `patternId: "password_inline"` is produced by the current implementation.

> **Traceability:** `patterns.js` → commented-out `password_inline` entry

---

#### RSG-057 — Finding: trigger_financial Risk-High Entries vs Score-0 Assignment

**Category:** Ambiguity

**User Story:** As a reviewer, I want the mismatch between trigger-level risk labels and base scores formally recorded.

##### Acceptance Criteria

1. The current implementation defines two trigger entries in `gazetteer.js` with `risk: "high"`: `{ phrase: "my account number is", category: "financial", risk: "high" }` and `{ phrase: "my card number is", category: "financial", risk: "high" }`. These produce findings with `patternId: "trigger_financial"` and `risk: "high"` on the finding object.
2. The current implementation assigns `trigger_financial` a base score of `0` in `BASE_SCORES` and a tier of `"contextual"`. The `risk: "high"` field on the finding object does not affect the base score contribution or tier classification.
3. The current implementation uses the `risk` field value from finding objects during `mergeAndDedupe()` (highest `RISK_ORDER[f.risk]` wins for duplicate raw matches). A `trigger_financial` finding with `risk: "high"` would win over a path B finding with `risk: "low"` for the same raw match, regardless of patternId-level base scores.

> **Traceability:** `gazetteer.js` → `TRIGGERS` | `scanner.js` → `BASE_SCORES`, `mergeAndDedupe()` | `trust-worker.js` → `BASE_SCORES`, `mergeAndDedupe()`

---



---

#### RSG-059 — Finding: Path C COMMON_FIRST_NAMES Suppresses Common Real Names

**Category:** Design Concern

**User Story:** As a reviewer, I want the name suppression behavior formally recorded.

##### Acceptance Criteria

1. The current implementation in `linguistic-detector.js` will not produce a `nlp_person_name` finding for any person name whose first word (lowercased) is in the `COMMON_FIRST_NAMES` set: `john`, `mary`, `james`, `david`, `robert`, `michael`, `william`, `richard`, `charles`, `joseph`, `thomas`, `alice`, `bob`, `charlie`, `example`, `user`, `test`, `demo`, `sample`, `admin`, `root`.
2. The current implementation applies this filter in both full NLP mode and fallback mode. A user submitting "My name is John Smith" will not produce a `nlp_person_name` finding for "John Smith" because "john" is in the suppression set.

> **Traceability:** `linguistic-detector.js` → `COMMON_FIRST_NAMES`, `shouldFilterCommonName()`, `extractPersons()`

---

#### RSG-060 — Finding: Path C Fallback Mode Single-Match Limitation

**Category:** Potential Defect

**User Story:** As a reviewer, I want the single-match limitation in Path C fallback mode formally recorded.

##### Acceptance Criteria

1. The current implementation in fallback mode (compromise.js unavailable) uses a single `exec()` call per entity type for person names, job titles, and organizations. This means at most one person name, one job title, and one organization can be detected per scan in fallback mode.
2. The current implementation in full NLP mode uses `while` loops for all three entity extraction steps, allowing multiple entities of each type to be detected per scan.

> **Traceability:** `linguistic-detector.js` → `scan()` (fallback branch)

---

### Section 7: Test Coverage

---

#### RSG-070 — Existing Test Coverage Inventory

**User Story:** As a reviewer, I want to understand what is currently tested and at what level.

##### Acceptance Criteria

1. The current implementation includes `test-normalizer.js`, a Node.js unit test file for `TrustNormalizer`. This file tests the shared layer, regex layer, linguistic layer, and the full `normalize()` function with 50+ assertions across a range of inputs including CAPS guard, smart quotes, digit separators, and code block preservation. It is a standalone dev-only file not loaded by the extension manifest.
2. The current implementation includes `test-scanner-pathc.js`, an integration test file that tests `TrustScanner.scan()` with Path C enabled. It covers approximately 10 test cases including NLP person detection with trigger phrases, organization detection, job title detection, mixed Path A + C, multi-entity detection, and empty input handling. It does not cover all Path C patterns or edge cases.
3. The current implementation includes `test-regex-patterns.js`, which functions as a manual exploration script for regex pattern matching. It is not a formal test suite with assertions.
4. The current implementation includes `test-linguistic-detector.js`, `test-phone-context.js`, `test-phone-fix.js`, and `test-backward-compat.js`. The full content of these files was not analyzed for this baseline.
5. The current implementation has no test file that directly exercises `computeRiskScore()`, `evaluateGovernance()`, or `finalClass()` in isolation with known inputs and expected outputs.
6. The current implementation has no test file that exercises the divergence between `scanner.js` and `trust-worker.js` scoring paths for equivalent inputs.

> **Traceability:** workspace files `test-normalizer.js`, `test-scanner-pathc.js`, `test-regex-patterns.js`, `test-linguistic-detector.js`, `test-phone-context.js`, `test-phone-fix.js`, `test-backward-compat.js`

---

#### RSG-071 — Test Coverage Gaps

**User Story:** As a reviewer, I want identified test coverage gaps recorded so they can be prioritized.

##### Acceptance Criteria

1. The current test suite does not include tests that verify `computeRiskScore()` returns exact expected `{ score, riskLevel, governance }` tuples for controlled input findings arrays. The scoring formula (base total × multiplier → preliminary → governance → final) has no unit-level coverage.
2. The current test suite does not include tests that verify governance rule boundary conditions: the exact score at which `preliminaryClass()` transitions (1.99 → none, 2.00 → low, 4.99 → low, 5.00 → moderate, 9.99 → moderate, 10.00 → high).
3. The current test suite does not include tests that verify `evaluateGovernance()` rule precedence: a scenario where both Rule 1 and Rule 2 conditions are met, confirming that Rule 1 fires and Rule 2 is skipped.
4. The current test suite does not include tests that verify `gazetteer_nationality_religion` and `trigger_religion` findings (score 0) are correctly excluded from `scoredFindings` in Rule 3 and do not prevent the Low-Impact Cap from firing.
5. The current test suite does not include tests that verify `trigger_religion` findings have score 0 and undefined tier and their effect on governance.
6. The current test suite does not include tests that compare equivalent prompts processed through `scanner.js` and `trust-worker.js` to expose the `validated` flag divergence for `id_label` and `credit_card`.
7. The current test suite does not include tests for `suppressPlaceholders()` confirming that each entry in `PLACEHOLDER_SUPPRESSIONS` and each `PLACEHOLDER_PATTERNS` regex correctly suppresses matching inputs.

> **Traceability:** All test files listed in RSG-070 | `scanner.js`, `trust-worker.js` logic analyzed above

---

### Section 8: Open Questions

---

#### RSG-080 — Open Question: gazetteer_nationality_religion ENTITY_TIER Omission

**User Story:** As a reviewer, I want this unresolved design question formally captured.

##### Acceptance Criteria

1. The current implementation omits `gazetteer_nationality_religion` from both `BASE_SCORES` and `ENTITY_TIER`. It is unclear whether this is intentional (nationality/religion detections are intentionally excluded from scoring) or an oversight (the patternId was not added when the category was introduced). No authoritative source in the codebase resolves this question.
2. The effect of adding `gazetteer_nationality_religion` to `ENTITY_TIER` as `"contextual"` would be: it would start contributing to the ENTITY_TIER-based checks used by Rules 1 and 2 (though its undefined tier currently does not affect those rules either), and it would still not score unless a `BASE_SCORES` entry were also added. Under the current Low-Impact Cap logic, its presence has no effect on Rule 3 since it is filtered out by the `BASE_SCORES > 0` check.

---

#### RSG-081 — Open Question: Should gazetteer_nationality_religion Trigger Rule 2 as Sensitive Context?

**User Story:** As a reviewer, I want this behavioral question formally captured.

##### Acceptance Criteria

1. It is unresolved whether `gazetteer_nationality_religion` findings (which detect ethnic origin, nationality, and religion terms) should be added to `SENSITIVE_CONTEXT_IDS` so that they can trigger Rule 2 co-occurrence alongside a direct personal entity. The manuscript identifies ethnic origin as a sensitive context category. No design document in the repository resolves whether this omission is intentional.

---

#### RSG-082 — Open Question: Is validated: Divergence Between Paths Intentional?

**User Story:** As a reviewer, I want this unresolved design question formally captured.

##### Acceptance Criteria

1. It is unresolved whether the difference in `validated` assignment between the main-thread path (all Path A survivors get `validated: true`) and the worker path (only Tier 1 and Tier 2 survivors get `validated: true`, plus structural-validate overrides) is an intentional design choice or a consequence of the worker's inability to run full mathematical validation.
2. The practical effect of this divergence is that `id_label` and `credit_card` findings trigger governance Rule 1 on the main thread but not on the worker path. Since the worker is the primary execution path (main thread only runs as fallback), the dominant runtime behavior is worker-path behavior.

---

#### RSG-083 — Open Question: Should id_label Qualify for Rule 1 Escalation?

**User Story:** As a reviewer, I want this unresolved design question formally captured.

##### Acceptance Criteria

1. It is unresolved whether `id_label` findings (which have `validate: null` — no mathematical confirmation) should qualify for Governance Rule 1 escalation, which is intended for "strongly validated critical entities." The pattern detects government ID field labels via regex keyword matching only; there is no structural validation of the value. No design document in the repository resolves this question.

---
---

#### RSG-085 — Open Question: risk Label on ipv4/ipv6/mac_address vs Scoring Tier

**User Story:** As a reviewer, I want this unresolved discrepancy formally captured.

##### Acceptance Criteria

1. It is unresolved whether the `risk: "moderate"` label on `ipv4`, `ipv6`, and `mac_address` in `patterns.js` is the authoritative classification for these entity types, or whether the base score of 2 and `"contextual"` tier in the scoring engine is authoritative. The two representations are inconsistent and no canonical source is identified in the repository. The `risk` field on the pattern object affects finding objects produced by Path A and is used in the merge/deduplication step.

---

#### RSG-086 — Open Question: trigger_financial High-Risk Entries and Scoring Intent

**User Story:** As a reviewer, I want this unresolved question formally captured.

##### Acceptance Criteria

1. It is unresolved whether the `risk: "high"` label on the `"my account number is"` and `"my card number is"` trigger entries in `gazetteer.js` was intended to produce high-impact scoring (which would require a `BASE_SCORES` entry of 10 for `trigger_financial`) or merely to flag these findings more prominently in the UI. The current `BASE_SCORES["trigger_financial"] = 2` means these triggers do not contribute score 10 regardless of their `risk` field value.

---

#### RSG-087 — Open Question: Path C COMMON_FIRST_NAMES Coverage Intent

**User Story:** As a reviewer, I want this unresolved design question formally captured.

##### Acceptance Criteria

1. It is unresolved whether the `COMMON_FIRST_NAMES` suppression set in `linguistic-detector.js` was intended to suppress all detections matching those first names or only low-confidence NER outputs. The set includes widely used real names (John, Mary, James, Alice) that are legitimate PII when appearing in actual prompts. The criterion for inclusion in the set is not documented.
