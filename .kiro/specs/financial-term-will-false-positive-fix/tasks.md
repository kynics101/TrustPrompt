# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Modal "will" Is Not a Financial Context Term
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - Create standalone Node script `test-financial-will.js` (no new dependencies, matching the existing `test-*.js` style)
  - Load the real `terms-financial.js` and `gazetteer.js` in a VM context (as `scripts/build-worker-bundle.js` does), so `FINANCIAL_TERMS_DATA` is present; if no finding appears, re-check the harness loaded the data
  - **Scoped PBT Approach**: Hand-rolled generator of modal-"will" sentence templates (`I will ...`, `Will you ...`, `It will be ...`, `WILL`/`will`/`Will` casing) combined randomly with entities (email, phone, name) and with the concrete cases below
  - isBugCondition: prompt contains standalone word "will" AND NOT part of an estate phrase (`last will and testament`, `my will`, `probate of the will`, `living will`, ...)
  - Assert expectedBehavior: no `gazetteer_financial` finding for "will"; the final level equals the level of the same prompt with "will" replaced by "shall" (lone email stays Moderate; no scored entity and no anchor gives No Risk)
  - Concrete cases: `Please email maria.santos@company.com, I will send the report tomorrow.`, `Will you review this draft?`, `It will be ready tomorrow.`, `Will Smith joined the call.`
  - Also include a full `scan()` check (via `scanner.js`) that email + modal "will" yields Moderate rather than High (Rule 2 not applied)
  - Run on UNFIXED code: `node test-financial-will.js`
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found (e.g., "`gazetteer_financial` with rawMatch `Will` on `Will you review this draft?`; email + 'will' raised Moderate to High")
  - Mark task complete when the test is written, run, and the failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Estate-Sense "Will" and All Other Terms Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Step A, baseline snapshot: add a snapshot mode to `test-financial-will.js` (or a companion script, e.g. `test-financial-will-baseline.js`) that runs a generated corpus through the UNFIXED `gazetteer.js` and `scanner.js` and saves findings, risk score, and final level per prompt to a JSON file (e.g. `financial-will-baseline.json`)
  - Corpus (all non-bug-condition inputs): 
    - many entries sampled from `FINANCIAL_TERMS_DATA` (excluding bare `Will`) inside templates
    - estate phrases: `last will and testament`, `my will`, `probate of the will`, `the deceased's will`, `living will`
    - genuine financial term + scored entity, e.g. `My salary is 50000, email me at a@b.com` (Rule 2 escalates Moderate to High)
    - medical and ethnic context, e.g. `I was diagnosed with diabetes`, `Ilocano`
    - entity-only prompts and prompts with no "will"
    - `My salary will increase.` observed on unfixed code (note: it contains modal "will", so treat it as a bug-condition case for the "will" part only; assert only that `salary` is still detected)
  - Observe on UNFIXED code and record: estate phrases yield `gazetteer_financial`; other terms are detected as before; Rule 2 behavior is unchanged
  - Step B, write property-based style checks (random template combinations) asserting that, for all non-bug-condition inputs, findings, risk score, and final level equal the snapshot
  - Step C, main vs worker parity: run the same corpus through `gazetteer.js` loaded with `terms-financial.js` and with the `worker-data-bundle.js` data (`self` shim) and assert equal results
  - Run on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code, and the baseline snapshot is saved
  - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Fix for modal "will" detected as financial context term

  - [ ] 3.1 Add EXCLUDED_FINANCIAL_WORDS and SUPPLEMENTARY_FINANCIAL_PHRASES in gazetteer.js
    - Read `gazetteer.js` first; match the existing `SUPPLEMENTARY_MEDICAL_TERMS` / `mergeSupplementaryMedical()` style and placement
    - Declare `EXCLUDED_FINANCIAL_WORDS = new Set(["will"])` with a comment explaining the modal-verb and personal-name ambiguity
    - Declare `SUPPLEMENTARY_FINANCIAL_PHRASES` (lowercase): `last will and testament`, `will and testament`, `last will`, `my will`, `the will of`, `the deceased's will`, `probate of the will`, `reading of the will`, `contest the will`, `execute the will`, `executor of the will` (`living will` already exists in the data); review the final list against Requirement 2.4
    - Use only letters, spaces, and an apostrophe in phrases (the scan regex escapes only `-`)
    - Do NOT edit `terms-financial.js`, `csv/financial_terms.csv`, `analyzeTermContext`, `scanner.js`, `trust-worker.js`, or governance code
    - _Bug_Condition: isBugCondition(X) where containsWord(X, "will") AND NOT isEstateSense(X, "will")_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: Preservation Requirements from design_
    - _Requirements: 2.1, 2.4, 3.4_

  - [ ] 3.2 Implement applyFinancialAdjustments() and call it on every load path
    - `applyFinancialAdjustments()`: remove `EXCLUDED_FINANCIAL_WORDS` from `FINANCIAL_WORDS`, add any missing supplementary phrases to `FINANCIAL_PHRASES` (deduplicated), re-sort phrases longest-first
    - Call after the initial financial load: the `FINANCIAL_TERMS_DATA` branch, the `window.FINANCIAL_TERMS_DATA` branch, and the data-absent case
    - Call inside `rebuildGazetteers()` after the financial lists are re-derived and before the `GAZETTEER` object is rebuilt (otherwise "will" is restored)
    - Confirm `initializeTerms()` builds `FIN_WORD_RE` / `FIN_PHRASE_RE` after the adjustment (it runs after `rebuildGazetteers()`); verify `GAZETTEER.financial` picks up the adjusted lists
    - Keep the `analyzeTermContext` financial guard (DEF-007) untouched
    - _Bug_Condition: isBugCondition(input) from design_
    - _Expected_Behavior: expectedBehavior(result) from design_
    - _Preservation: Preservation Requirements from design_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 3.3 Add unit checks for the adjustment
    - In `test-financial-will.js`: `FINANCIAL_WORDS` has no `will` after the initial load and after calling `rebuildGazetteers()`
    - `FINANCIAL_PHRASES` contains each estate phrase and is sorted longest-first
    - `runGazetteerScan("I will go")` has no financial finding; `runGazetteerScan("my last will and testament")` has one
    - Case variants `will`, `Will`, `WILL`
    - _Requirements: 2.1, 2.4_

  - [ ] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Modal "will" Is Not a Financial Context Term
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - Run `node test-financial-will.js`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed; email + modal "will" stays Moderate, bare "will" gives No Risk)
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Estate-Sense "Will" and All Other Terms Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Compare the corpus results against the saved baseline snapshot; run the main vs worker parity check
    - Confirm estate phrases still detected, Rule 2 still escalates for genuine financial context, and medical/ethnic context is unchanged
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 3.6 Verify worker bundle and main/worker parity
    - Run `npm run build:worker` and confirm `worker-data-bundle.js` is in sync (no content change expected, since term data files are untouched)
    - Run `node scripts/verify-worker-setup.js` to confirm the bundle is valid
    - Confirm `manifest.json` loads `gazetteer.js` in all three script groups, so the fix applies to the main thread and worker alike
    - Re-run the parity check against the regenerated bundle
    - _Requirements: 3.5, 3.6_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Run `node test-financial-will.js` and the preservation/parity checks; ensure all pass
  - Run existing related scripts (e.g. other `test-*.js` covering the gazetteer and governance) to confirm no regressions
  - Delete the temporary baseline snapshot if it is not intended to be kept
  - Ask the user if questions arise
