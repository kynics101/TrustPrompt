# TrustPrompt — Task #4: API Key / JWT / Placeholder Filters
## Comprehensive Task List

**Project:** TrustPrompt — Chromium-Based Browser Extension for Detecting and Mitigating Sensitive Data Exposure  
**Task Scope:** Task #4 — API Key, JWT, and Known-Placeholder Filters  
**Version:** 1.0  
**Date Created:** 2026-08-28  
**Last Updated:** 2026-08-28  
**Regulatory Basis:** NIST SP 800-122, RA 10173 (Philippine Data Privacy Act)

---

## Progress Tracker

| Task | Description | Status | Files Changed |
|---|---|---|---|
| TASK-4.1 | Audit current api_key / jwt behavior | ✅ Complete | — (analysis only) |
| TASK-4.2 | Harden api_key regex | ✅ Complete | `patterns.js` |
| TASK-4.3 | Tighten JWT structural validation | ✅ Complete | `patterns.js`, `validator-wrapper-worker.js` |
| TASK-4.4 | Known-placeholder suppression | ✅ Complete | `patterns.js`, `scanner.js`, `trust-worker.js` |
| TASK-4.5 | Shannon entropy guard | ✅ Complete | `patterns.js`, `scanner.js`, `trust-worker.js` |
| TASK-4.6 | Worker-path validated flag sync | ✅ Complete | `patterns.js`, `trust-worker.js` |
| TASK-4.7 | Regression tests and verification | 🔲 To Do | — (manual browser testing) |
| TASK-4.8 | Code quality and documentation | 🔲 To Do | `review.md` |

### Summary of Changes Made (2026-08-28)

**patterns.js:**
- `shannonEntropy(str)` — Shannon entropy utility (TASK-4.5)
- `PLACEHOLDER_SUPPRESSIONS` — frozen object with Stripe test cards, AWS example key, jwt.io default token (TASK-4.4)
- `PLACEHOLDER_PATTERNS` — frozen array of structural placeholder regexes (TASK-4.4)
- `isKnownPlaceholder(patternId, rawValue)` — checks both suppression list and structural patterns (TASK-4.4)
- `VENDOR_PREFIXES` — frozen array of vendor-specific key prefix regexes (TASK-4.6)
- `structuralValidateApiKey(raw)` — returns true for OpenAI, GitHub, Slack, AWS, Google key shapes (TASK-4.6)
- `api_key` regex: tightened keywords (dropped bare `secret`/`token`), added vendor-prefix OR branch, added `minEntropy: 3.5`, added `structuralValidate` field (TASK-4.2, 4.5, 4.6)
- `jwt` regex: added segment-length guards (header ≥10, payload ≥10, signature ≥20 chars), added `minEntropy: 3.5` (TASK-4.3, 4.5)

**scanner.js:**
- `suppressPlaceholders(findings)` — filters known placeholders post-dedupe (TASK-4.4)
- `runPathA()` — entropy pre-check before validator step (TASK-4.5)
- `scan()` — calls `suppressPlaceholders()` between dedupe and scoring (TASK-4.4)

**trust-worker.js:**
- `suppressPlaceholders(findings)` — identical to scanner.js version (TASK-4.4)
- `runPathA()` — entropy pre-check (TASK-4.5)
- `runPathA()` — `structuralValidate` hook: sets `validated: true` for vendor-prefix matches, enabling governance Rule 1 (TASK-4.6)

**Hotfix (2026-08-28) — patterns.js syntax error:**
- Removed malformed JWT entry from `VENDOR_PREFIXES` array — the regex `/^eyJ...[A-Za-z0-9\-_.+/=]+/` contained an unescaped `/` inside a character class, which terminated the regex literal prematurely and crashed `patterns.js` on load. This caused the extension to show "Safe — no issues found" for all inputs since `TRUSTPROMPT_PATTERNS` was never defined. JWT detection is handled by the dedicated `jwt` pattern entry and does not need to be in `VENDOR_PREFIXES`.

**validator-wrapper-worker.js:**
- `_base64urlDecode(str)` — helper to decode base64url segments
- `_isJWT(raw)` — upgraded from structural-only to full JSON decode check: decodes header + payload with atob(), JSON-parses both, requires plain objects with `alg` field, enforces ≥20 char signature — JWT now returns Tier 2 result (`validated: true`), fixing Known Issue #4 (TASK-4.3)

---

## Overview

Task #4 addresses three related improvements to how TrustPrompt handles authentication credentials and known-safe placeholder values:

1. **API Key regex hardening** — the existing `api_key` pattern fires on any `key=value` assignment with a 20+ character value. This causes false positives on benign config values and misses keys that appear without a labelled prefix (e.g., bare `sk-proj-...` tokens).

2. **JWT structural validation tightening** — the `jwt` pattern already uses `validator.isJWT`, but the worker path bypasses it. The regex can also match non-JWT base64url strings that happen to contain a dot. Structural segment-length checks are missing.

3. **Known-placeholder suppression** — industry-standard test/placeholder values (e.g., Stripe's `4111 1111 1111 1111`, dummy API keys like `YOUR_API_KEY`, `<YOUR_TOKEN>`) should not trigger warnings. TrustPrompt has no suppression layer yet.

---

## Task List

---

### TASK-4.1 — Audit and Document Current api_key and jwt Pattern Behavior

**Priority:** High  
**Depends on:** None  
**Estimated effort:** 1 session  
**Status:** Complete

| # | Action | Deliverable |
|---|---|---|
| 4.1.1 | Run all existing Sample Test Prompts from `review.md §14` through the current scanner and log each finding's `patternId`, `rawMatch`, `validated`, and `riskLevel` | Audit log (console output) |
| 4.1.2 | Construct 10 benign `api_key`-triggering prompts that should NOT fire (e.g., `config_key = "some_non_secret_value_here"`) | False-positive test list |
| 4.1.3 | Construct 10 real-world API key shapes that SHOULD fire but currently may not (bare `sk-proj-`, `ghp_`, `xoxb-`, `AKIA`, `AIza` prefixes without label) | True-positive gap list |
| 4.1.4 | Document current regex coverage gaps and false-positive sources in a comment block inside `patterns.js` | Code comment |

---

### TASK-4.2 — Harden the api_key Regex Pattern

**Priority:** High  
**Depends on:** TASK-4.1  
**Estimated effort:** 1–2 sessions  
**Status:** Complete

**Current pattern:**
```
regex: /(?:api[_\-\s]?key|secret|token|access[_\-\s]?key|client[_\-\s]?secret)\s*[:=]\s*["']?([A-Za-z0-9\-_\.+/=]{20,})["']?/gi
```

**Problems:**
- `secret` alone fires on `"my secret recipe is..."` — false positive
- `token` fires on `"access token: pending_approval_by_admin"` — false positive
- Misses vendor-prefixed bare keys: `sk-proj-`, `ghp_`, `xoxb-`, `AKIA`, `AIza`
- Does not enforce minimum entropy (repeated characters like `aaaaaaaaaaaaaaaaaaaaaa` fire incorrectly)

| # | Action | Deliverable |
|---|---|---|
| 4.2.1 | Tighten the keyword list: use `api_key`, `api-key`, `access_key`, `access-key`, `client_secret`, `auth_token`, `bearer` — drop bare `secret` and bare `token` as standalone keywords | Updated `patterns.js` |
| 4.2.2 | Add a vendor-prefix sub-pattern (OR branch): `sk-[A-Za-z0-9]{20,}` (OpenAI), `ghp_[A-Za-z0-9]{36}` (GitHub PAT), `xoxb-[0-9]+-[A-Za-z0-9-]+` (Slack), `AKIA[A-Z0-9]{16}` (AWS), `AIza[A-Za-z0-9\-_]{35}` (Google API) | Updated `patterns.js` |
| 4.2.3 | Add minimum-entropy guard: reject matches where the value is all one repeated character or contains known placeholder substrings (`xxx`, `YOUR_`, `<YOUR`, `placeholder`, `example`, `test`, `demo`, `fake`) | `isPlaceholder()` helper in `patterns.js` |
| 4.2.4 | Verify both `scanner.js` and `trust-worker.js` paths produce consistent results | Console test log |
| 4.2.5 | Update the `reason` field for `api_key` to mention vendor-prefixed key formats | Updated `patterns.js` |

---

### TASK-4.3 — Tighten the jwt Structural Validation

**Priority:** High  
**Depends on:** TASK-4.1  
**Estimated effort:** 1 session  
**Status:** Complete

**Background:** The worker path (`trust-worker.js` + `validator-wrapper-worker.js`) skips the `isJWT` validator and marks `validated: false` for JWT findings, meaning governance Rule 1 (critical_entity → HIGH) never fires in the worker path.

| # | Action | Deliverable |
|---|---|---|
| 4.3.1 | Add segment-length checks: header ≥ 10 chars, payload ≥ 10 chars, signature ≥ 20 chars | Updated `patterns.js` or `validator-wrapper.js` |
| 4.3.2 | Extend `validator-wrapper-worker.js` with a lightweight structural JWT check: both first two segments must be valid base64url that decodes to a JSON object starting with `{` — no full validator.js import needed | Updated `validator-wrapper-worker.js` |
| 4.3.3 | Re-test: a valid JWT processed by the worker path must produce `validated: true` and `riskLevel: "high"` | Test log confirming worker and scanner produce the same riskLevel |
| 4.3.4 | Confirm and document the sanitize decision: full `[REDACTED-JWT]` vs partial token display | Comment in `patterns.js` |

---

### TASK-4.4 — Implement Known-Placeholder Suppression

**Priority:** High  
**Depends on:** TASK-4.2, TASK-4.3  
**Estimated effort:** 2 sessions  
**Status:** Complete

**Known placeholder examples that must NOT trigger warnings:**

| Category | Example | Source |
|---|---|---|
| Credit card | `4111 1111 1111 1111` | Stripe test (SRC-SYN-001) |
| Credit card | `5500 0000 0000 0004` | Stripe Mastercard test |
| API key | `AKIAIOSFODNN7EXAMPLE` | AWS documentation |
| API key | `YOUR_API_KEY`, `<API_KEY_HERE>` | Generic placeholders |
| JWT | jwt.io default payload token | jwt.io tool |

| # | Action | Deliverable |
|---|---|---|
| 4.4.1 | Create `PLACEHOLDER_SUPPRESSIONS` constant in `patterns.js` — frozen object mapping `patternId → Set<string>` of known placeholder values (lowercased, stripped of spaces/dashes) | Updated `patterns.js` |
| 4.4.2 | Create `PLACEHOLDER_PATTERNS` — frozen array of structural placeholder regexes: `/^<[A-Z_]+>$/`, `/^YOUR_[A-Z_]+$/`, `/^x+$/i`, `/^0+$/`, `/^1+$/` | Updated `patterns.js` |
| 4.4.3 | Add `suppressPlaceholders(findings)` function to `scanner.js`, call it after `mergeAndDedupe()` | Updated `scanner.js` |
| 4.4.4 | Apply same suppression in `trust-worker.js` | Updated `trust-worker.js` |
| 4.4.5 | Add Stripe test card numbers to `PLACEHOLDER_SUPPRESSIONS.credit_card`: `4111111111111111`, `5500000000000004`, `378282246310005`, `6011111111111117`, `3566002020360505` | Updated `patterns.js` |
| 4.4.6 | Add AWS example key to `PLACEHOLDER_SUPPRESSIONS.api_key`: `AKIAIOSFODNN7EXAMPLE` | Updated `patterns.js` |
| 4.4.7 | Add jwt.io default payload segment to `PLACEHOLDER_SUPPRESSIONS.jwt` | Updated `patterns.js` |
| 4.4.8 | Log suppressed findings to console with `[TrustPrompt/suppressed]` prefix (not shown to user) | Updated scanner/worker |

---

### TASK-4.5 — Add Entropy-Based False-Positive Guard for api_key

**Priority:** Medium  
**Depends on:** TASK-4.2  
**Estimated effort:** 1 session  
**Status:** Complete

**Background:** A real API key from any major vendor has Shannon entropy ≥ 3.5 bits/char. A string of identical characters has entropy = 0. The placeholder suppression layer (TASK-4.4) catches specific known values; entropy catches the long-tail of user-typed dummy values.

| # | Action | Deliverable |
|---|---|---|
| 4.5.1 | Implement `shannonEntropy(str)` utility in `patterns.js` — returns H in bits/char | `patterns.js` utility |
| 4.5.2 | Add `minEntropy: 3.5` field to the `api_key` and `jwt` pattern entries | Updated `patterns.js` |
| 4.5.3 | In `runPathA()` (both scanner and worker), check `pattern.minEntropy` before the validator step — if entropy < threshold, skip the finding | Updated `scanner.js` and `trust-worker.js` |
| 4.5.4 | Test: `"sk-" + "a".repeat(50)` must NOT fire; `"sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234"` must fire | Test log |

---

### TASK-4.6 — Sync Worker-Path validated Flag for api_key

**Priority:** Medium  
**Depends on:** TASK-4.2, TASK-4.3  
**Estimated effort:** 0.5 sessions  
**Status:** Complete

**Background:** Known Issue #4 from `review.md`: the worker path sets `validated: false` for patterns without a full mathematical validator. This means `api_key` findings from the worker never trigger governance Rule 1 even though they should.

| # | Action | Deliverable |
|---|---|---|
| 4.6.1 | Add `structuralValidate` field to `api_key` pattern entry — a function that returns `true` if the match starts with a known vendor prefix (`sk-`, `ghp_`, `xoxb-`, `AKIA`, `AIza`) | Updated `patterns.js` schema |
| 4.6.2 | In `trust-worker.js` `runPathA()`, call `pattern.structuralValidate(raw)` if defined; set `validated: true` if it returns `true` | Updated `trust-worker.js` |
| 4.6.3 | Verify: a prompt with `sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ` in the worker path produces `riskLevel: "high"` | Test log |

---

### TASK-4.7 — Regression Tests and Verification

**Priority:** High  
**Depends on:** TASK-4.2 through TASK-4.6  
**Estimated effort:** 1–2 sessions  
**Status:** To Do

| # | Action | Deliverable |
|---|---|---|
| 4.7.1 | Run complete test case matrix from `TEST-CASE-APIKeyJWT.md` against both scanner.js and trust-worker.js | Completed test table with Actual Results and Pass/Fail |
| 4.7.2 | Confirm all existing Sample Test Prompts from `review.md §14` still produce the same `riskLevel` (no regressions) | Regression log |
| 4.7.3 | Load the updated extension in Chrome, paste each test prompt into ChatGPT and Claude, and document the badge/bar state | Screenshot evidence |
| 4.7.4 | Update `review.md §6` to reflect new vendor-prefix patterns, placeholder suppression, entropy guard, and worker-path fix | Updated `review.md` |

---

### TASK-4.8 — Code Quality and Documentation

**Priority:** Low  
**Depends on:** TASK-4.2 through TASK-4.7  
**Estimated effort:** 0.5 sessions  
**Status:** To Do

| # | Action | Deliverable |
|---|---|---|
| 4.8.1 | Add JSDoc comments to all new functions: `isPlaceholder()`, `shannonEntropy()`, `suppressPlaceholders()`, `structuralValidate()` | Code comments |
| 4.8.2 | Freeze `PLACEHOLDER_SUPPRESSIONS` and `PLACEHOLDER_PATTERNS` with `Object.freeze()` | Code review |
| 4.8.3 | Verify `patterns.js` header comment lists all fields including new fields `minEntropy` and `structuralValidate` | Updated comment |
| 4.8.4 | Append a `## Task #4 Changes` section to `review.md` summarising all modifications | Updated `review.md` |

---

## Execution Order

```
TASK-4.1 (Audit)
    |
    |---> TASK-4.2 (api_key regex hardening)
    |         |---> TASK-4.5 (entropy guard)
    |         |---> TASK-4.6 (worker validated flag)
    |
    |---> TASK-4.3 (JWT structural validation)
    |
    |---> [4.2 + 4.3 complete] ---> TASK-4.4 (placeholder suppression)
    |
    |---> [4.2 + 4.3 + 4.4 + 4.5 + 4.6 complete] ---> TASK-4.7 (regression tests)
                                                              |
                                                              |---> TASK-4.8 (docs)
```

---

## Files to be Modified

| File | Tasks | Nature of Change |
|---|---|---|
| `patterns.js` | 4.2, 4.3, 4.4, 4.5, 4.6, 4.8 | New fields (`minEntropy`, `structuralValidate`), new constants, tightened regex |
| `scanner.js` | 4.4, 4.5 | `suppressPlaceholders()` call; entropy pre-check in `runPathA()` |
| `trust-worker.js` | 4.3, 4.4, 4.5, 4.6 | JWT structural check; placeholder suppression; entropy guard; `structuralValidate` hook |
| `validator-wrapper-worker.js` | 4.3 | Lightweight JWT structural decode |
| `review.md` | 4.7, 4.8 | Update detection patterns table and append Task #4 summary |

---

## Definition of Done

- [ ] All TASK-4.* subtasks marked complete
- [ ] Test case document `TEST-CASE-APIKeyJWT.md` fully executed with all steps Pass
- [ ] No regressions to existing test prompts in `review.md §14`
- [ ] Worker path and scanner path produce identical `riskLevel` for all api_key and jwt inputs
- [ ] Placeholder suppression fires correctly for all Stripe test card numbers and known dummy API keys
- [ ] `review.md` updated to reflect all changes
- [ ] All new functions documented with JSDoc
