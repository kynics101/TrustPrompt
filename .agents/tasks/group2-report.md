# Group 2 Implementation Report (D3, D4, D5)

**Run date:** after-group2.json vs baseline.json  
**File changed:** `linguistic-detector.js` only (186 insertions, 3 deletions)

---

## 1. Files Changed

```
git diff --stat:
 linguistic-detector.js | 189 +++++++++++++++++++++++++++++++++++++++++++++++-
 1 file changed, 186 insertions(+), 3 deletions(-)
```

No other application source files were modified.  
Data files (`terms-organizations.js`, `terms-occupations.js`) were not touched.

---

## 2. What Was Implemented

### D5 — Trailing-`\b` boundary fix (PASS 1 org regex)
In `findOrganizationsCSVFirst` PASS 1, org names ending in a non-word character (e.g. `"SGV & Co."`, `"Pacific Harvest Foods Inc."`) previously failed to match when the trailing `\b` required the next char to be a word char. Fix: detect when `orgLower` ends in `\W` and use `(?=[\s,;:.!?'"\\)]|$)` as the trailing boundary instead of `\b`. Leading `\b` is kept.

### D4 — Place-filter exception for CSV exact-match orgs
In STAGE 4 org output loop, the guard `if (looksLikePlaceName(orgRaw)) continue` dropped `"Cebu Pacific"` (a real CSV org) because `"cebu"` is in `PLACE_NAME_WORDS`. Fix: guard is now `if (org.source !== 'csv_exact_match' && looksLikePlaceName(orgRaw)) continue` — exact CSV hits are trusted over the place heuristic.

### D3 — Structural org detection pass
New function `findOrganizationsStructural(text, alreadyFoundLower)` added before `scan()`:
- **SUFFIX_RE** — matches `[Capitalized…] (Corporation|Corp.|Inc.|Ltd.|LLC|LLP|& Co.)` requiring ≥ 2 words total.
- **SINGLE_HEAD_RE** — matches `(Bureau|Unit|Association|Cooperative|Office|Council|Commission|Foundation|Federation|Society|Agency|Authority|School|Center)` + at least one following word.
- **DEPT_RE** — matches `Department of [Capitalized Name]` requiring ≥ 3 words total.
- Guards: `shouldFilterCommonOrganization`, `looksLikePlaceName`, deduplication against CSV findings, minimum word count.
- Source field: `'structural_match'`, confidence: `'medium'`, `csvValidated: false`.
- **Does NOT go through `validateOrganizationsWithCompromise`** (that validator checks CSV-membership context and would reject most valid structural hits).
- Wired into STAGE 2 (after CSV pass) and STAGE 4 (pushed after CSV orgs with same guards).

### Known-limitations comment block
Added immediately after `/* global … */` in the file header:
1. Lowercase names not detected (ASCII `[A-Z]` requirement)
2. ALL-CAPS names sentence-cased by `capsGuard` lose multi-word structure
3. Trade words inside names (e.g. "Mason Carpenter")
4. Departments without a dedicated `nlp_department` tag

---

## 3. Rows Newly Passing (shouldFlag=yes, newly correct)

| ID | Added Finding | Previously Missing | Fix |
|----|--------------|-------------------|-----|
| **C-068** | `Lumenbridge Analytics Inc` | all orgs missing | D3 (suffix pattern) |
| **C-121** | `Magsaysay Maritime Corporation` | org missing | D3 (suffix pattern) |
| **C-125** | `Pacific Harvest Foods Inc` | org missing | D3 + D5 |
| **C-127** | `Megawide Construction Corporation` | org missing | D3 (suffix pattern) |
| **C-130** | `Mabuhay Steelworks Inc` | org missing | D3 + D5 |

**C-068** is now fully clean (all expected matched, no spurious). All others are improvements — they detected the org correctly but still miss other expected findings (job titles) that belong to later groups.

### Partial improvements on yes-rows (org now found, other findings still missing)

| ID | Added Finding | Still Missing |
|----|--------------|---------------|
| C-082 | `Northgate Logistics Corp`, `Eastwind Packaging Ltd` | `Southpoint Supplies, Inc.` |
| C-084 | `Central Luzon State University` | `Tarlac National High School` |
| C-120 | `SGV & Co` | `accountant`, `auditor` |
| C-121 | `Magsaysay Maritime Corporation` | `seaman` |
| C-124 | `Bureau of Fire Protection` | `fire marshal`, `city engineer` |
| C-125 | `Pacific Harvest Foods Inc` | `warehouse supervisor` |
| C-127 | `Megawide Construction Corporation` | `senior civil engineer` |
| C-130 | `Mabuhay Steelworks Inc` | `Welder`, `Safety Officer` |
| C-136 | `Cebu Pacific` (D4 fix) | `flight attendant` |
| C-154 | `Pacific Harvest Foods Inc`, `Bureau of Fire Protection` | job titles + `Sentinel Shield Security Agency` |
| C-155 | `SGV & Co` | names (D7/D8 scope), job titles (D9 scope), `Punongbayan & Araullo` |

---

## 4. Rows Newly Failing / Regressions

**No formerly-clean rows regressed.** There is one row where an already-incorrect row worsened:

| ID | shouldFlag | Status | Detail |
|----|-----------|--------|--------|
| **C-088** | no | Pre-existing FP, worsened | Baseline already emitted spurious `nlp_person_name:"Wealth Management"`. Group 2 additionally emits `nlp_organization:"Department of Wealth Management"` via D3 HEAD_RE (the prompt text is: *"Is the Department of Wealth Management seminar a real government office?"*). This row was already in `falsePositiveIds` in baseline. |

Two more yes-rows got additional spurious findings alongside the true positives:
- **C-069** — `"Lim Trading Corporation"` detected by D3 suffix, but expected name is `"Santos-Lim Trading Corporation"` (the full form). Not a regression in terms of miss count (was already missing the correct full form).
- **C-096** — Same: `"Lim Trading Corporation"` partial match for `"Santos-Lim Trading Corporation"`.

These are expected limitations of substring-based structural detection when the org name embeds a shorter suffix-pattern inside a longer compound name. Fixing them requires D2 (classifier org-list membership) in a later group.

---

## 5. Summary Counts

|                                 | Baseline | After Group 2 |
|---------------------------------|----------|---------------|
| shouldFlag=yes rows             | 104      | 104           |
| All expected matched (yes rows) | 28       | **29** (+1)   |
| Missing some (yes rows)         | 76       | **75** (-1)   |
| Spurious extras (yes rows)      | 65       | 66 (+1)       |
| Correctly empty (no rows)       | 24       | 24            |
| Spurious FP (no rows)           | 33       | 33            |
| Total nlp findings              | 302      | **319** (+17) |
| nlp_organization findings       | 68       | **85** (+17)  |

---

## 6. Path A/B Finding Confirmation

The harness only stores `nlp_*` findings (Path C output). Because Group 2 edits are confined to `linguistic-detector.js`, Path A findings (regex/validator patterns: email, phone, credit card, etc.) and Path B findings (gazetteer: ph_address, gazetteer_medical, etc.) are by construction unaffected.

Sample of 5 rows with stable `nlp_*` findings (identical to baseline, confirming no side-effects on unchanged rows):
- **C-001** — `nlp_person_name:"Maria Clara"`, `nlp_person_name:"Maria Clara Santos"`, `nlp_organization:"make it"` — unchanged
- **C-002** — `nlp_person_name:"Juan"` — unchanged
- **C-003** — `nlp_person_name:"Roberto Villanueva Jr"`, `nlp_organization:"the philippines"` — unchanged
- **C-004** — `nlp_person_name:"Aris Thorne"`, `nlp_person_name:"Dr"` — unchanged
- **C-005** — `nlp_person_name:"Angelica Reyes"` — unchanged

---

## 7. Known-Limitations Comment Confirmed

Added at lines 18–25 of `linguistic-detector.js`, immediately after `/* global window, OCCUPATIONS_DATA, ORGANIZATIONS_DATA */`:

```
// KNOWN LIMITATIONS (intentional, documented):
// 1. Lowercase names: names written entirely in lowercase ...
// 2. ALL-CAPS names: capsGuard in normalizePath_C sentence-cases ...
// 3. Trade words inside names: names like "Mason Carpenter" ...
// 4. Departments without a dedicated tag: there is no nlp_department patternId ...
```

---

## 8. Ready for Next Step

Group 2 is complete. Waiting for OK before Group 5.
