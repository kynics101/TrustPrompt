# Requirements Document

## Introduction

Path C is the NLP/linguistic detection layer of TrustPrompt's Privacy Disclosure Risk Assessment Engine. It uses Compromise.js, a gazetteer, and fuzzy matching to detect person names, job titles, and organization names in AI prompts. Five concrete bugs have been identified that cause false positives, false negatives, unbounded memory growth, and performance overruns. This spec covers all five.

---

## Requirements

### 1. Philippine Names Dictionary (`terms-names.js`)

#### 1.1
The system shall include a new data file `terms-names.js` that exports a constant array named `NAMES_DATA` containing Philippine given names and surnames.

#### 1.2
`NAMES_DATA` shall contain at minimum 500 given names and 500 surnames commonly used in the Philippines, covering both traditional Filipino names and Spanish-origin names widely used in the Philippines.

#### 1.3
The structure and export style of `terms-names.js` shall be identical to `terms-occupations.js`: a single `const NAMES_DATA = [...]` array declaration with no module exports, suitable for loading as a browser extension content script.

#### 1.4
`terms-names.js` shall be listed in `manifest.json` before `linguistic-detector.js` in every content script block that already contains `terms-occupations.js`.

#### 1.5
`linguistic-detector.js` shall initialize a `PHILIPPINE_NAMES` Set from `NAMES_DATA` on module load, following the same initialization pattern used for `EXTENSIVE_JOB_TITLES` and `EXTENSIVE_ORGANIZATIONS`. If `NAMES_DATA` is unavailable, the system shall log a warning and continue without the names dictionary (graceful degradation).

---

### 2. Name Detection Positive-Signal Logic

#### 2.1
The `extractStandalonePersonNames` function shall use a positive-signal approach: a capitalized token is accepted as a candidate name component only if it appears in `PHILIPPINE_NAMES` or passes Compromise.js NER tagging as a person name. The existing `NON_NAME_WORDS` blocklist shall not be the primary gate.

#### 2.2
The system shall cross-reference every candidate name token against `EXTENSIVE_JOB_TITLES` and `EXTENSIVE_ORGANIZATIONS`. A token that appears in either dictionary shall be rejected as a person name component, regardless of capitalization.

#### 2.3
The `NON_NAME_WORDS` constant shall be reduced to possessive pronouns, articles, and demonstratives only (at most 20 entries). All adjectives, verbs, gerunds, and abstract nouns that were added as ad-hoc false-positive patches shall be removed from `NON_NAME_WORDS` and their filtering responsibility transferred to the positive-signal checks in 2.1 and 2.2.

#### 2.4
Single-word capitalized tokens that do not appear in `PHILIPPINE_NAMES` and are not confirmed by Compromise.js NER shall not be emitted as person name findings, even if they pass all other filters.

---

### 3. Organization Detection Priority Order

#### 3.1
Organization detection shall follow a strictly ordered three-pass pipeline: (1) exact match against `EXTENSIVE_ORGANIZATIONS`, (2) Compromise.js `.organizations()` NER, (3) `findOrganizationsInCSV()` substring scan. Later passes shall not produce a finding for a span already matched in an earlier pass.

#### 3.2
If a span is matched in Pass 1 (exact dictionary match), it shall be emitted with `source: 'nlp_organization'` and `validated: true`, and Passes 2 and 3 shall not re-examine that span.

#### 3.3
If a span is matched in Pass 2 (Compromise.js NER) but not in Pass 1, the span shall be validated against `EXTENSIVE_ORGANIZATIONS` before emission. If the span (or a normalized form) does not appear in `EXTENSIVE_ORGANIZATIONS`, it may still be emitted but with `validated: false`.

#### 3.4
Pass 3 (`findOrganizationsInCSV`) shall only run if Passes 1 and 2 together produced fewer than two organization findings for the current scan, to prevent triple-counting of the same org span.

#### 3.5
No span shall appear in the final findings array more than once with `patternId: 'nlp_organization'`. Deduplication shall be performed by normalized lowercase span value before findings are returned.

---

### 4. Fuzzy Organization Matching Performance

#### 4.1
The fuzzy Levenshtein scan in `findOrganizationsCSVFirst` Pass 2 shall be gated by `ORG_KEYWORDS_INDEX`. Before running any Levenshtein computation, the system shall extract keywords (words longer than 3 characters) from the current text window and retrieve candidate organizations from `ORG_KEYWORDS_INDEX`. Levenshtein shall only be run against retrieved candidates, not against all 22,151 organization names.

#### 4.2
If the total number of unique candidate organizations retrieved from `ORG_KEYWORDS_INDEX` exceeds 200 for a single scan, the fuzzy pass shall be skipped entirely for that scan. The exact-match Pass 1 and keyword-component Pass 3 shall still run.

#### 4.3
The performance of a full Path C scan on a 500-word text input shall not exceed 50ms in a Chrome extension content script environment (measured with `performance.now()`). This budget applies to the complete `scan()` call including all three organization detection passes.

#### 4.4
The gating logic shall be implemented inside `findOrganizationsCSVFirst` without modifying the `fuzzyFind` utility function or any other calling code outside that function.

---

### 5. `classifyNameVsOrganization` Dictionary-First Logic

#### 5.1
`classifyNameVsOrganization` shall check `EXTENSIVE_ORGANIZATIONS` first before evaluating any scoring heuristics. If the input text (exact or lowercased) appears in `EXTENSIVE_ORGANIZATIONS`, the function shall return `"organization"` immediately without computing `nameScore` or `orgScore`.

#### 5.2
`classifyNameVsOrganization` shall check `PHILIPPINE_NAMES` before evaluating scoring heuristics. If every word in the input appears in `PHILIPPINE_NAMES`, the function shall return `"name"` immediately.

#### 5.3
The existing scoring heuristics (`nameScore`, `orgScore`, and the structural keyword checks) shall be retained as a fallback for inputs that do not appear in either dictionary. Their logic shall not be modified.

#### 5.4
The function shall never return `"unknown"` for an input that has a definitive match in either dictionary.

---

### 6. General Constraints

#### 6.1
All processing shall execute client-side within the browser extension. No prompt text shall be transmitted to any external server during Path C scanning.

#### 6.2
The findings shape emitted by Path C shall remain `{ patternId, label, risk, rawMatch, safeVersion, source, validated }`. No new fields shall be added or existing fields removed.

#### 6.3
If Compromise.js (`window.nlp`) is unavailable at scan time, `scan()` shall return an empty array without throwing. This behavior shall be preserved by all changes in this spec.

#### 6.4
All changes shall be confined to `linguistic-detector.js`, `terms-names.js` (new file), and `manifest.json`. Path A (`patterns.js`) and Path B (`gazetteer.js`) shall not be modified.

#### 6.5
The `source` field on name findings shall be `'nlp_person'`. The `patternId` shall be `'nlp_person'` for names, `'nlp_organization'` for organizations, and `'nlp_job_title'` for job titles. These values shall not change.
