# TrustPrompt Governance Rules

## Source
Defined in Capstone Manuscript Chapter 3 — Risk Scoring and Data Masking Implementation (pp. 99–103).  
Grounded in **NIST SP 800-122**, **RA 10173 (Data Privacy Act of 2012)**, and DMN decision-table principles.

---

## Purpose

Governance rules address cases where the **numeric pre-governance score alone may underestimate or overstate actual disclosure risk** due to specific detection conditions. They are evaluated **after** the preliminary classification is computed and **before** the final severity level is assigned.

---

## Application Order (Table 15)

Rules are evaluated in strict decision order. **Only the first matching rule determines the outcome.** Once a higher-priority rule applies, lower-priority rules are not evaluated.

| Decision Order | Condition                                          | Result                                              |
|---------------|-----------------------------------------------------|-----------------------------------------------------|
| **1**         | Strongly Validated Critical-Entity Rule applies     | Assign as **High Risk**                             |
| **2**         | Sensitive-Context Co-occurrence Rule applies        | **Raise** preliminary level by one level (capped at High Risk) |
| **3**         | Low-Impact Entity Cap applies                       | **Cap** result at Moderate Risk                     |
| **4**         | No governance rule applies                          | **Retain** the preliminary severity level           |

---

## Rule 1 — Strongly Validated Critical-Entity Rule

### Condition
At least **one (1) strongly validated critical or access-critical entity** is detected in the prompt.

Qualifying entity types (High-impact, base score = 10):
- API keys / security tokens
- Credit/Debit card numbers (validated via Luhn algorithm)
- Philippine Government IDs: TIN, SSS, GSIS, PhilHealth, Pag-IBIG, PhilID, Passport, UMID, PRC, NBI Clearance, Police Clearance, PSA Certificate, Barangay Clearance, COMELEC Voter's ID, Driver's License

### Reliability requirement
The entity must come from a **High** reliability detection source:
- RegEx match **AND** Validator.js mathematical validation passes (`validated: true`)
- Gazetteer **exact** match

> ⚠️ Format-only candidates (RegEx matched but Validator.js failed) do **not** qualify. These are dropped at the reliability filter stage and never reach the governance engine.

### Effect
**Escalate to High Risk** — regardless of the preliminary score.

### Rationale
Any validated critical entity already yields a pre-governance score of 10.00, which falls within the Moderate range under the numeric formula. This rule ensures such entities are always classified as High Risk, as they can directly enable financial fraud, unauthorized system access, or identity compromise.

---

## Rule 2 — Sensitive-Context Co-occurrence Rule

### Condition
**All** of the following must be true in the same prompt:
1. A **trigger is present**: either
   - at least **one (1) validated personal identifier** limited to: **personal name, email address, phone number, physical address, date of birth, card number, or government ID**. Other scored types (job titles, organizations, departments, IP/MAC addresses, age, etc.) still contribute to the numeric score but are **not** valid Rule 2 triggers (e.g. "her doctor" detected as a job title must not escalate a medical-context prompt), **or**
   - an explicit **first-person self-attribution anchor** (e.g. "I was diagnosed", "I have [condition]", "my salary is"). The anchor is a trigger only: never scored, never changes the numeric base score. The bare pronoun "I" is **not** an anchor. The list covers explicit medical, financial, and ethnicity/religion self-attribution phrasings.
2. At least **one (1) non-scoring sensitive context indicator** is also present from the following categories:

| Context Type  | Examples |
|---------------|----------|
| Ethnic origin | Ilocano, Cebuano, Bicolano, Tagalog, Kapampangan, Bisaya, etc. |
| Medical       | Diagnosis, treatment, medication, hypertension, diabetes, surgery, etc. |
| Financial     | Salary, loan, payment, debt, payroll, tax filing, etc. |

Context indicators are detected via the **gazetteer wordlist** lookup and carry **no independent base score**.
3. The **Contextual Exclusion Filter does not suppress** the escalation (see below).

### Contextual Exclusion Filter
A deterministic check on the sentence(s) containing a sensitive context term. If **every** such sentence is a non-disclosure reference **and none** carries an explicit attribution, the Rule 2 escalation is **suppressed**. Only the escalation is suppressed: detected identifiers, context terms, and the numeric base score are unchanged. The filter is conservative: absence of an exclusion phrase never suppresses escalation.

| Category | Illustrative phrases |
|---|---|
| Research / academic | researching, studying, investigating, thesis, assignment, research on/about |
| Educational / informational | what is, explain, define, how does, causes of, symptoms of |
| General discussion | commonly affects, refers to, is defined as, examples of |
| Hypothetical | imagine if, suppose that, for example, hypothetically |

**Attribution override:** a clear personal disclosure in the same sentence keeps the escalation (e.g. "I have [condition]", "I was diagnosed with [condition]", "my salary is [amount]", "Carlo was diagnosed with [condition]").

Implementation: `EXCLUSION_PATTERNS`, `ATTRIBUTION_PATTERNS`, `splitSentences()`, `findSentenceContaining()`, `shouldSuppressContextEscalation(findings, fullText)`. The anchor and exclusion/attribution phrase lists are provisional and must be tuned and validated against the test dataset.

### Effect
**Raise the preliminary risk level by one level** (capped at High Risk):
- No Risk → Low **only via the first-person anchor** (e.g. "I was diagnosed with diabetes"); with no scored entity and no anchor, No Risk stays No Risk
- Low → Moderate
- Moderate → High
- High → High (already at ceiling)

### Important limitation
This rule represents **observable co-occurrence only** — it does not confirm a semantic relationship between the personal entity and the context term. The rule applies regardless because the combination increases the **potential** disclosure risk.

### Rationale
Under RA 10173, Sensitive Personal Information (SPI) encompasses health, financial, and ethnicity-related data. The co-occurrence of such context terms alongside a validated personal identifier meaningfully increases the risk of protected personal information being disclosed.

---

## Rule 3 — Low-Impact Entity Cap

### Condition
**All** of the following must be true:
1. All scored entities in the prompt are **Low-impact** (`BASE_SCORES[patternId] === 2`; the Organizational Affiliation unit has base 2 and qualifies):
   - Personal names, organizational names, job titles/departments, MAC addresses, IP addresses
2. **No Moderate or High impact entity** was detected
3. Rule 1 (Critical-Entity) does not apply

### Effect
**Cap the final result at Moderate Risk** — even if the multiplied score would otherwise reach 15+.

### Example from manuscript (Table 17)
- Name + Organization + Job title + Department + IP address = 5 distinct Low-impact types
- Score: (2+2+2+2+2) × 2.00 = 20.00 → Preliminary: High
- Low-Impact Cap applies → **Final: Moderate**

### Rationale
Heuristic detections (NLP/NER, gazetteer fuzzy matching) are more prone to false positives than structured regex+validator detections. Capping at Moderate when only low-impact entities are present prevents over-warning and preserves the High tier for prompts that genuinely contain critical or directly identifying information.

---

## Rule 4 — No Governance Rule Applies

### Condition
None of Rules 1, 2, or 3 apply.

### Effect
**Retain the preliminary severity level** as the final severity level.

---

## Final Severity → System Response Mapping (Table 16)

| Final Risk Level | Badge Color | Response Tier | User-Facing Action |
|-----------------|-------------|---------------|-------------------|
| **No Risk**     | Green       | Allow         | No interruption. Prompt may proceed. |
| **Low**         | Yellow      | Allow         | Optional passive notice. No side panel. |
| **Moderate**    | Orange      | Notify        | Side panel showing detected items, entity types, and disclosure explanation. |
| **High**        | Red         | Warn          | Side panel with detected items, explanation, **masked version of prompt**, and two buttons: "Copy Masked Version" and "Send Anyway". |

> User autonomy is preserved at all levels. TrustPrompt has **no enforcement authority** — a user who clicks "Send Anyway" on a High-risk prompt will have their original prompt submitted unmodified.

---

## Worked Decision Examples (Table 17)

| Prompt Content | Entities | Pre-Gov Score | Rule Applied | Final Level |
|---------------|----------|---------------|--------------|-------------|
| Personal name only | 1 Low (2) | 2 × 1.00 = 2.00 | None | **Low** |
| Email only | 1 Moderate (5) | 5 × 1.00 = 5.00 | None | **Moderate** |
| Personal name + Email | 2 types (7) | 7 × 1.20 = 8.40 | None | **Moderate** |
| Email + Organization + Job title | 2 units (7) | 7 × 1.20 = 8.40 | None | **Moderate** |
| Personal name + Email + Phone number | 2 units: Name + Contact (7) | 7 × 1.20 = 8.40 | None | **Moderate** |
| Email + Phone number | 1 unit: Contact (5) | 5 × 1.00 = 5.00 | None | **Moderate** |
| Organization + Job title + Department | 1 unit: Org Affiliation (2) | 2 × 1.00 = 2.00 | None | **Low** |
| Validated Philippine Passport number | 1 High (10) | 10 × 1.00 = 10.00 (Preliminary: Moderate) | Rule 1: Critical entity | **High** |
| Credit card number + personal name | 2 types (12) | 12 × 1.20 = 14.40 (Preliminary: Moderate) | Rule 1: Critical entity | **High** |
| Name + Org + Job title + Dept + IP address | 5 Low types (10) | 10 × 2.00 = 20.00 (Preliminary: High) | Rule 3: Low-Impact Cap | **Moderate** |
| Name + Medical Context Term | 1 scored (2) + 1 context | 2 × 1.00 = 2.00 (Preliminary: Low) | Rule 2: Co-occurrence → raise to Moderate | **Moderate** |
| Financial term only | 0 scored entities | 0 | None (context-only, no personal entity or anchor) | **No Risk** |
| "I was diagnosed with diabetes" | 0 scored + anchor + 1 context | 0 | Rule 2: anchor trigger → No Risk raised to Low | **Low** |
| "I am researching diabetes because I was diagnosed with it." | anchor + context | 0 | Rule 2: attribution overrides exclusion → Low | **Low** |
| "Maria is researching cancer for her thesis paper." | 1 Low (2) + context | 2 × 1.00 = 2.00 | Rule 2 suppressed by exclusion filter | **Low** |
| "Can you explain the symptoms of diabetes for my assignment?" | context only | 0 | Excluded (educational) | **No Risk** |
| "My name is Carlo and I have hypertension." | 1 Low (2) + context | 2 × 1.00 = 2.00 | Rule 2: attribution, raise Low → Moderate | **Moderate** |

---

## Implementation Notes for Developers

- Governance rules are evaluated **inside the Privacy Disclosure Risk Assessment Engine**, after the Hybrid Detection Engine returns validated entities.
- The engine receives the consolidated entity list from the **Entity Validation and Consolidation** stage (deduplicated, reliability-filtered).
- Low-reliability detections (RegEx-only fails Validator.js, fuzzy below 0.8 threshold) are **excluded before the engine runs** — they never reach governance evaluation.
- The governance decision order in Table 15 is **deterministic** — implement as a cascading `if / else-if` chain, not parallel conditions.
- Rule 2 condition 1 checks `BASE_SCORES[patternId] > 0 && isRule2TriggerEntity(patternId)`, **not** entity tier name. `isRule2TriggerEntity` uses `RULE2_TRIGGER_IDS` (`nlp_person_name`, `trigger_person_name`, `email`, `ph_mobile`, `phone_intl`, `ph_address`, `birthday_date`, `trigger_dob`, `credit_card`, `id_label`) plus any `ph_id_*` government ID. Defined identically in `scanner.js` and `trust-worker.js`. The trigger is `hasScoredEntity || hasFirstPersonAnchor(fullText)`.
- Rule 2 flow: `if (triggerPresent && hasSensitiveContext) { if (!shouldSuppressContextEscalation(findings, fullText)) return raised; }` — when suppressed, fall through to the next rule.
- `evaluateGovernance(findings, preliminary, fullText)` requires the raw prompt text.
- Governance must run for context-only findings when an anchor is present (do not early-return in `computeRiskScore` when the base total is 0 and an anchor plus context finding exist).
- Gazetteer notes: `SUPPLEMENTARY_MEDICAL_TERMS` / `mergeSupplementaryMedical()` add common terms missing from `terms-medical.js` (e.g. hypertension, cancer, surgery, medication, insulin) and must be re-merged in `rebuildGazetteers()`. `analyzeTermContext` treats "diagnosed with/as", "diagnosis of", "suffering from", "treated for" before a medical term as personal attribution.
- PATH C trigger patterns "my name is" and "call me" accept an upper-case first letter (the normalizer capitalizes the prompt's first character). Known gap: "I am Carlo" is not detected, on purpose, to avoid flagging "I am Filipino".
- Rule 3 condition checks `BASE_SCORES[patternId] === 2` for every scored finding — **do not use ENTITY_TIER string for this check**.
- Context indicators (`gazetteer_medical`, `gazetteer_financial`, `trigger_health`, `trigger_financial`) have `BASE_SCORES = 0` and are **never** included in the scorable set. They only participate in Rule 2 via the `SENSITIVE_CONTEXT_IDS` set.

## Precedence

Higher-priority governance rules shall not be overridden by lower-priority rules unless explicitly specified.

## Explainability

The system shall record which governance rule was triggered and why it affected the final severity.
