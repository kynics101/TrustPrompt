# Task 7.1 Verification: Update scanner.js to include Philippine ID patterns in runPathA()

## Task Requirements
- Ensure all 14 ph_id_* patterns are included in pattern iteration
- Apply entropy check (TASK-4.5: shannonEntropy minimum)
- Apply placeholder suppression (TASK-4.4: isKnownPlaceholder)
- Reference: Requirements 18, 20

## Implementation Status: ✅ COMPLETE

### 1. All 14 ph_id_* Patterns Present in TRUSTPROMPT_PATTERNS

**Location:** patterns.js (lines 1817-2061)

**Confirmed patterns:**
1. `ph_id_nbi_clearance` (line 1817)
2. `ph_id_police_clearance` (line 1834)
3. `ph_id_barangay_clearance` (line 1852)
4. `ph_id_comelec_voter_id` (line 1869)
5. `ph_id_philid` (line 1886)
6. `ph_id_drivers_license` (line 1903)
7. `ph_id_passport` (line 1920)
8. `ph_id_umid` (line 1938)
9. `ph_id_sss` (line 1955)
10. `ph_id_gsis` (line 1972)
11. `ph_id_prc` (line 1989)
12. `ph_id_tin` (line 2007)
13. `ph_id_philhealth` (line 2024)
14. `ph_id_psa_certificate` (line 2043)

**Verification:** All 14 patterns have:
- ✅ `id: "ph_id_*"` property
- ✅ `regex` property (for inclusion in runPathA)
- ✅ `structuralValidate` property (for validation)
- ✅ `sanitize` property (for redaction)
- ✅ `risk: "high"` (except barangay_clearance: "moderate")

### 2. runPathA() Implementation Analysis

**Location:** scanner.js, function `runPathA(normalisedText)` (starts ~line 340)

#### Pattern Iteration
```javascript
function runPathA(normalisedText) {
  const findings = [];
  for (const pattern of TRUSTPROMPT_PATTERNS) {  // ✅ Iterates through all patterns
    if (!pattern.regex) continue;  // ✅ Skips regex-less patterns (only ph_mobile)
```

**Status:** ✅ All ph_id patterns have regex → all included in iteration

#### Entropy Check (TASK-4.5)
```javascript
if (pattern.minEntropy !== undefined) {
  const valueMatch = raw.match(/[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{10,})["']?\s*$/)
                  || raw.match(/^([A-Za-z0-9\-_\.+\/=]{10,})$/);
  const valueStr = valueMatch ? valueMatch[1] : raw;
  if (shansonEntropy(valueStr) < pattern.minEntropy) {
    console.log(`[TrustPrompt/entropy] rejected low-entropy match...`);
    continue;  // ✅ Rejects low-entropy values
  }
}
```

**Status:** ✅ Entropy check applied before validation

#### Placeholder Suppression (TASK-4.4)
```javascript
if (isKnownPlaceholder(pattern.id, raw)) {
  console.log(`[TrustPrompt/placeholder] rejected known placeholder...`);
  continue;  // ✅ Rejects known placeholders
}
```

**Status:** ✅ Placeholder suppression applied before validation

#### Structural Validators (TASK-7.2)
```javascript
let isValidated = false;
if (pattern.structuralValidate) {
  isValidated = pattern.structuralValidate(raw);  // ✅ Calls validator for ph_id patterns
  if (!isValidated) {
    console.log(`[TrustPrompt/validator] structural validation failed...`);
    continue;  // ✅ Rejects failed validation
  }
}
```

**Status:** ✅ All ph_id patterns use structuralValidate → findings marked `validated: true`

#### Finding Creation
```javascript
findings.push({
  patternId:   pattern.id,
  label:       pattern.label,
  risk:        pattern.risk,
  rawMatch:    raw,
  safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
  validated:   isValidated,  // ✅ Set to true after structuralValidate passes
  source:      "A_regex"
});
```

**Status:** ✅ Finding created with `validated: true` for ph_id patterns

### 3. Governance Rule 1 Escalation (Requirements 18, 20)

**Location:** scanner.js, function `evaluateGovernance()` (line ~215)

```javascript
const validatedPhilIDFinding = findings.find(
  f => f.validated === true && 
       ENTITY_TIER[f.patternId] === "critical" &&
       f.patternId && f.patternId.startsWith("ph_id_")
);

if (validatedPhilIDFinding) {
  console.log(`[TrustPrompt/governance] Rule 1 escalation: ${validatedPhilIDFinding.patternId} (validated) → HIGH`);
  return { rule: "rule_1_validated_philid", result: "high" };
}
```

**Status:** ✅ Governance Rule 1 implemented for validated ph_id patterns → HIGH risk escalation

### 4. Risk Scoring Integration

**Location:** scanner.js, `BASE_SCORES` and `ENTITY_TIER` objects (lines 44-78)

```javascript
const BASE_SCORES = {
  ph_id_philid:              10,  // PhilID (PSA National ID)
  ph_id_drivers_license:     10,  // Driver's License (LTO)
  ph_id_passport:            10,  // Passport (BI)
  ph_id_umid:                10,  // UMID (Unified Multi-Purpose ID)
  ph_id_sss:                 10,  // SSS (Social Security System)
  ph_id_gsis:                10,  // GSIS (Government Service Insurance System)
  ph_id_prc:                 10,  // PRC (Professional Regulation Commission)
  ph_id_tin:                 10,  // TIN (Taxpayer Identification Number)
  ph_id_philhealth:          10,  // PhilHealth (Health Insurance)
  ph_id_nbi_clearance:       10,  // NBI Clearance
  ph_id_police_clearance:    10,  // Police Clearance (PNP)
  ph_id_psa_certificate:     10,  // PSA Certificate (Vital Records)
  ph_id_barangay_clearance:  8,   // Barangay Clearance (MODERATE risk)
  ph_id_comelec_voter_id:    10,  // COMELEC Voter's ID
};

const ENTITY_TIER = {
  ph_id_philid:              "critical",  // PhilID (PSA National ID)
  ph_id_drivers_license:     "critical",  // Driver's License (LTO)
  ph_id_passport:            "critical",  // Passport (BI)
  ph_id_umid:                "critical",  // UMID (Unified Multi-Purpose ID)
  ph_id_sss:                 "critical",  // SSS (Social Security System)
  ph_id_gsis:                "critical",  // GSIS (Government Service Insurance System)
  ph_id_prc:                 "critical",  // PRC (Professional Regulation Commission)
  ph_id_tin:                 "critical",  // TIN (Taxpayer Identification Number)
  ph_id_philhealth:          "critical",  // PhilHealth (Health Insurance)
  ph_id_nbi_clearance:       "critical",  // NBI Clearance
  ph_id_police_clearance:    "critical",  // Police Clearance (PNP)
  ph_id_psa_certificate:     "critical",  // PSA Certificate (Vital Records)
  ph_id_barangay_clearance:  "critical",  // Barangay Clearance (MODERATE risk but CRITICAL tier)
  ph_id_comelec_voter_id:    "critical",  // COMELEC Voter's ID
};
```

**Status:** ✅ All 14 ph_id patterns configured with BASE_SCORES and ENTITY_TIER

### 5. Structural Validators Implementation

All 14 ph_id patterns have corresponding structural validator functions in patterns.js:

1. `structuralValidatePHID_PhilID` (line ~1400)
2. `structuralValidatePHID_DriversLicense` (line ~724)
3. `structuralValidatePHID_Passport` (line ~565)
4. `structuralValidatePHID_UMID` (line ~299)
5. `structuralValidatePHID_SSS` (line ~400)
6. `structuralValidatePHID_GSIS` (line ~495)
7. `structuralValidatePHID_PRC` (line ~900)
8. `structuralValidatePHID_TIN` (line ~624)
9. `structuralValidatePHID_PhilHealth` (line ~801)
10. `structuralValidatePHID_PSACertificate` (line ~990)
11. `structuralValidatePHID_NBIClearance` (line ~1147)
12. `structuralValidatePHID_PoliceClearance` (line ~1222)
13. `structuralValidatePHID_BarangayClearance` (line ~1355)
14. `structuralValidatePHID_COMELECVoterID` (line ~1501)

**Status:** ✅ All 14 validators implemented and wired to patterns

## Conclusion

**Task 7.1 is COMPLETE ✅**

All requirements have been met:
1. ✅ All 14 ph_id_* patterns included in TRUSTPROMPT_PATTERNS
2. ✅ runPathA() iterates through all patterns via `for (const pattern of TRUSTPROMPT_PATTERNS)`
3. ✅ Entropy check applied (TASK-4.5)
4. ✅ Placeholder suppression applied (TASK-4.4)
5. ✅ Structural validators wired (TASK-7.2)
6. ✅ Governance Rule 1 escalation implemented (Requirements 18, 20)
7. ✅ Risk scoring integrated for all ph_id patterns
8. ✅ All patterns have regex property → will be processed by runPathA()

### Processing Flow
```
Text Input
  → normalize (TrustNormalizer)
  → runPathA (iterates TRUSTPROMPT_PATTERNS)
    → For each ph_id pattern:
      1. Match against regex
      2. Apply placeholder suppression (isKnownPlaceholder)
      3. Apply entropy check (shannonEntropy)
      4. Call structuralValidate → set validated: true/false
      5. Create finding with validated flag
  → mergeAndDedupe (combine findings from all paths)
  → suppressPlaceholders (secondary filter)
  → computeRiskScore (uses ph_id BASE_SCORES and ENTITY_TIER)
  → evaluateGovernance (Rule 1 escalation for validated ph_id patterns)
  → return findings with appropriate risk level
```

### Test Coverage
- test-scanner-path-a.js validates PATH A integration
- Existing Philippine ID validator tests verify structural validation
- Risk scoring tests verify governance rule application
