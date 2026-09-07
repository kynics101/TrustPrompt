# Philippine Government ID Patterns Requirements

## Introduction

TrustPrompt currently detects government-issued ID fields through a generic pattern (`id_label`) that matches generic labels (e.g., "passport no", "driver's license no") but does not validate the structural integrity of individual Philippine ID types. This feature adds 14 distinct Philippine government ID patterns, each with specific formatting rules and digit count validation.

Each ID type follows a unique structural standard defined by the Philippine government or international standards bodies. Implementing per-ID-type validation improves detection accuracy, reduces false positives, and marks validated findings as trustworthy for governance escalation (Rule 1: validated critical entities escalate to HIGH risk).

The 14 ID types include: PhilID (PSA National ID), Driver's License, Passport, UMID, SSS (Social Security System), GSIS (Government Service Insurance System), PRC (Professional Regulation Commission), TIN (Taxpayer Identification Number), PhilHealth, NBI Clearance, Police Clearance, PSA Certificate, Barangay Clearance, and COMELEC Voter's ID.

## Glossary

- **System**: TrustPrompt (the browser extension that detects and redacts PII)
- **Pattern**: A regex expression combined with optional structural validation rules to detect a specific type of data
- **Pattern ID**: Machine-readable key identifying the pattern type (e.g., `ph_id_philid`, `ph_id_drivers_license`)
- **Structural Validation**: Function that confirms a match meets specific digit-count, format, and checksum rules for a given ID type
- **Validated**: A finding marked `validated: true` when structural validation confirms the match is a real ID (not a false positive)
- **Governance Rule 1**: Escalation rule that raises CRITICAL tier findings with `validated: true` to HIGH risk level regardless of other scoring factors
- **Philippine Government ID**: Any government-issued identification document recognized by the Philippine government or international standards (e.g., PSA, LTO, BIR, POEA, PRC, NBI, BIR, BuCor, etc.)
- **RA 10173**: Philippine Data Privacy Act; classifies government ID numbers as Sensitive Personal Information (SPI)
- **Checksum Validation**: Mathematical verification (e.g., Luhn algorithm, modulo 10 check) to confirm ID number format integrity
- **Digit Count**: The exact number of digits expected in a valid ID of a given type
- **Format Rule**: Specific ordering, grouping, or character composition expected in a valid ID (e.g., "6 digits + 4 digits + 5 digits")

## Requirements

### Requirement 1: PhilID (PSA National ID) Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine national ID numbers (PhilID) issued by the Philippine Statistics Authority (PSA), so that I can flag this high-sensitivity government identifier.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_philid"` that detects PhilID numbers
2. THE System SHALL accept PhilID input in the format: 12 digits (e.g., "123456789012")
3. THE System SHALL validate PhilID structure via `structuralValidate` function that confirms:
   - Exactly 12 numeric digits
   - First 6 digits represent birth date (YYMMDD format)
   - Digits 7–9 represent city/municipality code (000–999)
   - Digits 10–11 represent order of registration (00–99)
   - Digit 12 represents sex (1 = male, 2 = female)
4. WHEN a 12-digit match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (PhilID is a critical government identifier under RA 10173)
6. WHEN the System sanitizes a PhilID finding, THE System SHALL redact all but the first 2 and last 2 digits (e.g., "12**-****-****-**12")

### Requirement 2: Driver's License Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine driver's license numbers issued by the Land Transportation Office (LTO), so that I can flag this authentication and identification credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_drivers_license"` that detects driver's license numbers
2. THE System SHALL accept driver's license input in the format: 11 digits or 11 alphanumeric characters (LTO issues both numeric-only and alphanumeric variants)
3. THE System SHALL validate driver's license structure via `structuralValidate` function that confirms:
   - 11 characters total (numeric or alphanumeric mix)
   - First 2 digits represent region code (01–16 for Philippine regions)
   - Digits 3–4 represent city/municipality code (00–99)
   - Digits 5–8 represent series/batch code (numeric or alphanumeric)
   - Digits 9–11 represent sequence number (000–999 or AAA–ZZZ depending on variant)
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (Driver's license is a widely-used identity document under RA 10173)
6. WHEN the System sanitizes a driver's license finding, THE System SHALL redact the middle 7 characters (e.g., "12-*******-890")

### Requirement 3: Passport Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine passport numbers issued by the Bureau of Immigration (BI), so that I can flag this international travel credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_passport"` that detects Philippine passport numbers
2. THE System SHALL accept passport input in the format: 8–9 digits or "P" followed by 8–9 digits (e.g., "12345678" or "P123456789")
3. THE System SHALL validate passport structure via `structuralValidate` function that confirms:
   - Optional "P" prefix (or "PH" for newer formats)
   - 8–9 numeric digits
   - First digit represents passport type (1–3 for standard, official, diplomatic)
   - Remaining digits represent unique sequence within issuance batch
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (Passport is an international travel credential under RA 10173 and UNCHR standards)
6. WHEN the System sanitizes a passport finding, THE System SHALL redact digits 3–7 (e.g., "P1-****89" or "123-****789")

### Requirement 4: UMID (Unified Multi-Purpose ID) Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Unified Multi-Purpose ID (UMID) numbers issued by SSS, so that I can flag this unified government identifier credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_umid"` that detects UMID numbers
2. THE System SHALL accept UMID input in the format: 12 digits (e.g., "123456789012")
3. THE System SHALL validate UMID structure via `structuralValidate` function that confirms:
   - Exactly 12 numeric digits
   - First 4 digits represent the SSS system code (1000–1999)
   - Digits 5–8 represent month/year of issuance (MMYY format)
   - Digits 9–11 represent batch/series (000–999)
   - Digit 12 represents check digit (0–9, calculated via modulo 10)
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (UMID is a unified government identifier credential under RA 10173)
6. WHEN the System sanitizes an UMID finding, THE System SHALL redact digits 5–10 (e.g., "1234-****-90-12")

### Requirement 5: SSS (Social Security System) Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Social Security System (SSS) numbers, so that I can flag this social insurance credential and employment identifier.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_sss"` that detects SSS numbers
2. THE System SHALL accept SSS input in the format: 10 digits (e.g., "1234567890") or with separators (e.g., "12-3456789-0")
3. THE System SHALL validate SSS structure via `structuralValidate` function that confirms:
   - Exactly 10 numeric digits (separators are optional and stripped)
   - First 2 digits represent branch code (01–59 for Philippine SSS branches)
   - Digits 3–8 represent membership sequence (000000–999999)
   - Digits 9–10 represent check digits (00–99, calculated via modulo 11)
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (SSS number is a social insurance identifier linked to employment and benefits under RA 10173)
6. WHEN the System sanitizes an SSS finding, THE System SHALL redact digits 3–8 (e.g., "12-****-90" or "12-XXXXXX-90")

### Requirement 6: GSIS (Government Service Insurance System) Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Government Service Insurance System (GSIS) numbers, so that I can flag this government employee identifier.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_gsis"` that detects GSIS numbers
2. THE System SHALL accept GSIS input in the format: 10 digits (e.g., "1234567890") or with separators (e.g., "12-3456789-0")
3. THE System SHALL validate GSIS structure via `structuralValidate` function that confirms:
   - Exactly 10 numeric digits (separators are optional and stripped)
   - First 4 digits represent the agency/account type (0001–9999)
   - Digits 5–9 represent member sequence (00000–99999)
   - Digit 10 represents check digit (0–9, calculated via modulo 10)
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (GSIS number identifies government employees and their benefits under RA 10173)
6. WHEN the System sanitizes a GSIS finding, THE System SHALL redact digits 5–9 (e.g., "1234-*****-0" or "1234-XXXXX-0")

### Requirement 7: PRC (Professional Regulation Commission) License Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Professional Regulation Commission (PRC) license numbers, so that I can flag this professional credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_prc"` that detects PRC license numbers
2. THE System SHALL accept PRC input in the format: 6–7 digits (e.g., "1234567") or with year prefix (e.g., "2021-1234567")
3. THE System SHALL validate PRC structure via `structuralValidate` function that confirms:
   - Optional 4-digit year prefix (1900–2099)
   - 6–7 numeric digits representing license ID
   - First 2 digits represent profession category (01–99 for different professions)
   - Remaining digits represent unique license sequence
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (PRC license numbers are professional credentials that identify individuals in regulated professions under RA 10173)
6. WHEN the System sanitizes a PRC finding, THE System SHALL redact the middle digits (e.g., "20-****67" or "****567")

### Requirement 8: TIN (Taxpayer Identification Number) Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Taxpayer Identification Numbers (TIN) issued by the Bureau of Internal Revenue (BIR), so that I can flag this financial identification credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_tin"` that detects TIN numbers
2. THE System SHALL accept TIN input in the format: 9 digits (e.g., "123456789") or with separators (e.g., "123-45-678-9" or "123 456 789")
3. THE System SHALL validate TIN structure via `structuralValidate` function that confirms:
   - Exactly 9 numeric digits (separators are optional and stripped)
   - First 3 digits represent the taxpayer's registration area code (100–900 for Philippine regions)
   - Digits 4–6 represent sequence of registration within that area (000–999)
   - Digits 7–8 represent further classification (00–99)
   - Digit 9 represents check digit (0–9, calculated via modulo 11)
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (TIN is a critical financial identifier linked to taxation, income, and financial status under RA 10173)
6. WHEN the System sanitizes a TIN finding, THE System SHALL redact digits 4–7 (e.g., "123-****-89" or "123 **** 89")

### Requirement 9: PhilHealth Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Health Insurance Corporation (PhilHealth) member ID numbers, so that I can flag this healthcare credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_philhealth"` that detects PhilHealth numbers
2. THE System SHALL accept PhilHealth input in the format: 12 digits (e.g., "123456789012") or with separators (e.g., "12-345-678-9-0-1-2")
3. THE System SHALL validate PhilHealth structure via `structuralValidate` function that confirms:
   - Exactly 12 numeric digits (separators are optional and stripped)
   - First 2 digits represent member category (00–99 for different categories: individual, dependent, etc.)
   - Digits 3–8 represent the member sequence number (000000–999999)
   - Digits 9–11 represent check code (000–999)
   - Digit 12 represents version/type indicator (0–9)
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (PhilHealth number is a healthcare identifier linked to medical records and insurance coverage under RA 10173)
6. WHEN the System sanitizes a PhilHealth finding, THE System SHALL redact digits 3–11 (e.g., "12-*********-2" or "12-*-*-*-*-*-*-2")

### Requirement 10: NBI Clearance Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine National Bureau of Investigation (NBI) clearance numbers, so that I can flag this criminal background check credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_nbi_clearance"` that detects NBI clearance numbers
2. THE System SHALL accept NBI clearance input in the format: 7–10 digits (e.g., "1234567" or "12-34-567-890") or with "NBI" prefix (e.g., "NBI1234567")
3. THE System SHALL validate NBI clearance structure via `structuralValidate` function that confirms:
   - Optional "NBI" prefix
   - 7–10 numeric digits representing clearance ID
   - First 2 digits represent year of issuance (00–99 for YY format)
   - Digits 3–5 represent office code (001–999 for NBI regional/branch offices)
   - Remaining digits represent clearance sequence within that period and office
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (NBI clearance numbers are background check credentials that identify individuals and their criminal record status under RA 10173)
6. WHEN the System sanitizes an NBI clearance finding, THE System SHALL redact the middle digits (e.g., "12-34-****-890" or "NBI-****567")

### Requirement 11: Police Clearance Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine National Police (PNP) clearance numbers, so that I can flag this law enforcement credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_police_clearance"` that detects Police clearance numbers
2. THE System SHALL accept Police clearance input in the format: 6–10 digits or alphanumeric (e.g., "123456" or "PNP-2021-123456")
3. THE System SHALL validate Police clearance structure via `structuralValidate` function that confirms:
   - Optional "PNP" prefix
   - 6–10 characters (numeric or alphanumeric)
   - If year-prefixed: 4-digit year (1900–2099) followed by 4–6 digit sequence
   - First digits represent office code or region (01–99 for PNP units)
   - Remaining digits represent sequence within issuance period
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (Police clearance numbers identify individuals and their police record status under RA 10173)
6. WHEN the System sanitizes a Police clearance finding, THE System SHALL redact the middle digits (e.g., "PNP-2021-****-56" or "*-*-***456")

### Requirement 12: PSA Certificate Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Statistics Authority (PSA) vital record certificate numbers (birth, marriage, death certificates), so that I can flag this vital document credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_psa_certificate"` that detects PSA certificate numbers
2. THE System SHALL accept PSA certificate input in the format: 8–13 digits or with separators (e.g., "12345678" or "123-4567-8901-23")
3. THE System SHALL validate PSA certificate structure via `structuralValidate` function that confirms:
   - 8–13 numeric digits (separators are optional and stripped)
   - First 3 digits represent certificate type code (e.g., 101 = birth, 201 = marriage, 301 = death)
   - Digits 4–6 represent province/city code (000–999)
   - Digits 7–10 represent year and batch number
   - Remaining digits represent sequence within that batch
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (PSA certificate numbers are vital records that identify individuals and their life events under RA 10173)
6. WHEN the System sanitizes a PSA certificate finding, THE System SHALL redact the middle digits (e.g., "123-****-8901-23" or "123-45-****-23")

### Requirement 13: Barangay Clearance Number Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Barangay Clearance numbers issued by local government units (LGU), so that I can flag this community-level credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_barangay_clearance"` that detects Barangay clearance numbers
2. THE System SHALL accept Barangay clearance input in the format: 4–8 digits or with year (e.g., "2021-123456" or "BC-2021-1234")
3. THE System SHALL validate Barangay clearance structure via `structuralValidate` function that confirms:
   - Optional "BC" or "Barangay" prefix
   - 4–8 numeric digits
   - If year-included: 4-digit year (1900–2099)
   - Barangay code (01–99 for barangay ID within municipality)
   - Sequence number within that period (0–9999)
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "moderate"` (Barangay clearance is a local credential; more sensitive than generic labels but less critical than national IDs under RA 10173)
6. WHEN the System sanitizes a Barangay clearance finding, THE System SHALL redact the sequence number (e.g., "BC-2021-****" or "2021-12-****")

### Requirement 14: COMELEC Voter's ID Pattern

**User Story:** As a privacy analyst, I want the System to detect Philippine Commission on Elections (COMELEC) Voter's ID numbers, so that I can flag this electoral credential.

#### Acceptance Criteria

1. THE System SHALL define a pattern with `patternId: "ph_id_comelec_voter_id"` that detects COMELEC Voter's ID numbers
2. THE System SHALL accept COMELEC input in the format: 10–14 digits or with separators (e.g., "1234567890" or "12-345-678-90-1234")
3. THE System SHALL validate COMELEC structure via `structuralValidate` function that confirms:
   - 10–14 numeric digits (separators are optional and stripped)
   - First 2 digits represent province code (01–82 for Philippine provinces)
   - Digits 3–4 represent city/municipality code (01–99)
   - Digits 5–6 represent barangay code (01–99)
   - Digits 7–10 represent precinct number (0000–9999)
   - Remaining digits represent voter sequence within that precinct
4. WHEN a match is found and passes structural validation, THE System SHALL set `validated: true`
5. THE System SHALL assign `risk: "high"` (COMELEC Voter's ID is an electoral credential that identifies eligible voters and voting location under RA 10173)
6. WHEN the System sanitizes a COMELEC finding, THE System SHALL redact digits 7–13 (e.g., "12-34-56-****-****" or "12-34-56-****-1234")

### Requirement 15: Pattern Registry and Metadata

**User Story:** As a system architect, I want all 14 Philippine ID patterns to be registered in `patterns.js` with consistent metadata, so that the scanner can discover, validate, and score them uniformly.

#### Acceptance Criteria

1. THE System SHALL add 14 new pattern objects to the TRUSTPROMPT_PATTERNS array in `patterns.js`
2. EACH pattern SHALL include:
   - `id` (patternId): lowercase kebab-case identifier (e.g., `ph_id_philid`, `ph_id_drivers_license`)
   - `label`: human-readable English name (e.g., "PhilID (PSA National ID)")
   - `regex`: pattern to detect the ID format (numeric digits with optional separators)
   - `risk`: one of `"high"` or `"moderate"` (13 IDs use HIGH, barangay clearance uses MODERATE)
   - `validate`: null (structural validation uses custom `structuralValidate` function instead)
   - `structuralValidate`: function(raw) => boolean; performs digit-count and format verification
   - `sanitize`: function(m) => string; returns redacted display version
   - `reason`: plain-language explanation of why this ID type is flagged as PII

3. EACH `structuralValidate` function SHALL:
   - Strip optional separators (hyphens, spaces, letters)
   - Verify digit count and format rules per that ID type
   - Return true if all structural rules are satisfied, false otherwise
   - NOT throw errors if the input is malformed (return false instead)

4. THE System SHALL ensure all pattern definitions follow the same structure and naming conventions as existing patterns (credit_card, api_key, jwt, etc.)

### Requirement 16: Validated Flag and Governance Escalation

**User Story:** As a system designer, I want validated Philippine ID findings to be escalated to HIGH risk by Governance Rule 1, so that confirmed government identifiers are treated as critical.

#### Acceptance Criteria

1. WHEN a Philippine ID pattern matches and `structuralValidate` returns true, THE Scanner SHALL set `validated: true` on the finding
2. WHEN a finding has `patternId` matching any of the 14 Philippine ID types, THE Scanner SHALL classify it as `ENTITY_TIER: "critical"`
3. WHEN Governance Rule 1 evaluates a finding with `validated: true` and `ENTITY_TIER: "critical"`, THE Scanner SHALL escalate the risk level to `"high"` regardless of other scoring factors
4. THE Scanner SHALL log the escalation decision (e.g., "[TrustPrompt/governance] Rule 1 escalation: ph_id_philid (validated) → HIGH")

### Requirement 17: Regex Pattern Design

**User Story:** As a pattern designer, I want the regex for each Philippine ID to detect common input formats (with or without separators), so that users are protected regardless of how they paste or write ID numbers.

#### Acceptance Criteria

1. THE System SHALL design each ID pattern regex to accept:
   - Numeric digits (required)
   - Optional separators: hyphens, spaces, dots
   - Optional prefixes (where applicable, e.g., "P" for passport, "NBI" for NBI clearance)
   - Case-insensitive matching where alphanumeric characters are involved

2. EACH regex SHALL use word boundary markers (\b) or lookahead/lookbehind assertions to avoid matching ID digits that appear mid-word (e.g., in code variable names)

3. THE System SHALL test each regex against known valid ID formats and ensure false-positive rate is minimized (calibration via test suite)

### Requirement 18: Integration with Existing Scanner

**User Story:** As a system integrator, I want the new Philippine ID patterns to integrate seamlessly with the existing TrustScanner pipeline, so that they participate in finding merging, deduplication, and risk scoring without modification to core scanner logic.

#### Acceptance Criteria

1. WHEN the Scanner runs PATH A (regex matching), THE Scanner SHALL include all 14 Philippine ID patterns in its iteration through TRUSTPROMPT_PATTERNS
2. EACH Philippine ID finding SHALL be processed through the same entropy check (TASK-4.5) and placeholder suppression (TASK-4.4) as existing high-risk patterns
3. WHEN merging findings from PATH A/B/C, THE Scanner SHALL apply the same deduplication logic (keep highest risk level)
4. WHEN computing risk score, THE Scanner SHALL include Philippine ID findings in BASE_SCORES and ENTITY_TIER with appropriate values (score 10 for 13 IDs, score 8 for barangay clearance)
5. THE Scanner SHALL not require modifications to `computeRiskScore()`, `mergeAndDedupe()`, or governance evaluation logic

### Requirement 19: Safe Redaction and Display

**User Story:** As a UX designer, I want Philippine ID redactions to be contextually meaningful, so that users understand what type of ID was detected without seeing the actual identifier.

#### Acceptance Criteria

1. EACH Philippine ID pattern's `sanitize` function SHALL produce a redaction format that:
   - Preserves at least 2 leading digits and 2 trailing digits (to help users identify their own IDs if present)
   - Redacts the middle portion (e.g., "12-****-90" or "PHILID-**-1290")
   - Uses consistent formatting (asterisks for numeric digits, readable label if applicable)

2. WHEN displaying a finding in the UI, THE System SHALL show the `safeVersion` string instead of `rawMatch`

3. THE System SHALL include the pattern's `label` in the UI display (e.g., "PhilID (PSA National ID): 12-****-90")

### Requirement 20: Performance Baseline

**User Story:** As a performance analyst, I want Philippine ID pattern validation to add minimal latency to the scan pipeline, so that overall scan performance is not degraded.

#### Acceptance Criteria

1. WHEN the Scanner processes 100–500 characters of text containing Philippine ID matches, THE structural validation for all 14 ID types SHALL complete within 10ms
2. IF structural validation for any single pattern exceeds 1ms, THE System SHALL log a performance warning (but not suppress the validation)
3. THE System SHALL use caching where possible (e.g., pre-compiled regex objects) to minimize recompilation overhead

