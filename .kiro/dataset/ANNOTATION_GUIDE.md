# TrustPrompt — Annotation Guide
**Version:** 0.1.0  
**Owner:** QA / Research Lead  
**Last Updated:** 2026-08-21  
**Applies To:** All batches listed in `DATASET_REGISTER.md`

---

## 1. Purpose

This guide defines the rules every annotator follows when creating, classifying, and reviewing test cases for TrustPrompt's curated dataset. Consistent annotation is what makes the dataset usable as a ground-truth benchmark. Two annotators working independently on the same sample must reach the same label ≥ 85% of the time (the inter-annotator agreement threshold).

Read this entire guide before annotating your first batch.

---

## 2. Roles

| Role | Responsibility |
|---|---|
| **Primary Annotator** | Creates the raw sample, writes the ground-truth fields, and self-reviews for obvious errors |
| **Second Annotator** | Reviews the primary annotator's cases independently, flags disagreements |
| **Adjudicator** | Resolves disagreements that the two annotators cannot resolve themselves (usually the QA lead) |

No one may be both the primary annotator and the second annotator on the same batch.

---

## 3. Annotation File Format

Each batch is stored as a **JSON Lines file** (`.jsonl`) — one JSON object per line. File naming convention:

```
<BATCH_ID>.jsonl
```

Example: `AUTH-A-001.jsonl`, `HEALTH-B2-001.jsonl`

Files live under: `.kiro/dataset/cases/<BATCH_ID>.jsonl`

### 3.1 Case Object Schema

```jsonc
{
  // ── Identification ────────────────────────────────────────────────────────
  "case_id":        "AUTH-A-001-0001",        // <BATCH_ID>-<4-digit sequence>
  "batch_id":       "AUTH-A-001",             // parent batch from DATASET_REGISTER
  "created_by":     "annotator_handle",       // GitHub handle or initials
  "created_date":   "2026-08-21",             // ISO 8601 date

  // ── Raw Sample ────────────────────────────────────────────────────────────
  "input_text": "...",                        // the exact prompt text to scan
  "language":   "en",                         // "en" | "fil" | "en-fil" (code-switched)

  // ── Ground Truth ──────────────────────────────────────────────────────────
  "case_type": "positive",                    // see Section 4
  "expected_detections": [                    // empty array [] for negative cases
    {
      "pattern_id":  "api_key",               // must match a patternId in scanner.js
      "label":       "API Key / Secret Token",
      "risk":        "high",                  // "high" | "medium" | "low"
      "raw_match":   "token=abc123xyz789...", // the exact substring that should match
      "safe_version": "token=[REDACTED-KEY]"  // expected sanitized output
    }
  ],
  "expected_risk_level": "high",              // "none" | "low" | "medium" | "high"
  "expected_score_range": [10, 99],           // [min, max] inclusive; null if not testing scorer

  // ── Detector Targeting ────────────────────────────────────────────────────
  "target_detector":  "api_key",              // primary pattern_id this case exercises
  "detection_layer":  "A-REGEX",             // "A-REGEX" | "B-GAZETTEER" | "B-TRIGGER" | "BOTH"

  // ── Sub-classification ────────────────────────────────────────────────────
  "subtype": "well_formed",                   // see Section 4.3

  // ── Annotation Metadata ───────────────────────────────────────────────────
  "annotation_notes": "",                     // optional: why this case was written
  "review_status":    "pending",              // "pending" | "approved" | "disputed"
  "reviewed_by":      null,                   // second annotator handle (null until reviewed)
  "review_date":      null,
  "dispute_notes":    null                    // filled only if review_status = "disputed"
}
```

---

## 4. Case Type Taxonomy

Every case must be assigned exactly one `case_type`. There are five types.

### 4.1 `positive` — True Positive
The input **should** trigger detection. The detector must fire on this input.

- `expected_detections` must have at least one entry.
- `raw_match` must be a substring that actually appears in `input_text` (exact copy-paste, no paraphrasing).
- The detection should be unambiguous — a reasonable annotator would always agree this is sensitive data.

**Example:**
```json
{
  "case_type": "positive",
  "input_text": "Here is my token=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456",
  "target_detector": "api_key",
  "expected_detections": [{
    "pattern_id": "api_key",
    "raw_match": "token=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ123456"
  }],
  "expected_risk_level": "high"
}
```

---

### 4.2 `negative` — True Negative
The input **should not** trigger detection. The detector must not fire.

- `expected_detections` must be an **empty array** `[]`.
- `expected_risk_level` must be `"none"` (unless other detectors in the same text would legitimately fire — in that case document them).
- Negatives must be realistic text that superficially resembles a positive (otherwise they have no diagnostic value). A blank prompt is not a useful negative.

**Example:**
```json
{
  "case_type": "negative",
  "input_text": "Please token this sentence for NLP analysis.",
  "target_detector": "api_key",
  "expected_detections": [],
  "expected_risk_level": "none"
}
```

---

### 4.3 `boundary` — Boundary / Edge Case
The input sits at the edge of a detection rule. It tests a limit condition. Boundary cases may be either true-positive or true-negative, but what makes them boundary is that they test a specific threshold or formatting edge.

Set `subtype` to one of the following:

| Subtype | Description | Example |
|---|---|---|
| `min_length` | Value at the minimum length that should detect | 13-digit card number (shortest valid Visa) |
| `max_length` | Value at or just beyond the maximum | 19-digit card number (longest valid) |
| `separator_variant` | Same value with different spacing or punctuation | `4111 1111 1111 1111` vs `4111-1111-1111-1111` vs `4111111111111111` |
| `caps_variant` | ALL-CAPS version of a normally mixed-case input | `MY NAME IS JUAN DELA CRUZ` |
| `unicode_variant` | Fullwidth digits or characters used in place of ASCII | `４１１１ １１１１ １１１１ １１１１` |
| `prefix_boundary` | Value at the exact start/end of a valid prefix range | PH mobile `09900000000` (prefix 990, valid) vs `09800000000` (prefix 980, invalid) |
| `context_boundary` | Value is sensitive only in context (would be benign alone) | `I am from Manila` (low-risk location trigger) |
| `co_occurrence` | Multiple detectors interact at a scoring boundary | `email` + `ph_mobile` crossing from MEDIUM to HIGH |

---

### 4.4 `malformed` — Malformed / Invalid Format
The input contains a value in the right structural shape but with an invalid checksum, wrong length, or other format error. The detector should **not** fire (because validators should reject it), or it should fire with degraded confidence if the pattern has no validator.

- Used primarily for patterns that have a `validate` function (`credit_card`, `email`, `jwt`, `ph_mobile`, `ipv4`, `ipv6`, `mac_address`, `ph_address`).
- For patterns without a validator (`api_key`, `password_inline`), a malformed case tests that the regex itself doesn't over-match.
- Set `case_type` to `malformed` and `expected_detections` to `[]` if the validator should reject it.

**Example:**
```json
{
  "case_type": "malformed",
  "input_text": "Card: 4111 1111 1111 1112",
  "subtype": "luhn_fail",
  "target_detector": "credit_card",
  "expected_detections": [],
  "expected_risk_level": "none",
  "annotation_notes": "Luhn check fails — last digit changed from 1 to 2"
}
```

---

### 4.5 `placeholder` — Placeholder / Dummy Value
The input contains a value that looks structurally valid but is a known placeholder, dummy, test, or example value. The detector should ideally **not** fire, or fire at a lower confidence. This case type specifically targets the placeholder/dummy-value filter that task #4 (API key / JWT patterns) will implement.

Common placeholder signatures:

| Detector | Common Placeholders |
|---|---|
| `api_key` | `YOUR_API_KEY`, `<API_KEY>`, `xxxxxxxxxxxxxxxxxxxx`, `INSERT_KEY_HERE`, `1234567890abcdef1234` |
| `password_inline` | `password=changeme`, `password=yourpassword`, `password=123456`, `password=****` |
| `jwt` | `eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.FAKE_SIGNATURE` |
| `credit_card` | `4111 1111 1111 1111` (Visa test number — Luhn-valid but publicly known test value) |
| `email` | `user@example.com`, `test@test.com`, `noreply@company.com` |
| `ph_mobile` | `09000000000`, `09999999999` |

> **Note:** Placeholder filtering is not yet fully implemented in the current codebase (it is a task #4 deliverable). For now, annotate these cases with the **expected future behavior** — i.e., `expected_detections: []` — so the test suite is ready to validate the filter once implemented. Add `"annotation_notes": "Placeholder filter not yet implemented — test will fail until task #4 is complete"` to make this clear.

---

## 5. Field-by-Field Annotation Rules

### 5.1 `input_text`
- Write text as a user would realistically type it into ChatGPT or Claude. Avoid synthetic-sounding sentence structures like "The credit card number is 1234567890123456 and the email is a@b.com." — they don't reflect real prompt patterns.
- Mix English and Filipino naturally for code-switched samples. Mark these `"language": "en-fil"`.
- For negative cases, include text that shares vocabulary or structure with the positive pattern (otherwise the negative has no diagnostic value).
- Do **not** include real PII from real people. All names, numbers, emails, and addresses must be either fully synthetic or drawn from a pre-approved test corpus.
- For medical and health cases, use condition names only (e.g. "I have diabetes") — not clinical descriptions or treatment details.

### 5.2 `raw_match`
- Must be copied exactly from `input_text` — character-for-character, including surrounding spaces if the regex would capture them.
- If the pattern's `sanitize` function trims the match, the `raw_match` should still be the full regex capture, not the sanitized version.
- For `B-TRIGGER` cases, `raw_match` is the trigger phrase plus the extracted value span, e.g. `"my name is Juan Dela Cruz"`.

### 5.3 `safe_version`
- Copy the exact output of the pattern's `sanitize()` function for the given `raw_match`.
- If you are unsure, run the pattern manually in the browser console on the test extension.
- Leave blank (`""`) for cases where `safe_version` is not relevant (e.g. negative cases).

### 5.4 `expected_risk_level`
- Use the final risk level the **scoring engine** should produce, not just the pattern's own `risk` field.
- For single-detector positive cases, the risk level matches the pattern's risk tier (high/medium/low).
- For multi-detector scoring tests, apply the governance rules mentally before writing the expected level.
- When in doubt, refer to the scoring rules in `scanner.js` — specifically `BASE_SCORES`, `getMultiplier()`, and `evaluateGovernance()`.

### 5.5 `expected_score_range`
- Only fill this in for **scoring engine test batches** (Section 3 of the register, SCORE-XXX batches).
- Set a `[min, max]` range that accounts for small floating-point rounding. A range of ±0.5 around the expected value is acceptable.
- For most individual-detector positive cases, leave as `null` — the risk level is sufficient.

### 5.6 `language`
| Value | When to Use |
|---|---|
| `"en"` | English-only input |
| `"fil"` | Filipino/Tagalog-only input |
| `"en-fil"` | Code-switched (mix of both in the same sentence) |

---

## 6. Quality Checklist — Before Submitting a Batch

Run through this checklist on every case before marking the batch as REVIEW.

- [ ] `case_id` follows the format `<BATCH_ID>-<4-digit sequence>` with no gaps
- [ ] `input_text` contains no real PII from real people
- [ ] `raw_match` is an exact substring of `input_text` (grep-verifiable)
- [ ] `expected_detections` is empty `[]` for negative, malformed, and placeholder cases (unless another detector legitimately fires)
- [ ] `expected_risk_level` reflects the scoring engine output, not just the pattern's risk field
- [ ] `case_type` is one of: `positive`, `negative`, `boundary`, `malformed`, `placeholder`
- [ ] `subtype` is filled in for all `boundary` and `malformed` cases
- [ ] Each batch contains at least **20% negative cases** and at least **20% boundary/malformed/placeholder cases** (the 20/20 rule)
- [ ] Filipino-language and code-switched cases are present in all trigger-phrase batches (at least 2 per batch)
- [ ] `annotation_notes` explains any non-obvious design decision

---

## 7. Inter-Annotator Agreement Protocol

### 7.1 Process
1. Primary annotator completes the batch and sets `review_status: "pending"` on all cases.
2. Second annotator independently assigns `expected_detections`, `expected_risk_level`, and `case_type` to each case — **without looking at the primary annotator's ground truth**.
3. Both annotators compare labels. For each case, a match requires **all three fields** to agree: `expected_detections` (same set of `pattern_id`s), `expected_risk_level` (exact match), and `case_type` (exact match).
4. Compute agreement rate: `agreed_cases / total_cases`.
5. If agreement ≥ 0.85 → set all agreed cases to `review_status: "approved"`.
6. If agreement < 0.85 → batch goes to REWORK.

### 7.2 Dispute Resolution
For cases where the two annotators disagree:
1. Both annotators write their reasoning in `dispute_notes`.
2. They attempt to resolve by referencing the code (`scanner.js`, `patterns.js`, `gazetteer.js`) directly.
3. If unresolved after one round of discussion, the adjudicator makes the final call.
4. Resolved cases: update `expected_*` fields to the agreed value, set `review_status: "approved"`.

### 7.3 Agreement Rate Calculation

```
agreement_rate = count(cases where all 3 fields match) / count(total_cases_in_batch)
```

Minimum threshold: **0.85** (85 out of every 100 cases must fully agree).

---

## 8. Synthetic Sample Generation Rules

Many batches use synthetic test data. Follow these rules to keep synthetic samples realistic and safe.

### 8.1 Names
- Use plausible Filipino names drawn from the approved name list in `NAME-B2-001` batch (source: philipperemy/name-dataset PH subset).
- For non-PH names in international tests, use names from a standard name list (e.g., the top 100 US Census first/last names).
- Never use names of real, identifiable public figures.

### 8.2 Phone Numbers
- For PH mobile: use `0917 XXX XXXX` series (Globe) or `0927 XXX XXXX` (Smart) with random last 7 digits.
- For international: use the reserved test ranges where available (e.g., UK: `+44 7700 900XXX`; US: 555 numbers).

### 8.3 Email Addresses
- Use `@example.com`, `@test.ph`, `@trustprompt.test` domains — these are IANA-reserved or clearly non-real.
- Never use a domain that resolves to a real mail server.

### 8.4 Card Numbers
- Use the published Stripe/PayPal test card numbers (e.g., `4111 1111 1111 1111`, `5500 0000 0000 0004`). These are Luhn-valid but universally known to be test values.
- For malformed cases, alter one digit to break the Luhn check.

### 8.5 API Keys / JWTs
- For API key positives: generate random 32–64 character alphanumeric strings with assignment context (e.g., `api_key=a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6`). Never use real keys.
- For JWT positives: use jwt.io to generate a token with a dummy payload (`{"sub":"test","iat":1}`) and the signing secret `"trustprompt-test"`. This produces structurally valid but meaningless tokens.

### 8.6 Addresses
- Use real barangay/municipality/city names from the PH regions dataset (the dataset itself is public data), combined with entirely fictional street numbers and street names.
- Example: `123 Fictional St., Brgy. Poblacion, Makati City` — the barangay and city are real; the street is not.

### 8.7 Medical Conditions
- Use condition names only (e.g., "diabetes", "hypertension") — never invent or describe fictional symptoms.
- All medical terms must come from the NHS A–Z approved list.

---

## 9. Special Rules by Detector

### 9.1 `api_key`, `jwt`, `password_inline` (Task #4 Targets)
These three detectors will eventually have placeholder/dummy-value filters (task #4). When annotating:
- Write one `placeholder` case per known placeholder variant (see Section 4.5 table).
- Set `expected_detections: []` to reflect intended future behavior.
- Add the note: `"Placeholder filter not yet implemented — test will fail until task #4 is complete"`.
- Do **not** skip these cases — they are the acceptance tests for task #4.

### 9.2 `credit_card`
- Always verify the Luhn check manually before marking a case `positive`. Use an online Luhn checker or the validator.js `isCreditCard` function.
- The 13-digit Visa (`4111111111111`) and 16-digit Visa (`4111111111111111`) must both appear as positive cases.
- Include at least one case for each card type: Visa (4xxx), Mastercard (51–55xx), Amex (34xx/37xx), JCB (35xx).

### 9.3 `ph_mobile`
- Valid prefixes are 900–999 (after the leading `09`). Prefix `880` is invalid — use it for boundary/malformed cases.
- Test all three format variants: `09171234567`, `+639171234567`, `639171234567`.

### 9.4 `ph_address`
- Every positive case must include both: (a) a street-type keyword (`barangay`, `brgy.`, `street`, `subdivision`, etc.) **and** (b) a real PH place name that `PH_ADDRESS_DB.matchesAny()` would confirm.
- Negatives should test false-positive traps: `"Street Fighter"`, `"Avenue Q"`, `"Drive-thru"`.

### 9.5 `context_label`
- Cover all 30+ label keywords in the regex — at least one case per keyword.
- Include Filipino-language labels: `pangalan`, `edad`, `tirahan`, `relihiyon`, `hanapbuhay`, `kasarian`.
- Test that labels without a value (`"Name: "` with nothing after the colon) do **not** fire (they shouldn't match the `+` quantifier).

### 9.6 `trigger_*` (B2 Triggers)
- Test each of the ~35 trigger phrases at least twice: once exact, once with a single-character typo (to exercise the Levenshtein fuzzy matcher).
- The typo variant should still be a positive case (fuzzy match should catch it).
- For triggers with `requireGazetteer` (e.g., `"i have"` → requires a medical term in the span):
  - Write a **negative** case where the trigger fires but the gazetteer term is absent (e.g., `"I have a question"` → should not detect).
  - Write a **positive** case where both are present (`"I have diabetes"` → should detect).

### 9.7 Gazetteer Terms (B1)
- Each term in the gazetteer word lists must have at least one positive case where it appears as a standalone word (not a substring of a longer word).
- Write at least one negative case per term that tests the word-boundary guard — e.g., `"diagnosed"` should not fire on `"undiagnosed"` because of the `\b` boundary anchor.

### 9.8 Filipino / Code-Switched Inputs
- Every trigger batch must include at least one Filipino-language input using the Filipino trigger phrases: `"nakatira ako sa"`, `"nakatira sa"`, `"address ko"`.
- For code-switched inputs, the trigger phrase may be Filipino and the value English, or vice versa.

---

## 10. What NOT to Annotate

The following are explicitly out of scope for this dataset:

- Cases requiring a live network call or authentication (the scanner runs entirely client-side).
- Cases testing the UI rendering (`sidepanel.html`) or DOM injection (`dom-claude.js`, `dom-chatgpt.js`) — those are separate integration tests.
- Performance/latency cases — the dataset tests correctness only, not speed.
- Cases involving real PII from any real person, living or deceased.
- Images, audio, or other non-text content — TrustPrompt scans text only.

---

## 11. File Storage Structure

```
.kiro/
└── dataset/
    ├── DATASET_REGISTER.md       ← batch tracker (this session)
    ├── ANNOTATION_GUIDE.md       ← this document
    ├── SOURCE_REGISTRY.md        ← upstream source catalogue
    └── cases/
        ├── AUTH-A-001.jsonl
        ├── AUTH-A-002.jsonl
        ├── AUTH-A-003.jsonl
        ├── FIN-A-001.jsonl
        ├── CONTACT-A-001.jsonl
        │   ... (one .jsonl per batch ID)
        └── SCORE-010.jsonl
```

---

## 12. Change Log

| Date | Version | Changed By | Summary |
|---|---|---|---|
| 2026-08-21 | 0.1.0 | (initial) | Created annotation guide covering all 5 case types, schema, IAA protocol, and per-detector rules |
