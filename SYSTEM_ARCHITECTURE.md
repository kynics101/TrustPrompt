# TrustPrompt — System Architecture Flow

**Version:** 0.0.4 (Manifest V3 Chrome Extension)  
**Targets:** ChatGPT (`chatgpt.com`, `chat.openai.com`), Claude (`claude.ai`)

---

## 1. High-Level Component Map

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BROWSER TAB  (chatgpt.com / claude.ai)                                      │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  CONTENT SCRIPT LAYER  (Isolated World)                              │    │
│  │                                                                       │    │
│  │  manifest.json ──loads──►  lib/validator.min.js                      │    │
│  │                            ph-address-db.js                          │    │
│  │                            normalizer.js        ◄─ TrustNormalizer   │    │
│  │                            patterns.js          ◄─ TRUSTPROMPT_PATTERNS│  │
│  │                            gazetteer.js         ◄─ TrustGazetteer    │    │
│  │                            linguistic-detector.js◄─ TrustLinguisticDetector│
│  │                            validator-wrapper.js  ◄─ TrustValidator   │    │
│  │                            scanner.js           ◄─ TrustScanner      │    │
│  │                            worker-bridge.js     ◄─ TrustWorkerBridge │    │
│  │                            ui.js                ◄─ TrustUI           │    │
│  │                            dom-chatgpt.js  (ChatGPT) ──OR──           │    │
│  │                            dom-claude.js   (Claude)                  │    │
│  └──────────────────────────────────────────────────────────────────────┘    │
│                                                                               │
│  ┌─────────────────────────────────┐                                         │
│  │  WEB WORKER  (trust-worker.js)  │  (spawned from worker-bridge.js)        │
│  │  importScripts:                 │                                          │
│  │    normalizer.js                │                                          │
│  │    patterns.js                  │                                          │
│  │    validator-wrapper-worker.js  │                                          │
│  │    gazetteer.js                 │                                          │
│  │    ph-address-db.js             │                                          │
│  │    linguistic-detector.js       │                                          │
│  └─────────────────────────────────┘                                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  EXTENSION BACKGROUND  (Service Worker)                                      │
│  background.js                                                               │
│   • Badge colour / text management                                           │
│   • SCAN_RESULT relay → Side Panel                                           │
│   • Auto-open side panel on High risk                                        │
│   • Firebase rules fetch (cached, 1-hour TTL)                                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  SIDE PANEL  (sidepanel.html + sidepanel.js)                                 │
│   • Receives SCAN_RESULT from background.js                                  │
│   • Displays findings list, risk badge, masked prompt                        │
│   • "Copy Masked Version" / "Send Anyway" actions                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. End-to-End Scan Flow

```
User types in ChatGPT / Claude prompt box
        │
        ▼
 dom-chatgpt.js / dom-claude.js
  attachListeners() — input / paste / keydown
        │
        │  [400 ms debounce]
        ▼
  onInput() → scanState = PENDING
        │
        │  debounce fires
        ▼
  triggerScan(rawText)
        │
        ▼
  TrustWorkerBridge.scan(rawText)          [worker-bridge.js]
   ├─ workerAlive? ──NO──► scanOnMainThread(rawText) ──────────────────────┐
   │                         uses TrustScanner.scan() directly             │
   └─ YES ──► worker.postMessage({ type:"SCAN", rawText, scanId })         │
               │                                                            │
               ▼                                                            │
        Web Worker  (trust-worker.js)  ──────────────────────────────────┐ │
         runPathA(textRegex)   ← regex + structural validator            │ │
         TrustGazetteer.scan(textNLP)  ← Path B                         │ │
         TrustLinguisticDetector.scan(textNLP)  ← Path C                │ │
         mergeAndDedupe(A, B, C)                                         │ │
         suppressPlaceholders()                                          │ │
         computeRiskScore()     ← RAE 5-step model                      │ │
         postMessage({ type:"RESULT", ... })                             │ │
        └──────────────────────────────────────────────────────────────┘ │
               │                                                          │
               ▼                                                          │
  TrustWorkerBridge.onWorkerMessage()                                     │
        │                                                                  │
        └──────────── both paths converge here ────────────────────────────┘
        │
        ▼
  applyResult(result, rawText)           [dom-chatgpt.js / dom-claude.js]
   ├─ buildSafeText()  — replace findings with safeVersion strings
   ├─ TrustUI.update(riskLevel, findings, safeText, ...)
   └─ chrome.runtime.sendMessage({ type:"SCAN_RESULT", riskLevel, findings })
        │
        ├──────────► background.js
        │              setBadge(tabId, riskLevel)
        │              if riskLevel === "high" → chrome.sidePanel.open()
        │              chrome.runtime.sendMessage(→ side panel)
        │
        └──────────► Side Panel (sidepanel.html)
                       render findings, risk badge, masked prompt
```

---

## 3. Detection Engine — Three-Path Pipeline

All three paths run on the **same normalised text** produced by `normalizer.js`.

```
rawText
   │
   ▼
TrustNormalizer.normalize(rawText)        [normalizer.js]
   ├─ sharedLayer()    → NFKC, invisible chars stripped, CRLF→LF
   ├─ regexLayer()     → textRegex  (code-block isolation, digit separators,
   │                                  smart-quote normalisation, whitespace collapse)
   └─ linguisticLayer()→ textNLP    (full whitespace→space, sentence-case
                                      estimation, punctuation normalisation)
   │
   ├──────────────── PATH A ─────────────────────────────────────────────────
   │  Input: textRegex
   │  Engine: TRUSTPROMPT_PATTERNS  [patterns.js]
   │    for each pattern → RegExp match → TrustValidator.validate()
   │    structuralValidate() hook for vendor-prefixed API keys
   │    Shannon entropy pre-check (minEntropy threshold)
   │  Output: findings[]  { patternId, label, risk, rawMatch, safeVersion,
   │                         validated:true/false, source:"A_regex" }
   │
   ├──────────────── PATH B ─────────────────────────────────────────────────
   │  Input: textNLP
   │  Engine: TrustGazetteer.scan()  [gazetteer.js]
   │    B1 — Wordlist scan (exact + fuzzy ≥0.80 Levenshtein):
   │          GAZETTEER.medical, .financial, .nationality_religion
   │          → patternId: "gazetteer_medical" | "gazetteer_financial"
   │                       | "gazetteer_nationality_religion"
   │    B2 — Trigger-phrase scan (TRIGGERS array):
   │          person_name, age, dob, location, health, employer,
   │          religion, financial
   │          → patternId: "trigger_<category>"
   │          → grammarCheck() + analyzeTermContext() semantic filter
   │  Output: findings[]  { patternId, label, risk, rawMatch, safeVersion,
   │                         validated:false, source:"B_gazetteer" }
   │
   └──────────────── PATH C ─────────────────────────────────────────────────
      Input: textNLP
      Engine: TrustLinguisticDetector.scan()  [linguistic-detector.js]
        • compromise.js NER  (if available) — persons, jobs, orgs
        • Honorific patterns — "Ms Padua", "Dr. Santos"
        • Appositive phrases — "is the head of OICT"
        • Trigger-phrase fallback regex
      Output: findings[]  { patternId: "nlp_person_name"|"nlp_job_title"
                                        |"nlp_organization",
                             validated:false, source:"C_linguistic" }
```

---

## 4. Merge, Deduplication & Suppression

```
mergeAndDedupe(pathA, pathB, pathC, sourceCode)     [scanner.js / trust-worker.js]
   │
   │  Key: "patternId:rawMatch.toLowerCase()"
   │  — preserves DISTINCT entity types that match the same text token
   │    (e.g. trigger_person_name + nlp_person_name on "John" → TWO entries)
   │  — collapses same-type duplicates; highest risk wins
   │
   ├─ UMID / SSS overlap filter:
   │    if ph_id_sss rawMatch is a substring of a ph_id_umid match → drop SSS
   │
   ▼
suppressPlaceholders()
   │  Drops matches whose rawMatch is a known placeholder
   │  (e.g. "example@email.com", "192.168.x.x", "sk-xxxx...")
   ▼
findings[]  — clean, deduplicated, ready for scoring
```

---

## 5. Privacy Disclosure Risk Assessment Engine (RAE)

Implemented identically in both `scanner.js` (main-thread path) and `trust-worker.js` (worker path).  
Authoritative specification: `.kiro/steering/risk-scoring.md` and `.kiro/steering/governance-rules.md`.

```
computeRiskScore(findings)
   │
   ├─ STEP 1 & 2: Base Scores  [BASE_SCORES map]
   │    Filter scorable findings: BASE_SCORES[patternId] > 0
   │    Deduplicate by patternId (same type counted once)
   │    Sum base scores across distinct types
   │
   │    Score = 10  → credit_card, jwt, api_key, id_label,
   │                   ph_id_philid, ph_id_umid, ph_id_passport, ph_id_prc,
   │                   ph_id_postal, ph_id_pwd, ph_id_senior_citizen,
   │                   ph_id_gsis, ph_id_sss, ph_id_philhealth,
   │                   ph_id_drivers_license, ph_id_voters
   │    Score =  5  → email, ph_mobile, phone_intl, ph_address, source_code
   │    Score =  2  → ipv4, ipv6, mac_address, personal_label,
   │                   trigger_person_name, trigger_age, trigger_dob,
   │                   trigger_employer, trigger_location, trigger_religion,
   │                   nlp_person_name, nlp_job_title, nlp_organization
   │    Score =  0  → trigger_health, trigger_financial,
   │                   gazetteer_medical, gazetteer_financial,
   │                   gazetteer_nationality_religion
   │                   (context indicators — Rule 2 participation only)
   │
   ├─ STEP 3: Multiplier  [getMultiplier(distinctTypeCount)]
   │    1 type  → ×1.00     3 types → ×1.40     5+ types → ×2.00
   │    2 types → ×1.20     4 types → ×1.70
   │
   │    preScore = Σ(base scores) × multiplier
   │
   ├─ STEP 4: Preliminary Classification  [preliminaryClass(preScore)]
   │    0          → "none"
   │    2 – 4.99   → "low"
   │    5 – 14.99  → "moderate"
   │    15+        → "high"
   │
   ├─ STEP 5: Governance Rules  [evaluateGovernance(findings, preliminary)]
   │    Evaluated in strict decision order — first match wins:
   │
   │    Rule 1 — Critical Entity
   │      ENTITY_TIER[patternId] === "critical" AND validated === true
   │      → escalate to HIGH regardless of preScore
   │
   │    Rule 2 — Sensitive-Context Co-occurrence
   │      hasScoredEntity (BASE_SCORES > 0)
   │      AND hasSensitiveContext (SENSITIVE_CONTEXT_IDS match)
   │      → raise preliminary by one level (Low→Moderate, Moderate→High)
   │
   │    Rule 3 — Low-Impact Entity Cap
   │      all scored findings have BASE_SCORES === 2 (no Moderate or Critical)
   │      → cap final result at Moderate
   │
   │    Rule 4 — Retain preliminary (no rule matched)
   │
   └─ finalClass(preliminary, governance)  → riskLevel
        "none" | "low" | "moderate" | "high"
```

---

## 6. Submit Interception Flow

```
User presses Enter / clicks Send
        │
        ▼
dom-chatgpt.js / dom-claude.js  handleSubmitAttempt(e)
        │
        ├─ e.preventDefault() + e.stopImmediatePropagation()
        │
        ├─ scanState === PENDING?
        │     YES → showToast("Starting scan…")
        │           clearTimeout(debounce)
        │           triggerScan(raw) immediately
        │
        └─ scanState === DONE / SCANNING?
              → click send button to release submit
              (badge already shows risk level; user has full autonomy)

chrome.runtime.onMessage "SEND_ANYWAY"  (from side panel)
        → reset state, clear alert, re-allow submission
```

---

## 7. Background ↔ Content Script Messaging

All messages flow through `chrome.runtime.sendMessage / onMessage`.

| Message Type | Direction | Purpose |
|---|---|---|
| `CONTENT_SCRIPT_READY` | Content → Background | Set badge to "ON" on load |
| `SCAN_SCANNING` | Content → Background | Set badge to "…" (scanning) |
| `SCAN_RESULT` | Content → Background | Send findings + riskLevel; badge colour + side panel update |
| `SCAN_CLEARED` | Content → Background | Prompt cleared; reset badge to green |
| `UPDATE_BADGE` | Content → Background | Legacy badge-only update |
| `OPEN_SIDE_PANEL` | Content → Background | User clicked badge/alert → open panel |
| `REFRESH_RULES` | Side Panel → Background | Re-fetch Firebase rules |
| `SEND_ANYWAY` | Side Panel → Content | User clicked "Send Anyway" on High-risk panel |
| `SCAN_RESULT` (relayed) | Background → Side Panel | Forward findings for panel rendering |

---

## 8. Worker Initialisation & Fallback

```
worker-bridge.js  initWorker()
   │
   ├─ DISABLED (current state): workerAlive = false
   │    All scans → scanOnMainThread() → TrustScanner.scan()
   │
   ├─ Strategy 1 (when enabled): Blob trampoline
   │    Blob sets self.EXTENSION_BASE → importScripts(trust-worker.js)
   │    Avoids cross-origin Worker restriction on claude.ai
   │
   ├─ Strategy 2: Direct extension URL Worker
   │    Works on chatgpt.com; may fail on claude.ai
   │
   └─ Strategy 3: Main-thread fallback (always available)
        TrustScanner.scan() called synchronously
        Returns Promise.resolve() for caller compatibility

Timeout budget:
   ≤150 words → 1500 ms
   +200 ms per extra 100 words beyond baseline
   On timeout → fall back to main-thread scan
```

---

## 9. Source Code Detection (scanner.js)

Runs in parallel with Paths A/B/C via `runSourceCodeDetection()`.

```
extractUnformattedCodeBlocks(normalisedText)
   │
   ├─ 10-Feature Composite Scorer
   │    Strong (score 3 each): code_keywords, import_statements
   │    Strong (score 2 each): braces, function_calls (≥2)
   │    Weak  (score 1 each):  semicolons, operators, naming_conventions,
   │                            comments, indentation, line_density
   │
   │  Classification: totalScore ≥ 6  AND  strong_evidence_present
   │
   ├─ evaluateCodeRiskEscalation()
   │    API key / JWT in block → HIGH
   │    Password / DB URL → MODERATE
   │    No credentials → LOW (base)
   │
   └─ isCodeContextual()  (100-char lookahead/lookbehind)
        Trigger phrases → elevate LOW → MODERATE
        → finding: { patternId:"source_code", risk, validated:true }
```

---

## 10. UI Components

| Component | File | Scope |
|---|---|---|
| Floating badge (above textarea) | `dom-chatgpt.js` / `dom-claude.js` | Injected into AI page DOM |
| Inline alert banner | `dom-chatgpt.js` / `dom-claude.js` | Injected below prompt form |
| Toast notification | `dom-chatgpt.js` / `dom-claude.js` | Fixed-position scan status |
| Risk badge + findings panel | `ui.js` | Injected into AI page DOM |
| Side panel | `sidepanel.html` | Extension side panel (Chrome API) |
| Browser action badge | `background.js` | Toolbar icon badge (Chrome API) |

---

## 11. Reference Files

| File | Role |
|---|---|
| `manifest.json` | Extension entry point; declares permissions, content scripts, web-accessible resources |
| `background.js` | Service worker; badge, message routing, Firebase rules, side panel auto-open |
| `dom-chatgpt.js` | ChatGPT DOM driver; prompt detection, input listener, submit interception, `TrustWorkerBridge` orchestration |
| `dom-claude.js` | Claude DOM driver; same responsibilities as `dom-chatgpt.js`, Claude-specific selectors |
| `content-script-chatgpt.js` | Legacy ChatGPT content script (standalone scan + basic UI, does not use worker bridge) |
| `content-script.js` | Legacy Claude content script (standalone scan + basic UI, does not use worker bridge) |
| `worker-bridge.js` | `TrustWorkerBridge` — spawns Web Worker, manages fallback to main thread, timeout budget |
| `trust-worker.js` | Web Worker; full scan pipeline (Path A + B + C), RAE scoring, governance rules |
| `scanner.js` | `TrustScanner` — main-thread scan pipeline; source code detection; identical RAE scoring logic |
| `normalizer.js` | `TrustNormalizer` — three-layer text normalisation (shared, regex, linguistic) |
| `patterns.js` | `TRUSTPROMPT_PATTERNS` — all regex patterns with validators and sanitizers |
| `gazetteer.js` | `TrustGazetteer` — Path B; wordlist scan (medical, financial, nationality/religion) + trigger-phrase scan |
| `linguistic-detector.js` | `TrustLinguisticDetector` — Path C; compromise.js NER + honorific/appositive patterns |
| `validator-wrapper.js` | `TrustValidator` — adapter from pattern matches to validator.js checks (Luhn, RFC5322, etc.) |
| `validator-wrapper-worker.js` | `TrustValidatorWorker` — worker-safe version of the above |
| `ph-address-db.js` | `PH_ADDRESS_DB` — Philippine place name database for address detection |
| `ui.js` | `TrustUI` — in-page UI helpers (risk card, findings list, safe-text display) |
| `lib/validator.min.js` | Third-party validator.js (Luhn, email, IP, MAC, etc.) |
| `.kiro/steering/risk-scoring.md` | **Authoritative spec** — base scores, multiplier table, preliminary thresholds, Table 17 examples |
| `.kiro/steering/governance-rules.md` | **Authoritative spec** — governance rule conditions, decision order, implementation notes |

---

## 12. Data Privacy Guarantee

> All scanning executes **locally within the browser**. No prompt text, findings, or personal data is transmitted to any external server during the scan phase. The only outbound network request is a read-only fetch of detection rules from Firebase Hosting (cached, 1-hour TTL, no prompt content included).
