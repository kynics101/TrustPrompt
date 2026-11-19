---
inclusion: auto
name: risk-scoring-framework
description: Use when implementing, modifying, debugging, reviewing, or testing TrustPrompt's risk-score calculation, scoring-unit aggregation, entity base scores, multiplier, preliminary classification, or score-to-response mapping.
---

# TrustPrompt Risk Scoring Framework

## Source of truth and change control

The approved Capstone Manuscript, Chapter 3, "Risk Scoring and Data Masking Implementation" (pp. 87–103), is the primary authority for the risk-scoring framework.

- Preserve the entity categories, base scores, scoring-unit groups, multiplier values, thresholds, and worked outcomes specified here.
- Do not silently add, remove, regroup, or reweight entity types.
- Do not introduce additional risk factors, contextual bonuses, semantic correlation, likelihood estimates, or predictive scoring.
- If source code, tests, governance steering, or an older manuscript conflicts with this framework, identify the exact conflict. Do not silently reconcile it.
- Scores, multipliers, and thresholds are researcher-defined operational parameters informed by NIST SP 800-122 and RA 10173 §3(g); do not claim that these exact numerical values are prescribed by either source.

## Engine overview

The Privacy Disclosure Risk Assessment Engine calculates a preliminary privacy-disclosure classification and then passes it to the governance stage for the final classification.

1. Assign base scores to eligible, validated scoring units.
2. Sum the base scores of distinct scoring units.
3. Apply the Distinct Entity-Type Multiplier.
4. Map the pre-governance score to a preliminary classification.
5. Apply the governance rules in `governance-rules.md` to obtain the final classification.

Risk assessment runs after detection findings have been consolidated, deduplicated, and passed through the reliability filter.

## 1. Base entity scores — Manuscript Table 10

Each eligible entity type has a base score. Repeated instances of the same type do not increase the score. Closely related fields may be combined into a scoring unit as specified in Section 2.

| Impact tier | Base score | Entity types |
|---|---:|---|
| High (Critical) | 10 | API keys and tokens; credit/debit card numbers; the nine supported Philippine government-ID types listed below (PhilID, UMID, Philippine Passport, PRC, Postal, PWD, Digital National Senior Citizen ID, SSS, PhilHealth) |
| Moderate (Significant) | 5 | Email addresses; Philippine mobile phone numbers; international phone numbers; Philippine physical addresses; source code blocks |
| Low (Limited) | 2 | Personal names; organizational names; job titles/roles; departments; MAC addresses; IP addresses |

Only supported, validated findings that pass the reliability filter may contribute to scoring.

### Non-scoring context indicators

Ethnic-origin/nationality, medical, and financial context terms are detected through gazetteer lookup and receive **no independent base score**. They do not increase the base-score total or distinct scoring-unit count. Their only scoring-framework role is to provide context to the Sensitive-Context Co-occurrence governance rule.

Examples include:
- Ethnic origin/nationality: Ilocano, Cebuano, Bicolano.
- Financial: salary, loan, payment, debt.
- Medical: diagnosis, treatment, medication.

Do not treat a context term by itself as a validated personal identifier.

## Supported Philippine Government ID detection scope

The following are the **only Philippine government-ID types currently in scope for detection**. Do not add or assume support for TIN, GSIS, Pag-IBIG, NBI Clearance, Police Clearance, PSA Certificate, Barangay Clearance, COMELEC Voter's ID, Driver's License, or any other ID type unless the project specification is formally revised.

| ID type | Supplied format specification |
|---|---|
| Philippine National ID (PhilID) | 12 digits, grouped as `xxxx-xxxx-xxxx` |
| UMID | 12 digits, grouped as `xxxx-xxxxxxx-x` |
| Philippine Passport | 8–9 alphanumeric characters: 1–2 prefix letters followed by 7 digits; no dashes |
| PRC ID | 7 numeric digits |
| Postal ID | Described as 14 alphanumeric characters; supplied layout: `Letterxxxxxxx-xxxx-Letter` |
| PWD ID | `RR-PPMM-BBB-NNNNNNN` |
| Digital National Senior Citizen ID | 10 numeric digits |
| SSS ID/number | 10 digits, grouped as `xx-xxxxxxx-x` |
| PhilHealth ID/number | 12 digits, grouped as `xx-xxxxxxxxx-x` |

**Format details requiring confirmation before final validator implementation:**
- The supplied Postal ID layout `Letterxxxxxxx-xxxx-Letter` contains 13 character positions when counted literally, while the description states 14 alphanumeric characters. Do not silently change either specification; confirm the intended format.
- The character classes represented by `R`, `P`, `M`, `B`, and `N` in the PWD format have not been defined. Preserve the supplied template, but do not infer whether each position must be numeric or alphabetic until confirmed.
- Confirm whether passport prefix letters must be uppercase, or whether matching should be case-insensitive. Do not assume a rule not stated here.

Detection must apply the stated structure for each ID type. A format match alone must not be described as independently validated unless the detection/validation specification defines and implements an additional validation check. Do not claim checksum or registry validation for these IDs unless explicitly implemented.

## 2. Scoring-unit grouping

Related fields are grouped to avoid inflating the score when multiple fields represent the same information category. Detection and UI explanation remain field-specific; only score aggregation is performed at the scoring-unit level.

| Scoring unit | Included `patternId`s | Unit base score | Counting rule |
|---|---|---:|---|
| Contact Information (`contact_information`) | `email`, `ph_mobile`, `phone_intl` | 5 | Count once if one or more included fields are detected. |
| Organizational Affiliation | `trigger_employer`, `nlp_organization`, `nlp_job_title` | 2 | Count once if one or more included fields are detected. |

All `patternId`s not listed in a group form their own scoring unit, keyed by their own `patternId`, using the corresponding value in `BASE_SCORES`.

Important consequences:
- Email + Philippine mobile + international phone = one Contact Information unit, score 5.
- Organization + job title = one Organizational Affiliation unit, score 2.
- Department is **not** included in the Organizational Affiliation group in this specification; it remains its own unit unless the approved manuscript or implementation specification is formally revised.
- Personal name, MAC address, IP address, physical address, date of birth, one of the nine supported Philippine government-ID types, card number, API key/token, and source code each remain separate units unless explicitly listed in a group.
- Multiple occurrences of one `patternId` count once.
- Multiple grouped `patternId`s count once for their shared unit.
- Keep the individual findings available for display, explanation, and masking even when they share one scoring unit.

### Scoring-eligibility gates

A scoring unit contributes its base score only when at least one of its findings is eligible. An ineligible finding is still detected, displayed, explained, and masked, but it adds no base score and no scoring unit, so it does not change the multiplier.

- `nlp_job_title` is eligible with a first-person self-attribution in the same sentence, when it is linked to a detected personal name in the same sentence, or as the value of a labeled record field.
- `nlp_organization` is eligible when the sentence ties the name to the writer, when it is linked to a detected personal name in the same sentence, or as the value of a labeled record field.
- Personal attributes (`age_value`, `height_mention`, `weight_mention`, `eye_color_mention`, `blood_type_mention`, `sex_mention`) are eligible with a first-person lead ("I'm", "I am", "I weigh", ...) or a first-person possessive ("my height", "my blood type", ...) before the value, or as the value of a labeled record field. The full rules, examples, and limits are in `governance-rules.md`, section "Scoring-eligibility gates (first-person attribution)".

A labeled record needs at least two "Label: value" fields and must not be a hiring or vacancy notice. These gates are implementation-level eligibility rules. Manuscript Table 10 does not state them, so the manuscript owner needs to confirm them.

Source discrepancy: Table 10 and the grouping table in this file do not list the personal-attribute fields or a Personal Attributes unit. `governance-rules.md` (Table 11) and `scanner.js` do. This file does not resolve that. Until the manuscript owner decides, the gate applies only to the six fields above as implemented.
### Implementation contract

The grouping is implemented through:

- `SCORING_UNIT_GROUPS`
- `SCORING_UNIT_BASE`
- `scoringUnitKey(patternId)`
- `scoringUnitBase(unitKey)`

`computeRiskScore()` must:
1. Determine the scoring-unit key for each eligible finding.
2. Deduplicate by scoring-unit key.
3. Sum `scoringUnitBase(unitKey)` once per unique unit.
4. Use the number of unique scoring units (`seenUnits.size`) as the input to `getMultiplier()`.

The same scoring behavior must be maintained in `scanner.js` and `trust-worker.js`. If one execution path is changed, verify parity with the other.

## 3. Distinct Entity-Type Multiplier — Manuscript Table 12

The multiplier is based on the number of **distinct scoring units**, not the number of raw findings, individual occurrences, or fields inside a grouped unit.

| Distinct scoring units | Multiplier | Disclosure-diversity level |
|---:|---:|---|
| 1 | ×1.00 | Single-type disclosure |
| 2 | ×1.20 | Limited multi-type disclosure |
| 3 | ×1.40 | Moderate multi-type disclosure |
| 4 | ×1.70 | High multi-type disclosure |
| 5 or more | ×2.00 | Extensive multi-type disclosure |

### Formula

`Pre-governance Risk Score = (Sum of base scores of distinct scoring units) × Distinct Entity-Type Multiplier`

Calculation sequence:
1. Filter out findings that are not eligible for scoring.
2. Convert eligible findings to scoring-unit keys.
3. Deduplicate the keys.
4. Sum each unique unit's base score once.
5. Select the multiplier using the number of unique scoring units.
6. Multiply the base-score sum by the selected multiplier.

Do not apply the multiplier to the number of findings. Do not count context indicators as scoring units. Do not multiply each entity's base score separately.

## 4. Preliminary classification thresholds — Manuscript Table 13

Classify the calculated pre-governance score as follows:

| Pre-governance score | Preliminary risk level | Interpretation |
|---:|---|---|
| 0 | No Risk (UI label: "No Detected Risk") | No supported validated scoring entity detected |
| 2–4.99 | Low | Limited information or low-impact identifiers with low standalone identifiability |
| 5–14.99 | Moderate | Direct personal information or a combination of identifying entities not reaching the defined High threshold |
| 15 or higher | High | Broad disclosure involving multiple distinct entity types |

The classification at this stage is **preliminary**. Governance rules may escalate, cap, or retain it.

A zero score means that no supported validated scoring entity was detected by the configured rules. It does not establish that a prompt is universally safe or that it contains no sensitive information outside TrustPrompt's supported detection scope.

### Design implication

Under the specified base scores and multiplier, a prompt without a validated critical entity reaches a pre-governance score of 15 or higher only when it contains a sufficiently broad combination of distinct scoring units. Do not use this observation to add an independent High-risk override; the governance rules are specified separately.

## 5. Governance handoff

After preliminary classification, pass the score and relevant consolidated findings to the governance engine described in `governance-rules.md`.

The risk-scoring engine must not duplicate, reorder, or independently modify governance rules. It must provide the governance stage with the information needed to evaluate the rules, including:
- consolidated validated findings;
- pre-governance numeric score;
- distinct scoring-unit count;
- preliminary classification; and
- raw prompt text where required for contextual-anchor and exclusion checks.

The final classification is determined by the governance rules, not by the preliminary score alone.

## 6. System response by final risk level — Manuscript Table 16

The response mapping uses the **final** classification after governance evaluation.

| Final risk level | UI indication | Response tier | User-facing behavior |
|---|---|---|---|
| No Risk | Green badge | Allow | Prompt proceeds without interruption. |
| Low | Yellow badge | Allow | Submission is allowed; an optional passive notice may be shown. |
| Moderate | Orange badge | Notify | Notify the user and show detected entity types and a disclosure-risk explanation. |
| High | Red badge | Warn | Show a warning and a recommended masked version. The user may proceed with the original prompt or copy the masked version. |

TrustPrompt does not block submission or enforce masking. If the user chooses to proceed, the original prompt may be submitted unmodified.

## 7. Evidence-source reliability gate

The risk-scoring engine processes only findings that pass the detection pipeline's reliability filter.

| Evidence source | Reliability | Scoring eligibility |
|---|---|---|
| RegEx + Validator.js | High | Eligible when the pattern matches and the applicable mathematical validation passes. |
| Gazetteer exact match | High | Eligible when it exactly matches a controlled wordlist. |
| Gazetteer fuzzy match | Moderate | Eligible when accepted at or above the ≥0.8 Levenshtein similarity threshold. |
| Compromise.js / NLP-based | Moderate | Eligible when accepted by the configured grammar-based NER process. |
| RegEx match, validator fails | Low | Dropped; must not reach risk scoring. |
| Gazetteer fuzzy match below 0.8 | Low | Dropped; must not reach risk scoring. |

Do not reinterpret or change reliability thresholds in this file. Detection-source reliability and validation behavior belong to the detection/validation specification.

## 8. Source-code block scoring

Source code blocks are Moderate-impact entities with a base score of 5.

Detection uses weighted structural features:

| Feature | Weight | Evidence strength |
|---|---:|---|
| Import/require statement | 3 | Strong |
| Code keywords | 3 | Strong |
| Braces `{}` | 2 | Strong |
| Function-call pattern | 2 | Strong |
| Consistent indentation | 2 | Moderate |
| Semicolon line terminator | 1 | Weak |
| Assignment/comparison operators | 1 | Weak |
| camelCase/snake_case identifiers | 1 | Weak |
| Comment markers | 1 | Weak |
| Line density | 1 | Weak |

A block is classified as source code when its structural-feature total is **at least 6** and at least **one Strong indicator** is present.

Do not award multiple source-code base scores for multiple structural features within the same detected source-code entity. The source-code finding contributes according to its scoring-unit identity and the standard deduplication process.

## 9. Required implementation constraints

- Run scoring locally in the browser. Prompt content must not be transmitted externally as part of risk scoring.
- Use `BASE_SCORES[patternId]` as the scoring source. The `risk` field on a finding is for UI display only and must never determine the numeric score.
- Deduplicate by scoring-unit key before summing scores or determining the multiplier.
- Keep the main-thread and Web Worker implementations consistent.
- `computeRiskScore(findings, fullText)` and `evaluateGovernance(findings, preliminary, fullText)` require raw prompt text for the first-person anchor and contextual-exclusion logic.
- Call sites must pass the raw prompt text from `scanner.js` `scan()` and the `trust-worker.js` SCAN handler.
- Do not return early from `computeRiskScore()` merely because the numeric base total is zero if a first-person self-attribution anchor and a sensitive-context finding may still require governance evaluation.
- The scoring worker is currently disabled in `worker-bridge.js`. If it is re-enabled, `worker-data-bundle.js` must include supplementary medical terms.
- Do not add a context bonus, entity-correlation bonus, semantic ownership inference, likelihood estimate, or any additional factor not defined by the approved framework.
- Do not alter the detection categories, reliability thresholds, governance precedence, or user-response behavior through changes to the scoring formula.

## 10. Worked scoring examples — Manuscript Table 17

These examples illustrate scoring-unit aggregation and preliminary-to-final classification. Governance outcomes are shown where specified.

| Scenario | Distinct scoring units | Base-score sum | Calculation | Governance / final result |
|---|---:|---:|---|---|
| Personal name only | 1 | 2 | 2 × 1.00 = 2.00 | Low |
| Email address only | 1 | 5 | 5 × 1.00 = 5.00 | Moderate |
| Personal name + email | 2 | 7 | 7 × 1.20 = 8.40 | Moderate |
| Email + organization + job title | 2 | 7 | 7 × 1.20 = 8.40 | Moderate |
| Personal name + email + phone | 2 | 7 | 7 × 1.20 = 8.40 | Moderate |
| Email + phone | 1 | 5 | 5 × 1.00 = 5.00 | Moderate |
| Organization + job title | 1 | 2 | 2 × 1.00 = 2.00 | Low |
| Validated Philippine Passport number | 1 | 10 | 10 × 1.00 = 10.00; preliminary Moderate | Rule 1 → High |
| Credit card + personal name | 2 | 12 | 12 × 1.20 = 14.40; preliminary Moderate | Rule 1 → High |
| Name + organization + job title + department + IP address | Requires verification; see source discrepancy below | — | Do not rely on the manuscript's stated 5-unit / 20.00 calculation without resolving the grouping conflict. | Rule 3 may cap an all-Low result at Moderate. |
| Name + medical context | 1 scored unit + context indicator | 2 | 2 × 1.00 = 2.00; preliminary Low | Rule 2 may raise to Moderate if its trigger and exclusion conditions are met. |
| Financial term only | 0 | 0 | 0 | No Rule 2 trigger; No Risk |
| "I was diagnosed with diabetes" | 0 scored units + anchor/context | 0 | 0 | Rule 2 anchor path → Low, if the governance conditions are met. |
| "Maria is researching cancer for her thesis paper." | 1 name unit + context | 2 | 2 × 1.00 = 2.00 | Rule 2 escalation suppressed by contextual exclusion, if the filter matches; Low |
| "My name is Carlo and I have hypertension." | 1 name unit + context | 2 | 2 × 1.00 = 2.00 | Rule 2 → Moderate, if attribution is detected. |

## 11. Known source discrepancy requiring explicit resolution

The manuscript refinement note states that the example:

`Name + Organization + Job title + Department + IP address`

contains five Low-impact types, has a base-score sum of 10, uses ×2.00, and produces 20.00.

However, the scoring-unit definitions in this same framework group:
- `trigger_employer`,
- `nlp_organization`, and
- `nlp_job_title`

into one Organizational Affiliation unit, while Department is explicitly not included in that group.

Under the stated grouping rules, the example appears to contain four units:
1. Personal name (2)
2. Organizational Affiliation (2)
3. Department (2)
4. IP address (2)

That would produce a base-score sum of 8 and a ×1.70 multiplier (four units), for a pre-governance score of 13.60—not 20.00. Rule 3 would still cap an all-Low result at Moderate.

**Do not silently choose between the example and the formal grouping rules.** The manuscript owner/research team must confirm whether:
- Department should be included in the Organizational Affiliation unit;
- Department should remain a separate scoring unit and the worked example should be corrected; or
- another approved grouping definition is intended.

Until resolved, implement the explicit `SCORING_UNIT_GROUPS` definitions and flag the worked-example discrepancy in documentation and tests.

## 12. Change-control checklist

Before changing the scoring engine, verify:

- [ ] Entity types and base scores still match Table 10.
- [ ] Scoring-unit groups still match the approved grouping definitions.
- [ ] Repeated findings and grouped fields are deduplicated by scoring-unit key.
- [ ] Multiplier uses the count of distinct scoring units.
- [ ] The formula sums unit base scores before applying the multiplier.
- [ ] Preliminary thresholds still match Table 13.
- [ ] Context indicators contribute no numeric score.
- [ ] Governance remains a separate subsequent stage.
- [ ] Final UI response uses the post-governance classification.
- [ ] Main-thread and worker calculations remain equivalent.
- [ ] Tests cover grouped-field combinations, repeated occurrences, boundary scores, and context-only prompts.
- [ ] Scoring-eligibility gates (job title, organization, personal attributes) are unchanged, or the change is approved, and are mirrored in `scanner.js` and `trust-worker.js`.
- [ ] Any discrepancy with the approved manuscript is documented and explicitly resolved rather than silently patched.