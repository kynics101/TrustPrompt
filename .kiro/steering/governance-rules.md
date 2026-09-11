# TrustPrompt Governance Rules

## Source
Defined in Capstone Manuscript Chapter 3 — Risk Scoring and Data Masking Implementation (pp. 99–103).  
Grounded in **NIST SP 800-122**, **RA 10173 (Data Privacy Act of 2012)**, and DMN decision-table principles.

---

## Purpose

Governance rules address cases where the **numeric pre-governance score alone may underestimate or overstate actual disclosure risk** due to specific detection conditions. They are evaluated **after** the preliminary classification is computed and **before** the final severity level is assigned.

---

## Application Order (Table 12)

Rules are evaluated in strict decision order. **Only the highest applicable rule determines the final outcome.** Once a higher-priority rule applies, lower-priority rules are not applied.

| Decision Order | Condition | Result |
|---------------|-----------|--------|
| **1** | A High-escalation rule applies | Assign as **High Risk** |
| **2** | Sensitive-Context Co-occurrence Rule applies | **Raise** preliminary level by one level (capped at High Risk) |
| **3** | Low-Impact Entity Cap applies | **Cap** result at Moderate Risk |
| **4** | No governance rule applies | **Retain** the preliminary severity level |

---

## Rule 1 — Strongly Validated Critical-Entity Rule

### Condition
At least **one (1) strongly validated critical or access-critical entity** is detected in the prompt.

Qualifying entity types (High-impact, base score = 10):
- API keys / security tokens
- Credit/Debit card numbers (validated via Luhn algorithm through Validator.js)
- Philippine Government IDs: TIN, SSS, GSIS, PhilHealth, Pag-IBIG, PhilID, Passport numbers

### Reliability requirement
The entity must come from a **High** reliability detection source:
- RegEx match **AND** Validator.js mathematical validation passes
- Gazetteer **exact** match

> ⚠️ Format-only candidates (RegEx matched but Validator.js failed) do **not** qualify. These are dropped at the reliability filter stage and never reach the governance engine.

### Effect
**Escalate to High Risk** — regardless of the preliminary score.

### Rationale
These entity types carry the highest confidentiality impact under NIST SP 800-122 and can directly enable financial fraud, unauthorized system access, or identity compromise. A single strongly validated critical entity is sufficient to warrant the highest warning level.

---

## Rule 2 — Sensitive-Context Co-occurrence Rule

### Condition
**Both** of the following must be true in the same prompt:
1. At least **one (1) validated personal entity** is detected (any entity type with an assigned base score — Low, Moderate, or High impact)
2. At least **one (1) non-scoring sensitive context indicator** is also present from the following categories:

| Context Type  | Examples |
|---------------|----------|
| Ethnic origin | Ilocano, Cebuano, Bicolano, Tagalog, Kapampangan, Bisaya, etc. |
| Medical       | Diagnosis, treatment, medication, hypertension, diabetes, surgery, etc. |
| Financial     | Salary, loan, payment, debt, payroll, tax filing, etc. |

Context indicators are detected via the **gazetteer wordlist** lookup.

### Effect
**Raise the preliminary risk level by one level** (capped at High Risk):
- No Risk → No Risk (rule does not apply without a validated personal entity)
- Low → Moderate
- Moderate → High
- High → High (already at ceiling)

### Important limitation
This rule represents **observable co-occurrence only** — it does not confirm a semantic relationship between the personal entity and the context term. A medical term and a name appearing in the same prompt may be coincidental. The rule nonetheless applies because the combination increases the **potential** disclosure risk from the user's perspective.

### Rationale
Under RA 10173, Sensitive Personal Information (SPI) encompasses health, financial, and ethnicity-related data. The co-occurrence of such context terms alongside a validated personal identifier meaningfully increases the risk that protected personal information is being disclosed — consistent with the Data Privacy Act's SPI categories and NIST SP 800-122's contextual impact considerations.

---

## Rule 3 — Low-Impact Entity Cap

### Condition
**All** of the following must be true:
1. All scored entities in the prompt are **Low-impact** (base score = 2):
   - Personal names, organizational names, job titles/departments, MAC addresses, IP addresses
2. **No Moderate or High impact entity** was detected in the prompt
3. Rule 1 (Critical-Entity) does not apply

### Effect
**Cap the final result at Moderate Risk** — even if the multiplied score would otherwise reach 10+.

### Example from manuscript (Table 14)
- Name + Organization + Job title + Department = 4 distinct Low-impact types
- Score: (2+2+2+2) × 1.70 = 13.60 → Preliminary: High
- Low-Impact Cap applies → **Final: Moderate**

### Rationale
Heuristic detections (Compromise.js grammar-based NER, gazetteer fuzzy matching) are more prone to false positives than structured regex+validator detections. Capping at Moderate when only low-impact, heuristically detected entities are present prevents over-warning the user and avoids habituation to false high-risk alerts. This preserves the High tier for prompts that genuinely contain critical or directly identifying information.

---

## Rule 4 — No Governance Rule Applies

### Condition
None of Rules 1, 2, or 3 apply.

### Effect
**Retain the preliminary severity level** as the final severity level.

---

## Final Severity → System Response Mapping

After governance rules produce the final severity level, the system responds as follows:

| Final Risk Level | Badge Color | Response Tier | User-Facing Action |
|-----------------|-------------|---------------|-------------------|
| **No Risk**     | Green       | Allow         | No interruption. Prompt may proceed. |
| **Low**         | Yellow      | Allow         | Optional passive notice. No side panel. |
| **Moderate**    | Orange      | Notify        | Optional Side panel showing detected items, entity types, and disclosure explanation. |
| **High**        | Red         | Warn          | Side panel opens with detected items, explanation, **masked version of prompt**, and two buttons: "Copy Masked Version" and "Send Anyway". |

> User autonomy is preserved at all levels. TrustPrompt has **no enforcement authority** — a user who clicks "Send Anyway" on a High-risk prompt will have their original prompt submitted to ChatGPT or Claude unmodified.

---

## Worked Decision Examples (Table 14)

| Prompt Content | Entities | Pre-Gov Score | Rule Applied | Final Level |
|---------------|----------|---------------|--------------|-------------|
| Name only | 1 Low (2) | 2.00 | None | **Low** |
| Email only | 1 Moderate (5) | 5.00 | None | **Moderate** |
| Name + Email | 2 types (7) | 7 × 1.20 = 8.40 | None | **Moderate** |
| Email + Org + Job title | 3 types (9) | 9 × 1.40 = 12.60 | None | **High** |
| Philippine Passport number (validated) | 1 High (10) | 10 × 1.00 = 10.00 | Rule 1: Critical entity | **High** |
| Name + Org + Job title + Dept | 4 Low types (8) | 8 × 1.70 = 13.60 (Pre: High) | Rule 3: Low-Impact Cap | **Moderate** |
| Name + Medical term | 1 Low scored (2) + 1 context | 2 × 1.00 = 2.00 (Pre: Low) | Rule 2: Co-occurrence → raise to Moderate | **Moderate** |
| Financial term only | 0 scored entities | 0 | None (context-only, no personal entity) | **No Risk** |

---

## Implementation Notes for Developers

- Governance rules are evaluated **inside the Privacy Disclosure Risk Assessment Engine**, after the Hybrid Detection Engine returns validated entities.
- The engine receives the consolidated entity list from the **Entity Validation and Consolidation** stage (deduplicated, reliability-filtered).
- Low-reliability detections (RegEx-only fails Validator.js, fuzzy below 0.8 threshold) are **excluded before the engine runs** — they never reach governance evaluation.
- The governance rule check runs entirely **within the Web Worker** — same thread as risk scoring, no main thread impact.
- Final severity is returned to the content script via `postMessage()` for badge and side-panel rendering.
- The governance decision order in Table 12 is **deterministic** — implement as a cascading if/else-if chain, not parallel conditions.

## Precedence

Higher-priority governance rules shall not be overridden by
lower-priority rules unless explicitly specified.

## Explainability

The system shall record which governance rule was triggered and
why it affected the final severity.
