# TrustPrompt — Curated Dataset Register & Tracker
**Version:** 0.1.0  
**Owner:** QA / Research Lead  
**Last Updated:** 2026-08-21  
**Scope:** All detection layers across the seven sensitive-data categories plus access-credential detectors.

---

## How to Read This Register

Each row in the tables below represents **one dataset batch entry** — a logical group of curated test samples that feeds a specific detector or layer.

| Column | Meaning |
|---|---|
| **ID** | Unique batch identifier. Format: `CAT-LAYER-NNN` |
| **Category** | One of the 7 SPI categories or `AUTH` for credentials |
| **Layer** | `A-REGEX`, `B-GAZETTEER`, `B-TRIGGER`, or `BOTH` |
| **Detector / Pattern ID** | The `patternId` key in `scanner.js` that this batch targets |
| **Source** | Upstream dataset (see Source Registry, Section 3) |
| **Sample Count Target** | Planned number of cases in this batch |
| **Sample Count Actual** | Confirmed curated cases (updated as work progresses) |
| **Positive Cases** | Number of TRUE POSITIVE cases (should-detect) |
| **Negative Cases** | Number of TRUE NEGATIVE cases (should-NOT-detect) |
| **Boundary / Edge Cases** | Malformed, placeholder, near-miss, and boundary cases |
| **Status** | `PLANNED` / `IN PROGRESS` / `REVIEW` / `DONE` |
| **Assigned To** | Contributor responsible for this batch |
| **Notes** | Anything unusual about this batch |

---

## Section 1 — Structured Detector Batches (Path A — Regex + Validator)

### 1.1 Authentication & Access Credentials (`AUTH`)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AUTH-A-001 | AUTH | A-REGEX | `api_key` | Synthetic + public leak datasets | 80 | 0 | 30 | 20 | 30 | PLANNED | — | Covers `key=`, `secret=`, `token=`, `access_key=` assignment forms |
| AUTH-A-002 | AUTH | A-REGEX | `jwt` | Synthetic (jwt.io generator) | 40 | 0 | 15 | 10 | 15 | PLANNED | — | Real structure, dummy payloads only; malformed segment tests |
| AUTH-A-003 | AUTH | A-REGEX | `password_inline` | Synthetic | 50 | 0 | 20 | 15 | 15 | PLANNED | — | `password=`, `pwd=`, `passwd=` forms; placeholder filters (`password=changeme`) |

### 1.2 Financial Identifiers

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIN-A-001 | Financial | A-REGEX | `credit_card` | Synthetic (Luhn-valid test numbers) | 80 | 0 | 30 | 20 | 30 | PLANNED | — | Covers Visa, MC, Amex, JCB; malformed / Luhn-fail negatives |

### 1.3 Contact & Network Identifiers

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CONTACT-A-001 | Contact | A-REGEX | `email` | Synthetic | 60 | 0 | 25 | 20 | 15 | PLANNED | — | RFC 5322 edge cases, subdomain emails, + alias, unicode domains |
| CONTACT-A-002 | Contact | A-REGEX | `ph_mobile` | Synthetic | 60 | 0 | 25 | 20 | 15 | PLANNED | — | 09XX, +639XX, 639XX formats; invalid prefix negatives |
| CONTACT-A-003 | Contact | A-REGEX | `phone_intl` | Synthetic | 50 | 0 | 20 | 15 | 15 | PLANNED | — | US, UK, AU, SG formats; ensure PH mobile not double-flagged |
| CONTACT-A-004 | Contact | A-REGEX | `ipv4` | Synthetic | 50 | 0 | 20 | 15 | 15 | PLANNED | — | Private ranges, public IPs, loopback, broadcast edge cases |
| CONTACT-A-005 | Contact | A-REGEX | `ipv6` | Synthetic | 40 | 0 | 15 | 10 | 15 | PLANNED | — | Full, compressed (::), loopback (::1), link-local |
| CONTACT-A-006 | Contact | A-REGEX | `mac_address` | Synthetic | 40 | 0 | 15 | 10 | 15 | PLANNED | — | Colon and hyphen formats; partial matches that should not fire |

### 1.4 Location

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LOC-A-001 | Location | A-REGEX | `ph_address` | PH regions/provinces/cities dataset + synthetic | 70 | 0 | 30 | 20 | 20 | PLANNED | — | Barangay, brgy., street, subdivision keywords with real PH place names |

### 1.5 Context Labels

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LABEL-A-001 | Identity | A-REGEX | `context_label` | Synthetic | 80 | 0 | 35 | 25 | 20 | PLANNED | — | All 30+ label keywords in EN and Filipino (pangalan, edad, tirahan, sss, tin, etc.) |

### 1.6 Source Code

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| CODE-A-001 | Credential | A-REGEX | `source_code` | Synthetic | 50 | 0 | 20 | 15 | 15 | PLANNED | — | Fenced (` ``` `), inline (`` ` ``), code with embedded credentials |

---

## Section 2 — NLP Detector Batches (Path B — Gazetteer + Trigger)

### 2.1 Gazetteer — Medical / Health (B1)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HEALTH-B1-001 | Health | B-GAZETTEER | `gazetteer_medical` | NHS A–Z common diseases (nhsinform.scot) | 100 | 0 | 40 | 30 | 30 | PLANNED | — | Common disease names from NHS A–Z; NOT full ICD-10 (see decision note) |
| HEALTH-B1-002 | Health | B-GAZETTEER | `gazetteer_medical` | Synthetic clinical sentences | 50 | 0 | 20 | 15 | 15 | PLANNED | — | Context sentences using each medical term, including partial-word false-positive traps |

> **Decision Note — Medical Gazetteer Shift:** Per team decision, the medical gazetteer uses common disease names from [NHS A–Z](https://www.nhsinform.scot/illnesses-and-conditions/a-to-z/) rather than the full ICD-10 code database (k4m1113/ICD-10-CSV). Rationale: ICD-10 contains ~70 000 codes with lengthy clinical descriptions that would cause excessive latency on every keypress scan. NHS A–Z covers the ~300 most prevalent conditions in plain-language English — the realistic vocabulary a user would type into an AI assistant.

### 2.2 Gazetteer — Financial Terms (B1)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIN-B1-001 | Financial | B-GAZETTEER | `gazetteer_financial` | FinRAD dataset + BSP Glossary | 80 | 0 | 30 | 25 | 25 | PLANNED | — | Loan, debt, mortgage, bankruptcy, garnishment, and BSP-specific terms |
| FIN-B1-002 | Financial | B-GAZETTEER | `gazetteer_financial` | Synthetic financial sentences | 50 | 0 | 20 | 15 | 15 | PLANNED | — | Terms embedded in neutral vs. disclosing sentences |

### 2.3 Gazetteer — Nationality & Religion (B1)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NATRELIG-B1-001 | Nationality/Religion | B-GAZETTEER | `gazetteer_nationality_religion` | country-nationality-list (Imagin-io) | 80 | 0 | 30 | 25 | 25 | PLANNED | — | Nationality adjectives and religion names; test for partial-word collisions |

### 2.4 Gazetteer — Legal Terms (B1)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LEGAL-B1-001 | Legal | B-GAZETTEER | `gazetteer_legal` | Synthetic | 60 | 0 | 25 | 20 | 15 | PLANNED | — | Arrested, convicted, probation, parole, restraining order, criminal record |

### 2.5 Trigger — Person Name (B2 + B3)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| NAME-B2-001 | Identity | B-TRIGGER | `trigger_person_name` | PH name dataset (philipperemy/name-dataset) | 100 | 0 | 40 | 30 | 30 | PLANNED | — | Filipino first names, surnames; "my name is", "call me", "I am called" triggers |
| NAME-B2-002 | Identity | B-TRIGGER | `trigger_person_name` | Synthetic (typo variants) | 50 | 0 | 20 | 15 | 15 | PLANNED | — | Typo trigger phrases ("my naem is", "mi name iz") for fuzzy-match coverage |

### 2.6 Trigger — Age / Date of Birth (B2)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| AGE-B2-001 | Age/DOB | B-TRIGGER | `trigger_age` | Synthetic + Presidio patterns | 60 | 0 | 25 | 20 | 15 | PLANNED | — | "I am 25 years old", "I'm 30", "my age is"; non-age "I am tired" negatives |
| DOB-B2-001 | Age/DOB | B-TRIGGER | `trigger_dob` | Synthetic + Presidio patterns | 60 | 0 | 25 | 20 | 15 | PLANNED | — | "I was born on", "my birthday is", "date of birth"; various date formats |

### 2.7 Trigger — Location (B2 + B3)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| LOC-B2-001 | Location | B-TRIGGER | `trigger_location` | PH regions/provinces/barangays dataset | 80 | 0 | 30 | 25 | 25 | PLANNED | — | "I live in Quezon City", "nakatira ako sa Marikina"; test with real PH place names |
| LOC-B2-002 | Location | B-TRIGGER | `trigger_location` | GeoNames PH dump | 50 | 0 | 20 | 15 | 15 | PLANNED | — | International locations via GeoNames; "I am from" (low-risk) vs. "I live at" (medium) |

### 2.8 Trigger — Health (B2 + B3)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| HEALTH-B2-001 | Health | B-TRIGGER | `trigger_health` | Synthetic + NHS A–Z terms | 80 | 0 | 30 | 25 | 25 | PLANNED | — | "I was diagnosed with diabetes", "I suffer from anxiety"; false-positive traps ("I have a question") |

### 2.9 Trigger — Employer / Occupation (B2)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| EMP-B2-001 | Employment | B-TRIGGER | `trigger_employer` | company_designator + PSA PSOC | 60 | 0 | 25 | 20 | 15 | PLANNED | — | "I work at BDO", "my employer is Jollibee"; company designators (Inc., Corp., LLC) |
| JOBTITLE-B2-001 | Employment | B-TRIGGER | `trigger_employer` | gpriday/job-titles + O*NET + PSA PSOC | 60 | 0 | 25 | 20 | 15 | PLANNED | — | Job title detection in employer trigger context |

### 2.10 Trigger — Religion / Nationality (B2)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| RELIG-B2-001 | Religion/Nationality | B-TRIGGER | `trigger_religion` | Synthetic + nationality gazetteer | 60 | 0 | 25 | 20 | 15 | PLANNED | — | "I am a Muslim", "I am Catholic"; requires gazetteer hit to fire |

### 2.11 Trigger — Financial Disclosures (B2)

| ID | Category | Layer | Detector | Source | Target | Actual | Positive | Negative | Boundary | Status | Assigned | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| FIN-B2-001 | Financial | B-TRIGGER | `trigger_financial` | FinRAD + synthetic | 70 | 0 | 30 | 20 | 20 | PLANNED | — | "my salary is ₱50,000", "I earn", "my income is"; should not fire on "I earn respect" |

---

## Section 3 — Multi-Layer Combination Batches (Scoring Engine Tests)

These batches test the risk-scoring pipeline specifically — not individual detectors.

| ID | Purpose | Detector Combination | Score Target | Risk Level Target | Status | Notes |
|---|---|---|---|---|---|---|
| SCORE-001 | Single critical entity floor | `api_key` alone | ≥10 | HIGH | PLANNED | Governance Rule 1 |
| SCORE-002 | Two direct identifier types → HIGH | `email` + `ph_mobile` | ≥12 | HIGH | PLANNED | Governance Rule 2 |
| SCORE-003 | Direct + 2 contextual → HIGH | `email` + `trigger_location` + `gazetteer_medical` | ≥14 | HIGH | PLANNED | Governance Rule 3 |
| SCORE-004 | Contextual-only ceiling | `trigger_person_name` + `gazetteer_medical` + `trigger_location` | ≤9.99 | MEDIUM (capped) | PLANNED | Governance Rule 6 |
| SCORE-005 | Person name + sensitive context → MEDIUM floor | `trigger_person_name` + `gazetteer_medical` | 2–9.99 | MEDIUM (floor) | PLANNED | Governance Rule 7 |
| SCORE-006 | Source code alone = no score | `source_code` only | 0 | NONE | PLANNED | Container-only |
| SCORE-007 | Source code + embedded credential | `source_code` + `api_key` | ≥10 | HIGH | PLANNED | Governance Rule 4 |
| SCORE-008 | 5+ distinct types → 2× multiplier | 5 distinct contextual/direct types | base × 2.0 | HIGH | PLANNED | Step 2 multiplier cap |
| SCORE-009 | Filipino trigger detection | `trigger_location` via Filipino trigger | ≥2 | LOW–MEDIUM | PLANNED | "nakatira ako sa" trigger |
| SCORE-010 | Caps conversion + detection | ALL-CAPS prompt with PII | same as lowercase version | Same level | PLANNED | Normalizer capsGuard test |

---

## Section 4 — Progress Dashboard

| Layer | Batches Planned | Batches Done | Total Target Samples | Total Actual Samples | % Complete |
|---|---|---|---|---|---|
| A-REGEX (structured) | 13 | 0 | 710 | 0 | 0% |
| B-GAZETTEER | 6 | 0 | 370 | 0 | 0% |
| B-TRIGGER | 11 | 0 | 680 | 0 | 0% |
| SCORING ENGINE | 10 | 0 | 100 | 0 | 0% |
| **TOTAL** | **40** | **0** | **1 860** | **0** | **0%** |

---

## Section 5 — Batch Status Lifecycle

```
PLANNED → IN PROGRESS → REVIEW → DONE
                ↑               |
                └───── REWORK ──┘
```

- **PLANNED** — batch defined, source identified, not yet started
- **IN PROGRESS** — cases being collected/written
- **REVIEW** — cases written, awaiting second-annotator agreement check
- **REWORK** — returned after review with disagreements to resolve
- **DONE** — inter-annotator agreement ≥ 0.85, merged into canonical dataset

---

## Section 6 — Change Log

| Date | Version | Changed By | Summary |
|---|---|---|---|
| 2026-08-21 | 0.1.0 | (initial) | Created register with all 40 planned batches |
