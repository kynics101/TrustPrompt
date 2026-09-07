# Philippine Government ID Patterns — Design Document

## Overview

This document specifies the architecture, component design, and implementation strategy for detecting, validating, sanitizing, and escalating 14 distinct Philippine government-issued ID types within the TrustPrompt PII detection system.

### Scope

This feature adds structural validation functions for 14 Philippine ID types:
1. Social Security System (SSS)
2. Government Service Insurance System (GSIS)
3. PhilHealth
4. Pag-IBIG / Home Development Mutual Fund (HDMF)
5. Tax Identification Number (TIN)
6. Passport
7. Driver's License
8. Unified ID (PhilSys)
9. Postal ID
10. Voter's ID
11. National ID (NATIONAL ID)
12. National Bureau of Investigation (NBI) Clearance
13. Bureau of Internal Revenue (BIR) Registration
14. Employees Provident Fund (based on GSIS-like format)

**Design Goal**: Provide fine-grained structural validation per ID type, enabling high-confidence classification and Governance Rule 1 escalation (validated critical entities → HIGH risk).

**Risk Classification**: All 14 ID types are classified as **critical** PII under RA 10173 (Philippines Data Privacy Act) because:
- Direct personal identifiers issued by government agencies
- Uniquely identify individuals across government systems
- Used for authentication, benefit claims, and identity verification
- Disclosure enables identity theft, benefit fraud, and account takeover

---

## Architecture

### 1. Structural Validation Layer

Each ID type has a dedicated validation function placed in `patterns.js`. These functions follow this contract:

```javascript
/**
 * Structural validator for [ID Type]
 * @param {string} raw - the raw matched value (may include prefixes/labels)
 * @returns {boolean} - true if structure is valid (format-only; no checksum)
 */
function structuralValidatePHID_[Type](raw) {
  // Extract value portion (after label, quotes, equals)
  const value = extractValue(raw);
  
  // Check format: length, character set, optional separators
  const pattern = /^[expected pattern]$/;
  
  if (!pattern.test(value)) return false;
  
  // Optional: checksum validation (if algorithm known)
  // return validateChecksum(value);
  
  return true;
}
```

### 1.1 ID Type Specifications

#### SSS (Social Security System)

- **Format**: 10 digits, typically displayed as `XX-XXXXXXX-X` (2-6-1)
- **Regex Pattern**: `/(?:sss|social\s?security)\s*:?\s*["']?(\d{10}|[\d-]{12})["']?/gi`
- **Validator**: `structuralValidatePHID_SSS`
- **Checksum**: No published algorithm; structural check only (10 digits, optional dashes)
- **Sanitization**: `XXX-XXXXX-X` (show first 2, redact middle 6, show last 1)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_SSS(raw) {
  const value = raw.replace(/\D/g, "");  // strip non-digits
  return /^\d{10}$/.test(value);
}
```

#### GSIS (Government Service Insurance System)

- **Format**: 12 digits, typically `XXXXXXXXXXXX` or with separators `XX-XXXXXXX-XXX`
- **Regex Pattern**: `/(?:gsis|government\s?service\s?insurance)\s*:?\s*["']?(\d{12}|[\d-]{15})["']?/gi`
- **Validator**: `structuralValidatePHID_GSIS`
- **Checksum**: No published algorithm; structural check only (12 digits)
- **Sanitization**: `XX-XXXX-XXXXX` (show first 2, redact middle 7, show last 3)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_GSIS(raw) {
  const value = raw.replace(/\D/g, "");
  return /^\d{12}$/.test(value);
}
```

#### PhilHealth

- **Format**: 12 digits (recent system) or 15 alphanumeric (legacy RF ID cards)
- **Regex Pattern**: `/(?:philhealth|ph|health\s?card)\s*:?\s*["']?([A-Z0-9\-]{12,20})["']?/gi`
- **Validator**: `structuralValidatePHID_PhilHealth`
- **Checksum**: No published algorithm; length and character class check
- **Sanitization**: `XXXX-XXXX-XXXX` (show first 4, redact middle 4, show last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_PhilHealth(raw) {
  const value = raw.replace(/\W/g, "");  // alphanumeric only
  return /^[A-Z0-9]{12}$|^[A-Z0-9]{15}$/.test(value);
}
```

#### Pag-IBIG (Home Development Mutual Fund)

- **Format**: 12 digits, typically `XXXX-XX-XXXXXX` or `XXXXXXXXXXXX`
- **Regex Pattern**: `/(?:pag[- ]?ibig|pagibig|hdmf)\s*:?\s*["']?(\d{12}|[\d-]{14})["']?/gi`
- **Validator**: `structuralValidatePHID_PagIBIG`
- **Checksum**: No published algorithm; structural check only (12 digits)
- **Sanitization**: `XXXX-XX-XXXX` (show first 4, redact middle 2, show last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_PagIBIG(raw) {
  const value = raw.replace(/\D/g, "");
  return /^\d{12}$/.test(value);
}
```

#### TIN (Tax Identification Number)

- **Format**: 12 digits or 15 with separators `XXX-XXX-XXX-XXXXX` or `XXXXXXXXXXXX`
- **Regex Pattern**: `/(?:tin|tax\s?id(?:entif(?:ication)?\s?)?number)\s*:?\s*["']?(\d{12}|[\d-]{14})["']?/gi`
- **Validator**: `structuralValidatePHID_TIN`
- **Checksum**: Optional Luhn-like check; primary check is format and length
- **Sanitization**: `XXX-XXX-XXXXX` (show first 3, redact middle 3, show last 5)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_TIN(raw) {
  const value = raw.replace(/\D/g, "");
  return /^\d{12}$/.test(value);
}
```

#### Passport

- **Format**: 1 letter + 7 digits, typically `A/C12345678` (series prefix + 8 digits)
- **Regex Pattern**: `/(?:passport)(?:\s?(?:number|no\.?|num))?\s*:?\s*["']?([A-Z]{1,3}\s*\d{6,8})["']?/gi`
- **Validator**: `structuralValidatePHID_Passport`
- **Checksum**: No checksum; BIR registration number linkage
- **Sanitization**: `A****5678` (show series and last 4 digits)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_Passport(raw) {
  const value = raw.replace(/\s/g, "");
  return /^[A-Z]{1,3}\d{6,8}$/.test(value);
}
```

#### Driver's License (DL)

- **Format**: 8-15 digits depending on system generation; new format: `XX-XX-XXXXXX` (2 digits - 2 digits - 6 digits)
- **Regex Pattern**: `/(?:driver.?s?\s?licen[cs]e|dl|driver\s?license|license\s?number)\s*:?\s*["']?([\dA-Z\-]{8,18})["']?/gi`
- **Validator**: `structuralValidatePHID_DriverLicense`
- **Checksum**: No checksum; format varies by region (BIR-LTO linkage)
- **Sanitization**: `XX-XXXXXX` (show series, redact middle, show last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_DriverLicense(raw) {
  const value = raw.replace(/[\s\-]/g, "");
  // Accept various formats: 8–15 digit sequences
  return /^[\dA-Z]{8,15}$/.test(value);
}
```

#### PhilSys / Unified ID

- **Format**: 12 digits (PSA-issued, linkage to all ID types)
- **Regex Pattern**: `/(?:philsys|unified\s?id|phil\s?sys|psa|national\s?registry)\s*:?\s*["']?(\d{12})["']?/gi`
- **Validator**: `structuralValidatePHID_PhilSys`
- **Checksum**: No published algorithm; 12 digits only
- **Sanitization**: `XXXX-XXXX-XXXX` (show first 4, redact middle, show last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_PhilSys(raw) {
  const value = raw.replace(/\D/g, "");
  return /^\d{12}$/.test(value);
}
```

#### Postal ID

- **Format**: Typically letter prefix + 8 digits, e.g., `P87654321`
- **Regex Pattern**: `/(?:postal\s?id|post\s?office)\s*:?\s*["']?([A-Z]\d{8})["']?/gi`
- **Validator**: `structuralValidatePHID_PostalID`
- **Checksum**: No checksum; format letter + 8 digits
- **Sanitization**: `P****4321` (show prefix and last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_PostalID(raw) {
  const value = raw.replace(/\s/g, "");
  return /^[A-Z]\d{8}$/.test(value);
}
```

#### Voter's ID

- **Format**: Typically `YYYY-XXXXXXXXX` (4-digit cluster ID + 9-digit serial) or pure 13 digits
- **Regex Pattern**: `/(?:voter.?s?\s?id|voter\s?registration|comelec|(?:comelec|cvr)\s?number)\s*:?\s*["']?([\dA-Z\-]{12,16})["']?/gi`
- **Validator**: `structuralValidatePHID_VotersID`
- **Checksum**: No checksum; format varies (COMELEC format)
- **Sanitization**: `XXXX-XXXXX` (show cluster, redact serial)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_VotersID(raw) {
  const value = raw.replace(/[\s\-]/g, "");
  // COMELEC format: cluster (4) + serial (9) = 13 digits
  return /^\d{13}$|^[\dA-Z]{14,16}$/.test(value);
}
```

#### National ID (NATIONAL ID)

- **Format**: Letter + 8 digits (e.g., `N12345678`), sometimes hyphenated
- **Regex Pattern**: `/(?:national\s?id|nid)\s*:?\s*["']?([A-Z]\d{8}|[\dA-Z\-]{10,12})["']?/gi`
- **Validator**: `structuralValidatePHID_NationalID`
- **Checksum**: No checksum; format letter + 8 digits
- **Sanitization**: `N****5678` (show series and last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_NationalID(raw) {
  const value = raw.replace(/[\s\-]/g, "");
  return /^[A-Z]\d{8}$/.test(value);
}
```

#### NBI Clearance

- **Format**: Typically 12-16 digits (release number + date components), e.g., `123456789012`
- **Regex Pattern**: `/(?:nbi|nbi\s?clearance|national\s?bureau.*investigation|clearance\s?number)\s*:?\s*["']?(\d{12,16})["']?/gi`
- **Validator**: `structuralValidatePHID_NBIClearance`
- **Checksum**: No standard checksum; 12-16 digits
- **Sanitization**: `XXXX****9012` (show first 4 and last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_NBIClearance(raw) {
  const value = raw.replace(/\D/g, "");
  return /^\d{12,16}$/.test(value);
}
```

#### BIR Registration

- **Format**: Alphanumeric, typically `BN001234567` or numeric `001234567890`
- **Regex Pattern**: `/(?:bir|bureau.*revenue|bir\s?(?:reg|registration)|bn\s?number)\s*:?\s*["']?([A-Z0-9\-]{9,15})["']?/gi`
- **Validator**: `structuralValidatePHID_BIRRegistration`
- **Checksum**: Optional checksum (varies); primary check is alphanumeric format
- **Sanitization**: `BN****567` (show prefix and last 3)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_BIRRegistration(raw) {
  const value = raw.replace(/[\s\-]/g, "").toUpperCase();
  return /^[A-Z0-9]{9,15}$/.test(value);
}
```

#### Employees Provident Fund (EPF) / GSIS Variant

- **Format**: Similar to GSIS (12 digits) but with optional EPF-specific prefix
- **Regex Pattern**: `/(?:epf|employees?\s?provident\s?fund)\s*:?\s*["']?(\d{12})["']?/gi`
- **Validator**: `structuralValidatePHID_EPF`
- **Checksum**: Same as GSIS (12 digits)
- **Sanitization**: `XX-XXXX-XXXX` (show first 2, redact middle, show last 4)
- **Risk**: high / critical

```javascript
function structuralValidatePHID_EPF(raw) {
  const value = raw.replace(/\D/g, "");
  return /^\d{12}$/.test(value);
}
```

---

### 1.2 Helper Functions

```javascript
/**
 * Extract the value portion from a raw match.
 * Handles formats like "SSS: 123456789", "sss=123-456-789", "sss 123456789"
 * @param {string} raw
 * @returns {string} the extracted value
 */
function extractPHIDValue(raw) {
  // Try to extract after = or :
  let valueMatch = raw.match(/[:=]\s*["']?([^"'\s,;]+)["']?\s*$/);
  if (valueMatch) return valueMatch[1];
  
  // If no delimiter found, take the entire string
  return raw.trim();
}

/**
 * Check if a value looks like a placeholder (test data, documentation example).
 * @param {string} value
 * @returns {boolean}
 */
function isPhIDPlaceholder(value) {
  const normalized = value.replace(/[\s\-]/g, "").toLowerCase();
  // Common test values
  return /^(test|example|demo|fake|sample|00{3,}|11{3,}|12{3,}|123{3,}|placeholder|xxx)/.test(normalized);
}

/**
 * Normalize a Philippine ID for consistent comparison.
 * Removes separators, whitespace, converts to uppercase/lowercase as needed.
 * @param {string} value
 * @returns {string}
 */
function normalizePHID(value) {
  return value
    .replace(/[\s\-\.]/g, "")          // remove separators
    .toUpperCase()                      // uppercase for letter prefixes
    .trim();
}
```

---

### 2. Integration into patterns.js

Each ID type receives a pattern object added to `TRUSTPROMPT_PATTERNS`:

```javascript
{
  id: "ph_id_sss",
  label: "Philippine Social Security System (SSS) Number",
  reason: "SSS numbers are government-issued personal identifiers used for social security benefits, retirement claims, and provident fund access. Exposure enables fraudulent benefit claims, identity theft, and unauthorized access to financial records. RA 10173 classifies SSS numbers as Sensitive Personal Information.",
  regex: /(?:sss|social\s?security)\s*:?\s*["']?(\d{10}|[\d-]{12})["']?/gi,
  risk: "high",
  validate: null,
  structuralValidate: structuralValidatePHID_SSS,
  sanitize: (m) => {
    const value = extractPHIDValue(m);
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 10) return "[REDACTED-SSS]";
    return digits.slice(0, 2) + "-" + "XXXXX" + "-" + digits.slice(-1);
  }
},
// ... (repeat for all 14 types)
```

### 3. Pattern Registry and Metadata

Each pattern must be registered in the scanner's validation registry:

```javascript
const PH_ID_PATTERNS = {
  ph_id_sss:              { validator: structuralValidatePHID_SSS,           tier: "critical" },
  ph_id_gsis:             { validator: structuralValidatePHID_GSIS,          tier: "critical" },
  ph_id_philhealth:       { validator: structuralValidatePHID_PhilHealth,    tier: "critical" },
  ph_id_pagibig:          { validator: structuralValidatePHID_PagIBIG,       tier: "critical" },
  ph_id_tin:              { validator: structuralValidatePHID_TIN,           tier: "critical" },
  ph_id_passport:         { validator: structuralValidatePHID_Passport,      tier: "critical" },
  ph_id_driver_license:   { validator: structuralValidatePHID_DriverLicense, tier: "critical" },
  ph_id_philsys:          { validator: structuralValidatePHID_PhilSys,       tier: "critical" },
  ph_id_postal_id:        { validator: structuralValidatePHID_PostalID,      tier: "critical" },
  ph_id_voters_id:        { validator: structuralValidatePHID_VotersID,      tier: "critical" },
  ph_id_national_id:      { validator: structuralValidatePHID_NationalID,    tier: "critical" },
  ph_id_nbi_clearance:    { validator: structuralValidatePHID_NBIClearance,  tier: "critical" },
  ph_id_bir_registration: { validator: structuralValidatePHID_BIRRegistration, tier: "critical" },
  ph_id_epf:              { validator: structuralValidatePHID_EPF,           tier: "critical" },
};
```

---

## 4. Governance Rule 1 Escalation Flow

### 4.1 Rule Definition

**Governance Rule 1**: When a critical entity (API key, JWT, credit card, ID) is structurally validated (passes `structuralValidate` function), the finding is marked `validated: true` and escalates to **HIGH** risk level.

### 4.2 Escalation Logic in scanner.js

```javascript
function evaluateGovernance(findings, preliminary) {
  // ── Rule 1: Critical entity with structural validation ────────────────
  const hasValidatedCritical = findings.some(
    f => ENTITY_TIER[f.patternId] === "critical" && f.validated === true
  );
  if (hasValidatedCritical) {
    return { rule: "critical_entity", result: "high" };
  }

  // ── Rule 2: Direct identifier + sensitive context ────────────────────
  // (existing logic)
  // ...
}
```

### 4.3 Finding Enrichment in PATH A

```javascript
function runPathA(normalisedText) {
  const findings = [];
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    if (!pattern.regex) continue;
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = re.exec(normalisedText)) !== null) {
      const raw = match[0];
      
      // ... (existing entropy + context checks)
      
      // NEW: Structural validation for critical entities
      let validated = false;
      if (pattern.structuralValidate) {
        try {
          validated = pattern.structuralValidate(raw);
          if (validated) {
            console.log(`[TrustPrompt/PH_ID] validated: ${pattern.id}:${raw.slice(0, 30)}`);
          }
        } catch (e) {
          console.error(`[TrustPrompt/PH_ID] validator error: ${pattern.id}:`, e);
          validated = false;
        }
      }
      
      findings.push({
        patternId:   pattern.id,
        label:       pattern.label,
        risk:        pattern.risk,
        rawMatch:    raw,
        safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]",
        validated:   validated,  // NEW: reflects structural validation result
        source:      "A_regex"
      });
    }
  }
  return findings;
}
```

---

## 5. Performance Optimization Strategies

### 5.1 Regex Optimization

**Goal**: Minimize backtracking and compilation overhead.

1. **Anchor Patterns**: Start with word boundaries or specific keywords to avoid scanning entire text.
   ```javascript
   /(?:sss|social\s?security)\s*:?\s*["']?(\d{10}|[\d-]{12})["']?/gi
   ```

2. **Character Class Specificity**: Use `[\d-]` instead of `.` for separators.
   ```javascript
   // Good: [\d-]{12}
   // Bad:  .{12}
   ```

3. **Atomic Groups** (JavaScript approximation): Use non-capturing groups and structure to minimize backtracking.
   ```javascript
   /^(?:\d{10}|-\d{10})$/ // more specific than /^[\d\-]{12}$/
   ```

4. **Compiled Regex Cache**: Pre-compile all patterns at module load time.
   ```javascript
   const COMPILED_PATTERNS = TRUSTPROMPT_PATTERNS
     .map(p => ({ ...p, compiled: p.regex ? new RegExp(p.regex, 'g') : null }));
   ```

### 5.2 Validation Overhead Reduction

1. **Short-Circuit Checks**: Validate length before checksum.
   ```javascript
   function structuralValidatePHID_SSS(raw) {
     const value = raw.replace(/\D/g, "");
     if (value.length !== 10) return false;  // early exit
     // Optional checksum
     return true;
   }
   ```

2. **Lazy Evaluation**: Only call validators on matches that passed regex.

3. **Batch Validation**: Group similar patterns by validator type (digit-only, alphanumeric, etc.)
   ```javascript
   const DIGIT_ONLY_IDS = new Set([
     "ph_id_sss", "ph_id_gsis", "ph_id_pagibig", ...
   ]);
   ```

### 5.3 Memory Optimization

1. **Minimal Metadata**: Store only essential fields in findings.
2. **String Interning**: Reuse static strings (labels, reasons) via `Object.freeze()`.
3. **No Excessive Cloning**: Use references where safe (immutable pattern objects).

### 5.4 Benchmark Targets

- **Regex matching**: 100 ID patterns across 10KB text in <50ms
- **Structural validation**: 10 validated findings in <5ms
- **Sanitization**: 100 findings sanitized in <1ms
- **Total pipeline**: Full scan (PATH A–C) on 10KB text in <200ms

---

## 6. Error Handling and Logging

### 6.1 Validation Errors

```javascript
function structuralValidatePHID_SSS(raw) {
  try {
    const value = extractPHIDValue(raw);
    if (!value) return false;
    const digits = value.replace(/\D/g, "");
    return /^\d{10}$/.test(digits);
  } catch (e) {
    console.error(`[TrustPrompt/PH_ID] Validation error (SSS):`, e);
    return false;  // fail safe: don't mark as validated on error
  }
}
```

### 6.2 Logging Strategy

**Log Levels**:
- `info`: Governance rule escalation ("Rule 1: validated critical entity")
- `debug`: Individual validation results ("ph_id_sss validated: XXX-XXXXX-X")
- `warn`: Performance threshold exceeded, missing dependencies
- `error`: Validator exceptions, malformed input

**Log Format**:
```javascript
console.log(`[TrustPrompt/PH_ID] rule:${rule} entity:${type} validated:${validated}`);
```

---

## 7. Integration Checklist

### 7.1 Code Changes Required

- [ ] Add 14 validator functions to `patterns.js`
- [ ] Add 14 pattern objects to `TRUSTPROMPT_PATTERNS` array
- [ ] Update `BASE_SCORES` to include all 14 ID types (score: 10 each)
- [ ] Update `ENTITY_TIER` to classify all 14 as "critical"
- [ ] Update `runPathA()` in `scanner.js` to call `structuralValidate` hooks
- [ ] Update `evaluateGovernance()` in `scanner.js` to check for `validated: true` critical entities
- [ ] Add helper functions `extractPHIDValue()`, `isPhIDPlaceholder()`, `normalizePHID()`

### 7.2 Testing Requirements

- **Unit Tests**: Each validator function with valid/invalid examples
- **Integration Tests**: Full scan with mixed ID types, verify governance escalation
- **Regression Tests**: Existing patterns (credit card, JWT, email) still function
- **Benchmark Tests**: Performance targets met

---

## 8. Data Structures and Correctness Properties

### 8.1 Finding Structure

Each Philippine ID finding follows this structure:

```javascript
{
  patternId:     "ph_id_sss",           // matches pattern.id
  label:         "SSS Number",          // human-readable
  risk:          "high",                // always "high" for ID types
  rawMatch:      "12-3456789-0",        // original matched text
  safeVersion:   "12-XXXXX-0",          // sanitized display version
  validated:     true,                  // true if structuralValidate passed
  source:        "A_regex",             // detection path
  governanceContext: {
    rule:        "critical_entity",     // Governance Rule 1
    escalatedTo: "high"                 // final risk level
  }
}
```

### 8.2 Correctness Properties

These properties must hold across all scans:

**Property 1: Valid PHIDs Pass Validation**
*For any* valid Philippine ID that matches regex, if its structure is correct, `validated` SHALL be true after `structuralValidate` returns true.

**Property 2: Invalid PHIDs Fail Validation**
*For any* string that matches the regex but has invalid structure (wrong length, bad checksum), `validated` SHALL be false.

**Property 3: Governance Rule 1 Escalation**
*For any* finding where `patternId` is a Philippine ID type AND `validated` is true, the final `riskLevel` of the scan SHALL be "high".

**Property 4: Sanitization Preserves Format**
*For any* valid PHID, the sanitized version SHALL retain the format structure (e.g., `XX-XXXXX-X` for SSS) with redacted portions replaced by 'X'.

**Property 5: No Placeholder False Positives**
*For any* known placeholder value (e.g., "00-000000-0" for SSS), `isPhIDPlaceholder()` SHALL return true and the finding SHALL be suppressed.

---

## 9. Future Extensions

1. **Checksum Validation**: Add Luhn or other checksums for TIN, BIR when algorithms are published
2. **Age Validation**: For IDs with embedded DOB, validate plausible age range (optional)
3. **Linked ID Detection**: Cross-reference multiple ID types to increase confidence
4. **Regional Variants**: Support provincial driver's license formats

---

## Appendix: Regex Patterns Reference

| ID Type | Regex Keywords | Format | Length |
|---------|-----------------|--------|--------|
| SSS | sss, social security | `XX-XXXXXX-X` | 10 digits |
| GSIS | gsis, govt service | `XXXXXXXXXXXX` | 12 digits |
| PhilHealth | philhealth, ph, health card | Alphanumeric | 12–15 chars |
| Pag-IBIG | pagibig, pag-ibig, hdmf | `XXXX-XX-XXXX` | 12 digits |
| TIN | tin, tax id | `XXX-XXX-XXX-XXXXX` | 12 digits |
| Passport | passport | `[A-Z]XXXXXXXX` | 9 chars |
| Driver's License | driver's license, dl | `XX-XX-XXXXXX` | 8–15 chars |
| PhilSys | philsys, unified id | `XXXXXXXXXXXX` | 12 digits |
| Postal ID | postal id | `PXXXXXXXX` | 9 chars |
| Voter's ID | voter's id, comelec | `XXXX-XXXXXXXXX` | 13 chars |
| National ID | national id, nid | `NXXXXXXXX` | 9 chars |
| NBI Clearance | nbi, clearance | `XXXXXXXXXXXX` | 12–16 digits |
| BIR Registration | bir, bn | `BNXXXXXXXXX` | 9–15 alphanumeric |
| EPF | epf, employees provident | `XXXXXXXXXXXX` | 12 digits |

