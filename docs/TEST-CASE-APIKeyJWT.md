# TrustPrompt — Test Case Document
## Task #4: API Key / JWT / Placeholder Filters

**Project Name:** TrustPrompt: Development of a Chromium-Based Browser Extension for Detecting and Mitigating Sensitive Data Exposure in Free GPT-5.5 and Claude Sonnet 5 Prompts  
**Module Name:** Detection Engine — API Key / JWT / Placeholder Filter  
**Version:** 1.0  
**Date Created:** 2026-08-28

---

---

## Test Case AUTH-01

**Test Case ID:** AUTH-01  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — API Key Pattern (Labelled Key)  
**Test Executed By:**  
**Test Title:** Detect labelled API key with standard keyword prefix  
**Test Executed Date:**  
**Description:** Verifies that the `api_key` pattern correctly detects credential assignments using standard keyword prefixes (`api_key`, `access_key`, `client_secret`, `auth_token`) followed by a 20+ character value. Confirms risk is classified as HIGH and the finding is forwarded to the UI with appropriate redaction.  
**Pre-Condition:** Extension is loaded; scanner and worker paths are active  
**Dependencies:** `patterns.js` `api_key` pattern; `validator-wrapper.js`; `scanner.js` / `trust-worker.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt containing an `api_key` label with a high-entropy value | `api_key = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd"` | Pattern `api_key` fires; `riskLevel` = `high`; badge turns red; side panel opens automatically | | | |
| 2 | Enter a prompt using `access_key` keyword prefix | `access_key: AKIAXYZ1234567890ABCDEF` | Pattern `api_key` fires; `riskLevel` = `high` | | | |
| 3 | Enter a prompt using `client_secret` keyword prefix | `client_secret="q9W2eRtYuIoPaSdFgHjKlZxCvBnM1234"` | Pattern `api_key` fires; `riskLevel` = `high` | | | |
| 4 | Enter a prompt using `auth_token` keyword prefix | `auth_token: eyABCDEFGHIJKLMNOPQRSTUVWXYZ123456` | Pattern `api_key` fires; `riskLevel` = `high` | | | |
| 5 | Enter a prompt using `bearer` keyword prefix | `Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz123456` | Pattern `api_key` fires; `riskLevel` = `high` | | | |

**Post-Conditions:** Findings with `patternId: "api_key"` appear in the side panel; safe version shows `[REDACTED-KEY]` in place of the credential value.

---

## Test Case AUTH-02

**Test Case ID:** AUTH-02  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — API Key Pattern (Vendor-Prefix Bare Keys)  
**Test Executed By:**  
**Test Title:** Detect vendor-prefixed API keys appearing without a label  
**Test Executed Date:**  
**Description:** Verifies that the new vendor-prefix sub-pattern (TASK-4.2.2) detects well-known API key shapes from OpenAI, GitHub, Slack, AWS, and Google even when the key appears as a bare value in the prompt text without any `api_key=` label preceding it. These keys are structurally identifiable by their prefix alone.  
**Pre-Condition:** TASK-4.2.2 vendor-prefix OR branch is implemented in `patterns.js`  
**Dependencies:** Updated `patterns.js` `api_key` pattern; `scanner.js` / `trust-worker.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with an OpenAI-style key appearing as bare text | `Here is my key: sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd` | Pattern `api_key` fires on the bare `sk-proj-...` value; `riskLevel` = `high` | | | |
| 2 | Enter a prompt with a GitHub Personal Access Token | `My PAT is ghp_abcdefghijklmnopqrstuvwxyz123456xyz0` | Pattern `api_key` fires; `riskLevel` = `high` | | | |
| 3 | Enter a prompt with a Slack Bot Token | `Token: [SLACK-BOT-TOKEN-EXAMPLE]` | Pattern `api_key` fires; `riskLevel` = `high` | | | Note: actual token format is xo**-prefixed; value replaced with placeholder to avoid secret scanner false positive |
| 4 | Enter a prompt with an AWS Access Key ID | `My AWS key is AKIAIOSFODNN7REALKEY12` | Pattern `api_key` fires; `riskLevel` = `high` | | | Currently AKIAIOSFODNN7EXAMPLE is a placeholder and should be suppressed — see AUTH-05 |
| 5 | Enter a prompt with a Google API key | `AIzaSyAbCdEfGhIjKlMnOpQrStUvWxYz1234567` | Pattern `api_key` fires; `riskLevel` = `high` | | | |
| 6 | Enter a prompt where no recognizable vendor prefix is present and no label is used | `Here is a long random string: abcdefghijklmnopqrstuvwxyz1234` | Pattern `api_key` does NOT fire (no label, no vendor prefix) | | | Confirms the OR branch does not over-generalize |

**Post-Conditions:** All vendor-prefix keys produce `patternId: "api_key"` findings with `riskLevel: "high"`.

---

## Test Case AUTH-03

**Test Case ID:** AUTH-03  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — api_key False-Positive Reduction  
**Test Executed By:**  
**Test Title:** Confirm bare `secret` and `token` keywords do not produce false positives  
**Test Executed Date:**  
**Description:** After TASK-4.2.1 removes bare `secret` and bare `token` as standalone keywords, this test confirms that common English uses of these words in a prompt do not trigger the `api_key` pattern. These are known false-positive sources in the original pattern.  
**Pre-Condition:** TASK-4.2.1 keyword list tightening is implemented  
**Dependencies:** Updated `patterns.js` `api_key` pattern

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with the word "secret" in natural language | `My secret recipe for adobo has been in the family for generations.` | Pattern `api_key` does NOT fire | | | Bare `secret` must no longer be a standalone keyword trigger |
| 2 | Enter a prompt with "token" in a non-credential context | `I need to check whether my access token: pending_approval_by_admin is valid` | Pattern `api_key` does NOT fire (value is not 20+ high-entropy chars) | | | |
| 3 | Enter a prompt with "secret" as a labelled field but with a short value | `secret: abc123` | Pattern `api_key` does NOT fire (value < 20 chars) | | | |
| 4 | Enter a prompt that uses "config_key" as a label | `config_key = "somevaluenotacredential12345678"` | Pattern `api_key` does NOT fire (`config_key` is not in the tightened keyword list) | | | Confirm tightened keyword list excludes `config_key` |
| 5 | Enter a prompt with a legitimate credential context | `api_key = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890"` | Pattern `api_key` DOES fire (control case confirming true positives still work) | | | |

**Post-Conditions:** Only real credential patterns trigger `api_key`; natural language use of "secret" and "token" produces no findings.

---

## Test Case AUTH-04

**Test Case ID:** AUTH-04  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — JWT Detection (Both Paths)  
**Test Executed By:**  
**Test Title:** Detect real JWT tokens and confirm HIGH risk on both scanner and worker paths  
**Test Executed Date:**  
**Description:** Verifies the JWT pattern detects valid tokens and that after TASK-4.3.2, the worker path correctly sets `validated: true` for structurally valid JWTs, triggering governance Rule 1 (critical_entity → HIGH). Tests both the main-thread scanner.js path and the web worker trust-worker.js path.  
**Pre-Condition:** TASK-4.3 is implemented; extension loaded in Chrome  
**Dependencies:** Updated `validator-wrapper-worker.js`; `trust-worker.js`; `patterns.js` JWT segment-length check

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with a structurally valid 3-segment JWT | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0cnVzdHByb21wdC10ZXN0IiwiaWF0IjoxNzAwMDAwMDAwfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c` | Pattern `jwt` fires; worker path produces `validated: true`; `riskLevel` = `high`; governance = `critical_entity` | | | Use jwt.io to generate a test token with payload {"sub":"trustprompt-test","iat":1700000000} |
| 2 | Enter a prompt with a JWT where the signature segment has fewer than 20 chars | `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.short` | Pattern `jwt` does NOT fire (signature segment too short) | | | |
| 3 | Enter a prompt with a string that looks like JWT format but has no valid JSON in the payload | `eyXXXXXXXXXXXXXXXXXX.eyYYYYYYYYYYYYYYYYYY.ZZZZZZZZZZZZZZZZZZZZZZZZZZ` | Pattern `jwt` does NOT fire (segments do not decode to valid JSON) | | | Tests the lightweight worker-side decode check |
| 4 | Confirm scanner.js and trust-worker.js produce the same riskLevel for the same JWT prompt | Same prompt as Step 1 | Both paths produce `riskLevel: "high"` and `governance: "critical_entity"` | | | This directly validates the Known Issue #4 fix |
| 5 | Enter a prompt with the safe version of a JWT (already redacted) | `[REDACTED-JWT]` | Pattern `jwt` does NOT fire on the redacted placeholder string | | | |

**Post-Conditions:** Valid JWTs produce `riskLevel: "high"` on both scanner and worker paths; structural rejects produce no finding.

---

## Test Case AUTH-05

**Test Case ID:** AUTH-05  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — Known-Placeholder Suppression (API Key & JWT)  
**Test Executed By:**  
**Test Title:** Confirm known placeholder values are suppressed and produce no warning  
**Test Executed Date:**  
**Description:** Verifies that the placeholder suppression layer (TASK-4.4) correctly identifies and suppresses known-safe test/documentation values. Users pasting code examples from official documentation should not receive false-positive warnings. The test covers the Stripe test card numbers, AWS documentation example key, and generic structural placeholders.  
**Pre-Condition:** TASK-4.4 placeholder suppression is implemented in both scanner.js and trust-worker.js  
**Dependencies:** `PLACEHOLDER_SUPPRESSIONS` and `PLACEHOLDER_PATTERNS` constants in `patterns.js`; `suppressPlaceholders()` in `scanner.js` and `trust-worker.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt containing the Stripe Visa test card | `4111 1111 1111 1111` | Pattern `credit_card` does NOT produce a user-facing warning; finding is suppressed; console logs `[TrustPrompt/suppressed]` | | | Stripe test card (SRC-SYN-001) |
| 2 | Enter a prompt containing the Stripe Mastercard test card | `5500 0000 0000 0004` | Pattern `credit_card` is suppressed; no warning shown | | | |
| 3 | Enter a prompt containing the AWS documentation example access key | `api_key = "AKIAIOSFODNN7EXAMPLE"` | Pattern `api_key` is suppressed; no warning shown | | | AWS docs example key |
| 4 | Enter a prompt using an angle-bracket template placeholder | `Please use your API key: <YOUR_API_KEY>` | Pattern `api_key` does NOT fire; `<YOUR_API_KEY>` matches `PLACEHOLDER_PATTERNS` | | | Structural placeholder pattern |
| 5 | Enter a prompt using a YOUR_-prefixed uppercase placeholder | `Set access_key = YOUR_ACCESS_KEY_HERE in your config` | Pattern `api_key` is suppressed | | | |
| 6 | Enter a prompt with an all-x dummy value | `api_key = "xxxxxxxxxxxxxxxxxxxxxxxxxxxx"` | Pattern `api_key` is suppressed (all-x string) | | | |
| 7 | Enter a prompt with a real API key immediately after a suppressed one | `Old key: AKIAIOSFODNN7EXAMPLE. New key: AKIAXYZ1234567890ABCDEF` | First key is suppressed; second key (not in suppression list) fires normally as `riskLevel: "high"` | | | Confirms suppression is per-finding, not global |

**Post-Conditions:** Only real (non-placeholder) credential values produce user-facing warnings. Suppressed values are logged to the console but not shown in the badge/bar/panel.

---

## Test Case AUTH-06

**Test Case ID:** AUTH-06  
**Test Design By:**  
**Test Priority:** Medium  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — Entropy Guard for api_key  
**Test Executed By:**  
**Test Title:** Confirm low-entropy strings are rejected by the entropy guard  
**Test Executed Date:**  
**Description:** Verifies that the Shannon entropy guard (TASK-4.5) correctly rejects low-entropy strings that pass the API key regex shape but are obviously not real credentials. A string of identical characters has entropy = 0; a real API key has entropy ≥ 3.5 bits/char. This is a defense-in-depth measure beyond placeholder suppression.  
**Pre-Condition:** TASK-4.5 `shannonEntropy()` and `minEntropy: 3.5` are implemented  
**Dependencies:** `shannonEntropy()` in `patterns.js`; entropy pre-check in `scanner.js` and `trust-worker.js` `runPathA()`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with an all-same-character padded fake key (sk- prefix) | `api_key = "sk-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"` | Pattern `api_key` does NOT fire; entropy check rejects the value (H < 3.5 bits/char) | | | Shannon entropy of all-'a' string = 0 |
| 2 | Enter a prompt with an all-zero padded value | `api_key = "00000000000000000000000000000000"` | Pattern `api_key` does NOT fire; entropy too low | | | |
| 3 | Enter a prompt with a high-entropy realistic fake key | `api_key = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890"` | Pattern `api_key` DOES fire; entropy check passes (H ≥ 3.5 bits/char) | | | Control case: real-shaped key must still fire |
| 4 | Enter a prompt with a medium-entropy key that just meets the threshold | `api_key = "abcdefghijklmnopqrstuvwxyz123456"` (26 distinct chars + digits) | Pattern `api_key` DOES fire; entropy passes | | | Alphabet + digit string H ≈ 4.7 bits/char |
| 5 | Verify the entropy function itself returns expected values | Run `shannonEntropy("aaaaaaaaaa")` and `shannonEntropy("abcdefghij")` in console | `shannonEntropy("aaaaaaaaaa")` = 0; `shannonEntropy("abcdefghij")` ≈ 3.32 | | | Unit-level verification of the utility function |

**Post-Conditions:** The entropy guard reduces false positives from low-entropy dummy values without blocking detection of real-shaped credential strings.

---

## Test Case AUTH-07

**Test Case ID:** AUTH-07  
**Test Design By:**  
**Test Priority:** Medium  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — Worker Path Consistency (Governance Rule 1)  
**Test Executed By:**  
**Test Title:** Confirm worker path validates api_key vendor-prefix findings and triggers HIGH risk  
**Test Executed Date:**  
**Description:** Validates the fix for Known Issue #4 (from review.md): before TASK-4.6, `api_key` findings from the worker path had `validated: false`, meaning governance Rule 1 (critical_entity → HIGH) never fired in the worker. After TASK-4.6, vendor-prefix matches must set `validated: true` in the worker, producing HIGH risk consistent with the scanner.js main-thread path.  
**Pre-Condition:** TASK-4.6 `structuralValidate` field and worker hook are implemented  
**Dependencies:** Updated `trust-worker.js` `runPathA()`; `structuralValidate()` in `patterns.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Enter a prompt with a vendor-prefix API key and observe worker path finding | `sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd` | Worker `runPathA()` produces finding with `validated: true`; `riskLevel` = `high`; governance = `critical_entity` | | | Check via console: `[TrustPrompt/scorer]` log line |
| 2 | Enter the same prompt and compare scanner.js and worker results | Same prompt as Step 1 (force scanner.js fallback by increasing scan timeout) | Both paths produce `riskLevel: "high"` and `governance: "critical_entity"` | | | |
| 3 | Enter a prompt with a non-vendor-prefix key (labelled only, no structural prefix) | `api_key = "q9W2eRtYuIoPaSdFgHjKlZxCvBnM1234"` (no vendor prefix, high entropy, 20+ chars) | Worker produces `validated: false` for this finding (no structural prefix to confirm); riskLevel depends on governance rules without Rule 1 | | | Confirms `structuralValidate` only fires for known vendor prefixes |
| 4 | Confirm no regression: email-only prompt still produces moderate risk on worker path | `My email is maria.santos@gmail.com. Can you help write a follow-up email?` | `riskLevel` = `moderate` on worker path (unchanged) | | | Existing behavior must be preserved |

**Post-Conditions:** Vendor-prefix API key matches from the worker path produce `validated: true` and trigger `riskLevel: "high"` via governance Rule 1.

---

## Test Case AUTH-08

**Test Case ID:** AUTH-08  
**Test Design By:**  
**Test Priority:** High  
**Test Design Date:** 2026-08-28  
**Module Name:** Detection Engine — Full Regression (Existing Test Prompts)  
**Test Executed By:**  
**Test Title:** Confirm no regressions to existing sample test prompts after Task #4 changes  
**Test Executed Date:**  
**Description:** After all Task #4 changes are applied, re-runs every Sample Test Prompt from review.md §14 to confirm that existing expected risk levels are unchanged. This is the full regression gate before the task is considered complete.  
**Pre-Condition:** All TASK-4.1 through TASK-4.7 subtasks are complete  
**Dependencies:** All modified files: `patterns.js`, `scanner.js`, `trust-worker.js`, `validator-wrapper-worker.js`

| Step | Test Steps | Test Data | Expected Results | Actual Results | Status Pass/Fail | Notes |
|---|---|---|---|---|---|---|
| 1 | Run low-risk sample prompt 1 (personal label fields) | `Name: Maria Santos / Age: 28 / Civil Status: Single / Can you help me write a short personal introduction for a job application?` | `riskLevel` = `low` (unchanged from pre-Task-4 baseline) | | | From review.md §14 |
| 2 | Run low-risk sample prompt 2 (PH address) | `I work near Barangay Bagong Lipunan, Quezon City. What are some good lunch spots nearby?` | `riskLevel` = `low` (unchanged) | | | |
| 3 | Run moderate-risk sample prompt (email only) | `My email is maria.santos@gmail.com. Can you help me write a follow-up email to a client who hasn't responded in two weeks?` | `riskLevel` = `moderate` (unchanged) | | | |
| 4 | Run moderate-risk sample prompt (IPv4) | `Our dev server is at 192.168.1.200. Help me write an incident report for a network disruption that happened this afternoon.` | `riskLevel` = `moderate` (unchanged) | | | |
| 5 | Run moderate-risk sample prompt (PH mobile) | `My number is 09271234567. Draft a professional text message I can send to reschedule a client meeting.` | `riskLevel` = `moderate` (unchanged) | | | |
| 6 | Run high-risk sample prompt (api_key labelled) | `api_key = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd" / I keep getting a 401 Unauthorized error. Here is my config — what am I doing wrong?` | `riskLevel` = `high`; side panel opens automatically (unchanged) | | | |
| 7 | Run high-risk sample prompt (email + mobile combined) | `My email is juan.reyes@company.com and my mobile number is 09181234567. Can you help me fill out this registration form?` | `riskLevel` = `high` (unchanged; two direct identifiers → governance Rule 2 or breadth multiplier) | | | |

**Post-Conditions:** All existing sample prompts produce the same risk level as before Task #4 changes. Zero regressions confirm that the new filters, suppression, and entropy guard do not break any established detection behavior.

---

## Summary Table

| Test Case ID | Title | Priority | Status |
|---|---|---|---|
| AUTH-01 | Detect labelled API key with standard prefix | High | Not Executed |
| AUTH-02 | Detect vendor-prefixed bare API keys | High | Not Executed |
| AUTH-03 | Confirm bare secret/token do not false-positive | High | Not Executed |
| AUTH-04 | Detect JWT on both scanner and worker paths | High | Not Executed |
| AUTH-05 | Known-placeholder suppression | High | Not Executed |
| AUTH-06 | Entropy guard rejects low-entropy strings | Medium | Not Executed |
| AUTH-07 | Worker path governance Rule 1 for api_key | Medium | Not Executed |
| AUTH-08 | Full regression — existing sample prompts | High | Not Executed |

---

*TrustPrompt v0.0.4+ — Task #4 Test Cases — Detection Engine: API Key / JWT / Placeholder Filters*
