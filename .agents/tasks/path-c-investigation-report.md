# Path C Linguistic-Detection Subsystem — Investigation Report

**Scope:** Path C only (`nlp_person_name`, `nlp_organization`, `nlp_job_title`, and the department question). Paths A/B (`gazetteer_*`, `ph_address`, `source_code`, regex/validator) are out of scope and were only read to define boundaries. READ-ONLY: no files were edited, created, or deleted; the extension was not run. All example data is fictional.

---

## Summary (read this first)

- **Live file is `linguistic-detector.js`.** `manifest.json` loads `linguistic-detector.js` in both content-script sets; `linguistic-detector-refactored.js` is NOT in the manifest and is dead. `scanner.js` calls `TrustLinguisticDetector.scan()` (line 3183) — the live `scan` at line 2716. A second `scanLegacy` (line 3110) and its helpers (`extractStandalonePersonNames`, `extractSubjectPositionNames`, `extractPredicateJobTitles`, `extractOrganizationContexts`, `extractFromAppositives`, `extractEntityContextPairs`, `deduplicateWithinPath`, `mergeConsecutiveNames`) are NOT called by the live `scan`; they are legacy.
- The module is an IIFE assigned to `const TrustLinguisticDetector` and also to `window.`/`globalThis.` (lines 3550/3555). It returns `{ scan, waitForCSVInit }` (line 3542); `waitForCSVInit` is a no-op `() => Promise.resolve(true)` (line 3539). Data loads synchronously from JS arrays (`ORGANIZATIONS_DATA`/`OCCUPATIONS_DATA`), not runtime CSV.
- **Dictionaries are inline JS arrays**, not runtime CSV: `terms-organizations.js` (`ORGANIZATIONS_DATA`, 22,151 orgs) and `terms-occupations.js` (`OCCUPATIONS_DATA`, 17,995 titles). `organization-loader.js`/`organization-detector-enhanced.js` (`TrustOrganizationLoader`/`TrustOrganizationDetectorEnhanced`) are loaded by the manifest but are NOT referenced by the live `linguistic-detector.js` — they were only wired into the dead `-refactored` file.
- **Fuzzy matching uses Levenshtein edit distance, not a 0.8 ratio.** Orgs: `maxDistance = 2` (line 1611). Jobs: `maxDistance = 1` (line 1795). Both add a `lengthRatio >= 0.70` guard and a `match.length > 5` guard. The 0.8-similarity threshold belongs to Path B gazetteer, not Path C.
- **There is no `nlp_department` tag.** Departments fold into `nlp_organization` (CSV entries containing Department/Division words, plus `classifyNameVsOrganization` recognizing `department`/`dept`/`division`).
- **Core defect pattern:** Path C names are detected by *capitalized-word heuristics* (`[A-Z][a-z]+`), which (1) is ASCII-only so it truncates diacritic surnames (Peña→Pe), (2) caps multi-word spans at 3 words so it splits "Alvin Jay Dela Rosa", and (3) has no exclusion list for sentence-initial verbs/titles. Org detection is *CSV-whitelist-only* with no suffix/structural patterns, so orgs absent from the 22k list are missed; and its PASS-3 keyword step has a single-keyword bug that flags ordinary words ("philippines", "store") as whole organizations.

---

## Part A — Path C Architecture (Step 1 answers)

### A1. Files & functions that detect each entity type

All live detection is in **`c:\Users\Andrea\TrustPrompt-1\linguistic-detector.js`**, inside the live `scan(textNLP)` (lines **2716–3108**). Compromise.js (`window.nlp`) is used only as a validation gate (POS/context), NOT as the primary extractor; the primary extractors are regexes over Title-Case words.

**(a) Person names** — `scan()` STAGE 1 + STAGE 5, four inline methods:
- METHOD 1 — Honorifics: `extractNamesWithHonorific(text)` (lines 564–578) using `const HONORIFICS` regex (line 547): `(Mr|Ms|Mrs|Miss|Mx|Sir|Madam|Dr|Prof|Professor|Rev|...)\.?\s+([A-Z][a-z]+...)`. Pushed at lines 2736–2752.
- METHOD 2 — Trigger phrases: inline `nameTriggerPatterns` (lines 2755–2768): `my name is`, `i am/'m`, `call me`, `i'm called`. Pushed at lines 2769–2801.
- METHOD 3 — Subject position: inline `subjectNamePattern` (line 2809): `[Capitalized words] + (is|are|said|works|...)`. Pushed at lines 2813–2854.
- METHOD 4 — Standalone capitalized: inline `standaloneNamePattern` (line 2858): `\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b`. Pushed at lines 2859–2945. This is the only name method that calls `classifyNameVsOrganization` (line 2907), `looksLikePlaceName` (line 2911), and the corporate-suffix check (lines 2921–2924).
- METHOD 4.5 — Directive context: inline `directiveContextPatterns` (lines 3044–3058): single `[A-Z][a-z]+` after `for|to|with|from|contact|call|invite|notify`. Pushed at lines 3062–3098.

**(b) Organizations** — `scan()` STAGE 2 + STAGE 4:
- `findOrganizationsCSVFirst(text)` (lines 1553–1695): PASS 1 exact `\b…\b` (1576–1599), PASS 2 fuzzy `fuzzyFind(text, org, 2)` (1610–1649), PASS 3 keyword-component (1666–1695).
- Validated by `validateOrganizationsWithCompromise(csvFindings, text, doc)` (lines 1904–1960) using `checkOrgContext` (lines 411–453) and `checkBadPOS` (lines 461–496). High-confidence exact CSV matches bypass validation (line 1916).
- Added to findings in STAGE 4 (lines 2998–3030), gated by `shouldFilterCommonOrganization` (line 3004) and `looksLikePlaceName` (line 3008).
- Note: `findOrganizationsInCSV` (lines 865–925, exact-only) is a separate function used only by `scanLegacy` (line 2658), NOT by live `scan`.

**(c) Job titles** — `scan()` STAGE 2 + STAGE 4:
- `findJobTitlesCSVFirst(text)` (lines 1703–1839): PASS 1 exact `\b…\b` (1724–1740), PASS 2 multi-word phrase (1748–1790), PASS 3 fuzzy `fuzzyFind(text, title, 1)` (1794–1830).
- Validated by `validateJobTitlesWithCompromise(csvFindings, text, doc)` (lines 1843–1901) using `checkJobContext` (lines 380–403) and `checkBadPOS`. **Even high-confidence exact matches require `checkJobContext` to pass** (lines 1858–1867).
- Added in STAGE 4 (lines 2984–2996).

**(d) Departments** — no dedicated function and no `nlp_department` tag (confirmed: no such `patternId` exists anywhere). Departments are detected as `nlp_organization` when (i) the department string is in `ORGANIZATIONS_DATA` (caught by `findOrganizationsCSVFirst` PASS 1), or (ii) the phrase reaches the name path and `classifyNameVsOrganization` (line 1406) sees an org-indicator word (`department`, `dept`, `division`, `unit`, `group`, `team`, `bureau` are in `explicitOrgWords`, lines 1422–1425) and returns `"organization"` — but `classifyNameVsOrganization` only *suppresses* name candidates, it never *emits* an org finding. So a department NOT in the CSV is not detected at all.

**Compromise.js usage:** `COMPROMISE_AVAILABLE` (line 22) gates validation only. `window.nlp(span)` is called in `validateJobTitlesWithCompromise`/`validateOrganizationsWithCompromise` for `checkBadPOS` (POS counts). The live `scan` never calls `doc.people()`/`doc.organizations()`/NER directly — name/org extraction is regex + dictionary, not compromise NER.

### A2. Execution order & overlap resolution

**Within one `scan(textNLP)` call** (lines 2716–3108), strictly sequential:
1. STAGE 1 — names: METHOD 1 honorific → METHOD 2 trigger → METHOD 3 subject → METHOD 4 standalone.
2. STAGE 2 — `findJobTitlesCSVFirst` then `findOrganizationsCSVFirst`.
3. STAGE 3 — `validateJobTitlesWithCompromise` then `validateOrganizationsWithCompromise`.
4. STAGE 4 — push validated jobs, then push validated orgs.
5. STAGE 5 — METHOD 4.5 directive single-word names (runs AFTER org detection; cannot see org findings to suppress itself).

**In `scanner.js scan(rawText)`** (lines 3068–3266): normalize four views (3084–3085) → source-code detection first on `textRegex` (3091) → Path A `runPathA(textRegex)` then concat source-code (3099–3119) → Path B `TrustGazetteer.scan(textGazetteer)` then **filter out person_name/organization/job_title** so Path B keeps only medical/financial/nationality/religion/health/sex/eye_color (3127–3160) → Path C `TrustLinguisticDetector.scan(textNLP)` (3160–3192, call at 3183) → `mergeAndDedupe(pathA,pathB,pathC,sourceCode)` (~3220) → `suppressPlaceholders` → `computeRiskScore`.

**Overlap / deduplication — `mergeAndDedupe` (scanner.js lines 2816–2938):**
- Dedup key is `patternId + ":" + rawMatch.trim().toLowerCase()` (line 2851). This is the decisive design: the same raw text detected as **both** `nlp_organization` AND `nlp_person_name` produces **two different keys, so BOTH survive**. There is NO organization-over-person precedence in the scanner.
- Within the same `(patternId, rawMatch)` pair, the higher-risk finding wins via `RISK_ORDER` (line 2853).
- Cross-type overlap that IS resolved: a `ph_address` whose text contains a `nlp_person_name`/`nlp_organization` fragment drops the name/org fragment (lines 2914–2936); a `ph_address` contained in a longer `ph_address` or in an `nlp_organization` is dropped (lines 2893–2907). SSS-vs-UMID substring suppression (2857–2866).

**Where "org vs person name" is actually decided:** Inside Path C, only METHOD 4 (standalone) rejects a candidate already classified as an organization, at line 2907 (`if (classifyNameVsOrganization(candidateName) === 'organization') continue;`). METHOD 1, METHOD 2, METHOD 3, and METHOD 4.5 do **not** call `classifyNameVsOrganization` or `looksLikePlaceName`. So an organization that precedes a verb ("X is…", "X said…") is captured as a person name by METHOD 3 and survives, because (a) METHOD 3 has no org check and (b) the scanner keeps both tags. **Net: for the same span, person-name and organization findings coexist; organization only "wins" inside METHOD 4, and only when `classifyNameVsOrganization` actually returns `"organization"`.**

### A3. Dictionaries & thresholds

| Item | Location | Form |
|---|---|---|
| Job-title dictionary | `terms-occupations.js` → `const OCCUPATIONS_DATA` (line 4, 17,995 Title-Case entries) | Inline JS array |
| Organization dictionary | `terms-organizations.js` → `const ORGANIZATIONS_DATA` (line 4, 22,151 entries) | Inline JS array |
| Population into detector | `initializeExtensiveJobTitles` (lines 148–188), `initializeExtensiveOrganizations` (lines 190–238) — both lowercase into Sets + length-sorted arrays; called synchronously at module load (lines 3529–3530) | — |
| Org keyword index | `ORG_KEYWORDS_INDEX` built in `initializeExtensiveOrganizations` (lines 216–226) — maps each org word `> 3` chars to its org names | Map |

**Fuzzy thresholds (exact constants):**
- `levenshteinDistance(str1, str2)` — lines 252–285 (classic DP edit distance).
- `fuzzyFind(text, pattern, maxDistance = 2)` — lines 325–355. Orgs call it with `maxDistance = 2` (line 1611); jobs with `maxDistance = 1` (line 1795). A window of `patternWords.length` text words is joined and compared by Levenshtein.
- Prefix/suffix guard: `isPrefixSuffixVariation(text, term, threshold = 20)` (lines 291–322) rejects substring variants with `> 20%` length growth (line 304).
- Org PASS 2 guards: `org.length > 5` (1610), `match.length <= 5` → skip (1617), `lengthRatio = match.length / org.length < 0.70` → skip (1624–1626).
- Job PASS 3 guards: `title.length > 5` (1794), `match.length <= 5` → skip (1800), `lengthRatio < 0.70` → skip (1806–1808).
- **There is no 0.8 similarity-ratio threshold in Path C.** Path B gazetteer uses 0.8; Path C uses edit distance + the 0.70 length-ratio guard above.

### A4. Calling a single scan

**Entry point & signature (live):**
```js
window.TrustLinguisticDetector.scan(textNLP)  // browser
globalThis.TrustLinguisticDetector.scan(textNLP) // node
```
- `textNLP` is the Path-C-normalized view, i.e. `TrustNormalizer.normalizePath_C(rawText)` (normalizer.js lines 211–285). `scanner.js` passes `normalizePath_C` output (line 3085 → 3183). Passing raw text works but is not faithful (sentence-casing, code-block stripping, ñ handling differ).
- Returns an **array** of findings; each has `{ patternId, label, risk:'low', rawMatch, safeVersion, source:'C_linguistic', ... }` (shape documented at lines 2705–2714). Example filter: `results.filter(r => r.patternId === 'nlp_person_name').map(r => r.rawMatch)`.
- `waitForCSVInit()` exists but is a no-op (line 3539); nothing to await for data.

**Minimal harness to run a list of fictional prompts (Node):**
```js
// Mirrors test-detector-standalone.js
global.window = {}; global.globalThis = global; global.document = { title: 't' };
require('./terms-organizations.js');   // defines ORGANIZATIONS_DATA
require('./terms-occupations.js');     // defines OCCUPATIONS_DATA
require('./lib/compromise.min.js');    // optional; if absent, window.nlp undefined => validation skipped
require('./normalizer.js');           // defines TrustNormalizer
require('./linguistic-detector.js');   // assigns globalThis.TrustLinguisticDetector
const D = globalThis.TrustLinguisticDetector;
for (const t of PROMPTS) {
  const textNLP = TrustNormalizer.normalizePath_C(t);
  const findings = D.scan(textNLP);
  console.log(t, '->', findings.map(f => `${f.patternId}:"${f.rawMatch}"`));
}
```
- **Node vs browser:** runs in Node with the globals mocked (per `test-detector-standalone.js`). If `window.nlp` is undefined, `COMPROMISE_AVAILABLE` is false (line 22) and the STAGE-3 validation gate is skipped, so **all CSV findings are returned unfiltered** — that changes behavior vs the browser (where validation runs and drops context-less titles/orgs). For browser-faithful results, load `lib/compromise.min.js` so `window.nlp` is defined. `terms-organizations.js`/`terms-occupations.js` MUST load before the detector or the Sets are empty and CSV detection silently returns nothing (graceful fallback at lines 180–188/233–238).
- Existing test files use these patterns: `test-path-c-improvements.js` (loops `window.TrustLinguisticDetector.scan(text)` in browser), `test-detector-standalone.js` (Node with mocked globals + `require('./linguistic-detector.js')`), `quick_test.js` (eval-based), `test-org-extraction.js` (`require` then `.scan`).

---

## Part B — Root-cause analysis (failure categories a–g)

For each: exact location, short quoted code, and the mechanism. Example strings are fictional diagnostic inputs, not hardcoded data.

### (a) Organizations tagged as person names — "Mercury Drug", "Ayala Land", "Toyota Motor Philippines", "Philippine General Hospital"

**Root cause 1 — `classifyNameVsOrganization` defaults ambiguous 2–3 word Title-Case phrases to `"name"`** (`linguistic-detector.js` lines 1406–1551).

The classifier only recognizes an org via explicit keyword lists; brand names with none of those words fall through to the default that favors "name":
```
// line 1422 explicitOrgWords (Inc, Corp, Ltd, Department, University, Hospital, ...)
// line 1474 orgWords (company, corporation, dept, university, hospital, ...)
// line 1517 if (nameScore > orgScore && nameScore >= 2) return "name";
// line 1521 if (hasPrepositions) return "organization";
// line 1527 if (nameScore > 0) return "name";   // default for 2-3 words
```
- "Mercury Drug": no word in `explicitOrgWords`/`orgWords` → `nameScore=3` (2 words proper length +2, all-capitalized +1) vs `orgScore=0` → returns `"name"`.
- "Ayala Land", "Toyota Motor Philippines": same — no recognized org indicator → `"name"`.
- METHOD 4 (standalone, line 2858) captures these and, since `classifyNameVsOrganization(candidateName) === 'organization'` is false (line 2907), does NOT skip them → emitted as `nlp_person_name` (lines 2928–2938).

**Root cause 2 — METHOD 3 (subject position) has no organization precedence at all** (lines 2805–2854).
```
// line 2809 subjectNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:is|are|...|said|...)\b/g
// filters: pronouns, length<2, NON_NAME_WORDS, duplicate — NO classifyNameVsOrganization, NO looksLikePlaceName
```
- "Philippine General Hospital is located…" → METHOD 3 captures "Philippine General Hospital" before "is". Even though `classifyNameVsOrganization` WOULD return `"organization"` here (because "hospital" ∈ `explicitOrgWords`), METHOD 3 never calls it → emitted as `nlp_person_name` (lines 2843–2853).
- Mechanism: METHOD 1/2/3/4.5 lack the org/place/corporate-suffix guards that only METHOD 4 has (lines 2907–2924).

### (b) Organizations NOT detected — "SGV & Co.", "Magsaysay Maritime Corporation", "Pacific Harvest Foods Inc.", "Cebu Pacific", "St. Luke's Medical Center"

**Root cause 1 — Live org detection is CSV-whitelist-only; there is no suffix/structural detection.**
`findOrganizationsCSVFirst` (lines 1553–1695) only matches against `ORGANIZATIONS_DATA`. Verified data presence:
- "SGV & Co." → NOT in `ORGANIZATIONS_DATA`. "Magsaysay Maritime Corporation" → not present (only "Magsaysay" partial). "Pacific Harvest Foods Inc." → not present. "St. Luke's Medical Center" (full) → not present (only "St. Luke").
There is no regex like "X Corporation / X Inc. / X Medical Center / X & Co." anywhere in the live path. So orgs absent from the 22,151-entry whitelist are missed entirely.

**Root cause 2 — "Cebu Pacific" is in the data but dropped by `looksLikePlaceName`.**
`PLACE_NAME_WORDS` includes "cebu" (lines 78–87). `looksLikePlaceName` returns true if any token matches (lines 120–126):
```
// line 124 if (PLACE_NAME_WORDS.has(lower)) return true;
// line 125 return lower.split(/\s+/).some(w => PLACE_NAME_WORDS.has(w));
```
STAGE 4 drops CSV orgs that look like a place (line 3008 `if (looksLikePlaceName(orgRaw)) continue;`). So "Cebu Pacific" (a real org, in the CSV) is filtered out because "Cebu" is a place word.

**Root cause 3 (latent, affects CSV orgs ending in punctuation) — trailing `\b` after an escaped period breaks exact match.**
PASS 1 builds `new RegExp("\\b" + escapeRegex(orgLower) + "\\b", "gi")` (lines 1583–1587). For an org ending in "." (e.g. "Abad Cloud Services Inc."), the final `\b` sits after a literal ".", which is a non-word char; a word boundary there requires the next char to be a word char, so the org fails to match when followed by space/EOL. (Secondary to (b) since the listed examples are mostly absent from the CSV anyway.)

### (c) Names with extra words + titles tagged as names — "Introduce Joshua Pangilinan", "Congratulate Fernando Manalo", "Principal Armando Dizon"; titles "Ms", "Dr", "Safety Officer"

**Root cause 1 — Name regexes greedily capture all consecutive capitalized words; `NON_NAME_WORDS` lacks sentence-initial verbs and titles.**
METHOD 4 (line 2858) and METHOD 3 (line 2809) use `[A-Z][a-z]+` repeated with no boundary that excludes leading verbs/titles. `NON_NAME_WORDS` (lines 31–101) contains adjectives, participles, discourse markers, and attribute nouns, but NOT verbs like "introduce", "congratulate", "generate" nor titles like "principal", "officer", "captain", "safety".
- "Introduce Joshua Pangilinan" → METHOD 4 captures all 3 Title-Case words; `classifyNameVsOrganization` → `"name"` (no org words); `NON_NAME_WORDS` has no "introduce" → emitted as `nlp_person_name` (lines 2928–2938).
- "Principal Armando Dizon is…" → METHOD 3 captures "Principal Armando Dizon" before "is"; no title exclusion → `nlp_person_name` (lines 2843–2853).
- "Safety Officer" → METHOD 4; `classifyNameVsOrganization("Safety Officer")` → `"name"` (neither "safety" nor "officer" is in `explicitOrgWords`/`orgWords`); emitted as a person name.

**Root cause 2 — METHOD 4.5 directive captures single-word honorifics** (lines 3044–3098).
```
// line 3046 { pattern: /\b(?:for|to|with)\s+([A-Z][a-z]+)\b/g, ... }
// line 3048 { pattern: /\b(?:contact|call|invite|notify)\s+([A-Z][a-z]+)\b/g, ... }
```
`[A-Z][a-z]+` matches "Dr" (D+r) and "Ms" (M+s). The METHOD 4.5 filters (lines 3066–3074) reject only `shouldFilterCommonName`, `nonNameWordsDirective` (lines 3035–3043, no honorifics), and `knownOrganizations` (line 3072: azure/google/…/bard — no "ms"/"dr"). So "send to Dr" / "for Ms" → "Dr"/"Ms" emitted as `nlp_person_name` (lines 3080–3090). There is no honorific/title blocklist applied to captured names.

### (d) Names split wrongly — "Alvin Jay Dela" / "Rosa"; "Grace Dela Pe"

**Root cause 1 — Multi-word name cap of 3 words (`{1,2}`) splits 4-word names.**
`standaloneNamePattern` (line 2858) and `nameTriggerPatterns` (lines 2757–2767) and `HONORIFICS` (line 547) all use `(?:\s+[A-Z][a-z]+){1,2}` — at most 3 total words. "Alvin Jay Dela Rosa" (4 words) → captures "Alvin Jay Dela"; "Rosa" is a lone capitalized word that fails the {1,2} requirement, so it is either dropped or captured separately by a single-word method, producing "Alvin Jay Dela" / "Rosa".

**Root cause 2 — `[A-Z][a-z]+` is ASCII-only, so diacritics truncate surnames.**
"Peña" → after Path-C normalization the `ñ` survives (asciiPunctuation does not fold ñ→n); the regex `[a-z]+` stops at `ñ`, matching only "Pe". So "Grace Dela Peña" → "Grace Dela Pe" (line 2858 pattern; same defect in line 2809 and line 547). No Filipino/Hispanic surname particle handling ("Dela", "De Los", "De La") keeps "Dela Rosa"/"De Los Santos" as one unit.

### (e) Job titles not detected — "flight attendant", "call center agent", "chief financial officer", "seaman", "electrician", "accountant"

**Root cause 1 — `validateJobTitlesWithCompromise` requires job context even for exact CSV matches** (lines 1843–1901).
```
// line 1858 if (finding.source === 'csv_exact_match' && finding.confidence === 'high') {
//   if (checkJobContext(text, actualSpan)) validated.push(finding);
//   else { ... "FILTER (no context)" }    // exact match WITHOUT a trigger is DROPPED
```
`checkJobContext` (lines 380–403) only accepts a narrow trigger list ("is a", "is an", "is the", "works as", "my", "your", "his", …). Verified data presence: "Electrician", "Accountant", "Flight Attendant", "Call Center Agent" ARE exact `OCCUPATIONS_DATA` entries, but a bare mention ("hire an electrician", "the accountant said") has no trigger → dropped. (When `COMPROMISE_AVAILABLE` is false this gate is skipped, so results differ between Node-without-nlp and browser.)

**Root cause 2 — Some titles are not standalone entries.** "seaman" exists only as part of "Able Seaman"/"Able-Bodied Seaman" (PASS 1 `\bseaman\b` is never built; PASS 2 builds 2–3 word windows; a lone "seaman" is not checked) → missed. "chief financial officer" is absent from `OCCUPATIONS_DATA` → missed (no fuzzy hit at distance 1).

### (f) Ordinary words tagged as job titles — "schedule", "clearer", "stronger", "snippet", "service", "leader"

**Root cause — PASS 3 fuzzy match (`maxDistance = 1`) accepts any common word within 1 edit of a real occupation, and there is no common-word blocklist.**
`findJobTitlesCSVFirst` PASS 3 (lines 1794–1830) calls `fuzzyFind(text, title, 1)` for every title `> 5` chars, keeping matches `> 5` chars with `lengthRatio >= 0.70`. The `rawMatch` stored is the ordinary text word (line 1816), labeled `nlp_job_title`. Verified 1-edit neighbors in `OCCUPATIONS_DATA`:
- "clearer" → "Cleaner" (line 3076)
- "stronger" → "Stringer" (line 15663)
- "snippet" → "Snipper" (line 14872)
- "schedule" → "Scheduler" (line 13915)
- "leader" → "Loader" (line 9232)
- "service" → "Servicer" (line 14229)

`shouldFilterCommonJobTitle` (lines 744–770) positively KEEPS any title in the CSV set and only filters placeholder words — it has no English-common-word blocklist, so ordinary words that fuzzy-match an occupation pass. (Whether a fuzzy hit survives validation additionally depends on `checkJobContext`; the fundamental defect is the loose fuzzy match plus the absent blocklist.)

### (g) Ordinary phrases tagged as organizations — "to store", "make it", "the Philippines"

**Root cause (confirmed for "to store" and "the Philippines) — PASS 3 keyword-component matching flags a whole org when a single >3-char keyword appears, because 2-word orgs with a ≤3-char first word have only ONE keyword.**
`findOrganizationsCSVFirst` PASS 3 (lines 1666–1695): the keyword index (`ORG_KEYWORDS_INDEX`, built at lines 216–226) stores only org words `> 3` chars. For a 2-word org whose first word is ≤3 chars, the lone long second word is the only keyword, so the 60% gate (`keywordMatches >= Math.ceil(orgKeywords.length * 0.6)`) is satisfied by that single word appearing anywhere (the check is `textWindowWords.some(tw => tw.includes(keyword))` — a substring test, line 1685). Verified data:
- "AXA Philippines" (line 1672), "Kia Philippines" (line 8866), "OLX Philippines" (line 13948) — first word ≤3 chars → sole keyword "philippines". So any text containing "philippines" flags the whole canonical org as `nlp_organization`.
- "SM Store" (line 17945) — first word "SM" (2 chars) → sole keyword "store". So any "store" flags "SM Store".

STAGE 4 does not stop these: `shouldFilterCommonOrganization` (lines 782–860) only blocks single-word common terms and all-lowercase single words — a multi-word canonical name like "AXA Philippines"/"SM Store" passes (lines 786–860); `looksLikePlaceName` (line 3008) does not catch "philippines" (not in `PLACE_NAME_WORDS`). The emitted `rawMatch` is the canonical org name (`org.rawMatch || org.name`, line 2999), so the user sees an org badge triggered by the ordinary word.

**"make it":** I could not pin a concrete CSV target by static analysis. "make" is not an org word (no "Make X"/"X Make"/"Make It" entries found), and no 2-word org is within Levenshtein distance 2 of "make it" (both tokens are ≤5 chars, so PASS 2's `match.length > 5` guard blocks them; PASS 3 needs "make" in the keyword index). The likely mechanism is the same PASS-3 single-keyword class IF "make" indexes some org, or PASS-2 fuzzy against an as-yet-unlocated 2-word org; confirm with a live scan that prints `f.source` for the finding. Honest limitation: exact target not determined from code alone.

---

## Part C — Cross-cutting notes

**Shared filters affecting multiple categories:**
- **`classifyNameVsOrganization` (lines 1406–1551)** — used ONLY by METHOD 4 (line 2907) and `extractStandalonePersonNames` (scanLegacy, line ~660). Its keyword lists (`explicitOrgWords` 1422, `orgWords` 1474) decide (a) and (c); its default-to-"name" for 2–3 word phrases (line 1527) is the core of (a).
- **`NON_NAME_WORDS` (lines 31–101)** — consulted by METHOD 2 (2780), METHOD 3 (2836), METHOD 4 (2886) and scanLegacy. Missing verbs/titles cause (c).
- **`shouldFilterCommonOrganization` (lines 782–860)** — consulted at STAGE 4 (line 3004) and scanLegacy. Only blocks single-word common terms / all-lowercase single words; multi-word ordinary phrases pass → enables (g).
- **`looksLikePlaceName` (lines 120–126) + `PLACE_NAME_WORDS` (78–87)** — drops both name candidates (METHOD 4, line 2911) and CSV orgs (STAGE 4, line 3008). "cebu" ∈ place words causes (b) "Cebu Pacific"; "philippines" ∉ place words fails to stop (g) "the Philippines".
- **`isCodePattern` (lines 928–1023)** — consulted by `findOrganizationsInCSV` (line 890) and STAGE 4 org path via the legacy context extractor; mainly a code-vs-name guard, not a driver of a–g.
- **`checkJobContext` (380–403) / `checkOrgContext` (411–453)** — narrow trigger lists; the job one drives (e) and gates (f) survival; the org one gates medium-confidence orgs only (exact CSV orgs bypass it, line 1916).
- **`\b${escapeRegex(x)}\b` with `gi`** — PASS 1 in both finders (jobs 1728, orgs 1583). The trailing `\b` breaks on org names ending in punctuation (b root cause 3).
- **`fuzzyFind` edit-distance + 0.70 length-ratio guards** — the single mechanism behind (f) (jobs maxDistance 1) and a contributor to (g) (orgs maxDistance 2). No common-word blocklist exists on either finder.

**Path C vs Path B boundary (so later fixes stay scoped to Path C):**
- Path B = `gazetteer.js` (`TrustGazetteer.scan`, line 1855). Its person-name path is B2 trigger phrases (`TRIGGERS`, line 439: "my name is", "i am called", "call me", … → category `person_name`) + B3 `grammarCheck` (lines 947–1015; the `person_name` case at 968–971 is a lenient `span.length >= 2 && !/^\d/`) and a recapitalise step (line 1818). Path B emits `trigger_person_name`/`trigger_employer`/`trigger_job_title`, NOT `nlp_*`.
- `scanner.js` FILTERS Path B to remove any person_name/organization/job_title finding (lines 3128–3157), so Path B's name/org/job outputs never reach scoring in the live pipeline. Therefore fixes to name/org/job detection belong in Path C (`linguistic-detector.js`) only; do not touch `gazetteer.js` for these categories.
- "Compromise-lite grammar check" (B3) and "Contextual NLP analysis" (gazetteer.js lines 1017+) are Path B's own heuristics for medical/financial/nationality context, independent of Path C's compromise validation gate.

---

## Part D — Candidate fix hooks (location + smallest logical change; no code written)

| # | Root cause | Fix location (file / function / line) | Smallest logical change | Fixes examples | Regression risk |
|---|---|---|---|---|---|
| D1 | (a) METHOD 3/2/4.5 lack org precedence | `linguistic-detector.js` `scan()` METHOD 3 (2809–2854), METHOD 2 (2755–2801), METHOD 4.5 (3044–3098) | Apply the same three guards METHOD 4 already uses — `classifyNameVsOrganization` (2907), `looksLikePlaceName` (2911), corporate-suffix (2921) — to candidates from METHOD 3/2/4.5 before pushing `nlp_person_name`. | "Philippine General Hospital is…" (METHOD 3); orgs in trigger/directive contexts | Real names that genuinely co-occur with an org-suffix word could be skipped; verify with name fixtures. |
| D2 | (a) classifier defaults ambiguous 2–3 word Title-Case to "name" | `linguistic-detector.js` `classifyNameVsOrganization` (1406–1551), default branch lines 1517–1531 | Treat a Title-Case phrase containing a recognized org/place/brand token as org before the default; broaden `explicitOrgWords`/`orgWords` OR consult the org CSV membership (`EXTENSIVE_ORGANIZATIONS`) so listed orgs return "organization". | "Mercury Drug", "Ayala Land", "Toyota Motor Philippines" (METHOD 4) | Could misclassify a real 2-word person name that contains a word also in the org list; needs a name-side fixture check. |
| D3 | (b) no suffix/structural org detection | `linguistic-detector.js` `scan()` STAGE 2, after `findOrganizationsCSVFirst` (~2960) | Add a structural pass: regex for `[Capitalized …] (Corporation|Corp\.?|Inc\.?|Incorporated|Ltd\.?|Limited|LLC|LLP|& Co\.?|Medical Center|Hospital|University|College|Bank)` and emit `nlp_organization` when matched (CSV-validated if present, else medium confidence). | "SGV & Co.", "Magsaysay Maritime Corporation", "Pacific Harvest Foods Inc.", "St. Luke's Medical Center" | New orgs not in CSV would score; ensure `shouldFilterCommonOrganization`/`looksLikePlaceName` still run; could over-capture "X Hospital" place phrases. |
| D4 | (b) "Cebu Pacific" dropped by place filter | `linguistic-detector.js` `looksLikePlaceName` (120–126) / STAGE 4 (3008) | Do not drop a CSV-validated org whose rawMatch contains a place token only as a non-leading word, OR skip the place filter for high-confidence exact CSV org matches. | "Cebu Pacific" | Genuine place-only orgs (rare) could survive; low risk if gated to csv_exact_match. |
| D5 | (b latent) trailing `\b` breaks punctuation-ending orgs | `linguistic-detector.js` `findOrganizationsCSVFirst` PASS 1 (1583–1587) | Use a boundary that tolerates a trailing period (e.g. end the pattern at `(?=\b|\s|$|[,.;:])` or drop the trailing `\b` when the org ends in punctuation). | CSV orgs like "Abad Cloud Services Inc." followed by space | Could over-match substrings; keep the leading `\b`. |
| D6 | (c) verbs/titles captured as name | `linguistic-detector.js` `NON_NAME_WORDS` (31–101) + a new title/leading-verb blocklist applied in METHOD 3 (2809), METHOD 4 (2858) | Add a leading-verb set ("introduce","congratulate","generate","contact","send","please") and a title/honorific set ("ms","mr","dr","prof","principal","officer","captain","safety officer") and reject candidates whose first token is in either set. | "Introduce Joshua Pangilinan", "Congratulate Fernando Manalo", "Principal Armando Dizon", "Ms", "Dr", "Safety Officer" | Must not strip legitimate first-name tokens that equal a title word (rare); keep the suffix words. |
| D7 | (d) 3-word cap splits names | `linguistic-detector.js` `standaloneNamePattern` (2858), `nameTriggerPatterns` (2757–2767), `HONORIFICS` (547) | Raise `{1,2}` to allow a 4th word, and add surname-particle handling so "Dela"/"De Los"/"De La" + next word is captured as a unit (and the particle is not a stop condition). | "Alvin Jay Dela Rosa" | More words ⇒ more over-capture of 4-word org/title phrases; pair with D1/D2 guards. |
| D8 | (d) ASCII-only `[a-z]+` truncates diacritics | `linguistic-detector.js` patterns at 547, 2757–2767, 2809, 2858 | Replace `[A-Z][a-z]+` with a Unicode-aware class (e.g. `\b[A-Z][\p{L}]+`/u, or `[A-Za-zÀ-ÖØ-öø-ÿñÑ]+`). Apply consistently across all name regexes. | "Grace Dela Peña" (and "Niño", "García") | Could capture accented common words; combined with D6/D1 guards. Also confirm `normalizePath_C` keeps `ñ`. |
| D9 | (e) job context required even for exact matches | `linguistic-detector.js` `validateJobTitlesWithCompromise` (1858–1867) | For `csv_exact_match` + `high` confidence, accept without requiring `checkJobContext` (or accept a broader context), so standalone mentions of real titles are kept. | "electrician", "accountant", "flight attendant", "call center agent" | More ordinary-sentence job mentions survive; pair with the (f) blocklist to avoid false positives. |
| D10 | (e) missing/compound titles | `terms-occupations.js` data + `findJobTitlesCSVFirst` PASS 2 (1748–1790) | Add standalone entries ("seaman", "chief financial officer") or extend PASS 2 to match known compound titles by head noun. | "seaman", "chief financial officer" | Data-only additions are low risk; logic change to head-noun matching needs its own fixtures. |
| D11 | (f) fuzzy common-word false positives | `linguistic-detector.js` `findJobTitlesCSVFirst` PASS 3 (1794–1830) + `shouldFilterCommonJobTitle` (744–770) | Add a common-English-word blocklist consulted in PASS 3 (and in `shouldFilterCommonJobTitle`) to reject fuzzy matches whose `rawMatch` is an ordinary word (e.g. "schedule","leader","service","clearer","stronger","snippet"); require the matched text to itself be in the title set or to carry job context. | "schedule","clearer","stronger","snippet","service","leader" | A real title that is also a common word ("nurse"? "cook"?) could be dropped; keep a curated allowlist. |
| D12 | (g) PASS 3 single-keyword org false positives | `linguistic-detector.js` `findOrganizationsCSVFirst` PASS 3 (1666–1695) | Require ≥2 distinct keywords (or `keywordMatches === orgKeywords.length`) before flagging, so a 1-keyword org is not matched by one common word; also apply `shouldFilterCommonOrganization` to the matched keyword's context and skip orgs whose only keyword is a common noun ("store","philippines"). | "to store"→"SM Store", "the Philippines"→"AXA Philippines" | Genuine 1-keyword orgs (rare short names) could be missed; mitigated by D3 structural pass. |
| D13 | (g) no multi-word common-phrase blocklist for orgs | `linguistic-detector.js` `shouldFilterCommonOrganization` (782–860) | Extend the filter to reject multi-word ordinary phrases ("to store","make it","the philippines",…) via a small stop-phrase list / part-of-speech reject (leading function word + common noun). | "to store","make it","the Philippines" | Must not block real orgs that happen to start with "the"/"to". |

**Recommended fix order (independent, smallest blast radius first):** D4, D5 (data/regex hygiene) → D9, D10 (restore missing true positives) → D1, D2 (org-vs-name precedence) → D6, D7, D8 (name boundaries) → D11, D12, D13 (false-positive blocklists). Each should be validated by running the fictional prompt list via the harness in A4 and diffing before/after `nlp_*` findings, confirming Path A/B (`gazetteer_*`, `ph_address`, `source_code`, regex/validator) outputs are unchanged.

---

*Investigation method: static reading of `linguistic-detector.js`, `scanner.js`, `normalizer.js`, `gazetteer.js`, `patterns.js`, `manifest.json`, the `terms-*.js` data files, and the test files; plus read-only PowerShell data lookups. No source file was modified, created, or deleted; the extension was not executed. Where a concrete CSV target could not be located statically (category (g) "make it"), this is stated explicitly.*
