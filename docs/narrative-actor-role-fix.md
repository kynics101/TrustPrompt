# Narrative-Actor-Role Suppression: Edge-Case Fix

**Scope:** `linguistic-detector.js` (Path C — `validateJobTitlesWithCompromise`)  
**Session date:** 2026-11-15  
**Trigger sample:**

> "I'm studying data breaches. In a fictional case, a hacker posts: 'Name: Pedro Ramos, Engineer
> at Meralco, 6 ft, 80 kg, Catholic, bank loan ₱500,000, email pedro@example.com.' How should
> the company notify affected individuals?"

**Incorrect detection (before fix):** `nlp_job_title:hacker`  
**Correct behavior (after fix):** "hacker" suppressed — not an individual's job disclosure.

---

## Root Cause

### 1 — "Hacker" is a legitimate OCCUPATIONS_DATA entry

`terms-occupations.js` includes `"Hacker"` as a historical occupational term (hoe operator,
line ~7293). `findJobTitlesCSVFirst` PASS 1 (exact match, case-insensitive word boundary)
finds it in every prompt containing the word "hacker".

### 2 — `checkJobContext` passes on "a hacker"

`validateJobTitlesWithCompromise` calls `checkJobContext`, which scans the 50 characters before
the title for trigger phrases. The text before `"hacker"` is `"fictional case, a "`. The
trigger `"a "` (a member of the `"is a "` family) sits at a word boundary within the window,
so the check passes. This is correct behavior for `"Pedro is a nurse"` — but here "a" introduces
a generic-role subject in a narrative sentence, not an individual's occupation.

### 3 — `attributed: false` prevents scoring but not display

Even before this fix, the finding was `attributed: false` — no first-person self-attribution
in `"a hacker posts"`. `isScorable` in `scanner.js` correctly excluded it from the risk score.
However, the finding still appeared in the UI findings list and in the debug log as
`nlp_job_title:hacker`, creating user confusion and an inaccurate explainability display.

---

## Fix: `isNarrativeActorRole` function

Added inside the `TrustLinguisticDetector` closure in `linguistic-detector.js`, immediately
after `isPossessiveThirdPartyRole` and its supporting constants.

### Design

Mirrors the conservative approach of `isPossessiveThirdPartyRole`:

- Returns `true` only when **every** word-boundary occurrence of the title in the text matches
  the narrative-actor pattern. One occurrence outside the pattern keeps the title.
- Checks **two requirements** per occurrence:
  1. The title is immediately preceded by an indefinite article (`a/an`), optionally with up to
     3 modifier words between the article and the title.
  2. A narrative action verb follows immediately after the title (see `NARRATIVE_ACTION_AFTER_RE`).
- **Override conditions** (function returns `false`, title is kept):
  - A first-person marker (`I`, `I'm`, `my`, etc.) is present in the **framing clause**.
  - A Title-Case personal name token (not a function word) is present in the framing clause.
  - `at [Capital]` / `in [Capital]` follows the title directly (employer tie).

### Framing-clause scoping

Override checks are scoped to the **framing clause**, not the full sentence. The framing clause
is the text from the sentence start to the first colon (`:`), opening quote (`"`, `'`, `'`, `"`),
or sentence-ending punctuation that follows the title match.

This prevents quoted record content from rescuing the title:

> "In a fictional case, a hacker posts: 'Name: Pedro Ramos, Engineer at Meralco...'"

The sentence contains `"Pedro Ramos"` and `"Engineer"` (Title-Case words), but they appear
**after the colon** in the quoted record. The framing clause is only
`"In a fictional case, a hacker posts"` — no Title-Case personal names → filter fires correctly.

### Action-verb list (`NARRATIVE_ACTION_AFTER_RE`)

Covers verbs that mark an unnamed actor performing an action in narrative/report text:
`posts`, `says`, `tells`, `claims`, `hacks`, `accesses`, `breaches`, `leaks`, `attacks`,
`calls`, `contacts`, `reports`, `writes`, `starts`, `enters`, `tries`, `attempts`, `performs`,
`conducts`, `commits`, `executes`, `exploits`, `obtains`, `uses`, `provides`, `sends`,
`receives`, `uploads`, `downloads`, `threatens`, `demands`, `impersonates`, and their
conjugations.

Attribution verbs (`is`, `was`, `works`, `serves`, `employed`) are **intentionally excluded**
so sentences like `"Pedro is a nurse"` and `"she works as a hacker"` are not vetoed.

### Call site

Added in `validateJobTitlesWithCompromise`, immediately after the `isPossessiveThirdPartyRole`
guard and before `findActualSpan`:

```js
if (isNarrativeActorRole(text, titleText)) {
  console.debug(`[PATH_C/VAL_JOB] FILTER (narrative actor role): "${titleText}"`);
  continue;
}
```

The check runs on every CSV dictionary finding (both PASS 1 exact-match and PASS 3 fuzzy),
but NOT on `fromAppositive` findings (those are structurally validated upstream and bypass
all context checks).

---

## Scenario Walkthrough

| Prompt fragment | Title | Filter fires? | Reason |
|---|---|---|---|
| `"a hacker posts: 'Name: Pedro Ramos...'"` | hacker | **Yes** | Article + action verb; framing clause has no Title-Case names |
| `"an attacker accessed the database"` | attacker | Yes (if in OCCUPATIONS_DATA) | Article + action verb; no names in framing clause |
| `"Pedro is a nurse at PGH"` | nurse | **No** | "at PGH" follows → employer tie override |
| `"I'm studying how a hacker works"` | hacker | No | "I'm" in framing clause → first-person override |
| `"Maria Santos, a nurse at PGH, was involved"` | nurse | No | `"Maria Santos"` is Title-Case in framing clause |
| `"a hacker, Maria Santos, posts"` | hacker | No | `"Maria Santos"` is Title-Case in framing clause |
| `"a nurse told me my salary is low"` | nurse | Yes | Article + action verb; no Title-Case name in framing clause |

---

## Scoring Impact

This fix affects only the **detection/display layer**. The fix is an earlier suppression in
`validateJobTitlesWithCompromise`; it removes the finding from both the UI and from the
findings array passed to the scorer. Since a narrative-actor job title was already
`attributed: false` and thus excluded from scoring by `isScorable`, the risk score and
governance outcome are **unchanged** in all cases.

---

## Files Changed

| File | Nature of change |
|---|---|
| `linguistic-detector.js` | Added `NARRATIVE_ACTION_AFTER_RE`, `NARRATIVE_NAME_IN_SENTENCE_RE`, `NARRATIVE_FIRST_PERSON_RE`, `NARRATIVE_EMPLOYER_AFTER_RE` constants; added `isNarrativeActorRole` function; added call in `validateJobTitlesWithCompromise` after the possessive-third-party-role guard |
