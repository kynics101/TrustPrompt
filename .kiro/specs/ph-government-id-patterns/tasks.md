# Implementation Plan: Philippine Government ID Patterns Detection

## Overview

Implement 14 structural validator functions for Philippine government ID types, integrate them into the TRUSTPROMPT_PATTERNS registry, and wire them into the scanner.js PATH A pipeline with Governance Rule 1 escalation logic. This feature improves detection accuracy for critical government identifiers under RA 10173 by validating structural integrity and enabling high-confidence escalation to HIGH risk.

---

## Tasks

### 1. Set Up ID Pattern Infrastructure

- [ ] 1.1 Create helper functions for ID value extraction and normalization
  - Implement `extractPHIDValue(raw)` — strips prefixes, labels, quotes, and formatting
  - Implement `isPhIDPlaceholder(patternId, value)` — checks for known dummy/test values
  - Implement `normalizePHID(value, stripChars)` — removes separators consistently
  - Add to `patterns.js`
  - _Requirements: 15, 17_

- [ ] 1.2 Define ID type metadata and configuration structure
  - Create configuration object mapping ID types to validation rules (format, digit count, separators)
  - Define regex templates per ID type (with placeholders for digit counts, optional separators)
  - Include risk levels and sanitization templates
  - _Requirements: 15, 19_

- [ ]* 1.3 Write unit tests for helper functions
  - Test `extractPHIDValue()` with various prefix formats (labels, colons, equals)
  - Test `normalizePHID()` with mixed separators (hyphens, spaces, dots)
  - Test placeholder detection against known test values
  - _Requirements: 15, 20_

---

### 2. Implement Validator Functions (Phase 1: Government ID Systems)

- [ ] 2.1 Implement SSS (Social Security System) validator
  - Function: `structuralValidatePHID_SSS(raw)`
  - Validate: 10 numeric digits (after normalization)
  - Branch code check: first 2 digits (01–59)
  - Reference: Requirements 5, 15, 17
  - _Requirements: 5, 15, 17_

- [ ] 2.2 Implement GSIS (Government Service Insurance System) validator
  - Function: `structuralValidatePHID_GSIS(raw)`
  - Validate: 10 numeric digits (after normalization)
  - Agency code check: first 4 digits (0001–9999)
  - Reference: Requirements 6, 15, 17
  - _Requirements: 6, 15, 17_

- [ ] 2.3 Implement UMID (Unified Multi-Purpose ID) validator
  - Function: `structuralValidatePHID_UMID(raw)`
  - Validate: 12 numeric digits
  - SSS system code check: first 4 digits (1000–1999)
  - Modulo 10 check digit validation (digit 12)
  - Reference: Requirement 4
  - _Requirements: 4, 15, 17_

- [ ] 2.4 Implement TIN (Taxpayer Identification Number) validator
  - Function: `structuralValidatePHID_TIN(raw)`
  - Validate: 9 numeric digits (after normalization)
  - Registration area code: first 3 digits (100–900)
  - Modulo 11 check digit validation (digit 9)
  - Reference: Requirement 8
  - _Requirements: 8, 15, 17_

- [ ]* 2.5 Write unit tests for government ID validators
  - Generate 10 valid SSS, GSIS, UMID, TIN test cases each
  - Test boundary conditions (min/max branch codes, etc.)
  - Test invalid formats (wrong length, non-numeric)
  - Test with and without separators
  - _Requirements: 15, 20_

---

### 3. Implement Validator Functions (Phase 2: Benefit and Insurance IDs)

- [ ] 3.1 Implement PhilHealth validator
  - Function: `structuralValidatePHID_PhilHealth(raw)`
  - Validate: 12 numeric digits (recent) or 15 alphanumeric (legacy RF card)
  - Character set check: alphanumeric only
  - Reference: Requirement 9
  - _Requirements: 9, 15, 17_

- [ ] 3.2 Implement Pag-IBIG validator
  - Function: `structuralValidatePHID_PagIBIG(raw)`
  - Validate: 12 numeric digits
  - Optional Pag-IBIG specific format checks
  - Reference: Requirements 15, 17 (based on philippine-id-patterns design)
  - _Requirements: 15, 17_

- [ ]* 3.3 Write unit tests for benefit ID validators
  - Test PhilHealth with 12-digit and 15-alphanumeric formats
  - Test Pag-IBIG digit count and separators
  - Test edge cases (all zeros, maximum digits)
  - _Requirements: 15, 20_

---

### 4. Implement Validator Functions (Phase 3: Travel and Professional IDs)

- [ ] 4.1 Implement Passport validator
  - Function: `structuralValidatePHID_Passport(raw)`
  - Validate: optional letter prefix + 6–8 digits (format P123456789 or similar)
  - Passport type check: first digit (1–3)
  - Reference: Requirement 3
  - _Requirements: 3, 15, 17_

- [ ] 4.2 Implement Driver's License validator
  - Function: `structuralValidatePHID_DriversLicense(raw)`
  - Validate: 11 characters (numeric or alphanumeric mix)
  - Region code: first 2 digits (01–16)
  - Reference: Requirement 2
  - _Requirements: 2, 15, 17_

- [ ] 4.3 Implement PRC (Professional Regulation Commission) validator
  - Function: `structuralValidatePHID_PRC(raw)`
  - Validate: 6–7 digits with optional year prefix (1900–2099)
  - Profession category: first 2 digits (01–99)
  - Reference: Requirement 7
  - _Requirements: 7, 15, 17_

- [ ]* 4.4 Write unit tests for travel/professional ID validators
  - Test Passport formats (with and without P prefix)
  - Test Driver's License region codes and alphanumeric variants
  - Test PRC with/without year prefix
  - _Requirements: 15, 20_

---

### 5. Implement Validator Functions (Phase 4: Vital Records and Clearances)

- [ ] 5.1 Implement PSA Certificate validator
  - Function: `structuralValidatePHID_PSACertificate(raw)`
  - Validate: 8–13 digits
  - Certificate type: first 3 digits (101=birth, 201=marriage, 301=death)
  - Reference: Requirement 12
  - _Requirements: 12, 15, 17_

- [ ] 5.2 Implement NBI Clearance validator
  - Function: `structuralValidatePHID_NBIClearance(raw)`
  - Validate: 7–10 digits with optional "NBI" prefix
  - Year of issuance: first 2 digits (00–99)
  - Office code: digits 3–5 (001–999)
  - Reference: Requirement 10
  - _Requirements: 10, 15, 17_

- [ ] 5.3 Implement Police Clearance validator
  - Function: `structuralValidatePHID_PoliceClearance(raw)`
  - Validate: 6–10 alphanumeric characters with optional "PNP" prefix
  - Optional year prefix: 4 digits (1900–2099)
  - Reference: Requirement 11
  - _Requirements: 11, 15, 17_

- [ ] 5.4 Implement Barangay Clearance validator
  - Function: `structuralValidatePHID_BarangayClearance(raw)`
  - Validate: 4–8 digits with optional year (YYYY-format)
  - Barangay code: 2 digits (01–99)
  - Reference: Requirement 13
  - _Requirements: 13, 15, 17_

- [ ] 5.5 Implement COMELEC Voter's ID validator
  - Function: `structuralValidatePHID_COMELECVoterID(raw)`
  - Validate: 10–14 digits
  - Province code: first 2 digits (01–82)
  - City/municipality code: digits 3–4 (01–99)
  - Reference: Requirement 14
  - _Requirements: 14, 15, 17_

- [ ] 5.6 Implement PhilID (PSA National ID) validator
  - Function: `structuralValidatePHID_PhilID(raw)`
  - Validate: 12 numeric digits
  - Birth date: first 6 digits (YYMMDD format)
  - Sex digit: digit 12 (1=male, 2=female)
  - Reference: Requirement 1
  - _Requirements: 1, 15, 17_

- [ ]* 5.7 Write unit tests for vital/clearance ID validators
  - Test PSA Certificate types (101, 201, 301)
  - Test NBI Clearance with and without prefix
  - Test Police/Barangay Clearance date formats
  - Test COMELEC province and city codes
  - Test PhilID birth date and sex digit validation
  - _Requirements: 15, 20_

---

### 6. Create Pattern Registry in patterns.js

- [ ] 6.1 Add 14 pattern objects to TRUSTPROMPT_PATTERNS array
  - Each pattern includes: id, label, regex, risk, validate, structuralValidate, sanitize, reason
  - Follow naming convention: `ph_id_[type_kebab_case]` (e.g., `ph_id_philid`, `ph_id_drivers_license`)
  - Regex patterns to detect ID with optional separators and prefixes
  - Risk levels: HIGH for 13 types, MODERATE for barangay clearance (Requirement 13)
  - _Requirements: 15, 17_

- [ ] 6.2 Implement sanitize functions for each ID type
  - PhilID: redact to "12-****-90-12" format (first 2, middle redacted, last 2+2)
  - Driver's License: "12-*******-890" (first 2, middle 7 redacted, last 3)
  - Passport: "P1-****89" or "123-****789"
  - UMID: "1234-****-90-12" (first 4, middle 6 redacted, last 2+2)
  - SSS: "12-****-90" (first 2, middle redacted, last 2)
  - GSIS: "1234-*****-0" (first 4, middle redacted, last 1)
  - PRC: pattern-specific redaction (middle digits)
  - TIN: "123-****-89" (first 3, middle redacted, last 2)
  - PhilHealth: "12-*********-2" (first 2, middle redacted, last 1)
  - NBI: "12-34-****-890" or "NBI-****567"
  - Police: "PNP-2021-****-56" or similar
  - PSA: "123-****-8901-23" (type+location, middle, year+sequence)
  - Barangay: "BC-2021-****" (prefix+year, sequence redacted)
  - COMELEC: "12-34-56-****-****" (province, municipality, barangay, precinct, sequence)
  - _Requirements: 15, 19_

- [ ]* 6.3 Write integration tests for pattern registry
  - Verify all 14 patterns are in TRUSTPROMPT_PATTERNS
  - Verify pattern IDs are unique
  - Test regex matching against sample IDs (with/without separators)
  - Test sanitize functions produce consistent format
  - _Requirements: 15, 20_

---

### 7. Integrate into Scanner.js PATH A

- [ ] 7.1 Update scanner.js to include Philippine ID patterns in runPathA()
  - Ensure all 14 ph_id_* patterns are included in pattern iteration
  - Apply entropy check (TASK-4.5: shannonEntropy minimum)
  - Apply placeholder suppression (TASK-4.4: isKnownPlaceholder)
  - Reference: Requirements 18, 20
  - _Requirements: 18, 20_

- [ ] 7.2 Wire structural validators into finding creation
  - When pattern.structuralValidate is defined, call it on matched value
  - Set `validated: true` if structuralValidate returns true
  - Ensure `rawMatch` and `safeVersion` are populated correctly
  - Reference: Requirement 16
  - _Requirements: 16, 20_

- [ ] 7.3 Add Philippine ID patterns to BASE_SCORES and ENTITY_TIER
  - All 14 patterns: ENTITY_TIER = "critical" (government IDs are critical)
  - 13 patterns (all except barangay): BASE_SCORES = 10 (same as credit_card, jwt)
  - Barangay clearance: BASE_SCORES = 8 (less critical than national IDs)
  - Reference: Requirement 16, 18
  - _Requirements: 16, 18_

- [ ]* 7.4 Write integration tests for PATH A + Philippine IDs
  - Mock text containing valid PhilID, SSS, Driver's License samples
  - Verify patterns match correctly
  - Verify validators are called and findings are marked validated
  - Test with entropy and placeholder suppression
  - _Requirements: 18, 20_

---

### 8. Implement Governance Rule 1 Escalation

- [ ] 8.1 Update governance rule evaluation in scanner.js
  - When evaluating a finding with `validated: true` and ENTITY_TIER = "critical"
  - Check if patternId matches any ph_id_* pattern
  - Escalate risk to "high" regardless of other scoring factors
  - Log escalation: "[TrustPrompt/governance] Rule 1 escalation: ph_id_[type] (validated) → HIGH"
  - Reference: Requirements 16, 20
  - _Requirements: 16, 20_

- [ ] 8.2 Update risk scoring computation
  - Ensure escalated findings participate in risk score aggregation
  - Verify governance escalation does not interfere with duplicate merging or deduplication
  - Reference: Requirement 18
  - _Requirements: 18_

- [ ]* 8.3 Write tests for governance escalation
  - Create validated finding with phid pattern
  - Verify escalation logic raises risk to "high"
  - Verify log message is generated
  - Test with multiple escalations in same scan
  - _Requirements: 16, 20_

---

### 9. Performance Testing and Optimization

- [ ] 9.1 Measure structural validator performance
  - Profile each validator function with 100 iterations
  - Record execution time for each ID type
  - Target: each validator < 1ms per call
  - Overall structural validation for all 14 types < 10ms (Requirement 20)
  - _Requirements: 20_

- [ ] 9.2 Optimize validators if needed
  - Use pre-compiled regex patterns (cache)
  - Minimize string operations (normalization, stripping)
  - Use early exits for invalid formats
  - _Requirements: 20_

- [ ]* 9.3 Write performance tests
  - Benchmark 100 matches across all 14 ID types
  - Verify total validation time < 10ms
  - Log performance metrics
  - _Requirements: 20_

---

### 10. Comprehensive Testing and Calibration

- [ ] 10.1 Create test dataset with representative samples
  - Generate 20 valid test cases per ID type (14 × 20 = 280 samples)
  - Include with/without separators, optional prefixes
  - Include edge cases (boundary digit values, alternate formats)
  - Reference: Requirement 20
  - _Requirements: 20_

- [ ] 10.2 Create negative test dataset
  - Generate 10 invalid cases per ID type (wrong length, invalid characters)
  - Generate plausible false positives (e.g., generic digit sequences)
  - Reference: Requirement 20
  - _Requirements: 20_

- [ ]* 10.3 Write comprehensive validation test suite
  - Test each validator with positive samples (expect true)
  - Test each validator with negative samples (expect false)
  - Test regex pattern matching + validator combination
  - Measure false positive rate (invalid samples incorrectly passing)
  - Measure false negative rate (valid samples incorrectly failing)
  - Target: <5% combined error rate
  - _Requirements: 20_

---

### 11. Checkpoint — Ensure All Tests Pass

- [ ] 11.1 Run full test suite
  - Ensure all unit tests pass
  - Ensure all integration tests pass
  - Ensure all performance tests pass
  - Verify no regressions in existing scanner tests
  - Checkpoint: Ensure all tests pass, ask the user if questions arise.

---

### 12. Documentation and Code Review

- [ ] 12.1 Add inline documentation to all validator functions
  - Document format, digit count, validation rules
  - Include example valid/invalid inputs
  - Add links to requirement references
  - _Requirements: 15, 19_

- [ ] 12.2 Document integration points
  - Add comments to scanner.js explaining PATH A integration
  - Document governance rule 1 escalation logic
  - _Requirements: 18, 20_

- [ ]* 12.3 Create QA checklist
  - Verify each ID type detects/redacts correctly
  - Verify governance escalation works
  - Verify performance baseline met
  - _Requirements: 20_

---

## Notes

- All 14 validators follow the same pattern: normalize input → validate format → return boolean
- No external libraries required; all validation uses built-in regex and string operations
- Checksum validation is optional and marked in the design; currently format-only validation
- All ID types classified as CRITICAL tier except Barangay Clearance (MODERATE)
- Performance target: <10ms total for all 14 validators combined on typical text input
- Governance Rule 1 escalation is the key risk elevation mechanism for validated findings
- Integration into existing scanner should be minimal; validators are injected into TRUSTPROMPT_PATTERNS

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "2.2", "2.3", "2.4", "3.1", "3.2", "4.1", "4.2", "4.3", "5.1", "5.2", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 2, "tasks": ["2.5", "3.3", "4.4", "5.7"] },
    { "id": 3, "tasks": ["6.1", "6.2"] },
    { "id": 4, "tasks": ["6.3", "7.1", "7.2", "7.3"] },
    { "id": 5, "tasks": ["7.4"] },
    { "id": 6, "tasks": ["8.1", "8.2"] },
    { "id": 7, "tasks": ["8.3", "9.1", "9.2"] },
    { "id": 8, "tasks": ["9.3", "10.1", "10.2"] },
    { "id": 9, "tasks": ["10.3"] }
  ]
}
```
