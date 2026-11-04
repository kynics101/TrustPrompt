# Job Title Context Detection Bugfix Design

## Overview

Job titles in first-person role statements are dropped by `checkJobContext` in `linguistic-detector.js` when the sentence deviates from a few literal trigger strings. The prompt "As a freelancer, I'm sometimes a graphic designer, sometimes a VA, and on weekends a tricycle driver. How do I declare my income to the BIR?" yields zero findings (No Risk) instead of `nlp_job_title` findings (Low, score 2.00).

The fix is limited to job-title detection in `linguistic-detector.js`:

1. Replace the literal 50-character lookback in `checkJobContext` with a sentence-scoped role-anchor check (superset of existing triggers), evaluated at every occurrence of the span, with curly apostrophes normalized.
2. Add `SUPPLEMENTARY_JOB_TITLES` merged into the extensive vocabulary (including the fallback path).
3. Add a separate, case-sensitive, anchor-gated "VA" check that never goes through fuzzy matching.
4. Drop shorter titles contained within the span of an accepted longer title (e.g. `driver` inside `tricycle driver`).

Scoring, scoring-unit grouping, governance, person/org detection, `gazetteer.js` (DEF-007) and `linguistic-detector-refactored.js` (not loaded by the manifest) are untouched.

## Glossary

- **Bug_Condition (C)**: A prompt containing an occupation term in a first-person or attributed role statement that the current literal-trigger check rejects, or an occupation missing from the vocabulary.
- **Property (P)**: Every qualifying span is reported as an `nlp_job_title` finding.
- **Preservation**: Behavior for prompts outside C: filtered non-job uses ("the printer driver crashed", "designer bags"), existing true positives, other entity types, and risk scoring.
- **checkJobContext(text, actualSpan)**: Context gate in `linguistic-detector.js`; currently uses `indexOf` (first occurrence only) and a 50-char lookback with literal triggers.
- **findActualSpan(text, pattern)**: Returns the first case-insensitive substring match (no word boundary, first occurrence only).
- **findJobTitlesCSVFirst(text)**: Stage 2 matcher (exact, 2/3-word phrase, fuzzy passes).
- **validateJobTitlesWithCompromise(csvFindings, text, doc)**: Stage 3 gate; returns input unchanged when `COMPROMISE_AVAILABLE` is false (a module-load `const`).
- **Role anchor**: A copula or "as a/an" construction that attributes an occupation: "I'm / I am / he's / she's / X is / are / was", "as a/an", "work(s|ed|ing) as", "employed as", "hired as".
- **Scoring unit**: `nlp_job_title` belongs to Organizational Affiliation (base 2, counted once).

## Bug Details

### Bug Condition

The span is rejected because the only accepted evidence is a literal trigger within the 50 characters before the first occurrence. "I'm sometimes a " does not contain "i'm a "; list continuations ("sometimes a VA") and "As a " have no trigger of their own; curly apostrophes (`’`) never match `i'm a `; and later occurrences are never examined. Separately, `freelancer`, `virtual assistant`, `tricycle driver` and `VA` are not in `OCCUPATIONS_DATA`.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type PromptText
  OUTPUT: boolean

  RETURN EXISTS span IN occupationTerms(X) UNION supplementaryTerms(X):
         inFirstPersonOrAttributedRoleStatement(X, span)
         AND ( adverbBetweenCopulaAndArticle(X, span)
            OR isListContinuationOfRoleStatement(X, span)
            OR precededByAsA(X, span)
            OR usesCurlyApostropheTrigger(X, span)
            OR onlyLaterOccurrenceInJobContext(X, span)
            OR span IN {freelancer, virtual assistant, VA, tricycle driver} )
END FUNCTION
```

### Examples

- "I'm sometimes a graphic designer" - expected: `graphic designer` reported; actual: dropped.
- "... sometimes a VA, and on weekends a tricycle driver" - expected: both reported; actual: dropped / not in vocabulary.
- "As a freelancer, ..." - expected: `freelancer` reported; actual: not in vocabulary and no trigger.
- "I’m a graphic designer" (curly) - expected: reported; actual: dropped.
- "Designer bags are on sale. I'm a designer." - expected: reported (second occurrence in context); actual: first occurrence checked, dropped.
- "I live in VA", "the VA hospital", "Virginia" - expected: not reported.
- Full example prompt - expected: findings for freelancer, graphic designer, VA, tricycle driver; score 2.00; Low. Actual: none, No Risk.

Root cause confirmed by reading the code: `checkJobContext` (literal `jobTriggers.some(before.includes)`), `findActualSpan`/`checkJobContext` using first `indexOf`, and `initializeExtensiveJobTitles` loading only `OCCUPATIONS_DATA` (only `Delivery Rider` of the proposed gig roles exists there; "freelancer", "virtual assistant", "tricycle", "jeepney" are absent). Note: in `scan()` STAGE 3 the gate runs only if `COMPROMISE_AVAILABLE`; without it, STAGE 4 reports every CSV match unfiltered, so the context fix only affects the compromise path while vocabulary, VA, and overlap-dedupe changes must be correct on both paths.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Non-job uses ("the printer driver crashed", "designer bags") remain filtered by the context gate.
- "Maria is a librarian", "I work as a nurse" produce unchanged findings.
- Existing literal triggers keep working (new check is a superset).
- Person names and organizations are detected as before.
- Scoring (`nlp_job_title` base 2 in Organizational Affiliation), multipliers, thresholds, governance rules unchanged.
- DEF-007 guard in `gazetteer.js` unchanged.
- Behavior when `COMPROMISE_AVAILABLE` is false: the gate is still skipped.

**Scope:** Prompts with no occupation term, no role-statement structure, or only already-working triggers are unaffected.

## Hypothesized Root Cause

1. **Literal trigger matching**: `before.includes("i'm a ")` fails with any intervening word, list continuation, or "as a" opener. (Confirmed.)
2. **Apostrophe normalization missing**: `’` is not mapped to `'`. (Confirmed; no normalization in the function.)
3. **First-occurrence only**: `checkJobContext` and `findActualSpan` use `indexOf`. (Confirmed.)
4. **Vocabulary gaps**: `initializeExtensiveJobTitles` has no supplementary list, and the fallback path uses only `COMMON_JOB_TITLES`. (Confirmed.)
5. **Overlapping matches (latent)**: Pass 1 uses `\b` regexes for every title, so `driver` and `designer` match inside `tricycle driver` and `graphic designer`; once the longer titles pass context, the shorter ones would produce duplicate findings. Pass 3 fuzzy matching could also mis-map "VA" if it were in the vocabulary, hence the separate check.

## Correctness Properties

Property 1: Bug Condition - Role-statement job titles are detected

_For any_ prompt where the bug condition holds (isBugCondition returns true), the fixed detector SHALL report each qualifying span (including freelancer, virtual assistant, tricycle driver, upper-case "VA" with a first-person role anchor, and titles after adverbs, list continuations, "as a/an", curly apostrophes, or only at a later occurrence) as an `nlp_job_title` finding, and SHALL NOT also report a shorter title contained within the span of an accepted longer title.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

Property 2: Preservation - Non-buggy inputs unchanged

_For any_ prompt where the bug condition does NOT hold, the fixed detector SHALL produce the same `nlp_job_title` findings as the original, preserving filtering of non-job uses ("printer driver", "designer bags"), rejection of "VA" without a first-person role anchor ("I live in VA", "the VA hospital", lower-case "va"), existing true positives, and unchanged person/organization findings, scoring and governance.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**File**: `linguistic-detector.js`

**Specific Changes**:

1. **Sentence-scoped `checkJobContext(text, actualSpan)`**
   - Normalize `’ ‘` to `'` in a working copy of `text` (same length, so indexes stay aligned; replace char-for-char).
   - Iterate all occurrences of the span (case-insensitive, word-boundary aware) and return true if any occurrence passes.
   - Per occurrence: find the sentence start (previous `.`, `!`, `?`, newline, or start of text) and take `before = text[sentenceStart, index]` lower-cased.
   - Accept if the legacy trigger list matches in the 50-char lookback (unchanged superset), OR:
     - Role anchor regex in `before`: `\b(?:i'm|i am|he's|she's|you're|they're|we're|\w+ (?:is|are|was|were))\b(?:\s+(?:sometimes|also|currently|now|still|just|part-time|full-time|on weekends|on the side|\w+ly)){0,3}\s+(?:a|an|the)\b` or `\bas (?:a|an)\b` or `\b(?:work(?:s|ed|ing)?|employed|hired) as\b`; AND
     - The span is directly after the anchor (only article/adverb filler between), OR the text immediately before the span (trimmed of filler adverbs/time phrases) ends with article `a`/`an` (list continuation, e.g. "sometimes a VA", "on weekends a tricycle driver"), with an anchor earlier in the same sentence.
   - Plain "the printer driver" and "designer bags" have no anchor in the sentence, so they stay filtered.
   - The `findActualSpan` call remains for POS use; no behavior change except it is no longer used for context position.

2. **`SUPPLEMENTARY_JOB_TITLES`** (lowercase): `freelancer`, `virtual assistant`, `tricycle driver`, `jeepney driver`. (`delivery rider` already exists in `OCCUPATIONS_DATA`; the Set dedupes it anyway.) Merge into `titles` before building `EXTENSIVE_JOB_TITLES`/`EXTENSIVE_JOB_TITLES_ARRAY` in `initializeExtensiveJobTitles`, and also in the `catch` fallback; sort longest-first in both.

3. **Case-sensitive "VA" check** (new `findVAJobTitle(text)`, called from STAGE 2 next to `findJobTitlesCSVFirst`)
   - Match `/\bVA\b/` (no `i` flag) only; accept only when, in the same sentence before it, a first-person anchor (`I'm`, `I am`, `as a`... first-person only) is followed by optional filler and an article (`a VA`/`an VA` not required to be `an`). Not added to the vocabulary, so never fuzzy-matched.
   - Reject "VA hospital", "in VA", "Virginia" (no preceding article/anchor, or `\b` fails).
   - Emits a finding with `name: 'virtual assistant'`, `rawMatch: 'VA'`, `source: 'csv_exact_match'`, `confidence: 'high'`. It bypasses the compromise gate (it already did its own context check), so it behaves identically with and without `window.nlp`.

4. **Overlap suppression** (new helper `dropContainedJobTitles(findings, text)` applied after STAGE 3, before STAGE 4)
   - For each accepted finding, compute its span in `text`; drop any other accepted finding whose span lies fully inside a longer accepted finding's span. Only drops titles whose span is contained in an accepted longer one, so standalone "I'm a driver" is untouched.

5. **Preservation guards**: no changes to `validateOrganizationsWithCompromise`, person-name stages, `scan()` structure beyond calling the two helpers, scoring files, `gazetteer.js`, or `linguistic-detector-refactored.js`.

## Testing Strategy

### Validation Approach

No test runner exists. Use standalone Node scripts (e.g. `tests/job-title-context.test.js`, run with `node`) that load `terms-occupations.js` and `linguistic-detector.js` into a `vm` context with a `window` shim. Because `COMPROMISE_AVAILABLE` is a module-load `const`, create a fresh VM context per mode: (a) `window = {}` (no nlp), (b) `window = { nlp: stub }` where the stub returns an object with minimal `sentences()`/`match` methods so `checkBadPOS` returns false. Generators are hand-rolled (seeded PRNG over arrays of titles, anchors, adverbs, apostrophe variants, fillers). Run exploratory tests on unfixed code first.

### Exploratory Bug Condition Checking

**Goal**: Show failures on unfixed code and confirm the root cause.

**Test Cases**:
1. **Adverb**: "I'm sometimes a graphic designer" (fails on unfixed code, nlp stub mode)
2. **List continuation**: "I'm a nurse, sometimes a librarian" for the second title (fails on unfixed code)
3. **As a**: "As a freelancer, ..." (fails on unfixed code)
4. **Curly apostrophe**: "I’m a graphic designer" (fails on unfixed code)
5. **Later occurrence**: "Designer bags sell. I'm a designer." (may fail on unfixed code)
6. **Full example prompt** (fails: zero findings)

**Expected Counterexamples**: no `nlp_job_title` finding; causes: literal trigger mismatch, first-occurrence check, vocabulary gaps.

### Fix Checking

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := scanJobTitles_fixed(X)
  ASSERT every qualifying span IN result AS nlp_job_title
  ASSERT no title in result is contained in the span of a longer accepted title
END FOR
```

### Preservation Checking

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT scanJobTitles_original(X) = scanJobTitles_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing, because generated anchors/titles/fillers cover far more combinations than hand-picked cases. Capture the original `linguistic-detector.js` (copy from git, e.g. `git show HEAD:linguistic-detector.js`) and compare findings on generated non-bug inputs.

**Test Cases**:
1. **Non-job usage**: "the printer driver crashed", "designer bags" still filtered in nlp mode.
2. **Existing positives**: "Maria is a librarian", "I work as a nurse" same findings.
3. **VA rejection**: "I live in VA", "the VA hospital", "Virginia", lower-case "va" produce no job title.
4. **No-nlp mode**: gate still skipped, output identical to original for non-bug inputs apart from new vocabulary/dedupe.
5. **Other entities**: person/org findings identical on generated prompts.

### Unit Tests

- `checkJobContext`: each anchor form, up to 3 filler words (4 rejected), curly vs straight apostrophes, multiple occurrences, sentence boundary (anchor in previous sentence does not count).
- `initializeExtensiveJobTitles`: supplementary titles present and array sorted longest-first, in normal and fallback paths.
- `findVAJobTitle`: accept "I'm sometimes a VA", reject listed negatives.
- `dropContainedJobTitles`: `tricycle driver` suppresses `driver`; standalone `driver` kept.

### Property-Based Tests

- Generate `<anchor> <0-3 fillers> a <title>` with random apostrophe style and casing: title always detected (both modes).
- Generate list continuations with 2-4 titles: all detected, no contained duplicates.
- Generate non-anchored sentences with titles ("the {title} crashed"): filtered in nlp mode, same as original.
- Generate text with "VA" in random non-anchored positions: never reported.

### Integration Tests

- Scan the full example prompt through the scanner pipeline: four `nlp_job_title` findings, score 2.00, final Low, with and without the stub.
- Verify the DEF-007 how-to guard still applies to "How do I declare my income" (no escalation; result stays Low).
- Verify mixed prompts with names and organizations produce unchanged name/org findings.
