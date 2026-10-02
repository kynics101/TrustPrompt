# TrustPrompt Risk Scoring Framework

## Source
Defined in Capstone Manuscript Chapter 3 — Risk Scoring and Data Masking Implementation (pp. 87–103).  
Grounded in **NIST SP 800-122** (confidentiality impact) and **RA 10173 Section 3(g)** (cumulative identifiability).

---

## Overview

The Privacy Disclosure Risk Assessment Engine translates detected entities into a quantifiable privacy disclosure severity level through a **five-step process**:

1. Assign Base Entity Score per distinct eligible entity type
2. Sum base scores across all distinct entity types
3. Apply the Distinct Entity-Type Multiplier
4. Map pre-governance score to a preliminary classification
5. Apply governance rules to produce the final severity level

---

## Step 1 & 2 — Base Entity Scores (NIST SP 800-122) (Table 10)

Each **distinct validated entity type** is assigned one base score. The same type detected multiple times is counted **once**.

| Impact Tier                | Base Score | Entity Types Included |
|----------------------------|------------|----------------------|
| **High (Critical)**        | 10         | API keys & tokens, Credit/Debit card numbers, Philippine Government IDs (TIN, SSS, GSIS, PhilHealth, PhilID, Passport, UMID, PRC, NBI Clearance, Police Clearance, PSA Certificate, Barangay Clearance, COMELEC Voter's ID, Driver's License) |
| **Moderate (Significant)** | 5          | Email addresses, Philippine mobile phone numbers, International phone numbers, Philippine physical addresses, Source code blocks |
| **Low (Limited)**          | 2          | Personal names, Organizational names, Job titles/roles, Departments, MAC addresses, IP addresses |

> **Context Indicators** (ethnic origin, medical terms, financial terms) detected via gazetteer — assigned **no independent score**. They do not confirm that personal information belongs to an identifiable individual. Their role is limited to the Sensitive-Context Co-occurrence governance rule.

---

## Step 3 — Distinct Entity-Type Multiplier (RA 10173 §3(g)) (Table 12)

Applied to the **summed base score** to reflect the increased identifiability when multiple different types of information are disclosed together.

| Distinct Entity Types Detected | Multiplier | Disclosure-Diversity Level         |
|-------------------------------|------------|------------------------------------|
| 1 type                        | × 1.00     | Single-type disclosure             |
| 2 types                       | × 1.20     | Limited multi-type disclosure      |
| 3 types                       | × 1.40     | Moderate multi-type disclosure     |
| 4 types                       | × 1.70     | High multi-type disclosure         |
| 5+ types                      | × 2.00     | Extensive multi-type disclosure    |

**Formula:**
```
Risk Score = (Σ Base Entity Score per distinct eligible entity type) × Distinct Entity-Type Multiplier
```

---

## Step 4 — Preliminary Classification Thresholds (Table 13)

| Preliminary Risk Level | Score Range (Pre-Governance) | Interpretation |
|------------------------|------------------------------|----------------|
| **No Risk**            | 0                            | No supported validated entity detected |
| **Low**                | 2 – 4.99                     | Limited information or low-impact identifiers with low standalone identifiability |
| **Moderate**           | 5 – 14.99                    | Direct personal information or a combination of identifying entities not yet reaching the breadth associated with High disclosure |
| **High**               | 15+                          | Strong breadth of disclosure, reflecting the presence of multiple distinct entity types within a single prompt |

> The classification is **preliminary** — governance rules evaluated in Step 5 may escalate, cap, or retain it.

> **Design note:** No combination of two distinct non-critical entity types, and no combination of three types where at most one is Moderate-impact, can reach a pre-governance score of 15. A prompt without a validated critical entity therefore reaches High only through disclosures of at least three distinct entity types.

---

## Step 5 — Final Severity

After governance rules are applied (see `governance-rules.md`), the result becomes the **final privacy-disclosure risk level**.

---

## System Responses by Final Risk Level (Table 16)

| Final Risk Level | System Response |
|-----------------|-----------------|
| **No Risk**     | Green badge. Prompt proceeds without interruption. Tier: Allow. |
| **Low**         | Yellow badge. Allow submission; optional passive notice. Tier: Allow. |
| **Moderate**    | Orange badge. Notify user; show detected entity types and risk disclosure explanation. Tier: Notify. |
| **High**        | Red badge. Warning + recommended masked version of the prompt. User may either proceed with original or copy masked version. Tier: Warn. |

---

## Context Indicators (Table 11)

Ethnic origin, medical, and financial context terms are identified via gazetteer wordlist lookup. They receive **no independent base score**.

| Context Type  | Examples                                    | Scoring Treatment    |
|---------------|---------------------------------------------|----------------------|
| Ethnic origin | Ilocano, Cebuano, Bicolano                  | No independent score |
| Financial     | Salary, loan, payment, debt                 | No independent score |
| Medical       | Diagnosis, treatment, medication            | No independent score |

Their separate treatment allows the system to recognize potentially privacy-relevant sensitive context without assigning them the same weight as validated personal identifiers. They participate only in the Sensitive-Context Co-occurrence governance rule.

---

## Worked Examples: Risk Scoring Scenarios (Table 17)

| Scenario | Distinct Types | Base Score | Computation | Governance Result | Final Risk |
|----------|----------------|------------|-------------|-------------------|------------|
| Personal name only | 1 | 2 | 2 × 1.00 = 2.00 | n/a | Low |
| Email address | 1 | 5 | 5 × 1.00 = 5.00 | n/a | Moderate |
| Personal name + Email address | 2 | 7 | 7 × 1.20 = 8.40 | n/a | Moderate |
| Email + Organization + Job title | 3 | 9 | 9 × 1.40 = 12.60 | n/a | Moderate |
| Personal name + Email + Phone number | 3 | 12 | 12 × 1.40 = 16.80 | n/a | High |
| Validated Philippine Passport number | 1 | 10 | 10 × 1.00 = 10.00 (Preliminary: Moderate) | Strongly Validated Critical-Entity Rule applies | High |
| Credit card number + personal name | 2 | 12 | 12 × 1.20 = 14.40 (Preliminary: Moderate) | Strongly Validated Critical-Entity Rule applies | High |
| Name + Organization + Job title + Department + IP address | 5 | 10 | 10 × 2.00 = 20.00 (Preliminary: High) | Low-Impact Entity Cap applies | Moderate |
| Name + Medical Context Term | 1 (scored) | 2 | 2 × 1.00 = 2.00 (Preliminary: Low) | Sensitive-Context Co-occurrence applies | Moderate |
| Financial Term only | 0 | 0 | 0 | Rule does not apply | No Risk |

---

## Evidence Source Reliability Classification (Table 6)

The scoring engine only processes entities that pass the reliability filter. **Low reliability detections are dropped** and never forwarded to the risk engine.

| Evidence Source              | Reliability | Assignment Rule |
|------------------------------|-------------|-----------------|
| RegEx + Validator.js         | High        | Pattern matched and mathematically validated (e.g., Luhn check on credit cards) |
| Gazetteer exact match        | High        | Exact match against controlled wordlist |
| Gazetteer fuzzy match        | Moderate    | Accepted through ≥ 0.8 Levenshtein similarity threshold |
| Compromise.js / NLP-based    | Moderate    | Grammar-based NER without structural validation |
| RegEx match, validator fails | Low         | Format matched RegEx but mathematical check failed → **DROPPED** |
| Gazetteer fuzzy below 0.8    | Low         | Similarity below threshold → **DROPPED** |

---

## Structural Heuristics — Source Code Block Detection

Source code is classified as a **Moderate-impact** entity (score = 5). Detection uses weighted structural features:

| Feature                          | Weight | Evidence Type |
|----------------------------------|--------|---------------|
| Import/require statement         | 3      | Strong        |
| Code keywords                    | 3      | Strong        |
| Braces `{}`                      | 2      | Strong        |
| Function-call pattern            | 2      | Strong        |
| Consistent indentation           | 2      | Moderate      |
| Semicolon line-terminator        | 1      | Weak          |
| Assignment/comparison operators  | 1      | Weak          |
| camelCase/snake_case identifiers | 1      | Weak          |
| Comment markers                  | 1      | Weak          |
| Line density                     | 1      | Weak          |

**Classification rule:** Total score ≥ 6 **AND** at least one Strong indicator present.

---

## Key Design Constraints

- All scoring executes **locally within the browser** — no prompt content is transmitted externally during scanning.
- Context indicators (ethnic origin, medical, financial terms) carry **no independent base score** and cannot independently trigger any risk level.
- The multiplier is applied to the **sum of distinct entity type scores**, not to the count of individual entity instances. Repeated entities of the same type are deduplicated before scoring.
- Scores, multiplier values, and thresholds are **researcher-defined operational parameters** grounded in NIST SP 800-122 and RA 10173 principles, subject to validation during testing.
- The `risk` field on a finding object is used only for UI display. **All scoring uses `BASE_SCORES[patternId]` exclusively** — the `risk` string field is never used in the scoring formula.
