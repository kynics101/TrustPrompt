# Design Document

## Overview

This design covers five targeted hardening changes to `linguistic-detector.js` and the creation of `terms-names.js`. The changes are grouped into four concerns: (1) dictionary data, (2) name detection logic, (3) organization detection priority, and (4) performance and disambiguation fixes.

---

## Architecture

### How Path C fits into the scan pipeline

```
scanner.js
  └── TrustLinguisticDetector.scan(textNLP)
        ├── extractNamesWithHonorific()          → person names
        ├── extractSubjectPositionNames()        → person names
        ├── extractStandalonePersonNames()       → person names  ← Problem 1 & 2
        ├── extractPredicateJobTitles()          → job titles
        ├── findJobTitlesCSVFirst()              → job titles
        ├── findOrganizationsCSVFirst()          → organizations ← Problem 3 & 4
        │     ├── Pass 1: exact match
        │     ├── Pass 2: fuzzy (Levenshtein)    ← Problem 4
        │     └── Pass 3: keyword component
        ├── extractOrganizationContexts()        → organizations ← Problem 3
        ├── [Compromise.js NER: .people()]       → person names
        ├── [Compromise.js NER: .organizations()]→ organizations ← Problem 3
        └── classifyNameVsOrganization()         ← Problem 5
```

### Files changed

| File | Change |
|------|--------|
| `terms-names.js` | New file — Philippine names dictionary |
| `manifest.json` | Add `terms-names.js` before `linguistic-detector.js` in all three content script blocks |
| `linguistic-detector.js` | All logic changes in this spec |

---

## Component Design

### Group 1 — Dictionary Data (`terms-names.js`)

#### Structure

`terms-names.js` follows the same pattern as `terms-occupations.js`:

```js
// terms-names.js
// Philippine given names and surnames
// ~1000+ entries

const NAMES_DATA = [
  // Given names (Filipino, Spanish-origin, common borrowings)
  "Aaliyah",
  "Abby",
  "Ace",
  // ... ~500+ given names
  // Surnames (Filipino, Spanish-origin, common)
  "Abad",
  "Abaya",
  "Abueva",
  // ... ~500+ surnames
];
```

**Curation sources:** The list is researcher-curated from:
- Common Filipino given names (traditional and Spanish-origin)
- Common Philippine surnames per Philippine Statistics Authority naming frequency data
- Names observed as false negatives in existing test cases (e.g., Kyleen, Maricel, Victorio, Nicdao)

The file is not exhaustive. Its role is to provide a high-confidence positive signal. Unknown names fall back to Compromise.js NER.

#### Loading in `linguistic-detector.js`

```js
let PHILIPPINE_NAMES = new Set();
let PHILIPPINE_GIVEN_NAMES = new Set();
let PHILIPPINE_SURNAMES = new Set();

function initializePhilippineNames() {
  try {
    if (typeof NAMES_DATA === 'undefined' || !Array.isArray(NAMES_DATA)) {
      throw new Error('NAMES_DATA not available');
    }
    const names = NAMES_DATA.map(n => n.toLowerCase().trim()).filter(Boolean);
    PHILIPPINE_NAMES = new Set(names);
    console.log(`[TrustLinguisticDetector] ✅ Loaded ${PHILIPPINE_NAMES.size} Philippine names`);
    return true;
  } catch (error) {
    console.warn('[TrustLinguisticDetector] ⚠️ NAMES_DATA unavailable — name detection will rely on Compromise.js NER only');
    return false;
  }
}
```

Called in the same initialization block as `initializeExtensiveJobTitles()` and `initializeExtensiveOrganizations()`.

---

### Group 2 — Name Detection Positive-Signal Logic

#### Problem recap

`extractStandalonePersonNames` currently:
1. Finds any 2–3 consecutive capitalized tokens
2. Runs them through `NON_NAME_WORDS.has(word)` to reject obvious non-names
3. The blocklist has grown to 100+ entries as each false positive adds another entry

#### New logic: positive gate first

Replace the `NON_NAME_WORDS` broad blocklist gate with two positive checks:

```js
function isLikelyNameToken(word) {
  const lower = word.toLowerCase();
  // Positive check 1: in Philippine names dictionary
  if (PHILIPPINE_NAMES.has(lower)) return true;
  // Positive check 2: Compromise.js tagged as person
  if (COMPROMISE_AVAILABLE) {
    const doc = window.nlp(word);
    if (doc.people().length > 0) return true;
  }
  return false;
}

function isDefinitelyNotName(word) {
  const lower = word.toLowerCase();
  // Negative check: in job titles or org dictionary
  if (EXTENSIVE_JOB_TITLES.has(lower)) return false; // it's a job title
  if (EXTENSIVE_ORGANIZATIONS.has(lower)) return false; // it's an org
  return null; // unknown — defer to positive signal
}
```

Updated `extractStandalonePersonNames` decision logic:

```
For each 2–3 word capitalized phrase:
  1. Reject if first word is in NON_NAME_WORDS (pronouns/articles only — ≤20 entries)
  2. Reject if any word is in EXTENSIVE_JOB_TITLES
  3. Reject if any word is in EXTENSIVE_ORGANIZATIONS
  4. Accept if any word is in PHILIPPINE_NAMES
  5. Accept if Compromise.js tags the phrase or any word as a person
  6. Otherwise: reject (no positive signal → not emitted)
```

#### `NON_NAME_WORDS` reduction

Trim to a hard list of words that should **never** start a name:

```js
const NON_NAME_WORDS = new Set([
  // Possessive pronouns
  'my', 'your', 'his', 'her', 'its', 'our', 'their',
  // Articles and demonstratives
  'a', 'an', 'the', 'this', 'that', 'these', 'those',
  // Common conjunctions / prepositions that get capitalized at sentence start
  'and', 'or', 'but', 'for', 'nor', 'yet', 'so',
  'in', 'on', 'at', 'by', 'to', 'of', 'up',
]);
```

All other entries (adjectives, gerunds, verbs, abstract nouns) are removed. Their filtering is now handled by the positive-signal gate and the dictionary cross-reference.

---

### Group 3 — Organization Detection Priority Order

#### Problem recap

Three mechanisms run independently:
- `findOrganizationsCSVFirst()` (dictionary exact + fuzzy + keyword)
- `extractOrganizationContexts()` (regex patterns)
- Compromise.js `.organizations()` NER

No tiebreaker exists. The same org can appear in the findings array from multiple paths with different `rawMatch` strings, and org spans bleed into name detection when `classifyNameVsOrganization` doesn't have dictionary backing.

#### New pipeline in `scan()`

```js
// PASS A: Dictionary-first (findOrganizationsCSVFirst)
const dictOrgFindings = findOrganizationsCSVFirst(text);
const seenOrgSpans = new Set(dictOrgFindings.map(f => f.rawMatch.toLowerCase()));

// PASS B: Compromise.js NER — only for spans not already found
let nlpOrgFindings = [];
if (COMPROMISE_AVAILABLE) {
  const doc = window.nlp(text);
  doc.organizations().forEach(org => {
    const span = org.text().trim();
    if (span && !seenOrgSpans.has(span.toLowerCase())) {
      nlpOrgFindings.push(span);
      seenOrgSpans.add(span.toLowerCase());
    }
  });
}

// PASS C: Context pattern scan — only if A+B produced fewer than 2 findings
let ctxOrgFindings = [];
if (dictOrgFindings.length + nlpOrgFindings.length < 2) {
  ctxOrgFindings = extractOrganizationContexts(text)
    .filter(org => !seenOrgSpans.has(org.toLowerCase()));
}

// Merge all three into findings with correct source/validated fields
```

All three passes contribute to a unified `seenOrgSpans` set so no span appears twice. The final deduplication happens by normalized lowercase value.

---

### Group 4 — Fuzzy Org Matching Performance

#### Problem recap

Pass 2 of `findOrganizationsCSVFirst` slides a word window over the input text and calls `levenshteinDistance` against all 22,151 org names. On a 500-word prompt that is O(500 × 22151) Levenshtein calls.

`ORG_KEYWORDS_INDEX` already exists as a `Map<keyword, orgName[]>` built during `initializeExtensiveOrganizations()`, but it is only used in Pass 3 (keyword component matching). It is not used as a gate for Pass 2.

#### New Pass 2 logic

```js
// Before running any Levenshtein, collect candidate orgs via the index
function getCandidateOrgsFromIndex(text) {
  const textWords = text.toLowerCase()
    .split(/[\s,;.!?'"()\-]+/)
    .filter(w => w.length > 3);

  const candidates = new Set();
  for (const word of textWords) {
    const orgsForWord = ORG_KEYWORDS_INDEX.get(word);
    if (orgsForWord) {
      for (const org of orgsForWord) candidates.add(org);
    }
  }
  return candidates;
}

// In findOrganizationsCSVFirst Pass 2:
const candidateOrgs = getCandidateOrgsFromIndex(text);
if (candidateOrgs.size === 0 || candidateOrgs.size > 200) {
  // Skip fuzzy pass entirely — no candidates or too many to be useful
  console.debug(`[PATH_C/CSV_ORG] Pass 2 skipped: ${candidateOrgs.size} candidates`);
} else {
  for (const org of candidateOrgs) {
    if (org.length > 5) {
      const fuzzyMatches = fuzzyFind(text, org, 2);
      // ... existing length ratio checks ...
    }
  }
}
```

The `fuzzyFind` function itself is not changed. The gate is entirely within `findOrganizationsCSVFirst`.

---

### Group 5 — `classifyNameVsOrganization` Dictionary-First

#### Problem recap

`classifyNameVsOrganization("Abad Brothers")` computes `nameScore` and `orgScore` heuristically. "Abad Brothers" is in `EXTENSIVE_ORGANIZATIONS` but the function doesn't check it.

#### Updated function structure

```js
function classifyNameVsOrganization(text) {
  if (!text || text.length < 2) return "unknown";
  const lower = text.toLowerCase();

  // ── Dictionary checks FIRST ─────────────────────────────────────────────
  // 1. Org dictionary exact match → org
  if (EXTENSIVE_ORGANIZATIONS.has(lower)) return "organization";

  // 2. All words are Philippine names → name
  const words = text.split(/\s+/);
  if (PHILIPPINE_NAMES.size > 0 && words.every(w => PHILIPPINE_NAMES.has(w.toLowerCase()))) {
    return "name";
  }

  // ── Existing scoring heuristics (unchanged, fallback only) ──────────────
  // ... first-person copular pattern check ...
  // ... explicitOrgWords early return ...
  // ... nameScore / orgScore computation ...
  // ... existing decision tree ...
}
```

The existing scoring code is not deleted — it runs only when neither dictionary provides a match.

---

## Components and Interfaces

### `TrustLinguisticDetector` (modified)

**Exported interface (unchanged):**
- `scan(textNLP: string): Finding[]` — main entry point called by `scanner.js`
- `waitForCSVInit(): Promise<void>` — awaited by scanner before calling `scan()`

**New internal function added:**
- `initializePhilippineNames(): boolean` — loads `NAMES_DATA` into `PHILIPPINE_NAMES` Set
- `getCandidateOrgsFromIndex(text: string): Set<string>` — pre-filters org candidates for fuzzy pass

**Modified internal functions:**
- `extractStandalonePersonNames(text)` — positive-signal gate replaces broad `NON_NAME_WORDS` check
- `classifyNameVsOrganization(text)` — dictionary lookup before scoring heuristics
- `findOrganizationsCSVFirst(text)` — Pass 2 gated by `getCandidateOrgsFromIndex`
- `scan(text)` — three-pass org pipeline with shared `seenOrgSpans` Set

### `terms-names.js` (new file)

**Exports:** `const NAMES_DATA` (array of strings, global scope, no module system)

**Consumed by:** `linguistic-detector.js` `initializePhilippineNames()`

### `manifest.json` (modified)

**Change:** `"terms-names.js"` inserted before `"linguistic-detector.js"` in all three `content_scripts` array entries.

---

## Data Models

### Finding object (unchanged)

```js
{
  patternId: 'nlp_person' | 'nlp_organization' | 'nlp_job_title',
  label: string,          // Human-readable label
  risk: 'low' | 'moderate',
  rawMatch: string,       // Exact text as found in prompt
  safeVersion: string,    // Masked version
  source: string,         // Detection source identifier
  validated: boolean      // true = dictionary-backed, false = NLP-only
}
```

### `NAMES_DATA` array (new)

```js
const NAMES_DATA = [string, ...]; // ~1000+ entries, plain strings, mixed case
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `NAMES_DATA` not loaded | Log warning, `PHILIPPINE_NAMES` stays empty Set, name detection falls back to Compromise.js NER only |
| `EXTENSIVE_ORGANIZATIONS` empty | `classifyNameVsOrganization` skips dictionary check, falls through to scoring heuristics |
| Compromise.js unavailable | `scan()` returns `[]`, all NLP-dependent extraction is skipped |
| Fuzzy candidate count > 200 | Pass 2 is skipped; Pass 1 and Pass 3 still run |
| Levenshtein on very long strings | Existing `fuzzyFind` handles this — no change needed |

---

## Correctness Properties

### Property 1: Dictionary-backed organization match returns "organization"
For any input string `s` where `EXTENSIVE_ORGANIZATIONS.has(s.toLowerCase())` is `true`, `classifyNameVsOrganization(s)` shall return `"organization"`.

**Validates: Requirements 5.1**

### Property 2: Dictionary-backed name match returns "name"
For any two-word input where both words are in `PHILIPPINE_NAMES`, `classifyNameVsOrganization` shall return `"name"`.

**Validates: Requirements 5.2**

### Property 3: No org span appears twice in findings
The final findings array returned by `scan()` shall contain at most one entry with `patternId === 'nlp_organization'` per unique normalized span.

**Validates: Requirements 3.5**

### Property 4: Fuzzy pass skipped when candidate count exceeds cap
When `getCandidateOrgsFromIndex` returns more than 200 candidates, no `levenshteinDistance` call shall be made for that scan.

**Validates: Requirements 4.2**

### Property 5: Graceful degradation preserved
When `window.nlp` is `undefined`, `scan()` shall return an empty array without throwing.

**Validates: Requirements 6.3**
