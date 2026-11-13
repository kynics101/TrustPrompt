# Implementation Plan

- [ ] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Role-Statement Job Titles Dropped
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - Create standalone Node script `tests/job-title-context.bugcondition.test.js` (run with `node`, no test runner)
  - Load `terms-occupations.js` and `linguistic-detector.js` into a `vm` context with a `window` shim; create a FRESH context per mode because `COMPROMISE_AVAILABLE` is a module-load `const`: (a) no-nlp `window = {}`, (b) nlp-stub `window = { nlp: stub }` with minimal `sentences()`/`match` so `checkBadPOS` returns false
  - **Scoped PBT Approach**: hand-rolled seeded PRNG generator over anchors, adverbs (0-3 fillers), apostrophe variants (straight/curly), and titles; scope to concrete failing cases from isBugCondition
  - Assert `nlp_job_title` is reported for: "I'm sometimes a graphic designer"; "I'm a nurse, sometimes a librarian"; "As a freelancer, ..."; curly "I’m a graphic designer"; "Designer bags sell. I'm a designer."; supplementary titles (freelancer, virtual assistant, tricycle driver); upper-case "VA" with first-person anchor; and no contained duplicates (e.g. `driver` inside `tricycle driver`)
  - Assert the full example prompt "As a freelancer, I'm sometimes a graphic designer, sometimes a VA, and on weekends a tricycle driver. How do I declare my income to the BIR?" yields findings for freelancer, graphic designer, VA, tricycle driver
  - Run on UNFIXED code in both modes
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples (e.g. "no nlp_job_title for 'I'm sometimes a graphic designer'; zero findings for example prompt")
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-Buggy Job Title Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Create `tests/job-title-context.preservation.test.js`; save the original detector via `git show HEAD:linguistic-detector.js` to a temp baseline file for comparison; same VM/window-shim harness, fresh context per mode (no-nlp and nlp-stub)
  - Observe on UNFIXED code: "the printer driver crashed" and "designer bags" produce no job title (nlp mode); "Maria is a librarian" and "I work as a nurse" are detected; "I live in VA", "the VA hospital", "Virginia", lower-case "va" produce no job title; person/organization findings for generated prompts
  - Write property-based tests (seeded generators): for non-bug inputs, original and current findings are identical (job titles, person names, organizations); non-anchored "the {title} crashed" sentences stay filtered; VA in random non-anchored positions never reported
  - Confirm scoring is untouched: multiple `nlp_job_title` findings still count as one Organizational Affiliation unit (base 2); DEF-007 guard in `gazetteer.js` unchanged
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior to preserve)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 3. Fix for job titles dropped in first-person role statements

  - [ ] 3.1 Implement the fix in `linguistic-detector.js`
    - Rewrite `checkJobContext(text, actualSpan)` as sentence-scoped: normalize curly apostrophes (`’ ‘` to `'`, char-for-char so indexes align); iterate ALL word-boundary occurrences of the span and accept if any passes; per occurrence take `before` from the sentence start (previous `.`, `!`, `?`, newline, or text start); accept legacy 50-char literal triggers (superset) OR role anchor (`I'm/I am/he's/she's/you're/they're/we're/X is|are|was|were`, up to 3 filler adverbs, then article; `as a/an`; `work(s|ed|ing) as`; `employed as`; `hired as`) with the span directly after the anchor or following an article after filler/time phrase (list continuation) with an anchor earlier in the same sentence; anchors in prior sentences do not count
    - Add `SUPPLEMENTARY_JOB_TITLES` (`freelancer`, `virtual assistant`, `tricycle driver`, `jeepney driver`) merged into `titles` in `initializeExtensiveJobTitles` AND in the `catch` fallback path; sort longest-first in both
    - Add case-sensitive, anchor-gated `findVAJobTitle(text)` (`/\bVA\b/`, no `i` flag; first-person anchor + filler + article in same sentence); emit `name: 'virtual assistant'`, `rawMatch: 'VA'`, `source: 'csv_exact_match'`, `confidence: 'high'`; wire into `scan()` STAGE 2 next to `findJobTitlesCSVFirst`, bypassing the compromise gate; do not add VA to the vocabulary (no fuzzy matching)
    - Add `dropContainedJobTitles(findings, text)` applied after STAGE 3 and before STAGE 4: drop accepted findings whose span lies inside a longer accepted finding's span
    - Do NOT change scoring files, governance, person/org detection, `gazetteer.js`, or `linguistic-detector-refactored.js`
    - _Bug_Condition: isBugCondition(X) - occupation term in role statement with adverb between copula and article, list continuation, "As a", curly apostrophe, later-occurrence-only context, or vocabulary gap (freelancer, virtual assistant, VA, tricycle driver)_
    - _Expected_Behavior: every qualifying span reported as nlp_job_title with no contained duplicates (Property 1 in design)_
    - _Preservation: non-job uses filtered, VA negatives rejected, existing true positives, other entities, scoring and governance unchanged (Property 2 in design)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Role-Statement Job Titles Detected
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - Run `tests/job-title-context.bugcondition.test.js` in both no-nlp and nlp-stub modes
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-Buggy Job Title Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run `tests/job-title-context.preservation.test.js` in both modes
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)

  - [ ] 3.4 Full example-prompt integration check
    - Scan "As a freelancer, I'm sometimes a graphic designer, sometimes a VA, and on weekends a tricycle driver. How do I declare my income to the BIR?" through the scanner pipeline (with and without the nlp stub)
    - Expect exactly 4 `nlp_job_title` findings (freelancer, graphic designer, VA, tricycle driver), no contained duplicate (`driver`, `designer`), score 2.00 (one Organizational Affiliation unit, x1.00), final risk Low
    - Verify DEF-007 guard still applies to "How do I declare my income" (no escalation) and that mixed prompts with names/organizations give unchanged name/org findings
    - _Requirements: 2.7, 3.4, 3.5, 3.6_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass (bug condition, preservation, integration), ask the user if questions arise.
