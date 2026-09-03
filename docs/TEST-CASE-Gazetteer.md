# TrustPrompt — Test Case Document
## Task #5: Gazetteer Expansion — Medical, Financial, Nationality/Religion

**Project Name:** TrustPrompt: Development of a Chromium-Based Browser Extension for Detecting and Mitigating Sensitive Data Exposure in Free GPT-5.5 and Claude Sonnet 5 Prompts  
**Module Name:** Detection Engine — Gazetteer Path (B1 Word Scan + B2 Trigger Phrase)  
**Version:** 1.0  
**Date Created:** 2026-08-29

---

## Test Case Detect-01

**Test Case ID:** Detect-01  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path (B1) — Nationality Term  
**Test Executed By:**  
**Test Title:** Detect nationality and Filipino self-identifier terms via B1 gazetteer word scan  
**Test Executed Date:**  
**Description:** Verifies that the B1 gazetteer word scan correctly identifies nationality adjectives and Filipino-specific self-identifiers. Covers the standard English forms (Filipino, Korean), the Tagalog-language forms (Pilipino, Pilipina), the most common informal Filipino self-identifiers (Pinoy, Pinay), the institutional OFW term, and common misspellings (Philipino). Confirms that word-boundary guards prevent partial matches. Confirms removed high-false-positive terms (French, Polish, English, Thai) no longer fire.  
**Pre-Condition:** Extension loaded; updated `NATIONALITY_WORDS` and `NATIONALITY_PHRASES` compiled into `NAT_WORD_RE` and `NAT_PHRASE_RE`  
**Dependencies:** `NATIONALITY_WORDS`, `NATIONALITY_PHRASES`, `NAT_WORD_RE`, `NAT_PHRASE_RE` in `gazetteer.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with standard English nationality term | `I am Filipino citizen applying for a visa` | `gazetteer_nationality_religion` fires; `rawMatch` = `Filipino`; `riskLevel` = `low` | | | Mirrors Detect02 Step 1 from dataset register |
| 2 | Enter a prompt using the Tagalog-language spelling | `Pilipino ako at nagtatrabaho sa abroad` | `gazetteer_nationality_religion` fires on `Pilipino`; `riskLevel` = `low` | | | "Pilipino" is a distinct string from "Filipino" — fuzzy would miss it; requires explicit entry |
| 3 | Enter a prompt using the most common informal self-identifier | `Pinoy po ako, nagtatrabaho sa Dubai bilang OFW` | `gazetteer_nationality_religion` fires on both `Pinoy` and `OFW`; `riskLevel` = `low` | | | "Pinoy" and "OFW" were previously missing; confirms both additions |
| 4 | Enter a prompt using the female informal self-identifier | `Pinay nurse po ako nagtatrabaho sa UK` | `gazetteer_nationality_religion` fires on `Pinay`; `riskLevel` = `low` | | | "Pinay" previously absent |
| 5 | Enter a prompt using the most common one-l misspelling | `I am Philipino and I need help with my visa application` | `gazetteer_nationality_religion` fires on `Philipino`; `riskLevel` = `low` | | | Misspelling previously absent; fuzzy would miss (sim ~0.78 < 0.80 threshold) |
| 6 | Enter a prompt using `balikbayan` (returning Filipino from abroad) | `As a balikbayan, pwede ba akong magdala ng gamit from the US?` | `gazetteer_nationality_religion` fires on `balikbayan`; `riskLevel` = `low` | | | PH-specific institutional term previously absent |
| 7 | Enter a prompt using a different Asia-Pacific nationality (Korean) | `My colleague is Korean and we work together in the same team` | `gazetteer_nationality_religion` fires on `Korean`; `riskLevel` = `low` | | | Confirms existing entry still works |
| 8 | Enter a prompt with `French` in a language/food context (false-positive guard) | `Please help me translate this document into French` | `gazetteer_nationality_religion` does NOT fire — `French` was removed due to language reference collision | | | Confirms removal of high-FP term |
| 9 | Enter a prompt with `polish` as a verb (false-positive guard) | `Can you help me polish my resume before submitting it?` | `gazetteer_nationality_religion` does NOT fire — `polish` was removed due to verb/noun collision | | | Confirms removal of critical-FP term |
| 10 | Enter a prompt with the word `English` as a language reference (false-positive guard) | `Please respond in English so I can understand` | `gazetteer_nationality_religion` does NOT fire — `English` was removed due to language collision | | | Confirms removal |
| 11 | Enter a prompt with `karaniwang` as Tagalog common adjective (false-positive guard) | `Karaniwang tao lang ako, walang espesyal` | `gazetteer_nationality_religion` does NOT fire — `karaniwang` was removed (means "ordinary", not a denomination) | | | Confirms removal of factual error |
| 12 | Enter a prompt with a word NOT in the nationality list | `I enjoy hiking in the mountains every weekend` | No `gazetteer_nationality_religion` finding; `riskLevel` = `none` | | | True negative |

**Post-Conditions:** `gazetteer_nationality_religion` findings are passed to the Merge & Deduplicate stage with correct `patternId`, `label`, `risk`, `rawMatch`, and `safeVersion` fields. False-positive terms no longer generate findings.

---

## Test Case Detect-02

**Test Case ID:** Detect-02  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path (B1) — Medical Term  
**Test Executed By:**  
**Test Title:** Detect medical condition names via B1 gazetteer word scan  
**Test Executed Date:**  
**Description:** Verifies that the B1 gazetteer word scan correctly identifies medical condition names drawn from the NHS A-Z list (SRC-GAZ-002). Covers both single-word conditions (e.g., `hypertension`) and multi-word phrases (e.g., `high blood pressure`). The phrase match must shadow the individual word match where applicable (no duplicate findings). Words that sound medical but are not in the list must not fire.  
**Pre-Condition:** Extension loaded; `MEDICAL_WORDS` and `MEDICAL_PHRASES` arrays compiled into `MEDICAL_WORD_RE` and `MEDICAL_PHRASE_RE`  
**Dependencies:** `MEDICAL_WORDS`, `MEDICAL_PHRASES`, `MEDICAL_WORD_RE`, `MEDICAL_PHRASE_RE` in `gazetteer.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with a single-word medical condition (hypertension) | `I was recently diagnosed with hypertension` | `gazetteer_medical` finding produced; `rawMatch` = `hypertension`; `riskLevel` = at minimum `low` (moderate if trigger fires) | | | Core NHS A-Z single-word detection |
| 2 | Enter a prompt with a multi-word medical condition (high blood pressure) | `My doctor says I have high blood pressure and need medication` | `gazetteer_medical` finding produced; `rawMatch` = `high blood pressure`; single finding only (not `blood` separately) | | | Phrase match must shadow word match; dedup check |
| 3 | Enter a prompt with a medical abbreviation (PTSD) | `I have been living with PTSD since the accident` | `gazetteer_medical` finding produced; `rawMatch` = `PTSD` (case-insensitive match) | | | Case-insensitive flag test |
| 4 | Enter a prompt with a multi-word condition from the phrase list (irritable bowel syndrome) | `My gastroenterologist diagnosed me with irritable bowel syndrome last year` | `gazetteer_medical` finding produced; `rawMatch` = `irritable bowel syndrome`; `riskLevel` = at minimum `low` | | | Long phrase detection test |
| 5 | Enter a prompt with a word that is NOT in the medical list | `I enjoy hiking in the mountains every weekend` | No `gazetteer_medical` finding; `riskLevel` = `none` | | | True negative — must not fire |
| 6 | Enter a prompt with `Ms.` before a name (false-positive guard check) | `Ms. Santos is applying for health insurance` | No `gazetteer_medical` finding for `ms`; `Ms.` must NOT be matched as the medical abbreviation for multiple sclerosis | | | `ms` was removed from MEDICAL_WORDS; this test confirms the fix |

**Post-Conditions:** Medical gazetteer findings pass to Merge & Deduplicate; phrase matches shadow their contained word matches; `ms` abbreviation does not false-positive on honorific titles.

---

## Test Case Detect-03

**Test Case ID:** Detect-03  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path (B1) — Financial Term  
**Test Executed By:**  
**Test Title:** Detect personal financial disclosure terms via B1 gazetteer word scan  
**Test Executed Date:**  
**Description:** Verifies that the B1 gazetteer word scan correctly identifies financial disclosure terms from the FinRAD dataset (SRC-GAZ-003) and BSP Glossary (SRC-GAZ-004). Covers personal financial distress terms, BSP-specific PH banking terms, and payroll/income disclosure indicators. Generic financial words that do not indicate personal disclosure must not fire.  
**Pre-Condition:** Extension loaded; `FINANCIAL_WORDS` and `FINANCIAL_PHRASES` arrays compiled into `FIN_WORD_RE` and `FIN_PHRASE_RE`  
**Dependencies:** `FINANCIAL_WORDS`, `FINANCIAL_PHRASES`, `FIN_WORD_RE`, `FIN_PHRASE_RE` in `gazetteer.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt containing a payroll/salary term | `Please review our Q3 payroll and salary structure` | `gazetteer_financial` finding produced; `rawMatch` contains `payroll` and/or `salary`; `riskLevel` = at minimum `low` | | | Mirrors Detect02 Step 3 from dataset register |
| 2 | Enter a prompt containing a personal debt disclosure term | `I am currently dealing with mortgage arrears and overdue payments` | `gazetteer_financial` findings produced; matches include `mortgage`, `arrears`, `overdue`; `riskLevel` = `low` or higher | | | Multiple term detection test |
| 3 | Enter a prompt containing a BSP-specific term (remittance) | `My OFW remittance from abroad covers our household expenses` | `gazetteer_financial` finding produced; `rawMatch` = `remittance`; `riskLevel` = at minimum `low` | | | PH-specific term detection |
| 4 | Enter a prompt containing a financial phrase (payday loan) | `I am struggling to repay my payday loan this month` | `gazetteer_financial` finding produced; `rawMatch` = `payday loan`; phrase match returned | | | Multi-word financial phrase detection |
| 5 | Enter a prompt with a word that is NOT in the financial list | `I enjoy hiking in the mountains every weekend` | No `gazetteer_financial` finding; `riskLevel` = `none` | | | True negative |
| 6 | Enter a prompt with a generic financial word that should NOT fire (money, cost, price) | `What is the cost of a business class flight to Singapore?` | No `gazetteer_financial` finding; generic financial vocabulary must not trigger | | | Over-detection guard — only personal disclosure terms should fire |

**Post-Conditions:** Financial gazetteer findings pass to Merge & Deduplicate; only personal-disclosure-level financial terms trigger detection; generic financial vocabulary does not fire.

---

## Test Case Detect-04

**Test Case ID:** Detect-04  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path (B1) — Religion Term  
**Test Executed By:**  
**Test Title:** Detect religion and denomination terms via B1 gazetteer word scan  
**Test Executed Date:**  
**Description:** Verifies that religion and religious denomination terms stored in `NATIONALITY_WORDS` and `NATIONALITY_PHRASES` are correctly detected as `gazetteer_nationality_religion`. Multi-word denominations (e.g., `Roman Catholic`, `born again`) must match via the phrase regex. Bare common words that are not religion names must not fire.  
**Pre-Condition:** Extension loaded; religion terms present in `NATIONALITY_WORDS` and `NATIONALITY_PHRASES`  
**Dependencies:** `NAT_WORD_RE`, `NAT_PHRASE_RE` in `gazetteer.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with a common religion name (Muslim) | `As a Muslim I observe fasting during Ramadan` | `gazetteer_nationality_religion` finding produced; `rawMatch` = `Muslim`; `riskLevel` = `low` | | | |
| 2 | Enter a prompt with a multi-word denomination (Roman Catholic) | `I am Roman Catholic and attend mass every Sunday` | `gazetteer_nationality_religion` finding produced; `rawMatch` = `Roman Catholic`; phrase match | | | Multi-word phrase detection via NAT_PHRASE_RE |
| 3 | Enter a prompt with a PH-specific denomination (Iglesia ni Cristo) | `I am a member of Iglesia and we have services twice a week` | `gazetteer_nationality_religion` finding produced; `rawMatch` = `iglesia` or `Iglesia`; `riskLevel` = `low` | | | PH denomination detection |
| 4 | Enter a prompt with `born again` phrasing | `I became born again three years ago after attending a retreat` | `gazetteer_nationality_religion` finding produced; `rawMatch` = `born again` | | | Common PH evangelical phrase |
| 5 | Enter a prompt with NO religion or nationality term | `I enjoy hiking in the mountains every weekend` | No `gazetteer_nationality_religion` finding; `riskLevel` = `none` | | | True negative |

**Post-Conditions:** Religion and denomination findings produced by the gazetteer pass to Merge & Deduplicate with `patternId: "gazetteer_nationality_religion"` and `riskLevel: "low"`.

---

## Test Case Detect-05

**Test Case ID:** Detect-05  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path (B1) — True Negative (No Match)  
**Test Executed By:**  
**Test Title:** Confirm unrelated terms produce no gazetteer findings  
**Test Executed Date:**  
**Description:** This is the true-negative control test. Prompts containing everyday words that have no connection to the gazetteer's medical, financial, or nationality/religion word lists must produce zero B1 findings. This confirms the word-boundary guards, deduplication logic, and category gates are all working correctly.  
**Pre-Condition:** Extension loaded; all three categories active  
**Dependencies:** All three pre-compiled regexes in `gazetteer.js`; `runGazetteerScan()`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with no sensitive terms | `I enjoy hiking in the mountains every weekend` | No gazetteer findings in any category; `riskLevel` = `none`; badge shows Safe | | | |
| 2 | Enter a prompt about cooking with no sensitive terms | `Can you help me write a recipe for chicken adobo?` | No gazetteer findings; `riskLevel` = `none` | | | `adobo` must not match any list entry |
| 3 | Enter a prompt about programming | `Can you explain how to implement a binary search tree in Python?` | No gazetteer findings; `riskLevel` = `none` | | | Technical vocabulary must not false-positive |
| 4 | Enter a prompt about travel with no nationality disclosure | `What are the best places to visit in Japan?` | No `gazetteer_nationality_religion` finding — `Japan` is a country noun, not a nationality adjective; `riskLevel` = `none` | | | Country names (nouns) are NOT in the list — only nationality adjectives (e.g., `Japanese`) are |
| 5 | Enter a prompt about general health topics (not disclosure) | `What foods help lower cholesterol naturally?` | `gazetteer_medical` fires on `cholesterol`; `riskLevel` = `low` — this IS expected because `cholesterol` is in the medical list regardless of disclosure intent | | | Note: B1 fires on any match; context/intent is not assessed at this layer |

**Post-Conditions:** Non-sensitive prompts return `riskLevel: "none"`. The scanner correctly distinguishes between sensitive vocabulary and unrelated everyday language.

---

## Test Case Detect-06

**Test Case ID:** Detect-06  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path (B2) — Health Trigger + B1 Grammar Check  
**Test Executed By:**  
**Test Title:** Detect health disclosure via B2 trigger phrase combined with B1 medical gazetteer check  
**Test Executed Date:**  
**Description:** Verifies the B2 trigger path for health disclosures. When a trigger phrase fires (e.g., `I was recently diagnosed with`), the extracted value span must be confirmed by the B3 grammar check, which uses the pre-compiled `MEDICAL_WORD_RE` / `MEDICAL_PHRASE_RE` regexes. The combined result (`trigger_health`) must be deduplicated correctly against any B1 standalone medical finding.  
**Pre-Condition:** Extension loaded; health triggers active in `TRIGGERS` array; `MEDICAL_WORD_RE` available to `grammarCheck`  
**Dependencies:** `TRIGGERS` array, `grammarCheck()`, `MEDICAL_WORD_RE`, `MEDICAL_PHRASE_RE` in `gazetteer.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with a health trigger phrase and medical term | `I was recently diagnosed with hypertension and my doctor prescribed medication` | Both `trigger_health` (from B2) and `gazetteer_medical` (from B1) findings produced; `riskLevel` = `moderate` | | | B1 and B2 both fire; scoring raises to moderate via sensitive_context rule |
| 2 | Enter a prompt with `i have` trigger requiring gazetteer confirmation | `I have diabetes and take insulin daily` | `trigger_health` firing on `i have diabetes`; `gazetteer_medical` also fires on `diabetes` and `insulin`; `riskLevel` = `moderate` | | | `requireGazetteer: "medical"` gate confirmed |
| 3 | Enter a prompt with `i have` trigger but NO medical term after it | `I have a question about my electricity bill` | `trigger_health` does NOT fire — `question` is not in the medical gazetteer; only possible coincidental B1 match from unrelated terms | | | requireGazetteer gate prevents false positive |
| 4 | Enter a prompt with `i suffer from` trigger | `I suffer from chronic pain and fatigue` | `trigger_health` fires; `gazetteer_medical` fires on `chronic pain`; `riskLevel` = `moderate` | | | Phrase match `chronic pain` in medical phrases list |
| 5 | Enter a prompt with a typo in the trigger phrase (fuzzy match test) | `I was recntly diagnosed with asthma and need an inhaler` | `trigger_health` fires despite typo in `recntly` — Levenshtein similarity ≥ 0.80 allows the match; `riskLevel` = `moderate` | | | Fuzzy match tolerance test |

**Post-Conditions:** Health trigger findings (`trigger_health`) are combined with B1 gazetteer findings in the Merge & Deduplicate stage; `riskLevel` reaches `moderate` when both a direct identifier and a sensitive-context term are present.

---

## Test Case Detect-07

**Test Case ID:** Detect-07  
**Test Design By:**  
**Test Priority:** Medium  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path (B1) — Performance  
**Test Executed By:**  
**Test Title:** Confirm B1 gazetteer scan completes within performance budget on typical prompts  
**Test Executed Date:**  
**Description:** Verifies that the pre-compiled single-pass combined regex architecture keeps the B1 scan time within the extension's performance budget. The web worker's `elapsedMs` field in the RESULT message must stay well under the 400ms debounce threshold for typical prompt lengths (50–200 words). This test is evidence that the O(1) per-category scan design is working as intended.  
**Pre-Condition:** Extension loaded; worker running in blob-trampoline mode; DevTools open  
**Dependencies:** `trust-worker.js` `elapsedMs` field; `worker-bridge.js` console logs

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Open DevTools console and type a short prompt (5 words) with a medical term | `I have hypertension` | `[TrustPrompt/scorer]` log appears within 400ms; `elapsedMs` in worker RESULT ≤ 10ms | | | Establish baseline for short prompt |
| 2 | Type a medium prompt (50 words) with multiple sensitive terms | A 50-word prompt containing `Filipino`, `hypertension`, `salary`, and `Catholic` | `elapsedMs` ≤ 20ms; all four terms detected; `riskLevel` reflects combined findings | | | |
| 3 | Type a long prompt (200 words) with dense sensitive vocabulary | A 200-word paragraph mentioning multiple medical conditions, nationality, and financial terms | `elapsedMs` ≤ 50ms; scan completes well within the 400ms debounce window; no timeout fallback to main thread | | | Stress test — confirms O(1) architecture holds under load |
| 4 | Confirm no worker timeout fallback for the 200-word prompt | Same long prompt as Step 3 | Console does NOT show `[TrustPrompt/bridge] Worker timed out` — worker returns before the 1500ms timeout | | | |

**Post-Conditions:** B1 scan consistently completes under 50ms for typical prompt lengths, leaving ample headroom within the 1500ms worker timeout budget.

---

## Test Case Detect-08

**Test Case ID:** Detect-08  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-29  
**Module Name:** Detection Engine — Gazetteer Path — All Three Categories Combined  
**Test Executed By:**  
**Test Title:** Detect nationality, medical, and financial terms simultaneously; confirm no false fire on unrelated term  
**Test Executed Date:**  
**Description:** This is the composite validation test directly modelled on the Detect02 test case format from the dataset register. It confirms that the closed-set wordlist can pick up on nationality terms (ISO 3166), medical condition names (NHS A-Z), and financial terms (FinRAD + BSP), and does NOT fire on words that simply are not in any list. All four steps must produce the correct finding or non-finding.  
**Pre-Condition:** Extension loaded; normalised text available; all three categories active in `runGazetteerScan()`  
**Dependencies:** `NAT_WORD_RE`, `MEDICAL_WORD_RE`, `FIN_WORD_RE` and their phrase equivalents in `gazetteer.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with a nationality term | `I am Filipino citizen applying for a visa` | Terms matching the gazetteer's nationality list are correctly flagged as `gazetteer_nationality_religion`; `riskLevel` = `low` | | | |
| 2 | Enter a prompt with a medical condition term | `I was recently diagnosed with hypertension` | Term matching the gazetteer's medical list is correctly flagged as `gazetteer_medical`; `riskLevel` = at minimum `low`; trigger `recently diagnosed` may also fire as `trigger_health` | | | |
| 3 | Enter a prompt with a financial term | `Please review our Q3 payroll and salary structure` | Terms matching the gazetteer's financial list (`payroll`, `salary`) are correctly flagged as `gazetteer_financial`; `riskLevel` = at minimum `low` | | | |
| 4 | Enter a prompt with a term not in any gazetteer list | `I enjoy hiking` | No gazetteer findings in any category; `riskLevel` = `none`; badge shows Safe — no issues found | | | True negative control case |

**Post-Conditions:** Gazetteer-matched entities from all three categories are passed to the Merge & Deduplicate stage with correct `patternId`, `label`, `risk`, `rawMatch`, and `safeVersion` fields populated.

---

## Summary Table

| Test Case ID | Title | Priority | Status |
|---|---|---|---|
| Detect-01 | Detect nationality term via B1 word scan | High | Not Executed |
| Detect-02 | Detect medical condition names via B1 word and phrase scan | High | Not Executed |
| Detect-03 | Detect personal financial disclosure terms via B1 word and phrase scan | High | Not Executed |
| Detect-04 | Detect religion and denomination terms via B1 scan | High | Not Executed |
| Detect-05 | True negative — unrelated terms produce no findings | High | Not Executed |
| Detect-06 | Health disclosure via B2 trigger + B1 grammar check | High | Not Executed |
| Detect-07 | B1 scan performance within budget | Medium | Not Executed |
| Detect-08 | All three categories combined + true negative (Detect02-format composite) | High | Not Executed |

---

*TrustPrompt v0.0.4+ — Task #5 Test Cases — Detection Engine: Gazetteer Path (Medical / Financial / Nationality / Religion)*
