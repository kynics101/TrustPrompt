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

## Step 1 & 2 — Base Entity Scores (NIST SP 800-122)

Each **distinct validated entity type** is assigned one base score. The same type detected multiple times is counted **once**.

| Impact Tier        | Base Score | Entity Types Included |
|--------------------|------------|----------------------|
| **High (Critical)**    | 10         | API keys & tokens, Credit/Debit card numbers, Philippine Government IDs (TIN, SSS, GSIS, PhilHealth, PhilID, Passport) |
| **Moderate (Significant)** | 5     | Email addresses, Philippine mobile phone numbers, International phone numbers, Philippine physical addresses, Source code blocks |
| **Low (Limited)**      | 2          | Personal names, Organizational names, Job titles/departments, MAC addresses, IP addresses |

> **Context Indicators** (ethnic origin, medical terms, financial terms) detected via gazetteer — assigned **no independent score**. They do not confirm that personal information belongs to an identifiable individual. Their role is limited to the Sensitive-Context Co-occurrence governance rule.

---

## Step 3 — Distinct Entity-Type Multiplier (RA 10173 §3(g))

Applied to the **summed base score** to reflect the increased identifiability when multiple different types of information are disclosed together.

| Distinct Entity Types Detected | Multiplier | Disclosure-Diversity Level |
|-------------------------------|------------|---------------------------|
| 1 type                        | × 1.00     | Single-type disclosure    |
| 2 types                       | × 1.20     | Limited multi-type disclosure |
| 3 types                       | × 1.40     | Moderate multi-type disclosure |
| 4 types                       | × 1.70     | High multi-type disclosure |
| 5+ types                      | × 2.00     | Extensive multi-type disclosure |

**Formula:**
```
Risk Score = (Σ Base Entity Score per distinct eligible entity type) × Distinct Entity-Type Multiplier
```

**Example calculations (from manuscript Table 14):**
- Personal name only → 2 × 1.00 = **2.00** → Low
- Email only → 5 × 1.00 = **5.00** → Moderate
- Name + Email → (2+5) × 1.20 = **8.40** → Moderate
- Email + Organization + Job title → (5+2+2) × 1.40 = **12.60** → High
- Name + Org + Job title + Department → (2+2+2+2) × 1.70 = **13.60** → Preliminary High (but Low-Impact Cap applies → Moderate)

---

## Step 4 — Preliminary Classification Thresholds

| Preliminary Risk Level | Score Range (Pre-Governance) | Interpretation |
|------------------------|------------------------------|----------------|
| **No Risk**            | 0                            | No supported validated entity detected |
| **Low**                | 2 – 4.99                     | Limited information or low-impact identifiers with low standalone identifiability |
| **Moderate**           | 5 – 9.99                     | Direct personal information or a limited combination of identifying entities |
| **High**               | 10+                          | Critical information, multiple identities, strong breadth, or bulk disclosure |

> The classification is **preliminary** — governance rules evaluated in Step 5 may escalate, cap, or retain it.

---

## Step 5 — Final Severity

After governance rules are applied (see `governance-rules.md`), the result becomes the **final privacy-disclosure risk level**.

---

## System Responses by Final Risk Level (Table 13)

| Final Risk Level | System Response |
|-----------------|-----------------|
| **No Risk**     | Green badge. Prompt proceeds without interruption. Tier: Allow. |
| **Low**         | Yellow badge. Allow submission; optional passive notice. Tier: Allow. |
| **Moderate**    | Orange badge. Notify user; show detected entity types and risk disclosure explanation. Tier: Notify. |
| **High**        | Red badge. Warning + recommended masked version of the prompt. User may either proceed with original or copy masked version. Tier: Warn. |

---

## Evidence Source Reliability Classification (Table 6)

The scoring engine only processes entities that pass the reliability filter. **Low reliability detections are dropped** and never forwarded to the risk engine.

| Evidence Source             | Reliability | Assignment Rule |
|-----------------------------|-------------|-----------------|
| RegEx + Validator.js        | High        | Pattern matched and mathematically validated (e.g., Luhn check on credit cards) |
| Gazetteer exact match       | High        | Exact match against controlled wordlist |
| Gazetteer fuzzy match       | Moderate    | Accepted through ≥ 0.8 Levenshtein similarity threshold |
| Compromise.js               | Moderate    | Grammar-based NER without structural validation |
| RegEx match, validator fails | Low        | Format matched RegEx but mathematical check failed → **DROPPED** |
| Gazetteer fuzzy below 0.8   | Low         | Similarity below threshold → **DROPPED** |

---

## Structural Heuristics — Source Code Block Detection (Table 5)

Source code is classified as a **Moderate-impact** entity (score = 5). Detection uses weighted structural features:

| Feature                    | Weight | Evidence Type |
|----------------------------|--------|---------------|
| Import/require statement   | 3      | Strong        |
| Code keywords              | 3      | Strong        |
| Braces `{}`                | 2      | Strong        |
| Function-call pattern      | 2      | Strong        |
| Consistent indentation     | 2      | Moderate      |
| Semicolon line-terminator  | 1      | Weak          |
| Assignment/comparison operators | 1 | Weak         |
| camelCase/snake_case identifiers | 1 | Weak        |
| Comment markers            | 1      | Weak          |
| Line density               | 1      | Weak          |

**Classification rule:** Total score ≥ 4 **AND** at least one Strong indicator present.

> Example — `const keyword (3) + operator (1) + semicolon (1) + identifier (1) = 6` → classified as source code ✓  
> Counter-example — `semicolon (1) + line density (1) + indentation (2) = 4` but **no strong indicator** → NOT classified as code ✗

---

## Key Design Constraints

- All scoring executes **locally within the browser** via a dedicated Web Worker — no prompt content is transmitted externally during scanning.
- Context indicators (ethnic origin, medical, financial terms) carry **no independent base score** and cannot independently trigger any risk level.
- The multiplier is applied to the **sum of distinct entity type scores**, not to the count of individual entity instances. Repeated entities of the same type are deduplicated before scoring.
- Scores, multiplier values, and thresholds are **researcher-defined operational parameters** grounded in NIST SP 800-122 and RA 10173 principles, subject to validation during testing.
