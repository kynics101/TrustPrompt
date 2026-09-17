# QA Checklist: Philippine Government ID Patterns Implementation

**Feature**: Philippine Government ID Pattern Detection and Governance Escalation
**Version**: 1.0
**Date**: 2025
**Requirements**: TASK-6 through TASK-12

---

## Executive Summary

This implementation adds 14 distinct Philippine government ID patterns to TrustPrompt with:
- Structural validators for each ID type
- Governance Rule 1 escalation for validated findings
- Integration into scanner PATH A with entropy and placeholder checks
- Risk scoring with appropriate base scores and entity tiers
- Comprehensive redaction/sanitization functions

All 14 patterns are now in TRUSTPROMPT_PATTERNS, integrated with scanner.js, and support both regex matching and structural validation.

---

## 1. Pattern Registry Verification (TASK 6)

### 1.1 Pattern Registration ✓

**Requirement**: All 14 patterns must be in TRUSTPROMPT_PATTERNS array

**Patterns implemented**:
- [ ] ph_id_philid (PhilID - PSA National ID)
- [ ] ph_id_drivers_license (Driver's License - LTO)
- [ ] ph_id_passport (Passport - BI)
- [ ] ph_id_umid (UMID - Unified Multi-Purpose ID)
- [ ] ph_id_sss (SSS - Social Security System)
- [ ] ph_id_gsis (GSIS - Government Service Insurance System)
- [ ] ph_id_prc (PRC - Professional Regulation Commission)
- [ ] ph_id_tin (TIN - Taxpayer Identification Number)
- [ ] ph_id_philhealth (PhilHealth - Health Insurance)
- [ ] ph_id_nbi_clearance (NBI Clearance)
- [ ] ph_id_police_clearance (Police Clearance - PNP)
- [ ] ph_id_psa_certificate (PSA Certificate - Vital Records)
- [ ] ph_id_barangay_clearance (Barangay Clearance)
- [ ] ph_id_comelec_voter_id (COMELEC Voter's ID)

**Location**: patterns.js, lines 1852-1906

### 1.2 Pattern Metadata ✓

Each pattern includes:
- **id**: Pattern identifier (kebab-case)
- **label**: Human-readable name
- **regex**: Regex to match ID format (with optional separators)
- **risk**: "high" (13 types) or "moderate" (barangay clearance)
- **validate**: null (uses structuralValidate instead)
- **structuralValidate**: Function for format validation
- **sanitize**: Function for safe display redaction
- **reason**: Explanation of risk/sensitivity

**Location**: patterns.js, lines 1852-1906 (patterns), 1948-2240 (metadata in PH_ID_METADATA)

### 1.3 Regex Patterns ✓

**Formats supported**:
- [ ] PhilID: 12 digits with optional separators (hyphens, spaces)
- [ ] Driver's License: 11 alphanumeric with optional separators
- [ ] Passport: Optional P/PH prefix + 8-9 digits
- [ ] UMID: 12 digits with optional separators
- [ ] SSS: 10 digits with optional separators
- [ ] GSIS: 10 digits with optional separators
- [ ] PRC: 6-7 digits with optional year prefix
- [ ] TIN: 9 digits with optional separators
- [ ] PhilHealth: 12 digits or 15 alphanumeric
- [ ] NBI Clearance: 7-10 digits with optional "NBI" prefix
- [ ] Police Clearance: 6-10 alphanumeric with optional "PNP" prefix
- [ ] PSA Certificate: 8-13 digits
- [ ] Barangay Clearance: 4-8 digits with optional year and "BC" prefix
- [ ] COMELEC Voter's ID: 10-14 digits

### 1.4 Sanitize Functions ✓

**Redaction formats implemented**:
- [ ] PhilID: "12-****-****-**12" (first 2, middle redacted, last 2+2)
- [ ] SSS: "12-XXXXXX-90" (branch + redacted sequence + check)
- [ ] TIN: "123-****-89" (area + redacted + check digit)
- [ ] Driver's License: "12-*******-890" (first 2, middle 7 redacted, last 3)
- [ ] Passport: "12-****89" (first 2, middle redacted, last 2)
- [ ] GSIS: "1234-XXXXX-0" (agency + redacted + check)
- [ ] UMID: "1234-****-90-12" (system code + redacted + check+version)
- [ ] PhilHealth: "12-*********-2" (category + redacted + type)
- [ ] PRC: Middle redacted (preserves year and boundary digits)
- [ ] NBI Clearance: Year+office + middle redacted + sequence
- [ ] Police Clearance: Prefix + year + first 2 + middle redacted + last 2
- [ ] PSA Certificate: Type+location + middle redacted + year+sequence
- [ ] Barangay Clearance: Year + barangay + sequence redacted
- [ ] COMELEC Voter's ID: Province-city-barangay + precinct redacted + sequence

---

## 2. Structural Validators Verification (TASK 2-5)

### 2.1 Validator Functions ✓

All 14 validators implemented in patterns.js:

- [ ] structuralValidatePHID_PhilID (lines 1500+)
- [ ] structuralValidatePHID_DriversLicense (lines 724+)
- [ ] structuralValidatePHID_Passport (lines 565+)
- [ ] structuralValidatePHID_UMID (lines 299+)
- [ ] structuralValidatePHID_SSS (lines 400+)
- [ ] structuralValidatePHID_GSIS (lines 495+)
- [ ] structuralValidatePHID_PRC (lines 900+)
- [ ] structuralValidatePHID_TIN (lines 624+)
- [ ] structuralValidatePHID_PhilHealth (lines 801+)
- [ ] structuralValidatePHID_NBIClearance (lines 1147+)
- [ ] structuralValidatePHID_PoliceClearance (lines 1222+)
- [ ] structuralValidatePHID_PSACertificate (lines 990+)
- [ ] structuralValidatePHID_BarangayClearance (lines 1308+)
- [ ] structuralValidatePHID_COMELECVoterID (lines 1403+)

### 2.2 Validation Rules ✓

Each validator checks:
- [ ] Exact digit/character count
- [ ] Format-specific ranges (e.g., branch codes, region codes)
- [ ] Date format validation where applicable
- [ ] Checksum validation where applicable
- [ ] Sex digit or type indicator validation

**Helper functions used** (patterns.js):
- `normalizePHID()` - removes separators consistently
- `isPhIDPlaceholder()` - detects test/dummy values
- `extractPHIDValue()` - extracts value from labelled input
- `shannonEntropy()` - entropy check for low-entropy filtering

---

## 3. Scanner Integration Verification (TASK 7)

### 3.1 PATH A Integration ✓

**Location**: scanner.js, lines 319-375

**Changes**:
- [ ] runPathA() now checks `pattern.structuralValidate`
- [ ] Calls structuralValidate when defined
- [ ] Sets `validated: true` for patterns that pass structuralValidate
- [ ] Applies placeholder suppression (TASK-4.4)
- [ ] Applies entropy check (TASK-4.5)
- [ ] Logs validation failures for debugging

### 3.2 BASE_SCORES Configuration ✓

**Location**: scanner.js, lines 30-64

**Scores assigned**:
- [ ] 13 Philippine IDs: BASE_SCORES = 10 (same as credit_card, jwt, api_key)
- [ ] Barangay Clearance: BASE_SCORES = 8 (MODERATE risk, per Requirement 13)

### 3.3 ENTITY_TIER Configuration ✓

**Location**: scanner.js, lines 66-103

**Tiers assigned**:
- [ ] All 14 Philippine IDs: ENTITY_TIER = "critical"

**Reasoning**: Government IDs are classified as critical entities regardless of risk level, enabling Governance Rule 1 escalation.

---

## 4. Governance Rule 1 Escalation (TASK 8)

### 4.1 Escalation Logic ✓

**Location**: scanner.js, lines 150-181 (evaluateGovernance function)

**Rule**: When `validated:true` AND `ENTITY_TIER="critical"` AND `patternId.startsWith("ph_id_")`:
- [ ] Escalate risk to "high" regardless of other scoring factors
- [ ] Log: "[TrustPrompt/governance] Rule 1 escalation: ph_id_[type] (validated) → HIGH"
- [ ] Return governance rule "rule_1_validated_philid"

### 4.2 Final Classification ✓

**Location**: scanner.js, lines 211-227 (finalClass function)

**Changes**:
- [ ] Added check for "rule_1_validated_philid" rule
- [ ] Returns "high" for escalated findings

### 4.3 Risk Scoring ✓

**Location**: scanner.js, lines 230-250 (computeRiskScore function)

**Behavior**:
- [ ] Philippine IDs included in BASE_SCORES aggregation
- [ ] Escalated findings participate in final risk classification
- [ ] No interference with deduplication or merging logic

---

## 5. Test Coverage (TASK 6.3, 7.4, 8.3)

### 5.1 Pattern Registry Tests ✓

**File**: test-pattern-registry.js
- [ ] All 14 patterns registered
- [ ] Pattern IDs are unique
- [ ] Regex matches with/without separators
- [ ] Sanitize functions produce consistent output
- [ ] All patterns have required fields
- [ ] Risk levels correct (13 high, 1 moderate)

### 5.2 Scanner PATH A Integration Tests ✓

**File**: test-scanner-path-a.js
- [ ] PhilID pattern matches valid input
- [ ] SSS pattern matches valid input
- [ ] Multiple IDs detected in single scan
- [ ] Risk scoring includes Philippine IDs
- [ ] Invalid IDs fail structural validation
- [ ] ENTITY_TIER and BASE_SCORES coverage verified

### 5.3 Governance Escalation Tests ✓

**File**: test-governance-escalation.js
- [ ] Single validated PhilID escalates to HIGH
- [ ] Multiple escalations work correctly
- [ ] Barangay clearance escalates to HIGH (despite MODERATE risk)
- [ ] Non-validated IDs don't escalate
- [ ] Mixed findings escalate correctly
- [ ] SSS, TIN, Passport escalations verified
- [ ] Redaction in escalated findings verified

---

## 6. Performance Verification (TASK 9)

### 6.1 Validator Performance ✓

**Target**: Each validator < 1ms, total < 10ms

**Metrics to measure**:
- [ ] PhilID validation time
- [ ] SSS validation time
- [ ] TIN validation time
- [ ] Driver's License validation time
- [ ] All others

**Optimization techniques used**:
- [ ] Pre-compiled regex patterns (in pattern objects)
- [ ] Minimal string operations
- [ ] Early exits for invalid formats
- [ ] No external library calls

---

## 7. Documentation Verification (TASK 12)

### 7.1 Inline Documentation ✓

**Added to each validator**:
- [ ] Function signature and parameters
- [ ] Description of format rules
- [ ] Example valid and invalid IDs
- [ ] References to requirements
- [ ] Validation rules explained

**Location**: patterns.js, lines 1500+ for PhilID, etc.

### 7.2 Integration Documentation ✓

**Added to scanner.js**:
- [ ] Comments explaining PATH A integration (lines 319-328)
- [ ] Comments for structuralValidate wiring (line 347)
- [ ] Comments for Governance Rule 1 (lines 150-155)
- [ ] BASE_SCORES and ENTITY_TIER comments (lines 30-65, 66-103)

### 7.3 PH_ID_METADATA Documentation ✓

**Location**: patterns.js, lines 1906-2240

Each ID type has documented:
- [ ] id (patternId)
- [ ] label (human-readable name)
- [ ] risk level
- [ ] digitCount/format
- [ ] format description
- [ ] separators allowed
- [ ] regexTemplate
- [ ] structuralRules (array of validation checks)
- [ ] sanitizeFormat (template)
- [ ] exampleValid
- [ ] exampleInvalid

---

## 8. Functional Testing Checklist

### 8.1 PhilID Testing

- [ ] Test valid PhilID: 920315123456 → detected, validated
- [ ] Test with separators: 92-03-15-123-45-6 → detected, validated
- [ ] Test invalid sex digit: 920315123459 → not detected
- [ ] Test invalid length: 9203151234 → not detected
- [ ] Sanitization: 920315123456 → "12-****-****-**12"

### 8.2 SSS Testing

- [ ] Test valid SSS: 0412345678 → detected, validated
- [ ] Test with separators: 04-123456-78 → detected, validated
- [ ] Test invalid branch (00): 0012345678 → not detected
- [ ] Test invalid branch (60): 6012345678 → not detected
- [ ] Sanitization: 0412345678 → "04-XXXXXX-78"

### 8.3 TIN Testing

- [ ] Test valid TIN: 123456789 → detected, validated
- [ ] Test with separators: 123-45-678-9 → detected, validated
- [ ] Test invalid area code (090): 090456789 → not detected
- [ ] Sanitization: 123456789 → "123-****-89"

### 8.4 Driver's License Testing

- [ ] Test numeric: 12345678901 → detected, validated
- [ ] Test alphanumeric: 12-34-ABCD-567 → detected, validated
- [ ] Test invalid region (00): 00345678901 → not detected
- [ ] Sanitization: 12345678901 → "12-*******-901"

### 8.5 Passport Testing

- [ ] Test without prefix: 123456789 → detected, validated
- [ ] Test with P prefix: P123456789 → detected, validated
- [ ] Test with PH prefix: PH12345678 → detected, validated
- [ ] Test invalid type digit (0): 012345678 → not detected
- [ ] Sanitization: P123456789 → "P1-****89"

### 8.6 Governance Escalation Testing

- [ ] PhilID alone → HIGH risk (escalated)
- [ ] SSS alone → HIGH risk (escalated)
- [ ] Barangay clearance alone → HIGH risk (escalated despite MODERATE BASE_SCORES)
- [ ] Multiple IDs → HIGH risk
- [ ] Mixed with email → HIGH risk (PhilID escalation dominates)

### 8.7 Placeholder Suppression Testing

- [ ] Test known placeholder: "00-000000-00" (SSS) → suppressed
- [ ] Test all-ones: "11-111111-11" (SSS) → suppressed
- [ ] Test generic placeholder: "XX-XXXXXX-XX" → suppressed

### 8.8 Entropy Testing

- [ ] Low-entropy dummy → suppressed by minEntropy check
- [ ] High-entropy real ID → passes entropy check

---

## 9. Browser Extension Integration (TASK 11)

### 9.1 Content Script Integration

- [ ] patterns.js loaded in content script context
- [ ] All validators available to scanner.js
- [ ] Helper functions accessible
- [ ] PH_ID_METADATA frozen and immutable

### 9.2 Background Script Integration

- [ ] Scanner.js uses updated BASE_SCORES
- [ ] Scanner.js uses updated ENTITY_TIER
- [ ] Governance escalation works in background
- [ ] Risk scores calculated correctly

### 9.3 UI Integration

- [ ] Redacted findings display correctly in side panel
- [ ] Risk classification shown ("high", "moderate", "low")
- [ ] Governance rule shown in details
- [ ] No console errors

---

## 10. Known Test Vectors

### Test Text Examples

```
Valid text with all 14 IDs:
PhilID: 92-03-15-123-45-6
Driver's License: 12-34-ABCD-567
Passport: P123456789
UMID: 1000-01-23-04-51
SSS: 04-123456-78
GSIS: 1234-12345-0
PRC: 2021-1234567
TIN: 123-45-678-9
PhilHealth: 12-345678-901-2
NBI Clearance: 12-345-67890
Police Clearance: PNP-2021-123456
PSA Certificate: 101-234-5678901
Barangay Clearance: BC-2021-01-1234
COMELEC Voter's ID: 12-34-56-7890-1234
```

### Invalid Examples (should not detect)

```
Invalid PhilID (sex digit 9): 92-03-15-123-45-9
Invalid SSS (branch 00): 00-123456-78
Invalid TIN (area 090): 090-45-678-9
Invalid DL (region 00): 00-34-ABCD-567
Invalid Passport (type 0): 012345678
```

---

## 11. Expected Results Summary

| Pattern | Detection | Validation | Escalation | Redaction |
|---------|-----------|-----------|-----------|-----------|
| PhilID | ✓ | ✓ | HIGH | "12-****-****-**12" |
| Driver's License | ✓ | ✓ | HIGH | "12-*******-890" |
| Passport | ✓ | ✓ | HIGH | "P1-****89" |
| UMID | ✓ | ✓ | HIGH | "1234-****-90-12" |
| SSS | ✓ | ✓ | HIGH | "12-XXXXXX-90" |
| GSIS | ✓ | ✓ | HIGH | "1234-XXXXX-0" |
| PRC | ✓ | ✓ | HIGH | Middle redacted |
| TIN | ✓ | ✓ | HIGH | "123-****-89" |
| PhilHealth | ✓ | ✓ | HIGH | "12-*********-2" |
| NBI Clearance | ✓ | ✓ | HIGH | "12-34-****-890" |
| Police Clearance | ✓ | ✓ | HIGH | "PNP-****-56" |
| PSA Certificate | ✓ | ✓ | HIGH | "123-****-8901-23" |
| Barangay Clearance | ✓ | ✓ | HIGH* | "BC-2021-****" |
| COMELEC Voter's ID | ✓ | ✓ | HIGH | "12-34-56-****-****" |

*Barangay Clearance: MODERATE BASE_SCORES (8) but CRITICAL ENTITY_TIER, so escalates to HIGH via Governance Rule 1

---

## 12. Sign-Off

**Implementation Status**: ✓ COMPLETE

**Tests Created**:
- ✓ test-pattern-registry.js (TASK 6.3)
- ✓ test-scanner-path-a.js (TASK 7.4)
- ✓ test-governance-escalation.js (TASK 8.3)

**Code Changes**:
- ✓ patterns.js: 14 patterns, validators, PH_ID_METADATA
- ✓ scanner.js: BASE_SCORES, ENTITY_TIER, runPathA integration, Governance Rule 1

**Documentation**:
- ✓ Inline function documentation
- ✓ Integration point comments
- ✓ This QA checklist

**Ready for QA Verification**: YES

---

**Next Steps**:
1. Run test-pattern-registry.js in Node environment
2. Run test-scanner-path-a.js to verify scanner integration
3. Run test-governance-escalation.js to verify escalation logic
4. Manual browser extension testing
5. Verify no regressions in existing tests
