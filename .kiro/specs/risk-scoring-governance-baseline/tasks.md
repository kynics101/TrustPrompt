# Implementation Plan: Risk Scoring and Governance Baseline — Analysis and Verification Tasks
 
## Overview

These tasks are for systematic verification and documentation of the TrustPrompt Privacy Disclosure Risk Assessment Engine (PDRAE) baseline. Every task involves reading code, running existing tests, or writing targeted confirmation scripts — not modifying or fixing anything. Findings should be recorded as annotations on the relevant RSG requirements in `requirements.md` or `design.md`.

---

## Tasks

- [ ] 1. Verify scoring lookup tables in both execution paths
  - [ ] 1.1 Verify that the `BASE_SCORES` object in `scanner.js` matches the exact values in the RSG-010 table (25 patternId entries including `source_code: 0`)
    - Open `scanner.js` and locate `BASE_SCORES`. Compare each entry against the table in RSG-010 AC1.
    - _Requirements: RSG-010 AC1_
  - [ ] 1.2 Verify that the `BASE_SCORES` object in `trust-worker.js` is byte-for-byte identical to the one in `scanner.js`
    - Compare both definitions. Document any discrepancy.
 
    - _Requirements: RSG-010 AC3_
  - [ ] 1.4 Verify that the `ENTITY_TIER` object in `trust-worker.js` is identical to the one in `scanner.js`
    - _Requirements: RSG-010 AC3_
  - [ ] 1.5 Verify that `SENSITIVE_CONTEXT_IDS` contains exactly the four members listed in RSG-010 AC4: `gazetteer_medical`, `gazetteer_financial`, `trigger_health`, `trigger_financial`
    - Check both `scanner.js` and `trust-worker.js`. Document any extra or missing members.
    - _Requirements: RSG-010 AC4_

- [ ] 2. Verify the multiplier and preliminary classification functions
  - [ ] 2.1 Verify that `getMultiplier()` returns the exact five values in RSG-012 AC1: 1.00, 1.20, 1.40, 1.70, 2.00 for counts 1–4 and ≥5
    - Confirm that the function handles counts above 5 the same as count 5.
    - _Requirements: RSG-012 AC1_
  - [ ] 2.2 Verify that `computeRiskScore()` rounds the pre-score using `Math.round(preScore * 100) / 100` and not any other rounding method
    - _Requirements: RSG-012 AC3_
  - [ ] 2.3 Verify that `preliminaryClass()` uses strict `>=` comparisons evaluated in descending order (10, then 5, then 2) with the exact string values `"high"`, `"moderate"`, `"low"`, `"none"`
    - _Requirements: RSG-013 AC1, AC2, AC3_
  - [ ] 2.4 Verify boundary values manually: confirm `preliminaryClass(1.99)` → `"none"`, `preliminaryClass(2.00)` → `"low"`, `preliminaryClass(4.99)` → `"low"`, `preliminaryClass(5.00)` → `"moderate"`, `preliminaryClass(9.99)` → `"moderate"`, `preliminaryClass(10.00)` → `"high"`
    - Trace through the function logic by hand or via a Node.js REPL call. Document the result.
    - _Requirements: RSG-013 AC2_

- [ ] 3. Verify governance rule conditions and ordering
  - [ ] 3.1 Verify that `evaluateGovernance()` in `scanner.js` is structured as a cascading `if / else if` chain (not parallel conditions), and that Rule 1 is the first branch
    - _Requirements: RSG-020 AC2_
  - [ ] 3.2 Verify that `evaluateGovernance()` in `trust-worker.js` has the identical rule-ordering structure as `scanner.js`
    - _Requirements: RSG-020 AC2_
  - [ ] 3.3 Verify Rule 1 condition: `findings.some(f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true)` — confirm both conditions are ANDed on the same finding object
    - _Requirements: RSG-021 AC1_
  - [ ] 3.4 Verify Rule 1 return value: `{ rule: "critical_entity", result: "high" }` and that `finalClass()` returns `"high"` unconditionally for this case
    - _Requirements: RSG-021 AC2_
  - [ ] 3.5 Verify Rule 2 condition: confirm `hasSignificantOrCritical` checks for tier `"critical"` OR `"significant"` (not `"contextual"`), and `hasSensitiveContext` uses `SENSITIVE_CONTEXT_IDS.has()`
    - _Requirements: RSG-022 AC1_
  - [ ] 3.6 Verify Rule 2 raise logic: confirm it uses `RISK_ORDER[preliminary] + 1` with an `Object.keys().find()` lookup and is guarded by `RISK_ORDER[preliminary] < RISK_ORDER["high"]`
    - _Requirements: RSG-022 AC2_
  - [ ] 3.7 Verify Rule 2 effective raise table: trace `none` → `low`, `low` → `moderate`, `moderate` → `high`, `high` → `high` through the code
    - _Requirements: RSG-022 AC3_
  - [ ] 3.8 Verify Rule 3 condition: confirm `scoredFindings` is computed by filtering `findings` to entries where `BASE_SCORES[f.patternId] > 0`, that `hasAnyScoredEntity` checks `scoredFindings.length > 0`, and that `allLowImpact` checks every scored finding has `BASE_SCORES[f.patternId] === 2`
    - _Requirements: RSG-023 AC1_
  - [ ] 3.9 Verify Rule 3 ceiling logic in `finalClass()`: confirm the rule name is `"low_impact_cap"` and that it returns `"moderate"` when `RISK_ORDER[preliminary] > RISK_ORDER["moderate"]` and returns `preliminary` unchanged otherwise
    - _Requirements: RSG-023 AC3_
  - [ ] 3.10 Verify that `computeRiskScore()` passes the **full** merged-and-suppressed findings array (not the scorable-filtered subset) to `evaluateGovernance()`
    - _Requirements: RSG-011 AC4_

- [ ] 4. Verify merge, deduplication, and suppression logic
  - [ ] 4.1 Verify that `mergeAndDedupe()` deduplicates by `rawMatch.trim().toLowerCase()` and retains the finding with the higher `RISK_ORDER[f.risk]` value when a conflict occurs
    - _Requirements: RSG-005 AC1_
  - [ ] 4.2 Verify that `suppressPlaceholders()` checks both the `PLACEHOLDER_SUPPRESSIONS` lookup (normalized value per patternId) and the `PLACEHOLDER_PATTERNS` structural regexes
    - Confirm the exact suppression entries from RSG-005 AC3 are present: the seven Stripe test card numbers, the AWS documentation key fragments, and the jwt.io token segment.
    - _Requirements: RSG-005 AC2, AC3_
  - [ ] 4.3 Verify the six structural `PLACEHOLDER_PATTERNS` regexes from RSG-005 AC4 are all present: template placeholder, `YOUR_*`, all-x, all-zero, all-one, and the keyword list pattern
    - _Requirements: RSG-005 AC4_

- [ ] 5. Verify detection path eligibility and field behavior
  - [ ] 5.1 Verify that `ph_mobile` has no `regex` field in `TRUSTPROMPT_PATTERNS` and that both `scanner.js` and `trust-worker.js` `runPathA()` functions skip it via the `if (!pattern.regex) continue` guard
    - _Requirements: RSG-054 AC1_
  - [ ] 5.2 Verify that `nlp_person_name`, `nlp_job_title`, and `nlp_organization` all have `regex: null` in `TRUSTPROMPT_PATTERNS`
    - _Requirements: RSG-002 AC2_
  - [ ] 5.3 Verify that Path A finding objects do NOT include a `reason` field, and that `ui.js` maintains its own separate `WHY` map
    - _Requirements: RSG-042 AC1, AC2_
  - [ ] 5.4 Verify that all Path B findings (from `gazetteer.js`) have no `validated: true` assignment — confirm the return objects from `runGazetteerScan()` and `runTriggerScan()` never set `validated: true`
    - _Requirements: RSG-003_
  - [ ] 5.5 Verify that all Path C findings (from `linguistic-detector.js`) are created with `validated: false` explicitly
    - _Requirements: RSG-004 AC7_

- [ ] 6. Verify `validated` flag divergence between execution paths
  - [ ] 6.1 Verify main-thread behavior: confirm `TrustValidator.validate(null, rawMatch)` in `validator-wrapper.js` returns `true` unconditionally, and that all surviving Path A findings in `scanner.js` receive `validated: true`
    - _Requirements: RSG-040 AC1_
  - [ ] 6.2 Verify worker behavior: confirm `TrustValidatorWorker.validate(null, rawMatch)` in `validator-wrapper-worker.js` returns `{ passed: true, tier: "3_regex_only" }`, and that `trust-worker.js` sets `validated = (tier !== "3_regex_only")` — yielding `false` for Tier 3
    - _Requirements: RSG-040 AC2_
  - [ ] 6.3 Verify the structural override in `trust-worker.js`: confirm that if `validated` is `false` AND `pattern.structuralValidate` is a function AND `pattern.structuralValidate(rawMatch)` returns `true`, `validated` is overridden to `true`
    - _Requirements: RSG-040 AC3_
  - [ ] 6.4 Verify the `structuralValidateApiKey()` function in `patterns.js`: confirm it checks for the vendor prefix regexes listed in RSG-002 AC6 (OpenAI `sk-`, GitHub `ghp_`/`gho_`/`github_pat_`, Slack `xoxb-`/`xoxp-`, AWS `AKIA`, Google `AIza`/`ya29.`)
    - _Requirements: RSG-002 AC6_
  - [ ] 6.5 Verify that `isMeasurementContext()` exists in `scanner.js` but is absent from `trust-worker.js`, and that it is applied only to `phone_intl` matches
    - _Requirements: RSG-041 AC1, AC2_

- [ ] 7. Gap analysis — scan for undocumented entries

  - [ ] 7.1 Enumerate every `patternId` present in `TRUSTPROMPT_PATTERNS` in `patterns.js` and compare against the BASE_SCORES table in RSG-010. Flag any patternId that appears in `patterns.js` but is absent from RSG-010, or vice versa.
    - _Requirements: RSG-010_
  - [ ] 7.2 Enumerate every `category` value in the `TRIGGERS` array in `gazetteer.js` and produce a list of all distinct `trigger_{category}` patternIds. Compare against the contextual tier list in RSG-010 AC3. Flag any trigger category not documented.
    - _Requirements: RSG-010 AC3, RSG-051_
  - [ ] 7.3 Confirm whether `gazetteer_nationality_religion` appears in `BASE_SCORES` or `ENTITY_TIER` in either `scanner.js` or `trust-worker.js`. Record the exact result (present/absent, value if present).
    - _Requirements: RSG-050 AC1, AC2_
  - [ ] 7.4 Confirm whether `trigger_religion` appears in `BASE_SCORES` or `ENTITY_TIER` in either file. Record the exact result.
    - _Requirements: RSG-051 AC1_
  - [ ] 7.5 Check whether `source_code` findings ever receive `validated: true` on either path. Trace through the `validate: null` → `TrustValidator.validate(null)` → boolean `true` on main thread, and through the Tier 3 → `validated: false` path on the worker. Document whether any structural override applies to `source_code`.
    - _Requirements: RSG-058 AC1_
  - [ ] 7.6 Confirm whether the `COMMON_FIRST_NAMES` set in `linguistic-detector.js` matches the exact 21-entry list in RSG-059 AC1. Record any additions or removals.
    - _Requirements: RSG-059 AC1_
  - [ ] 7.7 Confirm whether the `COMMON_JOB_TITLES` set in `linguistic-detector.js` matches the 16-entry list in RSG-004 AC6. Record any additions or removals.
    - _Requirements: RSG-004 AC6_
  - [ ] 7.8 Confirm whether `password_inline` is still commented out in `patterns.js` and that no active pattern entry produces a `password_inline` finding.
    - _Requirements: RSG-056 AC1_
  - [ ] 7.9 Check whether Path C can ever produce `validated: true` on any code path, or whether all Path C findings are unconditionally `validated: false`.
    - _Requirements: RSG-004 AC7_

- [ ] 8. Assess existing test coverage against requirements

  - [ ] 8.1 Run `node test-normalizer.js` and document: total assertions, number passed, number failed, and which RSG requirements each test group covers
    - _Requirements: RSG-070 AC1, RSG-001_
  - [ ] 8.2 Run `node test-scanner-pathc.js` and document: total test cases, pass/fail status for each, and which RSG requirements each test case exercises
    - _Requirements: RSG-070 AC2_
  - [ ] 8.3 For each of `test-linguistic-detector.js`, `test-phone-context.js`, `test-phone-fix.js`, and `test-backward-compat.js`: run the file, record pass/fail output, and identify which RSG requirements (if any) each file covers
    - _Requirements: RSG-070 AC4_
  - [ ] 8.4 Assess whether any existing test exercises `computeRiskScore()` directly with a controlled findings array and asserts exact `{ score, riskLevel, governance }` output
    - If none found, record as confirmed gap against RSG-071 AC1.
    - _Requirements: RSG-071 AC1_
  - [ ] 8.5 Assess whether any existing test exercises `preliminaryClass()` at the exact boundary values: 1.99, 2.00, 4.99, 5.00, 9.99, 10.00
    - If none found, record as confirmed gap against RSG-071 AC2.
    - _Requirements: RSG-071 AC2_
  - [ ] 8.6 Assess whether any existing test constructs a scenario where both Rule 1 and Rule 2 conditions are met and asserts `governance: "critical_entity"` (not `"sensitive_context"`)
    - If none found, record as confirmed gap against RSG-071 AC3.
    - _Requirements: RSG-071 AC3_
  - [ ] 8.7 Assess whether any existing test passes `gazetteer_nationality_religion` or `trigger_religion` findings into `evaluateGovernance()` and verifies that they are excluded from `scoredFindings` (score 0) and do not prevent Rule 3 from firing
    - If none found, record as confirmed gap against RSG-071 AC4, AC5.
    - _Requirements: RSG-071 AC4, AC5_
  - [ ] 8.8 Assess whether any existing test compares equivalent prompts through `scanner.js` and `trust-worker.js` to expose the `validated` flag divergence for `id_label` or `credit_card`
    - If none found, record as confirmed gap against RSG-071 AC6.
    - _Requirements: RSG-071 AC6_
  - [ ] 8.9 Produce a consolidated RSG coverage map: for each RSG requirement ID (RSG-001 through RSG-060), record whether it is covered (fully, partially, or not at all) by any current test file
    - _Requirements: RSG-070, RSG-071_

- [ ] 9. Confirm potential defects with targeted scripts

  - [ ] 9.1 Write a Node.js script that calls `evaluateGovernance()` directly with a findings array containing one `gazetteer_nationality_religion` finding (tier `undefined`) plus one `nlp_person_name` finding (tier `"limited"`), and a preliminary of `"high"`. Assert whether Rule 3 fires or not. Record the actual result against the documented behavior in RSG-050.
    - Expected per RSG-050 AC3: Rule 3 does NOT fire; `allLowImpact` is `false`.
    - _Requirements: RSG-050 AC3_
  - [ ] 9.2 Write an equivalent script for `trigger_religion` (RSG-051): same structure as 9.1 but substituting `trigger_religion` for `gazetteer_nationality_religion`. Record actual result.
    - Expected per RSG-051 AC2: Rule 3 does NOT fire.
    - _Requirements: RSG-051 AC2_
  - [ ] 9.3 Write a Node.js script that calls `computeRiskScore()` with a findings array representing name (via `trigger_person_name`) plus medical term (via `gazetteer_medical`). Assert the actual `riskLevel` and `governance` fields. Record whether the result is `"low"` + `"low_impact_cap"` (as documented in design.md Section 11 Key Discrepancy) or `"moderate"` + `"sensitive_context"`.
    - Expected per design.md: `riskLevel: "low"`, `governance: "low_impact_cap"`. This confirms the discrepancy between current behavior and manuscript intent.
    - _Requirements: RSG-022, RSG-032_
  - [ ] 9.4 Confirm `id_label` Rule 1 behavior on the main-thread path: write a script that creates a mock finding `{ patternId: "id_label", validated: true }` and calls `evaluateGovernance()`. Assert that the result is `{ rule: "critical_entity", result: "high" }`.
    - _Requirements: RSG-053 AC1_
  - [ ] 9.5 Confirm `id_label` Rule 1 behavior on the worker path: write an equivalent script using `validated: false`. Assert that Rule 1 does NOT fire (the result should be `rule: "low_impact_cap"` or `rule: "none"` depending on other findings).
    - _Requirements: RSG-053 AC2_
  - [ ] 9.6 Confirm `credit_card` Rule 1 behavior: write a script that creates `{ patternId: "credit_card", validated: true }` and confirms Rule 1 fires, then repeat with `validated: false` and confirm Rule 1 does not fire. This documents the main-thread vs worker difference for credit cards.
    - _Requirements: RSG-040 AC4, AC5_
  - [ ] 9.7 Confirm Path C fallback-mode single-match limitation (RSG-060): inspect `linguistic-detector.js` fallback branch and verify whether each entity extraction step uses `exec()` (single match) or a `while` loop. Record the exact line(s).
    - _Requirements: RSG-060 AC1_
  - [ ] 9.8 Confirm the `risk: "moderate"` label discrepancy for `ipv4`, `ipv6`, `mac_address` (RSG-052): check `patterns.js` for the `risk` field value on each of these three entries and compare against their `BASE_SCORES` value of `2` in `scanner.js`. Document whether the two sources are inconsistent.
    - _Requirements: RSG-052 AC1_
  - [ ] 9.9 Confirm the `trigger_financial` high-risk entry discrepancy (RSG-057): locate the two trigger entries in `gazetteer.js` with `risk: "high"` (`"my account number is"` and `"my card number is"`), and confirm that their `patternId` after trigger scan is `"trigger_financial"` and that `BASE_SCORES["trigger_financial"] = 2`. Document the mismatch.
    - _Requirements: RSG-057 AC1, AC2_

- [ ] 10. Gather evidence for open questions

  - [ ] 10.1 Search `gazetteer.js` for all calls that produce `patternId: "gazetteer_nationality_religion"` findings. Identify whether there is any comment, note, or inline documentation suggesting these findings were intentionally excluded from `BASE_SCORES` and `ENTITY_TIER`. Record findings to inform RSG-080.
    - _Requirements: RSG-080_
  - [ ] 10.2 Search the codebase (all `.js` files) for any comment, TODO, FIXME, or note referencing `allLowImpact`, `gazetteer_nationality_religion`, or `trigger_religion` that might indicate whether the Rule 3 prevention behavior (RSG-081) is intentional or a side effect.
    - _Requirements: RSG-081_
  - [ ] 10.3 Search `validator-wrapper.js` and `validator-wrapper-worker.js` for any comment or documentation explaining the fail-open vs tier-based `validated` assignment difference. Check `review.md` for any known issue entry addressing this divergence. Record findings to inform RSG-082.
    - _Requirements: RSG-082_
  - [ ] 10.4 Search `patterns.js` for the `id_label` pattern definition. Check whether there is any comment explaining why `validate: null` was used (rather than a structural validator) for a pattern meant to detect government IDs. Record findings to inform RSG-083.
   
    - _Requirements: RSG-084, RSG-085, RSG-086, RSG-087_

- [ ] 11. Final checkpoint — reconcile findings
  - Review all tasks above that produced discrepancies between the spec and the code. For each discrepancy, annotate the relevant requirement in `requirements.md` with an "Observed Discrepancy" note.
  - Review all tasks that produced confirmed behavior matching the spec. Mark those requirements as "Verified" in `requirements.md`.
  - Ensure all eight coverage gaps from RSG-071 are recorded as either "Confirmed gap" or "Gap resolved by existing test" based on the results of Section 8 tasks.
  - Ensure all open questions from RSG-080–087 are updated with "Evidence found" or "No evidence found" based on the results of Section 10 tasks.

---

## Notes

- Tasks marked with no sub-items are standalone analysis steps that do not require test execution.
- All targeted scripts written in Section 9 should be placed in the workspace as `test-rsg-*.js` files and run via `node test-rsg-*.js`. They are dev-only confirmation scripts, not permanent test files.
- This task list does not prescribe any fixes. If a confirmed defect warrants a fix, that is a separate spec.
- All RSG requirement IDs reference `requirements.md` in this spec directory.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "3.2", "5.1", "5.2", "5.3", "5.4", "5.5", "6.4", "6.5"] },
    { "id": 2, "tasks": ["2.4", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "6.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.3", "7.1", "7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9"] },
    { "id": 4, "tasks": ["8.1", "8.2", "8.3", "8.4", "8.5", "8.6", "8.7", "8.8", "9.7", "9.8", "9.9", "10.1", "10.2", "10.3", "10.4", "10.5"] },
    { "id": 5, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 6, "tasks": ["8.9"] }
  ]
}
```
