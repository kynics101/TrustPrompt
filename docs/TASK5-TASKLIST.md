# TrustPrompt — Task #5: Gazetteer Expansion (Medical, Financial, Nationality/Religion)
## Comprehensive Task List

**Project:** TrustPrompt — Chromium-Based Browser Extension for Detecting and Mitigating Sensitive Data Exposure  
**Task Scope:** Task #5 — Gazetteer B1 Word List Expansion and Performance-Safe Single-Pass Regex  
**Version:** 1.0  
**Date Created:** 2026-08-29  
**Last Updated:** 2026-08-29  
**Regulatory Basis:** NIST SP 800-122, RA 10173 (Philippine Data Privacy Act)

---

## Progress Tracker

| Task | Description | Status | Files Changed |
|---|---|---|---|
| TASK-5.1 | Audit existing gazetteer word lists and identify gaps | ✅ Complete | — (analysis only) |
| TASK-5.2 | Expand medical word list (NHS A-Z) + add medical phrase list | ✅ Complete | `gazetteer.js` |
| TASK-5.3 | Expand financial word list (FinRAD + BSP Glossary) + phrase list | ✅ Complete | `gazetteer.js` |
| TASK-5.4 | Expand nationality/religion word list (ISO 3166 + PH denominations) + phrase list | ✅ Complete | `gazetteer.js` |
| TASK-5.5 | Remove legal category entirely (out of scope) | ✅ Complete | `gazetteer.js` |
| TASK-5.6 | Implement pre-compiled combined regex architecture (O(1) scan) | ✅ Complete | `gazetteer.js` |
| TASK-5.7 | Fix false-positive traps (`ms`, `kiwi`, multi-word entries in word arrays) | ✅ Complete | `gazetteer.js` |
| TASK-5.8 | Fix `pattern.regex` null crash in runPathA (scanner + worker) | ✅ Complete | `scanner.js`, `trust-worker.js` |
| TASK-5.9 | Regression tests and verification | 🔲 To Do | — (manual browser testing) |
| TASK-5.10 | Update test case document with Actual Results and Pass/Fail | 🔲 To Do | `TEST-CASE-Gazetteer.md` |

### Summary of Changes Made (2026-08-29)

**gazetteer.js — complete rewrite of B1 word lists and scan engine:**

- **Architecture change:** Replaced per-term loop (O(N) per scan) with pre-compiled single alternation regex per category (O(1) per scan). One `regex.exec()` pass per category per scan regardless of list size. `_buildWordRegex()` and `_buildPhraseRegex()` helpers compile all terms into a single `\b(?:term1|term2|...)\b` regex at module load time.
- **Word/phrase split:** Each category now has a `*_WORDS` array (single-word terms, compiled with `\b` word-boundary) and a `*_PHRASES` array (multi-word terms, compiled without `\b`, sorted longest-first to prevent shorter substrings shadowing longer matches).
- **`lastIndex` resets:** All shared `/g` flag regexes reset `lastIndex = 0` before every reuse to prevent stale match position bugs.
- **Deduplication:** After collecting all word + phrase matches per category, a dedup pass drops any word match that is fully contained within a phrase match.

**Medical (TASK-5.2):**
- Expanded from 22 terms → ~90 single words (NHS A-Z SRC-GAZ-002)
- Added 38 multi-word phrases: `irritable bowel syndrome`, `chronic obstructive pulmonary disease`, `polycystic ovary syndrome`, `post-traumatic stress disorder`, `multiple sclerosis`, `heart failure`, `blood pressure`, `sickle cell disease`, `eating disorder`, `panic attack`, and more
- Removed `ms` — false-positive on `Ms.` title in names; covered by phrase `multiple sclerosis`

**Financial (TASK-5.3):**
- Expanded from 11 terms → ~50 single words (FinRAD SRC-GAZ-003 + BSP Glossary SRC-GAZ-004)
- BSP Philippines-specific terms added: `dacion`, `nonperforming`, `overdraft`, `amortization`, `installment`, `arrears`
- General disclosure indicators added: `remittance`, `payroll`, `salary`, `income`, `retrenchment`, `severance`, `alimony`, `beneficiary`
- Added 23 multi-word phrases: `non-performing loan`, `past due`, `debt consolidation`, `payday loan`, `take-home pay`, `filed for bankruptcy`, and more

**Nationality/Religion (TASK-5.4):**
- Expanded from ~20 terms → ~70 nationality adjectives (ISO 3166 SRC-GAZ-001) + 15 religion terms
- Added ASEAN/Pacific prioritisation for PH user base
- Added PH-specific denominations: `iglesia`, `aglipayan`, `adventist`, `pentecostal`, `baptist`
- Added 11 multi-word phrases: `roman catholic`, `born again`, `jehovah's witness`, `latter-day saint`, `south african`, `sri lankan`, `new zealander`
- Moved multi-word entries out of NATIONALITY_WORDS (where `\b` word-boundary breaks them) into NATIONALITY_PHRASES

**Legal removal (TASK-5.5):**
- `LEGAL_WORDS`, `LEGAL_PHRASES`, `LEGAL_WORD_RE`, `LEGAL_PHRASE_RE` all removed
- `legal_term` removed from `CATEGORY_META`
- `legal` category removed from `runGazetteerScan` categories array
- Replaced `nat_term` metaKey (was reusing `legal_term` as a hack) with proper `nat_term` entry in `CATEGORY_META`

**False-positive fixes (TASK-5.7):**
- `ms` removed from MEDICAL_WORDS — matches `Ms.` in names (e.g. `Ms. Santos`)
- `kiwi` removed from NATIONALITY_WORDS — common fruit name
- `sri lankan`, `new zealander`, `south african` moved from NATIONALITY_WORDS to NATIONALITY_PHRASES — multi-word strings cannot use `\b` word-boundary in a word-list regex

**scanner.js + trust-worker.js (TASK-5.8):**
- Added `if (!pattern.regex) continue;` guard at the top of `runPathA()` loop in both files
- Fixes crash: `ph_mobile` has no `regex` field; accessing `pattern.regex.source` threw `TypeError: Cannot read properties of undefined (reading 'source')`
- This was a latent bug exposed by Task #4's new `runPathA()` which accesses `.source` directly

**B2 trigger additions (TASK-5.2 / health triggers):**
- Added `i was diagnosed with`, `recently diagnosed`, `living with` (requireGazetteer: medical) triggers
- Added `my religion is`, `my faith is` triggers (no gazetteer requirement — covers explicit declarations)
- Added `my debt is`, `i owe`, `my loan is` financial triggers

---

## Overview

Task #5 expands the TrustPrompt gazetteer (Path B, B1 sub-step) from a minimal proof-of-concept word list to a production-quality closed-set vocabulary for detecting sensitive personal disclosures in three categories:

1. **Medical / Health** — Plain-language disease and condition names a user would type into an AI assistant. Source: NHS A-Z (SRC-GAZ-002). Excludes ICD-10 clinical codes (too many, cause false positives on technical text).

2. **Financial** — Terms indicating personal financial disclosure or distress. Sources: FinRAD dataset (SRC-GAZ-003) + BSP Philippines Glossary (SRC-GAZ-004). Includes PH-specific terms like `dacion en pago`, `remittance`, and `pagibig`.

3. **Nationality / Religion** — Nationality adjectives and religion names that, when present in a prompt, indicate the user is disclosing protected characteristic information. Source: ISO 3166 nationality list (SRC-GAZ-001) + curated religious denomination list.

The legal category was removed from scope. Legal terms remain commented out in `scanner.js` and `trust-worker.js` scoring tables but are not detected.

The key architectural improvement is the **pre-compiled combined regex** pattern: all terms in each category are compiled into a single alternation regex at module load time, keeping B1 scan time under ~10ms in the web worker regardless of list size.

---

## Task List

---

### TASK-5.1 — Audit Existing Gazetteer and Identify Gaps

**Priority:** High  
**Depends on:** None  
**Estimated effort:** 1 session  
**Status:** Complete

| # | Action | Deliverable |
|---|---|---|
| 5.1.1 | Review all four existing GAZETTEER categories in `gazetteer.js` and count terms per category | Audit count (medical: 22, financial: 11, nationality_religion: ~20, legal: 10) |
| 5.1.2 | Identify false-positive traps in the existing list (`ms`, multi-word entries in word arrays) | False-positive list |
| 5.1.3 | Identify coverage gaps against dataset sources (SRC-GAZ-001, SRC-GAZ-002, SRC-GAZ-003, SRC-GAZ-004) | Gap analysis |
| 5.1.4 | Document the O(N) per-term loop performance problem and propose pre-compiled regex solution | Architecture note |

---

### TASK-5.2 — Expand Medical Word List

**Priority:** High  
**Depends on:** TASK-5.1  
**Estimated effort:** 1 session  
**Status:** Complete

**Source:** NHS A-Z common conditions (SRC-GAZ-002) — plain-language names users type in prompts

| # | Action | Deliverable |
|---|---|---|
| 5.2.1 | Extract ~90 single-word condition names from NHS A-Z A through W | `MEDICAL_WORDS` array in `gazetteer.js` |
| 5.2.2 | Extract multi-word condition names (IBS, COPD, PTSD, PCOS, etc.) | `MEDICAL_PHRASES` array — sorted longest-first |
| 5.2.3 | Remove `ms` from word list (false-positive on `Ms.` title) | Updated `MEDICAL_WORDS` |
| 5.2.4 | Add health-specific trigger phrases: `i was diagnosed with`, `recently diagnosed`, `living with` | Updated `TRIGGERS` array |

**Expanded medical single words include:** abscess, acne, addiction, adhd, aids, alcoholism, allergy, alzheimer, anaemia/anemia, angina, anorexia, anxiety, appendicitis, arrhythmia, arthritis, asthma, autism, bipolar, bronchitis, bulimia, cancer, candida, cataracts, chemotherapy, chickenpox, chlamydia, cholesterol, cirrhosis, colitis, conjunctivitis, constipation, copd, covid, cystitis, dementia, dengue, depression, dermatitis, diabetes, dialysis, diarrhea, dyslexia, eczema, emphysema, endometriosis, epilepsy, fibromyalgia, flu, gastritis, gerd, glaucoma, gonorrhea, gout, haemophilia/hemophilia, hepatitis, herpes, hiv, hypertension, hyperthyroidism/hypothyroidism, impetigo, infertility, influenza, insomnia, insulin, kidney, leukemia/leukaemia, lupus, malaria, measles, meningitis, menopause, migraine, mpox, mumps, obesity, osteoporosis, pancreatitis, parkinson, pneumonia, polio, pregnancy/pregnant, psoriasis, ptsd, rabies, rheumatism, schizophrenia, seizure, sepsis, shingles, sickle, sinusitis, stroke, thalassemia, thrombosis, thyroid, tonsillitis, tuberculosis, ulcer, vitiligo, whooping

---

### TASK-5.3 — Expand Financial Word List

**Priority:** High  
**Depends on:** TASK-5.1  
**Estimated effort:** 1 session  
**Status:** Complete

**Sources:** FinRAD dataset (SRC-GAZ-003) + BSP Glossary (SRC-GAZ-004)

| # | Action | Deliverable |
|---|---|---|
| 5.3.1 | Extract personal financial distress terms from FinRAD vocabulary | Updated `FINANCIAL_WORDS` |
| 5.3.2 | Extract BSP Philippines-specific terms from BSP Glossary | BSP terms in `FINANCIAL_WORDS` |
| 5.3.3 | Add general financial disclosure indicators (salary, remittance, payroll, etc.) | Updated `FINANCIAL_WORDS` |
| 5.3.4 | Build `FINANCIAL_PHRASES` array with multi-word disclosures sorted longest-first | `FINANCIAL_PHRASES` array |
| 5.3.5 | Add financial trigger phrases: `my debt is`, `i owe`, `my loan is` | Updated `TRIGGERS` array |

---

### TASK-5.4 — Expand Nationality / Religion Word List

**Priority:** High  
**Depends on:** TASK-5.1  
**Estimated effort:** 1 session  
**Status:** Complete

**Source:** country-nationality-list MIT (SRC-GAZ-001) + curated PH religious denominations

| # | Action | Deliverable |
|---|---|---|
| 5.4.1 | Extract top ~70 nationality adjectives by internet population (ASEAN-first for PH user base) | Updated `NATIONALITY_WORDS` |
| 5.4.2 | Add major religion names and PH-specific denominations (iglesia, aglipayan, adventist, pentecostal, baptist) | Religion terms in `NATIONALITY_WORDS` |
| 5.4.3 | Move multi-word entries (`south african`, `sri lankan`, `new zealander`) to `NATIONALITY_PHRASES` | Updated `NATIONALITY_PHRASES` |
| 5.4.4 | Add religious phrases: `roman catholic`, `born again`, `jehovah's witness`, `latter-day saint` | `NATIONALITY_PHRASES` array |
| 5.4.5 | Remove `kiwi` (fruit name, high false-positive risk) | Updated `NATIONALITY_WORDS` |
| 5.4.6 | Add religion triggers: `my religion is`, `my faith is` | Updated `TRIGGERS` array |

---

### TASK-5.5 — Remove Legal Category

**Priority:** High  
**Depends on:** TASK-5.1  
**Estimated effort:** 0.5 sessions  
**Status:** Complete

| # | Action | Deliverable |
|---|---|---|
| 5.5.1 | Delete `LEGAL_WORDS` array | Updated `gazetteer.js` |
| 5.5.2 | Delete `LEGAL_PHRASES` array | Updated `gazetteer.js` |
| 5.5.3 | Delete `LEGAL_WORD_RE` and `LEGAL_PHRASE_RE` pre-compiled regex lines | Updated `gazetteer.js` |
| 5.5.4 | Remove `legal` category object from `runGazetteerScan` categories array | Updated `gazetteer.js` |
| 5.5.5 | Remove `legal_term` from `CATEGORY_META` | Updated `gazetteer.js` |
| 5.5.6 | Add `nat_term` to `CATEGORY_META` to replace the `legal_term` reuse hack for nationality_religion | Updated `CATEGORY_META` |

---

### TASK-5.6 — Implement Pre-Compiled Combined Regex Architecture

**Priority:** High  
**Depends on:** TASK-5.2, TASK-5.3, TASK-5.4  
**Estimated effort:** 1 session  
**Status:** Complete

**Performance rationale:** The old approach ran N separate `regex.exec()` calls per scan (one per term). With 300+ medical terms, that would be 300 calls per keystroke. The new approach compiles all terms into one alternation regex at module load, reducing to 1 call per category per scan regardless of list size.

| # | Action | Deliverable |
|---|---|---|
| 5.6.1 | Implement `_escapeRegex(str)` helper — escapes all special regex chars | Utility in `gazetteer.js` |
| 5.6.2 | Implement `_buildWordRegex(words)` — compiles words into `\b(?:term1\|term2\|...)\b/gi` | Utility in `gazetteer.js` |
| 5.6.3 | Implement `_buildPhraseRegex(phrases)` — compiles phrases into `(?:phrase1\|phrase2\|...)/gi` (no `\b` — phrases have natural spacing) | Utility in `gazetteer.js` |
| 5.6.4 | Pre-compile all 6 combined regexes at module load: `MEDICAL_WORD_RE`, `MEDICAL_PHRASE_RE`, `FIN_WORD_RE`, `FIN_PHRASE_RE`, `NAT_WORD_RE`, `NAT_PHRASE_RE` | 6 module-level constants |
| 5.6.5 | Update `runGazetteerScan` to use pre-compiled regexes with `lastIndex = 0` resets before each reuse | Updated `runGazetteerScan` |
| 5.6.6 | Update `grammarCheck` for health, religion, and financial categories to use pre-compiled regexes instead of GAZETTEER object lookups | Updated `grammarCheck` |
| 5.6.7 | Update `runTriggerScan` `requireGazetteer` checks to use pre-compiled regexes instead of `terms.some()` loops | Updated `runTriggerScan` |

---

### TASK-5.7 — Fix False-Positive Traps

**Priority:** High  
**Depends on:** TASK-5.2, TASK-5.4  
**Estimated effort:** 0.5 sessions  
**Status:** Complete

| # | Action | Deliverable |
|---|---|---|
| 5.7.1 | Remove `ms` from `MEDICAL_WORDS` — fires on `Ms. Santos`, `Ms. Cruz` (title abbreviation) | Updated `MEDICAL_WORDS` |
| 5.7.2 | Remove `kiwi` from `NATIONALITY_WORDS` — fires on fruit references (`kiwi fruit`, `kiwi smoothie`) | Updated `NATIONALITY_WORDS` |
| 5.7.3 | Move `sri lankan` from `NATIONALITY_WORDS` → `NATIONALITY_PHRASES` — multi-word entry breaks `\b` word-boundary regex | Updated arrays |
| 5.7.4 | Move `new zealander` from `NATIONALITY_WORDS` → `NATIONALITY_PHRASES` | Updated arrays |
| 5.7.5 | Move `south african` from `NATIONALITY_WORDS` → `NATIONALITY_PHRASES` | Updated arrays |

---

### TASK-5.8 — Fix runPathA Null Crash on Regex-less Patterns

**Priority:** Critical (broke extension at runtime)  
**Depends on:** None (hotfix)  
**Estimated effort:** 0.5 sessions  
**Status:** Complete

| # | Action | Deliverable |
|---|---|---|
| 5.8.1 | Add `if (!pattern.regex) continue;` guard at the top of the `for` loop in `scanner.js` `runPathA()` | Updated `scanner.js` |
| 5.8.2 | Add the same guard in `trust-worker.js` `runPathA()` | Updated `trust-worker.js` |
| 5.8.3 | Confirm `ph_mobile` (which has no regex field) no longer crashes the scan pipeline | Console verification |

**Root cause:** `ph_mobile` in `patterns.js` has no `regex` field — it is detected by the `isMobilePhone_PH` validator alone. Task #4's new `runPathA()` accesses `pattern.regex.source` directly (no null check), which throws `TypeError: Cannot read properties of undefined (reading 'source')`. The one-line guard fixes both paths.

---

### TASK-5.9 — Regression Tests and Verification

**Priority:** High  
**Depends on:** TASK-5.2 through TASK-5.8  
**Estimated effort:** 1–2 sessions  
**Status:** To Do

| # | Action | Deliverable |
|---|---|---|
| 5.9.1 | Run complete test case matrix from `TEST-CASE-Gazetteer.md` against extension in Chrome | Completed test table with Actual Results and Pass/Fail |
| 5.9.2 | Confirm all existing Sample Test Prompts from `review.md §14` still produce correct `riskLevel` (no regressions) | Regression log |
| 5.9.3 | Verify console shows `[TrustPrompt/scanner]` lines with correct `riskLevel` for each gazetteer test prompt | Console screenshot evidence |
| 5.9.4 | Verify B1 scan time stays under ~10ms by checking `elapsedMs` field in worker RESULT messages | Performance log |

---

### TASK-5.10 — Update Test Case Document with Actual Results

**Priority:** High  
**Depends on:** TASK-5.9  
**Estimated effort:** 1 session  
**Status:** To Do

| # | Action | Deliverable |
|---|---|---|
| 5.10.1 | Fill in Actual Results column for all test cases in `TEST-CASE-Gazetteer.md` | Completed test document |
| 5.10.2 | Fill in Status Pass/Fail column | Completed test document |
| 5.10.3 | Note any deviations, false positives, or missed detections in the Notes column | Annotated findings |

---

## Execution Order

```
TASK-5.1 (Audit)
    |
    |---> TASK-5.2 (Medical expansion)
    |---> TASK-5.3 (Financial expansion)
    |---> TASK-5.4 (Nationality/Religion expansion)
    |---> TASK-5.5 (Legal removal)
    |
    |---> [5.2 + 5.3 + 5.4 + 5.5 complete] ---> TASK-5.6 (Pre-compiled regex)
    |                                                  |
    |                                                  v
    |                                             TASK-5.7 (False-positive fixes)
    |
    |---> TASK-5.8 (Null crash hotfix — independent, applied immediately)
    |
    |---> [5.6 + 5.7 + 5.8 complete] ---> TASK-5.9 (Regression tests)
                                                 |
                                                 v
                                            TASK-5.10 (Update test doc)
```

---

## Files Modified

| File | Tasks | Nature of Change |
|---|---|---|
| `gazetteer.js` | 5.2, 5.3, 5.4, 5.5, 5.6, 5.7 | Complete rewrite of B1 word lists; pre-compiled regex architecture; legal removal; false-positive fixes |
| `scanner.js` | 5.8 | Added `if (!pattern.regex) continue;` guard in `runPathA()` |
| `trust-worker.js` | 5.8 | Same guard in worker `runPathA()` |

---

## Definition of Done

- [ ] All TASK-5.* subtasks marked complete
- [ ] Test case document `TEST-CASE-Gazetteer.md` fully executed with all steps Pass
- [ ] No regressions to existing `review.md §14` sample prompts
- [ ] `ms` no longer fires on `Ms. Santos` or similar name contexts
- [ ] `"I am Filipino citizen applying for a visa"` → `gazetteer_nationality_religion` fires, `riskLevel` = `low`
- [ ] `"I was recently diagnosed with hypertension"` → `gazetteer_medical` fires, `riskLevel` = at minimum `low` (moderate if trigger also fires)
- [ ] `"Please review our Q3 payroll and salary structure"` → `gazetteer_financial` fires, `riskLevel` = at minimum `low`
- [ ] `"I enjoy hiking"` → no gazetteer findings, `riskLevel` = `none`
- [ ] B1 scan `elapsedMs` ≤ 10ms on typical prompts in worker path
- [ ] Zero `legal` pattern IDs appear in any scan result
