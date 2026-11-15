# Appositive-Role Construct: Edge-Case Fix

**Scope:** `linguistic-detector.js` (Path C — `scanCore`)  
**Session date:** 2026-11-15  
**Trigger sample:**

> "summarize this ticket in two sentences: customer jenny lim, teacher at ateneo, says her card
> 5555 5555 5555 4444 was charged without permission. she is behind on her bdo loan and has
> anxiety. her ip was 112.198.45.10"

**Expected detections (missed):** `nlp_person_name: jenny lim`, `nlp_job_title: teacher`,
`nlp_organization: ateneo`  
**Actual detections before fix:** `credit_card`, `ipv4`, `gazetteer_medical: anxiety`

---

## Root Causes

### 1 — All name-extraction methods require Title Case

`scanCore` (the live execution path inside `scan()`) runs four name-extraction methods in Stage 1.
Every one of them anchors on `[A-Z][a-z]+` or requires a Title-Case initial character:

| Method | Pattern / mechanism | Why it misses |
|---|---|---|
| Method 1 — honorifics | `/\b(?:Mr\|Ms\|Dr…)\s+([A-Z][a-z]+…)/gi` | No honorific before "jenny lim" |
| Method 2 — trigger phrases | `my name is`, `call me`, `I am` | Third-person ticket text, no first-person trigger |
| Method 3 — subject position | `NAME_RUN1` regex requires `[A-Z]` | "jenny" is lowercase mid-sentence |
| Method 4 — standalone capitalized | `NAME_RUN2`, requires `[A-Z]` initial | Same; also needs name-dictionary evidence |

The normalizer (`normalizePath_C`) capitalises only the first character of the prompt and the
first character after sentence-ending punctuation. Words after a colon or comma mid-sentence
remain lowercase. "jenny lim" follows ": customer" and stays entirely lowercase throughout
the NLP pass.

### 2 — Job-title validation requires a trigger phrase in the preceding text

`scanCore` Stage 2 runs `findJobTitlesCSVFirst`, which finds "teacher" as a CSV exact match.
Stage 3 then runs `validateJobTitlesWithCompromise`. Because "teacher" is not `csv_exact_match /
high`, it falls to the lower-confidence branch, which calls `checkJobContext`. That function
looks back up to 50 characters for triggers such as `"is a "`, `"am a "`, `"my "`, `"was a "`,
etc. The text before "teacher" is `"customer jenny lim, "` — no matching trigger. Result:
"teacher" is deferred and ultimately dropped.

Even if it were a `csv_exact_match / high` finding, `hasStructuralJobCue` also fails: cue 3b
looks for `\w,\s*an?\s+$` (appositive with article, e.g. "lim, a teacher"), but the input has
no article. Cue 4 looks for a capitalized org name after "at" — "ateneo" is lowercase. All
structural cues require either a first-person trigger or Title-Case context.

### 3 — Organization detection requires either a CSV entry or a capital letter

`findOrganizationsCSVFirst` does a case-insensitive exact-match search against the
`EXTENSIVE_ORGANIZATIONS_ARRAY`. "Ateneo" only appears in that list as full university names
("Ateneo de Manila University", "Ateneo de Davao University", etc.) — the bare word "ateneo"
is not an entry, so PASS 1 produces no match.

`findOrganizationsStructural` runs structural patterns (suffix and head-word). Its Pattern 3
(standalone capitalized words) uses `/\b([A-Z]{2,5}|[A-Z][a-z]+)\b/gi`, which requires an
uppercase initial character. "ateneo" is lowercase. No structural pattern covers
`[job-title] at [lowercase-org]`.

The Path B org filter in `scanner.js` also strips every finding whose `patternId` contains
`'organization'` from the B-path results before merging, so the gazetteer cannot rescue it
even if it had an exact match.

### 4 — Regex group-capture ordering caused "teacher at ateneo" to be one field

Once `extractAppositiveRoleConstruct` was introduced as the fix, the job-title group
(`m[2]`) used the pattern `([a-zA-Z][a-z]+(?:\s+[a-zA-Z][a-z]+){0,2})`. The word "at" matches
`[a-zA-Z][a-z]+` (a + t). The outer "at [org]" group is optional (`?`), so the regex engine had
no forced backtrack and the greedy expansion of group 2 consumed "teacher at ateneo" as a single
three-word job title, leaving group 3 (org) as `undefined`. "ateneo" was never separately
extracted.

### 5 — Dead-code path vs live path mismatch (first fix attempt)

The first fix added `extractAppositiveRoleConstruct` calls inside `extractPersons`,
`extractJobTitles`, and `extractOrganizations`. Those functions exist in the file but are only
reachable through a `doc`-based path that uses a compromise.js document object. The live
execution path is `scan()` → `scanCore()`, which never calls those three functions — it has its
own independent four-stage implementation. The fix had no effect at runtime.

### 6 — Stage-ordering (second fix attempt, first revision)

The second fix placed the appositive queue injection directly into the Stage 1.5 block but
referenced `csvJobFindings` and `csvOrgFindings` before they were declared by Stage 2's `let`
statements. This would cause a `ReferenceError` at runtime.

### 7 — Validator bypass gap

After correctly staging the queued job/org entries for injection after Stage 2 declarations,
the job-title entry with `source: 'appositive_role'` fell to the lower-confidence branch of
`validateJobTitlesWithCompromise`. Both `checkJobContext` and `hasStructuralJobCue` failed for
the reasons described in Root Cause 2 — the validator was simply not aware that the comma-
appositive construction is itself structural evidence of an occupation.

---

## Fixes Applied

All changes are in `linguistic-detector.js`.

### Fix 1 — New `extractAppositiveRoleConstruct` function

Added a new private function that targets the pattern
`[role-word] [firstname] [lastname], [job-title] at [org]`, common in support-ticket and
case-note text. A `TICKET_ROLE_WORDS` Set lists the nouns that introduce a person in this
context: `customer`, `client`, `patient`, `employee`, `applicant`, `complainant`, `vendor`,
`contractor`, `student`, `resident`, `claimant`, `account holder`, `caller`, `sender`,
`recipient`, `buyer`, `seller`.

The function accepts mixed/lowercase text and returns an array of
`{ name, jobTitle, org }` objects. Only fields that actually matched are set, so it is safe
to call when the comma or "at" parts are absent.

### Fix 2 — Regex: stop job-title group from absorbing "at"

The original group 2 (job-title capture):

```
([a-zA-Z][a-z]+(?:\s+[a-zA-Z][a-z]+){0,2})
```

Was changed to add a negative lookahead `(?!at\b)` before each continuation word:

```
([a-zA-Z][a-z]+(?:\s+(?!at\b)[a-zA-Z][a-z]+){0,2})
```

When the engine attempts to extend the job-title group past "teacher" and encounters "at",
the lookahead blocks the match, forcing backtracking to the optional `\s+at\s+` branch. "at"
is then consumed by the separator literal and "ateneo" is captured into group 3 (org) as
intended.

### Fix 3 — Stage 1.5 block in `scanCore` (the live path)

Added a new **Stage 1.5** block between the end of Stage 1 (name extraction) and Stage 2
(CSV detection). This is the only place that matters — `extractPersons` / `extractJobTitles`
/ `extractOrganizations` are not called by `scanCore`.

The block:
1. Calls `extractAppositiveRoleConstruct(textNLP)`.
2. Pushes any matched **name** directly into `findings` (no gating — a person name preceded
   by a known role-word is taken as sufficient evidence).
3. Queues matched **job titles** into `_appositiveJobQueue` and **org names** into
   `_appositiveOrgQueue` (temporary arrays, not yet pushed, because `csvJobFindings` and
   `csvOrgFindings` are not yet declared at that point).

Immediately after Stage 2 declares `csvJobFindings` and `csvOrgFindings`, the queues are
merged in with deduplication.

### Fix 4 — `fromAppositive` bypass in both validators

Job titles and orgs injected from the appositive queue are tagged `fromAppositive: true`.
Both `validateJobTitlesWithCompromise` and `validateOrganizationsWithCompromise` now check
this flag first and pass the finding straight through, skipping the context-trigger and
POS checks. The rationale: a comma-appositive construction (`name, occupation at employer`) is
itself structural evidence of an occupation and workplace; requiring a first-person trigger or
a capitalized org name in this context would always false-negative.

For job titles, if the title is also found in `EXTENSIVE_JOB_TITLES` (the occupations CSV),
the entry is additionally promoted to `source: 'csv_exact_match', confidence: 'high'` so it
is consistent with other high-confidence CSV findings.

### Fix 5 — Label cleanup

The `label` field on a finding is the exact string shown to the user in both UI rendering
paths (`ui.js` / `sidepanel.js`). Internal method names were leaking into the UI through
interpolated labels:

| Before | After |
|---|---|
| `'Person Name (NLP - Appositive Role)'` | `'Person Name (NLP)'` |
| `'Person Name (Appositive Role)'` | `'Person Name (NLP)'` |
| `'Job Title (NLP - Appositive Role)'` | `'Job Title (NLP)'` |
| `'Organization (NLP - Appositive Role)'` | `'Organization (NLP)'` |
| `` `Job Title (${title.source})` `` | `'Job Title (NLP)'` |
| `` `Organization (${org.source})` `` | `'Organization (NLP)'` |
| `'Organization (structural_match)'` | `'Organization (NLP)'` |
| `'Organization (Name Run)'` | `'Organization (NLP)'` |
| `` `Organization (NLP - CSV ${csvOrg.source})` `` | `'Organization (NLP)'` |

---

## Scoring Impact

| Entity | patternId | Scored? | Reason |
|---|---|---|---|
| `jenny lim` | `nlp_person_name` | Yes — base 2 | Detected via Stage 1.5 name push |
| `teacher` | `nlp_job_title` | No (`attributed: false`) | Third-person text; no first-person trigger; correct per scoring rules — shown in UI only |
| `ateneo` | `nlp_organization` | Yes — base 2 | Passes `isAttributedOrganization`: "teacher at" precedes it, matching the job-title list in `ORG_AFFILIATION_BEFORE_RE`; grouped into `organizational_affiliation` scoring unit with `teacher` |

The combined scoring-unit picture for the sample prompt:

| Scoring unit | Entities | Base score |
|---|---|---|
| `credit_card` | 5555 5555 5555 4444 | 10 |
| `nlp_person_name` | jenny lim | 2 |
| `organizational_affiliation` | ateneo (teacher attributed-org) | 2 |
| `ipv4` | 112.198.45.10 | 2 |
| *(context)* | anxiety | 0 |

4 distinct scoring units → multiplier 1.70. Pre-governance score: 16 × 1.70 = 27.20 →
Preliminary: High. Rule 1 (validated credit card) also applies independently.
**Final: High.** Correct — the prompt discloses a card number, a name, an employer, and a
health context.

---

## Remaining Gaps

### A — Lowercase names without a known role-word prefix

If a name appears in lowercase without any `TICKET_ROLE_WORDS` prefix (e.g. `"jenny lim says
her card was charged"` with no "customer"), all name-extraction methods still fail because they
require Title Case. The `NAMES_DICT_AVAILABLE` / `isKnownGivenName` path in Method 4
(`standaloneHasNameEvidence`) already performs dictionary lookup but only on Title-Case
candidates. Extending it to accept lowercase tokens whose first word matches the given-name
dictionary would close this gap.

### B — Org without "at"

If the employer is listed without the preposition (e.g. `"customer jenny lim, teacher, ateneo"`)
the org capture group in `extractAppositiveRoleConstruct` does not fire. A second pattern
variant using `(?:at|in|for|with)\s+` as the org separator would cover this.

### C — Multi-word job titles ending in "at"

A job title whose last word happens to be "at" (hypothetical but possible) would be truncated
by the `(?!at\b)` lookahead. In practice, no English occupation ends in the bare preposition
"at"; the lookahead is safe for all entries in `EXTENSIVE_JOB_TITLES`.

### D — Structural context cues remain case-sensitive

`hasStructuralJobCue` cue 4 and `checkOrgContext` both pattern-match against `[A-Z]` initial
characters. Any job title or org found outside the appositive construct (e.g. a bare lowercase
mention without a role-word) will still be dropped by those validators unless the `fromAppositive`
bypass fires. This is by design — relaxing the validators globally carries false-positive risk.

---

## Files Changed

| File | Nature of change |
|---|---|
| `linguistic-detector.js` | Added `TICKET_ROLE_WORDS`, `extractAppositiveRoleConstruct`; added Stage 1.5 in `scanCore`; added `fromAppositive` bypass in `validateJobTitlesWithCompromise` and `validateOrganizationsWithCompromise`; fixed regex group 2 lookahead; cleaned all `label` strings |
