# TrustPrompt — Technical Review & Feature Guide

> Version reviewed: v0.0.4  
> Date: August 2026

---

## Table of Contents

1. [What TrustPrompt Does](#1-what-trustprompt-does)
2. [System Architecture](#2-system-architecture)
3. [File Reference](#3-file-reference)
4. [Scan Pipeline](#4-scan-pipeline)
5. [Risk Scoring Model](#5-risk-scoring-model)
6. [Detection Patterns](#6-detection-patterns)
7. [Gazetteer & NLP Detection](#7-gazetteer--nlp-detection)
8. [UI Components](#8-ui-components)
9. [Alert Fatigue Mitigations](#9-alert-fatigue-mitigations)
10. [Submit Blocking](#10-submit-blocking)
11. [Message Passing](#11-message-passing)
12. [Known Issues & Limitations](#12-known-issues--limitations)
13. [Public APIs](#13-public-apis)
14. [Sample Test Prompts](#14-sample-test-prompts)

---

## 1. What TrustPrompt Does

TrustPrompt is a Chrome extension that screens user-typed prompts for sensitive personal data **before** they are submitted to AI assistants (ChatGPT and Claude). It scans in real-time as the user types, classifies detected data by risk level, and surfaces warnings through a layered UI — without modifying or intercepting the AI response.

**Supported sites:**
- `https://claude.ai/*`
- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

**Regulatory basis:** Philippine Data Privacy Act (RA 10173), PCI-DSS, NIST SP 800-122.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ CHROME BROWSER                                                      │
│                                                                     │
│  ┌────────────────────────────────┐   ┌───────────────────────────┐ │
│  │  Content Script                │   │  Chrome Side Panel        │ │
│  │  (claude.ai / chatgpt.com)     │   │  sidepanel.html           │ │
│  │                                │   │  sidepanel.js             │ │
│  │  Load order:                   │   │                           │ │
│  │  1. lib/validator.min.js       │   │  Receives relayed scan    │ │
│  │  2. ph-address-db.js           │   │  results from background  │ │
│  │  3. normalizer.js              │   └───────────────────────────┘ │
│  │  4. patterns.js                │             ▲                   │
│  │  5. gazetteer.js               │             │ relay             │
│  │  6. validator-wrapper.js       │   ┌──────────────────────────┐  │
│  │  7. scanner.js                 │◄──┤  Service Worker          │  │
│  │  8. worker-bridge.js           │──►│  background.js           │  │
│  │  9. ui.js                      │   │                          │  │
│  │  10. dom-claude.js             │   │  • Badge management      │  │
│  │      or dom-chatgpt.js         │   │  • Message routing       │  │
│  │                                │   │  • Firebase rules fetch  │  │
│  │  ┌──────────────────────────┐  │   │  • High-risk auto-open   │  │
│  │  │  Web Worker              │  │   └──────────────────────────┘  │
│  │  │  trust-worker.js         │  │                                  │
│  │  │  (blob trampoline)       │  │                                  │
│  │  │  importScripts:          │  │                                  │
│  │  │  - normalizer.js         │  │                                  │
│  │  │  - patterns.js           │  │                                  │
│  │  │  - validator-wrapper-    │  │                                  │
│  │  │    worker.js             │  │                                  │
│  │  │  - gazetteer.js          │  │                                  │
│  │  │  - ph-address-db.js      │  │                                  │
│  │  └──────────────────────────┘  │                                  │
│  └────────────────────────────────┘                                  │
└──────────────────────────────────────────────────────────────────────┘
```

### Execution contexts

| Context | Files | Runs where |
|---|---|---|
| Content script | `dom-claude.js`, `dom-chatgpt.js`, `ui.js`, `scanner.js`, `worker-bridge.js`, all shared libs | Injected into the AI site tab |
| Web worker | `trust-worker.js` (via blob URL) | Off-thread inside the tab |
| Service worker | `background.js` | Browser background |
| Side panel page | `sidepanel.html`, `sidepanel.js` | Chrome side panel frame |

---

## 3. File Reference

| File | Role |
|---|---|
| `manifest.json` | Extension wiring, permissions, content script load order |
| `background.js` | Service worker — badge updates, message routing, auto-open gate, Firebase rules fetch |
| `dom-claude.js` | Claude DOM driver — prompt box detection, 4-state scan machine, submit blocking |
| `dom-chatgpt.js` | ChatGPT DOM driver — same as above with ChatGPT-specific selectors |
| `worker-bridge.js` | Spawns the web worker via blob trampoline, manages scan IDs and 1.5s timeout fallback |
| `ui.js` | All inline UI — badge, bottom bar, inline detail panel |
| `scanner.js` | Main-thread fallback scanner — full pipeline + NIST 5-step scorer |
| `trust-worker.js` | Primary scanner running in the web worker — same pipeline, different scoring model |
| `normalizer.js` | Three-layer text normalization (shared → regexLayer → linguisticLayer) |
| `patterns.js` | All 14 regex detection patterns (frozen array) |
| `gazetteer.js` | NLP path — B1 word scan, B2 fuzzy trigger-phrase match, B3 grammar check |
| `ph-address-db.js` | Philippine geographic reference DB (~200 place names) |
| `validator-wrapper.js` | Delegates to validator.js (Luhn, RFC5322, JWT, IP, MAC, phone) |
| `validator-wrapper-worker.js` | Worker-safe stub — passes all matches except PH address |
| `sidepanel.html` | Side panel shell HTML + CSS |
| `sidepanel.js` | Side panel controller — renders findings, wires action buttons |
| `lib/validator.min.js` | External validator.js library |
| `content-script.js` | **Dead code** — legacy Claude script, not loaded by manifest |
| `content-script-chatgpt.js` | **Dead code** — legacy ChatGPT script, not loaded by manifest |
| `test-normalizer.js` | Dev-only Node.js unit tests — not loaded by extension |

---

## 4. Scan Pipeline

### End-to-end flow

```
User types in prompt box
         │
         ▼
onInput() [dom-claude.js / dom-chatgpt.js]
  → TrustUI.setScanning(inputEl)
  → chrome.runtime.sendMessage({ type: "SCAN_SCANNING" })
  → reset 400ms debounce timer
         │
         ▼  [400ms pause — debounce fires]
extractText(promptBox)
  │
  ├─ empty? ──► TrustUI.reset() + SCAN_CLEARED message
  ├─ same as lastScannedText? ──► skip entirely
  │
  └─► TrustWorkerBridge.scan(rawText)
               │
        ┌──────┴──────────────────────────────────────────┐
        │ Primary: Web Worker                             │
        │   TrustNormalizer.normalize(rawText)            │
        │     → masked / textRegex / textNLP              │
        │   runPathA(textRegex)  ← regex + validation     │
        │   TrustGazetteer.scan(textNLP)  ← NLP           │
        │   mergeAndDedupe(pathA, pathB)                  │
        │   computeRiskScore(findings)                    │
        │   postMessage(RESULT)                           │
        │                                                 │
        │ Fallback (worker timeout >1.5s or error):       │
        │   TrustScanner.scan(rawText)  [main thread]     │
        │   Same pipeline, full validator.js, NIST scorer │
        └─────────────────────────────────────────────────┘
               │
               ▼  Promise resolves
applyResult(result, rawText)
  → TrustUI.update(riskLevel, findings, safeText, inputEl)
  → chrome.runtime.sendMessage({ type: "SCAN_RESULT", riskLevel, findings, rawText })
               │
               ▼
background.js SCAN_RESULT handler
  → setBadge(tabId, riskLevel)
  → [high + not gated] → chrome.sidePanel.open(tabId) + add to gate
  → [none] → remove from gate
  → relay message to sidepanel.js
               │
               ▼
sidepanel.js
  → setStatus(riskLevel)
  → renderFindings(findings)
```

### Text normalization layers

`TrustNormalizer.normalize(rawText)` produces three strings:

| Output | Transformation | Used by |
|---|---|---|
| `masked` | NFKC, strip invisibles, CRLF→LF, trim | Display only |
| `textRegex` | + code block preservation, digit separator protection, ALL-CAPS guard, smart quote→ASCII | Path A (regex patterns) |
| `textNLP` | + collapse whitespace, normalize punctuation, sentence boundary injection, sentence-case estimation | Path B (gazetteer) |

---

## 5. Risk Scoring Model

> **Note:** Two separate scoring engines exist. The **web worker** (primary path) and **scanner.js** (main-thread fallback) use different base scores, multipliers, and thresholds. In practice the worker always wins — it is the primary path and only falls back to scanner.js on timeout.

### scanner.js — NIST SP 800-122 five-step model

**Step 1 — Base scores per entity type (each type counted once, not per occurrence)**

| Tier | Entity types | Base score |
|---|---|---|
| Critical | `credit_card`, `jwt`, `api_key`, `password_inline` | 10 |
| Direct personal identifier | `email`, `ph_mobile`, `phone_intl`, `ph_address`, `ipv4`, `ipv6`, `mac_address`, `context_label` | 5 |
| Contextual indicator | `trigger_*`, `gazetteer_*` | 2 |
| Container | `source_code` | 0 |

**Step 2 — Distinct-type breadth multiplier**

| Distinct entity types | Multiplier |
|---|---|
| 1 | 1.00× |
| 2 | 1.20× |
| 3 | 1.40× |
| 4 | 1.70× |
| 5+ | 2.00× |

**Step 3 — Preliminary classification**

| Score | Level |
|---|---|
| ≥ 10 | high |
| ≥ 5 | moderate |
| ≥ 2 | low |
| < 2 | none |

**Step 4 — Governance rules**

| Rule | Condition | Effect |
|---|---|---|
| 1 | Any critical entity present | Force high |
| 2 | ≥ 2 distinct direct identifier types | Force high |
| 3 | ≥ 1 direct + ≥ 2 contextual types | Force high |
| 4 | source_code + critical entity | Force high |
| 5 | ≥ 3 direct types (bulk disclosure) | Force high |
| 6 | All contextual, no direct | Cap at moderate |
| 7 | person_name + medical/legal contextual | Floor at moderate |

**Step 5 — Final** = `max(preliminary, governance_floor)`, with moderate_ceiling capping at moderate.

---

## 6. Detection Patterns

All 14 patterns are defined in `patterns.js` as a frozen array (`TRUSTPROMPT_PATTERNS`).

### High risk

| Pattern | What it detects | Validation | Safe version |
|---|---|---|---|
| `credit_card` | 13–19 digit card numbers (spaces/dashes allowed) | Luhn algorithm via validator.js | Mask all but last 4 digits |
| `api_key` | Keyword prefix (`api_key`, `secret`, `token`, `access_key`, `client_secret`) + `:=` + 20+ char value | None | `[REDACTED-KEY]` |
| `jwt` | Three base64url segments starting with `eyJ` | validator.isJWT | `[REDACTED-JWT]` |
| `password_inline` | Keyword prefix (`password`, `passwd`, `pwd`, `pass`) + `:=` + 6+ char value | None | `[REDACTED-PASSWORD]` |

### moderate risk

| Pattern | What it detects | Validation | Safe version |
|---|---|---|---|
| `email` | Standard `local@domain.tld` format | RFC 5322 via validator.js | `f***@domain.tld` |
| `ph_mobile` | Philippine mobile `09XX XXXXXXX` or `+639XX XXXXXXX` | Prefix 900–999 + length | Last 6 digits masked |
| `phone_intl` | International phone number (US format) | validator.isMobilePhone (any locale) | Last 4 digits masked |
| `ipv4` | IPv4 address with strict octet range | validator.isIP(4) | Last two octets → `xxx.xxx` |
| `ipv6` | Full and compressed IPv6 forms | validator.isIP(6) | `[REDACTED-IPv6]` |
| `mac_address` | Colon or hyphen separated hex pairs | validator.isMACAddress | Last 4 pairs → `xx` |

### Low risk

| Pattern | What it detects | Validation | Safe version |
|---|---|---|---|
| `source_code` | Fenced code blocks or long inline backtick spans (≥ 10 chars) | None | `[CODE BLOCK REMOVED]` |
| `context_label` | ~30 PH ID/field keywords followed by `: value` (Name, Age, TIN, SSS, Passport, etc.) | None | Redact value after colon |
| `ph_address` | Street-level keywords (barangay, brgy, street, avenue, road, subdivision, etc.) + up to 80 char tail | PH_ADDRESS_DB gazetteer check | `[PHILIPPINE ADDRESS REMOVED]` |

---

## 7. Gazetteer & NLP Detection

Path B (NLP) runs in `gazetteer.js` on the `textNLP` output of the normalizer.

### B1 — Word gazetteer scan

Checks `\bterm\b` word-boundary regex across four word lists:

| Category | Examples | Risk | Pattern ID |
|---|---|---|---|
| Medical | diabetes, hiv, depression, insulin, autism, chemotherapy | moderate | `gazetteer_medical` |
| Financial | bankrupt, mortgage, debt, foreclosure, collateral | moderate | `gazetteer_financial` |
| Nationality / religion | muslim, christian, filipino, korean, catholic | low | `gazetteer_nationality_religion` |
| Legal | arrested, convicted, felony, probation, warrant | moderate | `gazetteer_legal` |

### B2 — Trigger-phrase fuzzy match

~35 trigger phrases covering: name, age, DOB, address, employer, health condition, religion, financial situation.

Each trigger defines:
- `phrase` — canonical form (e.g. `"my name is"`)
- `category` — PII type following the trigger
- `risk` — low/moderate
- optional `followPattern` — regex the extracted value must match
- optional `requireGazetteer` — extracted value must contain a term from a named word list

**Fuzzy matching** uses Levenshtein similarity ≥ 0.80 across a sliding word-window the same length as the trigger phrase. This tolerates 1–2 character typos (e.g. `"my naem is"` still fires).

**Value extraction** collects words after the trigger until a stop word, sentence-ending punctuation, or 8-word cap is hit — deliberately punctuation-independent.

### B3 — Grammar check

Per-category heuristic verification of the extracted value:

| Category | Check |
|---|---|
| person_name | Length ≥ 2, doesn't start with digit |
| age | Must start with digits |
| dob | Must contain digits |
| location | PH place name match OR word ≥ 3 chars that isn't a stop word |
| health | Value must include a medical gazetteer term |
| religion | Value must include a nationality/religion gazetteer term |
| financial | Value must include digits or a financial gazetteer term |

### PH Address DB

`ph-address-db.js` provides `matchesAny(text)` and `findMatches(text)` over ~200 Philippine place names (17 regions, 82 provinces, 100+ cities/municipalities), sorted longest-first to prevent shorter names shadowing longer ones.

---

## 8. UI Components

All elements are injected into the host page DOM with `all: initial` CSS reset. They never modify the page's own layout — all are `position: fixed`.

### Badge (`#tp-badge`)

- Anchored to the **bottom-left of the composer card**, 6px below it
- `pointer-events: none` — never intercepts clicks
- Repositioned on scroll and resize
- Always visible while typing (scanning → result states)

| State | Background | Label |
|---|---|---|
| Scanning | Light grey | TrustPrompt is scanning… |
| Safe | Light green | Safe — no issues found |
| Low | Light yellow | Low risk detected |
| moderate | Light orange | moderate risk detected |
| High | Light red | High risk detected |

### Bottom bar (`#tp-bar`)

- Shown for low, moderate, high only
- Same width as the composer card (capped at input width × 1.05, max 760px)
- Positioned below the badge (badge height + gap offset)

| Risk level | Behavior |
|---|---|
| Low / moderate | Clickable — opens the inline detail panel |
| High | Display-only (`cursor: default`, no click handler) — details are in the Chrome side panel |

### Inline detail panel (`#tp-panel`)

- `position: fixed`, 340px wide, full height, right side, `z-index: 99999`
- Semi-transparent overlay covers the rest of the page; click-outside closes it
- Opened by clicking the bar (low/moderate only)
- **Never opened for high risk** — suppressed in `update()`, and any open instance is closed when risk escalates to high

Contents per tier:

| Tier | Contents |
|---|---|
| Low | Finding cards (label, detected value, "Why flagged?" expandable), "No action required" footer |
| moderate | Finding cards + safe version, "Send Anyway" + "Refresh Rules" buttons |
| High | Finding cards + safe version, "Copy Safe Version" + "Send Anyway" + "Refresh Rules" buttons |

### Chrome side panel (`sidepanel.html`)

- Opened via `chrome.sidePanel.open()` — either automatically (high risk, once per escalation) or manually (toolbar icon click)
- Separate browser-managed frame — cannot layout-conflict with the page
- Close button (`×`) in header calls `window.close()` — closes the panel entirely
- Contents: status banner, scrollable findings list, Copy Safe Version (high only), Send Anyway, Refresh Rules, risk legend

---

## 9. Alert Fatigue Mitigations

| Mechanism | Where | Effect |
|---|---|---|
| 400ms input debounce | `dom-claude.js`, `dom-chatgpt.js` | Scan fires only after user pauses, not per keystroke |
| 120ms observer debounce | Both DOM drivers | MutationObserver doesn't re-trigger on every React DOM burst |
| `lastScannedText` guard | Both DOM drivers | Skips re-scan if text hasn't changed (focus events, scroll, attribute changes) |
| Skip-re-render guard | `update()` in `ui.js` | No UI teardown/rebuild if risk level and finding count are unchanged |
| High-risk auto-open gate | `background.js` (`highRiskAutoOpened` Set) | Side panel auto-opens once per escalation, not on every scan tick |
| Gate reset on `none` | `background.js` | If user removes sensitive data, next high-risk event opens the panel again |
| Gate reset on navigation | `background.js` `tabs.onUpdated` | Fresh page load allows auto-open again |
| High bar is display-only | `ui.js` `showBar()` | High risk bar doesn't invite further interaction — side panel is the single action point |
| Inline panel suppressed for high | `ui.js` `update()` | No duplicate panel — high risk has exactly one place: the Chrome side panel |

---

## 10. Submit Blocking

Both DOM drivers intercept Enter key presses and send button clicks **before** the AI site's own event handlers fire, using `capture: true` listeners.

### State machine

```
IDLE ──► PENDING ──► SCANNING ──► DONE
  ▲          │ (400ms)      │
  └──────────┴──────────────┘ (reset on onInput)
```

### Submit intercept flow

```
User presses Enter or clicks Send
         │
         ▼
handleSubmitAttempt(e)
  e.preventDefault()  ← blocks default submission
         │
         ▼
awaitScan()  resolves based on state:
  DONE     → Promise.resolve(lastResult)
  SCANNING → stores resolver in pendingSubmitResolver
               triggerScan() calls it when done
  PENDING/IDLE → cancel debounce, scan immediately
         │
         ▼  result arrives
  riskLevel === "none"?
    YES → releaseSubmit()  ← allow through
    NO  → do nothing       ← submission stays blocked
                             user must use "Send Anyway"
```

### Release mechanics differ by site

| Site | Release method | Why |
|---|---|---|
| ChatGPT | Dispatch synthetic `KeyboardEvent` with `_tpRelease: true` on promptBox, or click send button | React accepts synthetic events from outside its tree |
| Claude | Always click the actual send button directly | ProseMirror ignores synthetic KeyboardEvents from outside React's tree |

Claude also attaches a second keydown listener **directly on the promptBox element** in capture phase, ensuring it fires before ProseMirror's own handlers.

---

## 11. Message Passing

```
Content Script                    background.js              Side Panel
──────────────                    ─────────────              ──────────

CONTENT_SCRIPT_READY ────────────► setBadge("active")

[user types]
SCAN_SCANNING ───────────────────► setBadge("scanning")
                                   relay SCAN_SCANNING ──────► setStatus("scanning")

[scan completes]
SCAN_RESULT {                     ► setBadge(riskLevel)
  riskLevel,                        [high + not gated]:
  findings,                           sidePanel.open(tabId)
  rawText                             add to gate
} ───────────────────────────────   relay SCAN_RESULT ────────► setStatus(riskLevel)
                                                                 renderFindings()

SCAN_CLEARED ────────────────────► setBadge("none")
                                   relay SCAN_CLEARED ────────► setStatus("none")
                                                                 renderFindings([])

OPEN_SIDE_PANEL ─────────────────► chrome.sidePanel.open()

REFRESH_RULES ───────────────────► clear cache + fetchRules()
                                   sendResponse({ ok, rules })

                                   Side Panel → Content Script:
SEND_ANYWAY ◄────────────────────────────────────────────────── "Send Anyway" click
```

Background.js relays scan results by broadcasting via `chrome.runtime.sendMessage()`. The side panel listens on `chrome.runtime.onMessage` — it receives results for the currently active tab automatically.

---

## 12. Known Issues & Limitations

### High severity

**1. Two divergent scoring engines**
`scanner.js` (fallback) and `trust-worker.js` (primary) use completely different base score scales, multiplier formulas, and thresholds. The same prompt can produce different risk levels depending on which path runs. Worker path dominates in practice but the inconsistency means fallback behavior is unpredictable.

**2. "Send Anyway" in side panel does not release blocked submit**
Neither `dom-claude.js` nor `dom-chatgpt.js` handles the `SEND_ANYWAY` message from `sidepanel.js`. Clicking "Send Anyway" in the Chrome side panel updates the side panel UI only — the blocked submit on the page is not released, and the bar/badge remain. Users must use the inline panel's "Send Anyway" button to actually allow the submission.

### moderate severity

**3. Firebase rules URL is a placeholder**
`background.js`: `FIREBASE_RULES_URL = "https://YOUR_PROJECT.web.app/trustprompt-rules.json"` — fetch always fails. The "Refresh Rules" button is a no-op. Rules never update dynamically.

**4. Worker skips mathematical validation**
`validator-wrapper-worker.js` always returns `true` except for PH address checks. This means the worker path can return false positives for items that fail Luhn (credit cards), RFC5322 (emails), JWT structure, IP format, and MAC format checks. The main-thread fallback correctly rejects these.

**5. moderate-risk prompts are permanently blocked with no auto-release**
`handleSubmitAttempt()` only releases if `riskLevel === "none"`. moderate-risk content (e.g. a single email address) blocks submission indefinitely unless the user opens the inline panel and clicks "Send Anyway". There is no timeout or passive release path.

### Low severity

**6. Dead code in repository**
`content-script.js` and `content-script-chatgpt.js` are legacy scripts never loaded by the manifest. They implement an older, simpler scan pipeline and a different UI approach. They will cause confusion if someone tries to reference them.

**7. No replay of last scan result when side panel opens**
When the side panel opens mid-session (e.g. user clicks toolbar icon after typing), it shows "Idle" until the next scan result arrives. There is no mechanism to request the current scan result from the content script.

**8. `reason` field not in worker findings**
`trust-worker.js`'s `runPathA()` does not copy `pattern.reason` into findings. `ui.js` works around this by using its internal `WHY` map keyed by `patternId` — but the data model is inconsistent between the two paths.

---

## 13. Public APIs

### `TrustNormalizer` — `normalizer.js`

```js
TrustNormalizer.normalize(rawText)
  // → { masked, textRegex, textNLP, wasCapsConverted }
```

### `TRUSTPROMPT_PATTERNS` — `patterns.js`

```js
// Frozen Array<{ id, label, regex, risk, validate, sanitize, reason }>
TRUSTPROMPT_PATTERNS
```

### `TrustValidator` — `validator-wrapper.js`

```js
TrustValidator.validate(validatorName, rawMatch)  // → boolean
```

### `TrustGazetteer` — `gazetteer.js`

```js
TrustGazetteer.scan(normalisedText)
  // → Array<{ patternId, label, risk, rawMatch, safeVersion, source }>
```

### `PH_ADDRESS_DB` — `ph-address-db.js`

```js
PH_ADDRESS_DB.matchesAny(text)   // → boolean
PH_ADDRESS_DB.findMatches(text)  // → string[]
```

### `TrustScanner` — `scanner.js`

```js
TrustScanner.scan(rawText)
  // → { findings, riskLevel, score, governance, normalisedText, wasCapsConverted }
```

### `TrustWorkerBridge` — `worker-bridge.js`

```js
TrustWorkerBridge.scan(rawText)
  // → Promise<{ findings, riskLevel, score, normalisedText, wasCapsConverted, elapsedMs }>
```

### `TrustUI` — `ui.js`

```js
TrustUI.update(riskLevel, findings, safeText, inputEl, _composerEl, onSendAnyway)
TrustUI.setScanning(inputEl)
TrustUI.reset(inputEl)
TrustUI.teardown()
TrustUI.removePanel()

// Constants
TrustUI.ID_BADGE   // "tp-badge"
TrustUI.ID_BAR     // "tp-bar"
TrustUI.ID_PANEL   // "tp-panel"
```

---

## 14. Sample Test Prompts

### Low risk
```
Name: Maria Santos
Age: 28
Civil Status: Single
Can you help me write a short personal introduction for a job application?
```

```
I work near Barangay Bagong Lipunan, Quezon City. What are some good lunch spots nearby?
```

### Moderate risk
```
My email is maria.santos@gmail.com. Can you help me write a follow-up email to a client who hasn't responded in two weeks?
```

```
Our dev server is at 192.168.1.200. Help me write an incident report for a network disruption that happened this afternoon.
```

```
My number is 09271234567. Draft a professional text message I can send to reschedule a client meeting.
```

### High risk — triggers auto side panel open
```
api_key = "sk-proj-aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890abcd"
I keep getting a 401 Unauthorized error. Here's my config — what am I doing wrong?
```

```
password = "S3cur3P@ss!"
I'm locked out of the admin dashboard. Can you help me debug this login function?
```

```
My email is juan.reyes@company.com and my mobile number is 09181234567.
Can you help me fill out this registration form?
```

---

*TrustPrompt v0.0.4 — Prompt privacy shield for AI assistants*
