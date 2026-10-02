# TrustPrompt Risk Scoring Model — Test Prompts

**Reference:** Manuscript Table 17 (Illustrative Risk-Scoring User Prompt Scenarios)  
**Framework:** NIST SP 800-122 impact tiers + RA 10173 Section 3(g) multiplier + governance rules (Table 15)

---

## Test Suite Structure

Each test case specifies:
- **Prompt:** The user input to test
- **Expected Entities:** Which patterns should be detected
- **Distinct Types:** Count of scored entity types (for multiplier)
- **Base Score:** Sum of per-type scores (before multiplier)
- **Pre-Governance Score:** base × multiplier
- **Preliminary Risk:** Score-based classification (before governance)
- **Governance Rule:** Which rule (if any) applies
- **Final Risk:** After governance application
- **Rationale:** Why this result is expected

---

## TIER 1: NO RISK (Score = 0)

### Test 1.1: Empty Prompt
```
Prompt: ""
Expected Entities: (none)
Distinct Types: 0
Base Score: 0
Pre-Governance: 0 × 1.00 = 0.00
Preliminary: No Risk
Governance Rule: None
Final Risk: No Risk
Rationale: No entities detected → score 0
```

### Test 1.2: Generic Text Only
```
Prompt: "What are the best practices for writing code?"
Expected Entities: (none detected)
Distinct Types: 0
Base Score: 0
Pre-Governance: 0 × 1.00 = 0.00
Preliminary: No Risk
Governance Rule: None
Final Risk: No Risk
Rationale: Question is generic; no PII or context indicators present
```

### Test 1.3: Context Indicator Alone (No Personal Entity)
```
Prompt: "What medications treat hypertension?"
Expected Entities: gazetteer_medical ("hypertension")
Distinct Types: 0 (scored: 0 because context indicator = BASE_SCORES[gazetteer_medical] = 0)
Base Score: 0
Pre-Governance: 0 × 1.00 = 0.00
Preliminary: No Risk
Governance Rule: None (Rule 2 requires scored entity + context indicator)
Final Risk: No Risk
Rationale: Medical term alone is context indicator (score 0); Rule 2 requires personal entity + context
```

### Test 1.4: Financial Term Alone
```
Prompt: "How do I calculate loan interest?"
Expected Entities: gazetteer_financial ("loan")
Distinct Types: 0 (scored: 0)
Base Score: 0
Pre-Governance: 0 × 1.00 = 0.00
Preliminary: No Risk
Governance Rule: None
Final Risk: No Risk
Rationale: Financial term without personal entity = context only, not PII
```

---

## TIER 2: LOW RISK (Score = 2.00 – 4.99)

### Test 2.1: Personal Name Only
```
Prompt: "My name is John"
Expected Entities: nlp_person_name ("John")
Distinct Types: 1 (nlp_person_name: score 2)
Base Score: 2
Pre-Governance: 2 × 1.00 = 2.00
Preliminary: Low
Governance Rule: None
Final Risk: Low
Rationale: Single Low-impact entity → score 2.00 → Low
Reference: Manuscript Table 17, Row 1
```

### Test 2.2: Personal Name + Job Title
```
Prompt: "I am John, a software engineer"
Expected Entities: nlp_person_name ("John"), nlp_job_title ("software engineer")
Distinct Types: 2 (nlp_person_name: 2, nlp_job_title: 2)
Base Score: 4
Pre-Governance: 4 × 1.20 = 4.80
Preliminary: Low
Governance Rule: None (4.80 < 5)
Final Risk: Low
Rationale: Two Low-impact types → base 4 × 1.20 = 4.80 → Low (just below Moderate threshold)
```

---

## TIER 3: MODERATE RISK (Score = 5.00 – 14.99)

### Test 3.1: Email Address Only
```
Prompt: "Contact me at john@example.com"
Expected Entities: email ("john@example.com")
Distinct Types: 1 (email: score 5)
Base Score: 5
Pre-Governance: 5 × 1.00 = 5.00
Preliminary: Moderate
Governance Rule: None
Final Risk: Moderate
Rationale: Single Moderate-impact (Significant) entity → score 5.00 → Moderate
Reference: Manuscript Table 17, Row 2
```

### Test 3.2: Personal Name + Email Address
```
Prompt: "I'm John and my email is john@example.com"
Expected Entities: nlp_person_name ("John"), email ("john@example.com")
Distinct Types: 2 (nlp_person_name: 2, email: 5)
Base Score: 7
Pre-Governance: 7 × 1.20 = 8.40
Preliminary: Moderate
Governance Rule: None
Final Risk: Moderate
Rationale: 2 types → base 7 × 1.20 = 8.40 → Moderate
Reference: Manuscript Table 17, Row 3
```

### Test 3.3: Email + Organization + Job Title
```
Prompt: "I work at Acme Corp as a Manager. Email: john@acme.com"
Expected Entities: email ("john@acme.com"), nlp_organization ("Acme Corp"), nlp_job_title ("Manager")
Distinct Types: 3 (email: 5, nlp_organization: 2, nlp_job_title: 2)
Base Score: 9
Pre-Governance: 9 × 1.40 = 12.60
Preliminary: Moderate
Governance Rule: None
Final Risk: Moderate
Rationale: 3 types → base 9 × 1.40 = 12.60 → Moderate (12.60 < 15)
Reference: Manuscript Table 17, Row 4
```

### Test 3.4: Personal Name + Medical Context
```
Prompt: "I'm Sarah and I have diabetes"
Expected Entities: nlp_person_name ("Sarah"), trigger_health ("diabetes")
Distinct Types: 1 (scored) + 1 (context indicator)
Base Score: 2 (only nlp_person_name scored)
Pre-Governance: 2 × 1.00 = 2.00
Preliminary: Low
Governance Rule: Rule 2 (Sensitive-Context Co-occurrence): scored entity + context indicator → raise by 1 level
Final Risk: Moderate (Low → Moderate)
Rationale: Personal name + medical context triggers Rule 2 → escalate from Low to Moderate
Reference: Manuscript Table 17, Row 9 (adapted)
```

### Test 3.5: Name + Organization + Job Title + Department
```
Prompt: "John, Manager of Sales Department at TechCorp"
Expected Entities: nlp_person_name ("John"), nlp_job_title ("Manager"), nlp_organization ("TechCorp"), nlp_organization ("Sales Department")
Distinct Types: 3 (nlp_person_name: 2, nlp_job_title: 2, nlp_organization: 2) — Sales Department is same type as TechCorp
Base Score: 6
Pre-Governance: 6 × 1.40 = 8.40
Preliminary: Moderate
Governance Rule: Rule 3 check: all scored entities are Low-impact (base 2 each) — BUT distinct type count is only 3
Final Risk: Moderate
Rationale: Multiple Low-impact types but score 8.40 < 15, so stays Moderate
```

---

## TIER 4: HIGH RISK (Score ≥ 15.00)

### Test 4.1: Personal Name + Email + Phone Number
```
Prompt: "I'm John, john@example.com, 09123456789"
Expected Entities: nlp_person_name ("John"), email ("john@example.com"), ph_mobile ("09123456789")
Distinct Types: 3 (nlp_person_name: 2, email: 5, ph_mobile: 5)
Base Score: 12
Pre-Governance: 12 × 1.40 = 16.80
Preliminary: High
Governance Rule: None
Final Risk: High
Rationale: 3 distinct types with 2 Moderate-impact entities → base 12 × 1.40 = 16.80 → High
Reference: Manuscript Table 17, Row 5
```

### Test 4.2: Email + Phone + Address
```
Prompt: "Contact john@example.com, 09123456789, or my address: 123 Main St, Manila"
Expected Entities: email, ph_mobile, ph_address
Distinct Types: 3 (email: 5, ph_mobile: 5, ph_address: 5)
Base Score: 15
Pre-Governance: 15 × 1.40 = 21.00
Preliminary: High
Governance Rule: None
Final Risk: High
Rationale: 3 Moderate-impact types → base 15 × 1.40 = 21.00 → High
```

### Test 4.3: Validated Philippine Passport (Rule 1 Escalation)
```
Prompt: "My passport number is AB1234567"
Expected Entities: ph_id_passport ("AB1234567") [validated: true]
Distinct Types: 1 (ph_id_passport: 10)
Base Score: 10
Pre-Governance: 10 × 1.00 = 10.00
Preliminary: Moderate (10.00 >= 5 and < 15)
Governance Rule: Rule 1 (Strongly Validated Critical-Entity) applies
Final Risk: High (escalated regardless of preliminary)
Rationale: Validated critical entity → Rule 1 escalates to High even though pre-governance score is only 10
Reference: Manuscript Table 17, Row 6
```

### Test 4.4: Credit Card + Personal Name (Rule 1 Escalation)
```
Prompt: "My name is John and my card number is 4532-1111-2222-3333"
Expected Entities: nlp_person_name ("John"), credit_card ("4532-1111-2222-3333") [validated: true]
Distinct Types: 2 (nlp_person_name: 2, credit_card: 10)
Base Score: 12
Pre-Governance: 12 × 1.20 = 14.40
Preliminary: Moderate (14.40 < 15)
Governance Rule: Rule 1 (Strongly Validated Critical-Entity: credit_card) applies
Final Risk: High (escalated from Moderate)
Rationale: Validated critical entity (credit card) → Rule 1 escalates to High
Reference: Manuscript Table 17, Row 7
```

---

## TIER 5: GOVERNANCE RULE TESTS

### Test 5.1: Low-Impact Entity Cap (Rule 3)
```
Prompt: "John works as Manager at TechCorp in Manila with IP 192.168.1.1"
Expected Entities: nlp_person_name, nlp_job_title, nlp_organization, ph_address, ipv4
Distinct Types: 5 (all Low-impact: nlp_person_name:2, nlp_job_title:2, nlp_organization:2, ph_address:2, ipv4:2)
Base Score: 10
Pre-Governance: 10 × 2.00 = 20.00
Preliminary: High (20.00 >= 15)
Governance Rule: Rule 3 (Low-Impact Entity Cap) applies — all scored entities have BASE_SCORES === 2
Final Risk: Moderate (capped from High)
Rationale: All-Low-impact types → Rule 3 caps at Moderate despite high multiplier
Reference: Manuscript Table 17, Row 8
```

### Test 5.2: Name + Medical Context (Rule 2)
```
Prompt: "My name is Sarah and I have hypertension"
Expected Entities: nlp_person_name ("Sarah"), gazetteer_medical ("hypertension")
Distinct Types: 1 (scored) + 1 (context indicator)
Base Score: 2
Pre-Governance: 2 × 1.00 = 2.00
Preliminary: Low
Governance Rule: Rule 2 (Sensitive-Context Co-occurrence) applies — scored entity + medical context
Final Risk: Moderate (raised from Low by one level)
Rationale: Personal name + medical term → Rule 2 escalates Low → Moderate
Reference: Manuscript Table 17, Row 9
```

### Test 5.3: Name + Financial Context (Rule 2)
```
Prompt: "I'm Mike and my salary is 100,000 pesos"
Expected Entities: nlp_person_name ("Mike"), gazetteer_financial ("salary")
Distinct Types: 1 (scored) + 1 (context indicator)
Base Score: 2
Pre-Governance: 2 × 1.00 = 2.00
Preliminary: Low
Governance Rule: Rule 2 applies — scored entity + financial context
Final Risk: Moderate (raised from Low)
Rationale: Personal name + financial term → Rule 2 escalates Low → Moderate
```

### Test 5.4: Email + Ethnic Origin Context (Rule 2)
```
Prompt: "My email is john@example.com and I am Ilocano"
Expected Entities: email ("john@example.com"), gazetteer_nationality_religion ("Ilocano")
Distinct Types: 1 (scored: email) + 1 (context indicator: ethnic origin)
Base Score: 5
Pre-Governance: 5 × 1.00 = 5.00
Preliminary: Moderate
Governance Rule: Rule 2 applies — scored entity + ethnic origin context
Final Risk: High (raised from Moderate by one level)
Rationale: Email + ethnic origin → Rule 2 escalates Moderate → High
```

---

## EDGE CASES & BOUNDARY CONDITIONS

### Test 6.1: Score at Threshold Boundary (just below High)
```
Prompt: "Contact: john@acme.com, Manager at TechCorp"
Expected Entities: email (5), nlp_job_title (2), nlp_organization (2)
Distinct Types: 3
Base Score: 9
Pre-Governance: 9 × 1.40 = 12.60
Preliminary: Moderate (12.60 < 15)
Governance Rule: None
Final Risk: Moderate
Rationale: Exactly at the boundary — 12.60 is just below High threshold (15)
```

### Test 6.2: Score at Threshold Boundary (just above High)
```
Prompt: "John (john@example.com) at TechCorp, 09123456789"
Expected Entities: nlp_person_name (2), email (5), nlp_organization (2), ph_mobile (5)
Distinct Types: 4
Base Score: 14
Pre-Governance: 14 × 1.70 = 23.80
Preliminary: High (23.80 >= 15)
Governance Rule: None (not all Low-impact, so Rule 3 doesn't apply)
Final Risk: High
Rationale: Score 23.80 crosses into High tier
```

### Test 6.3: Multiplier Effect (High Distinct Type Count, Low Impact)
```
Prompt: "John (Manager at TechCorp in Manila) has MAC 00:1A:2B:3C:4D:5E and IP 192.168.1.1"
Expected Entities: nlp_person_name (2), nlp_job_title (2), nlp_organization (2), ph_address (2), mac_address (2), ipv4 (2)
Distinct Types: 6 → multiplier cap at 5+ = 2.00
Base Score: 12
Pre-Governance: 12 × 2.00 = 24.00
Preliminary: High
Governance Rule: Rule 3 applies — all Low-impact
Final Risk: Moderate (capped by Rule 3)
Rationale: Even with 6 entity types, Rule 3 caps Low-impact-only prompts at Moderate
```

### Test 6.4: Critical Entity Without Validation (should NOT trigger Rule 1)
```
Prompt: "Format: 4532-1111-2222-3333 is a credit card pattern"
Expected Entities: (credit_card: not detected or detected but validated: false)
Distinct Types: 0 or 1
Base Score: 0 or 10
Pre-Governance: 0 × 1.00 = 0 OR 10 × 1.00 = 10
Preliminary: No Risk OR Moderate
Governance Rule: Rule 1 does NOT apply if validated:false
Final Risk: No Risk OR Moderate (depending on detection)
Rationale: Format-only candidates (failing Luhn check) are not scored by Rule 1
```

---

## VALIDATION CHECKLIST

When running these test prompts, verify:

- [ ] **Detection accuracy:** Each prompt detects the expected entities and only those entities
- [ ] **Base score calculation:** Sum of per-type scores matches expected
- [ ] **Multiplier application:** Correct multiplier applied based on distinct type count
- [ ] **Pre-governance score:** base × multiplier = pre-governance score
- [ ] **Preliminary classification:** Score maps to correct preliminary risk level per Table 13
- [ ] **Governance rule selection:** Correct rule applies (or none applies) per Table 15 decision order
- [ ] **Final risk level:** After governance, matches expected final risk
- [ ] **Boundary conditions:** Scores at thresholds (2.00, 5.00, 15.00) behave correctly
- [ ] **Rule priority:** Higher-priority rules take precedence (Rule 1 > Rule 2 > Rule 3 > Rule 4)
- [ ] **Rule 3 correctness:** Low-Impact Cap only applies when ALL scored entities have BASE_SCORES === 2

---

## Console Output Reference

Each test should produce a console log like:

```
[TrustPrompt/scorer] base:12 ×1.40 = 16.80 | prelim:high | gov:none(null) | final:high
```

Use this to verify:
1. baseTotal matches expected base score
2. Multiplier is correct for distinct type count
3. preScore = baseTotal × multiplier
4. preliminary matches expected preliminary level
5. governance rule and result match expectations
