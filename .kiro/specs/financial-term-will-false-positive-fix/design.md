# Financial Term "Will" False Positive Bugfix Design

## Overview

The financial gazetteer contains the bare entry `Will` (estate-document sense) in `terms-financial.js`. `runGazetteerScan` in `gazetteer.js` matches every term with a case-insensitive `\bterm\b` regex, so the modal verb "will" ("I will send...", "Will you...") produces a `gazetteer_financial` finding. `analyzeTermContext` returns `true` for every financial term that is not a generic how-to question, so the false finding survives. With any scored entity present (for example an email), governance Rule 2 then raises the level by one (Moderate to High).

**Resolved design decision:** drop the bare word `will` from the financial word list inside `gazetteer.js` and add explicit estate-sense phrases (supplementary financial phrases). Do not use a context check, and do not edit `terms-financial.js` or the CSV.

Rationale:
- Bare "will" is not separable from the modal verb by any cheap deterministic rule. A context check would need a grammar heuristic ("my will", "the will of", preceding verb) and would still misfire in both directions ("I will inherit my father's will" vs "my will to live"). Phrases are explicit, auditable, and match the way `SUPPLEMENTARY_MEDICAL_TERMS` already works.
- Capitalised "Will" is also a common personal name. Keeping the bare term would keep mislabelling it as a financial context.
- `gazetteer.js` is loaded by both the main thread and the worker (`manifest.json` lists it in all three script groups). Fixing it there gives one source of truth, so main thread and worker cannot diverge.
- `terms-financial.js` is generated data derived from `csv/financial_terms.csv` (line 9892 "Will"). Editing it would be lost whenever the CSV is re-imported. Because the data files are untouched, `worker-data-bundle.js` content does not change. `npm run build:worker` is still run as a verification step to confirm the bundle is in sync.
- Scoring, multipliers, thresholds, governance rules, `scanner.js` and `trust-worker.js` are not touched. `gazetteer_financial` keeps base score 0.

## Glossary

- **Bug_Condition (C)**: A prompt that contains the standalone word "will" used as a modal verb (not in an estate/legal-document sense).
- **Property (P)**: No `gazetteer_financial` finding is produced for that word, and Rule 2 is not triggered by it.
- **Preservation**: Detection of all other financial terms, medical/ethnic context, scoring, and governance behavior must be unchanged.
- **FINANCIAL_WORDS / FINANCIAL_PHRASES**: Lowercased single-word and multi-word financial term lists built in `gazetteer.js` from `FINANCIAL_TERMS_DATA`.
- **rebuildGazetteers()**: Function in `gazetteer.js` that reloads the term lists from globals and rebuilds `GAZETTEER`. It runs from `initializeTerms()` and overwrites the initial load, so any filter must also live here.
- **SUPPLEMENTARY_FINANCIAL_PHRASES**: New list of estate-sense phrases merged after each load (same pattern as `SUPPLEMENTARY_MEDICAL_TERMS` / `mergeSupplementaryMedical()`).
- **EXCLUDED_FINANCIAL_WORDS**: New set holding terms removed from the financial word list (`"will"`).
- **Rule 2**: Sensitive-Context Co-occurrence governance rule (`SENSITIVE_CONTEXT_IDS` includes `gazetteer_financial`).

## Bug Details

### Bug Condition

The bug manifests when "will" appears as a standalone word. `runGazetteerScan` iterates `GAZETTEER.financial`, which includes the lowercase word `will` from `FINANCIAL_WORDS`. The regex `\bwill\b` with flag `i` matches "will", "Will", "WILL". `analyzeTermContext(..., "financial")` returns `true` unless the surrounding text is a procedural question with no amount, so the finding is emitted.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type PromptText
  OUTPUT: boolean

  RETURN containsWord(X, "will")
         AND NOT isEstateSense(X, "will")
END FUNCTION
```

where `isEstateSense(X, "will")` is true when "will" is part of one of the supplementary estate phrases (listed in Fix Implementation) or the existing phrase `living will`.

### Examples

- `Please email maria.santos@company.com, I will send the report tomorrow.` Actual: `email` + `gazetteer_financial:Will`, Rule 2 raises Moderate to High. Expected: `email` only, final level Moderate.
- `Will you review this draft?` Actual: `gazetteer_financial:Will`, shown as "CONTEXT: FINANCIAL". Expected: no findings, No Risk.
- `It will be ready tomorrow.` Expected: no findings.
- `Will Smith joined the call.` Expected: no financial finding (the name path is unchanged and handled elsewhere).
- Edge, not buggy: `My last will and testament names my brother as executor.` Expected: still a `gazetteer_financial` finding (phrase match).
- Edge, not buggy: `I need help with probate of the will.` Expected: still detected.
- Edge, not buggy: `My salary will increase.` Expected: `salary` still detected; "will" is not.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Every financial term other than bare "will" (salary, loan, payment, debt, payroll, tax filing, `living will`, and so on) is detected exactly as before, including the `analyzeTermContext` financial guard (DEF-007 generic-question suppression).
- Rule 2 continues to apply for genuine financial/medical/ethnic context with a scored entity or a first-person anchor, subject to the Contextual Exclusion Filter.
- Medical gazetteer (including `SUPPLEMENTARY_MEDICAL_TERMS`), nationality/religion, organization, eye color and sex/gender gazetteers are unchanged.
- `BASE_SCORES`, scoring-unit grouping, multipliers, thresholds, and governance Rules 1 to 4 are unchanged in `scanner.js` and `trust-worker.js`.
- Main thread and worker produce identical results for the same input.

**Scope:**
All inputs that do NOT contain the standalone word "will" outside an estate phrase are unaffected. This includes:
- Prompts with other financial terms.
- Prompts with medical, ethnic, or entity-only content.
- Prompts where "will" occurs only inside an estate phrase.

Note: the expected correct behavior is defined in Correctness Properties (Property 1).

## Hypothesized Root Cause

1. **Ambiguous single-word term in the data (confirmed by code reading)**: `terms-financial.js` line 9898 and `csv/financial_terms.csv` line 9892 contain `Will`. `initializeTerms()` to `rebuildGazetteers()` lowercases it into `FINANCIAL_WORDS`, and `runGazetteerScan` matches it with `\bwill\b`.

2. **No sense disambiguation in matching**: Matching is word-level and case-insensitive. Nothing distinguishes the modal verb from the legal noun.

3. **Permissive financial context check**: `analyzeTermContext` for `category === "financial"` returns `true` by default (DEF-002), so the false match is not filtered afterwards.

4. **Amplification through Rule 2**: `gazetteer_financial` is in `SENSITIVE_CONTEXT_IDS`, so one false finding plus any scored entity raises severity. This is correct governance behavior and is not the defect.

A refuted alternative: scoring or governance miscounting. `gazetteer_financial` has base score 0 in both `scanner.js` and `trust-worker.js`, and Rule 2 behaves per spec.

## Correctness Properties

Property 1: Bug Condition - Modal "will" is not a financial context term

_For any_ prompt where the bug condition holds (isBugCondition returns true), the fixed scan SHALL NOT produce a `gazetteer_financial` finding for the word "will", SHALL NOT apply Rule 2 because of it, and the final risk level SHALL equal the level computed with that finding absent (for a lone email, Moderate; with no scored entity and no anchor, No Risk).

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Estate-sense "will" and all other terms unchanged

_For any_ prompt where the bug condition does NOT hold (isBugCondition returns false), the fixed scan SHALL produce the same findings, risk score, and final severity as the original scan, preserving detection of estate-sense "will" phrases, all other financial terms, medical and ethnic context, scoring, and governance, identically on the main thread and in the worker.

**Validates: Requirements 2.4, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct:

**File**: `gazetteer.js`

**Functions**: module-level financial loading block, `rebuildGazetteers()`

**Specific Changes**:
1. **Add exclusion set**: Declare `EXCLUDED_FINANCIAL_WORDS = new Set(["will"])` next to `SUPPLEMENTARY_MEDICAL_TERMS`, with a comment explaining the modal-verb and personal-name ambiguity.

2. **Add estate phrases**: Declare `SUPPLEMENTARY_FINANCIAL_PHRASES`, lowercase, for example:
   `last will and testament`, `will and testament`, `last will`, `my will`, `the will of`, `the deceased's will`, `probate of the will`, `reading of the will`, `contest the will`, `execute the will`, `executor of the will`. (`living will` already exists in the data.) Final list is reviewed against Requirement 2.4 during implementation. `my will` carries a small known risk ("my will to live"); it is kept because Requirement 2.4 names it.

3. **Add `applyFinancialAdjustments()`**: Mirrors `mergeSupplementaryMedical()`. It removes `EXCLUDED_FINANCIAL_WORDS` from `FINANCIAL_WORDS`, adds any missing supplementary phrases to `FINANCIAL_PHRASES`, and re-sorts phrases longest-first.

4. **Call it on every load path**: Call after the initial financial load block (both the `FINANCIAL_TERMS_DATA` and `window.FINANCIAL_TERMS_DATA` branches, and when data is absent) and inside `rebuildGazetteers()` before the `GAZETTEER` object is rebuilt. This is required because `rebuildGazetteers()` re-derives the lists from the raw data and would otherwise restore "will". Make sure `initializeTerms()` builds `FIN_WORD_RE` / `FIN_PHRASE_RE` after the adjustment (it already runs after `rebuildGazetteers()`).

5. **No other edits**: `terms-financial.js`, `csv/financial_terms.csv`, `analyzeTermContext`, `scanner.js`, `trust-worker.js` and governance code are not modified. `npm run build:worker` is run to confirm `worker-data-bundle.js` is in sync (no content change expected). If a later change touches the term data, the bundle must be regenerated with `npm run build:worker`.

6. **Phrase safety**: Estate phrases contain spaces and an apostrophe only. `runGazetteerScan` builds the regex from the raw term (only `-` escaped), so no regex metacharacters may be used in the phrases.

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples on the unfixed code, then verify the fix and preservation. The project has no test runner; tests follow the existing standalone Node scripts (`test-*.js`, which set `global.FINANCIAL_TERMS_DATA` and load `gazetteer.js`). Property-style checks use small hand-rolled generators (random sentence templates) to avoid adding a dependency.

### Exploratory Bug Condition Checking

**Goal**: Confirm the root cause before fixing.

**Test Plan**: New script `test-financial-will.js` loads the real `terms-financial.js` and `gazetteer.js` in a VM context (as `scripts/build-worker-bundle.js` does) and calls the scan on prompts. Run on UNFIXED code.

**Test Cases**:
1. **Modal verb with email**: `I will send the report to maria.santos@company.com` yields `gazetteer_financial:Will` (fails on unfixed code).
2. **Question form**: `Will you review this?` yields a financial finding (fails on unfixed code).
3. **Capitalised name**: `Will Smith joined the call` yields a financial finding (fails on unfixed code).
4. **Rule 2 effect**: full scan with email + modal "will" yields High instead of Moderate (fails on unfixed code).

**Expected Counterexamples**:
- Finding `gazetteer_financial` with `rawMatch` "Will" on prompts with no financial meaning.
- Possible causes: the data entry `Will`, and the permissive financial branch of `analyzeTermContext`. If the finding is absent, re-check whether `FINANCIAL_TERMS_DATA` was loaded in the test harness.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed scan behaves correctly.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := scan_fixed(X)
  ASSERT NOT hasFinding(result, "gazetteer_financial", "will")
     AND finalLevel(result) = levelWithoutThisFinding(X)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, results are identical.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT scan_original(X) = scan_fixed(X)
END FOR
```

**Testing Approach**: Property-based style checking is recommended because it covers many term and template combinations and catches accidental removal of other terms.

**Test Plan**: Capture baseline outputs from the UNFIXED code (saved as a JSON snapshot of findings and final level per prompt) for a generated corpus, then compare after the fix.

**Test Cases**:
1. **Other financial terms**: Sample many entries from `FINANCIAL_TERMS_DATA` (excluding bare `Will`) inside templates; findings identical before and after.
2. **Estate phrases**: `last will and testament`, `my will`, `probate of the will`, `living will` still yield `gazetteer_financial`.
3. **Rule 2 retained**: `My salary is 50000, email me at a@b.com` still escalates Moderate to High.
4. **Medical and ethnic context**: `I was diagnosed with diabetes` and `Ilocano` prompts unchanged.
5. **Main vs worker parity**: Run the same corpus through `gazetteer.js` loaded with `terms-financial.js` and with `worker-data-bundle.js` data (`self` shim); results equal.

### Unit Tests

- `FINANCIAL_WORDS` does not contain `will` after initial load and after calling `rebuildGazetteers()` (both paths).
- `FINANCIAL_PHRASES` contains each estate phrase, sorted longest-first.
- `runGazetteerScan("I will go")` returns no financial finding; `runGazetteerScan("my last will and testament")` returns one.
- Case variants: `will`, `Will`, `WILL`.

### Property-Based Tests

- Generate prompts from modal-"will" templates combined randomly with entities (email, phone, name); assert no `gazetteer_financial` and final level equals the level of the same prompt with "will" replaced by "shall".
- Generate prompts with random non-"will" financial terms; assert findings equal the baseline snapshot.
- Generate prompts mixing a genuine financial term with modal "will"; assert exactly the genuine term is reported.

### Integration Tests

- Full `scan()` in `scanner.js` on `Please email maria.santos@company.com, I will send the report`: final level Moderate, no Rule 2 in the governance explanation.
- Full scan of `My last will and testament is attached, contact a@b.com`: Rule 2 applies, level raised.
- Worker path (`trust-worker.js` scoring code with `worker-data-bundle.js`) gives the same result as the main thread for the corpus.
- Run `npm run build:worker` and `node scripts/verify-worker-setup.js` to confirm the bundle is valid and in sync.
