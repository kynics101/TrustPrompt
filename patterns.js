// patterns.js
// All detection patterns for TrustPrompt.
// Each entry defines:
//   id                - machine-readable key
//   label             - human-readable display name
//   regex             - detection regex (non-sticky, global flag applied at runtime)
//   risk              - "high" | "moderate" | "low"  (maps to NIST SP 800-122 sensitivity)
//   validate          - optional validator.js method name to confirm the raw match
//   sanitize          - function(match) => redacted string shown in safe version
//   reason            - plain-language explanation of why this is flagged as a risk
//   minEntropy        - optional minimum Shannon entropy (bits/char) required for the
//                       value portion of the match; matches below this threshold are
//                       discarded as low-entropy dummy values (TASK-4.5)
//   structuralValidate - optional function(raw) => boolean; called in the web worker
//                       path to set validated:true for vendor-prefixed keys where
//                       mathematical validation is unavailable (TASK-4.6)
//
// Risk mapping (NIST SP 800-122 inspired):
//   high   → direct financial or authentication identifiers (red)
//   moderate → contact / locating information (orange)
//   low    → metadata / indirect identifiers (yellow)

/* global TRUSTPROMPT_PATTERNS */

// ── TASK-1.1: Philippine ID helper functions ───────────────────────────────────
// These functions support the validation pipeline for 14 Philippine government ID types.
// They handle common input formats, normalization, and placeholder detection.
// Reference: Requirements 15, 17

/**
 * Extract the numeric/alphanumeric value from a Philippine ID string.
 * Strips common prefixes (labels, "ID:", "No.", etc.), quotes, and unnecessary whitespace.
 *
 * Examples:
 *   extractPHIDValue("PhilID: 123456789012") → "123456789012"
 *   extractPHIDValue('"123456789012"') → "123456789012"
 *   extractPHIDValue("ID Number: 123456789012") → "123456789012"
 *   extractPHIDValue("sss no. 12-3456789-0") → "12-3456789-0"
 *
 * @param {string} raw - raw matched value that may contain labels, quotes, or formatting
 * @returns {string} extracted value (labels removed, quotes stripped)
 */
function extractPHIDValue(raw) {
  if (!raw || typeof raw !== "string") return "";
  
  // Remove surrounding quotes or apostrophes
  let value = raw.replace(/^["']|["']$/g, "").trim();
  
  // Strip label patterns. Order is crucial: test more specific patterns first.
  // Patterns are tested in order of appearance.
  // Try to match longer, more specific patterns before shorter generic ones.
  const labelPatterns = [
    /^driver.{0,2}s.{0,2}\s+licen[cs]e\s*\.?\s*[:=\s]*/i,  // "Driver's License", "Drivers License", etc.
    /^passport\s+no\s*\.?\s*[:=\s]*/i,
    /^id\s+no\s*\.?\s*[:=\s]*/i,
    /^license\s+no\s*\.?\s*[:=\s]*/i,
    /^student\s+id\s*\.?\s*[:=\s]*/i,
    /^employee\s+id\s*\.?\s*[:=\s]*/i,
    /^mother.{0,2}s.{0,2}\s+maiden\s*\.?\s*[:=\s]*/i,  // "Mother's Maiden", "Mothers Maiden", etc.
    /^sss\s+no\s*\.?\s*[:=\s]*/i,
    /^gsis\s+no\s*\.?\s*[:=\s]*/i,
    /^pag.?ibig\s*\.?\s*[:=\s]*/i,
    /^barangay\s*\.?\s*[:=\s]*/i,
    /^comelec\s*\.?\s*[:=\s]*/i,
    /^philhealth\s*\.?\s*[:=\s]*/i,
    /^philid\s*\.?\s*[:=\s]*/i,
    /^police\s*\.?\s*[:=\s]*/i,
    /^umid\s*\.?\s*[:=\s]*/i,
    /^prc\s*\.?\s*[:=\s]*/i,
    /^tin\s*\.?\s*[:=\s]*/i,
    /^number\s*\.?\s*[:=\s]*/i,
    /^nbi\s*\.?\s*[:=\s]*/i,
    /^id\s*\.?\s*[:=\s]*/i,
    /^no\s*\.?\s*[:=\s]*/i,
  ];
  
  for (const pattern of labelPatterns) {
    if (pattern.test(value)) {
      value = value.replace(pattern, "");
      break;  // Stop after first match to avoid double-stripping
    }
  }
  
  // Clean up remaining whitespace
  value = value.trim();
  
  return value;
}

/**
 * Check if a value is a known placeholder or test dummy value for a Philippine ID.
 * Compares against known test values, patterns (all-X, all-0, etc.), and placeholder markers.
 *
 * Examples:
 *   isPhIDPlaceholder("ph_id_sss", "12-3456789-0") → false (valid-looking value)
 *   isPhIDPlaceholder("ph_id_sss", "00-000000-00") → true (all zeros)
 *   isPhIDPlaceholder("ph_id_sss", "11-111111-11") → true (all ones)
 *   isPhIDPlaceholder("ph_id_sss", "xx-xxxxxx-xx") → true (placeholder pattern)
 *   isPhIDPlaceholder("ph_id_sss", "<SSS_NUMBER>") → true (placeholder marker)
 *
 * @param {string} patternId - the pattern's id field (e.g., "ph_id_sss")
 * @param {string} value - the extracted ID value (after normalizePHID)
 * @returns {boolean} true if this value should be suppressed as a test/dummy value
 */
function isPhIDPlaceholder(patternId, value) {
  if (!value || typeof value !== "string") return true;
  
  const normalized = value.toLowerCase().trim();
  
  // Check for common placeholder markers
  if (/^<[^>]*>$/.test(normalized)) return true; // <SOMETHING>
  if (/^(placeholder|example|test|demo|fake|dummy|sample|insert|changeme|xxx|your_\w+|sample_\w+)$/i.test(normalized)) return true;
  
  // Check for all-same-character patterns (all 0s, all 1s, all Xs, all 9s, etc.)
  if (/^([0-9x\-\s])\1*$|^(0+[\-\s]*)*0+$|^(1+[\-\s]*)*1+$|^(x+[\-\s]*)*x+$/i.test(normalized)) return true;
  
  // Known Philippine ID test values (if any specific ones are documented)
  // These can be extended as test datasets are built
  const knownTestValues = {
    ph_id_philid: new Set([]),
    ph_id_sss: new Set([]),
    ph_id_gsis: new Set([]),
    ph_id_tin: new Set([]),
  };
  
  if (knownTestValues[patternId]) {
    const stripped = normalized.replace(/[\-\s]/g, "");
    if (knownTestValues[patternId].has(stripped)) return true;
  }
  
  return false;
}

/**
 * Normalize a Philippine ID value by removing optional separators (hyphens, spaces, dots).
 * Optionally strips additional characters specified in stripChars parameter.
 * Used before structural validation to get a clean numeric/alphanumeric string.
 *
 * Examples:
 *   normalizePHID("123-456-789-012") → "123456789012"
 *   normalizePHID("123 456 789 012") → "123456789012"
 *   normalizePHID("P-123456789", "P-") → "123456789"
 *   normalizePHID("12-345-678-9-0-1-2") → "123456789012"
 *
 * @param {string} value - the ID value with potential separators
 * @param {string} [stripChars] - additional characters to strip (e.g., "P-" for passport prefix)
 * @returns {string} normalized value with common separators removed
 */
function normalizePHID(value, stripChars) {
  if (!value || typeof value !== "string") return "";
  
  // Remove additional specified characters first (before removing standard separators)
  let normalized = value;
  if (stripChars && typeof stripChars === "string") {
    // Build a character class from stripChars, escaping regex special chars
    const chars = stripChars.split("").map(ch => ch === "-" ? "\\-" : ch).join("");
    const regex = new RegExp(`^[${chars}]+`, "i");
    normalized = normalized.replace(regex, "");
  }
  
  // Remove standard separators: hyphens, spaces, dots
  normalized = normalized.replace(/[\-\s\.]/g, "");
  
  return normalized;
}

// ── TASK-4.5: Shannon entropy utility ────────────────────────────────────────
// Returns the Shannon entropy of str in bits per character.
// H = -Σ p(x) * log2(p(x))
// A real API key / JWT has H ≥ ~3.5 bits/char.
// An all-same-character string has H = 0.
/**
 * Calculate Shannon entropy of a string.
 * @param {string} str - input string to measure
 * @returns {number} entropy in bits per character (0 for empty / uniform strings)
 */
function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = {};
  for (const ch of str) freq[ch] = (freq[ch] || 0) + 1;
  const len = str.length;
  let H = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    H -= p * Math.log2(p);
  }
  return H;
}

// ── TASK-4.4: Known-placeholder suppression constants ─────────────────────────
// PLACEHOLDER_SUPPRESSIONS maps patternId → Set of known-safe dummy values.
// Values are stored lowercased with spaces and dashes stripped for comparison.
// These are universally recognized test/documentation values that carry no
// real risk (Stripe test cards, AWS docs example key, jwt.io default token).
const PLACEHOLDER_SUPPRESSIONS = Object.freeze({
  credit_card: new Set([
    "4111111111111111",        // Stripe Visa test (SRC-SYN-001)
    "5500000000000004",        // Stripe Mastercard test
    "378282246310005",         // Stripe Amex test
    "6011111111111117",        // Stripe Discover test
    "3566002020360505",        // Stripe JCB test
    "4242424242424242",        // Stripe second Visa test
    "5105105105105100",        // Stripe Mastercard test 2
  ]),
  api_key: new Set([
    "akiaiosfodnn7example",    // AWS documentation example (TASK-4.4.6)
    "wjalkfsmuoi",             // AWS secret key example suffix (docs)
  ]),
  jwt: new Set([
    // jwt.io default payload: {"sub":"1234567890","name":"John Doe","iat":1516239022}
    // Store the base64url-encoded payload segment as the lookup key
    "eyjzdwiioiixmjm0nty3odkwiiwibmftzsi6ikpvag4grgvliiwiaweioiixnte2mjm5mdiyyn0",
  ]),
});

// PLACEHOLDER_PATTERNS: structural regexes that identify placeholder-shaped values
// regardless of exact content. Applied to the extracted value portion of a match.
const PLACEHOLDER_PATTERNS = Object.freeze([
  /^<[A-Z_][A-Z0-9_]*>$/,          // <YOUR_API_KEY>, <TOKEN>, <SECRET>
  /^YOUR_[A-Z][A-Z0-9_]*$/,        // YOUR_API_KEY, YOUR_SECRET_TOKEN
  /^x+$/i,                          // xxx...xxx (all-x strings)
  /^0+$/,                           // 000...000 (all-zero strings)
  /^1+$/,                           // 111...111 (all-one strings, e.g. 4111...)
  /^(placeholder|example|test|demo|fake|dummy|sample|insert.?here|changeme)$/i,
]);

/**
 * TASK-4.4: Check whether a raw match value is a known placeholder.
 * Strips formatting (spaces, dashes) and lowercases before lookup.
 * @param {string} patternId - the pattern's id field
 * @param {string} rawValue  - the matched value string
 * @returns {boolean} true if this value should be suppressed
 */
function isKnownPlaceholder(patternId, rawValue) {
  const normalized = rawValue.replace(/[\s\-]/g, "").toLowerCase();
  const suppressed = PLACEHOLDER_SUPPRESSIONS[patternId];
  if (suppressed && suppressed.has(normalized)) return true;
  // Also check structural placeholder patterns against the normalized value
  return PLACEHOLDER_PATTERNS.some(re => re.test(rawValue.trim()));
}

// ── TASK-4.6: Vendor-prefix structural validator ──────────────────────────────
// Used by the web worker path where validator.js is unavailable.
// Returns true if the raw match starts with a known vendor-specific API key prefix,
// which is structurally distinctive enough to confirm the match without Luhn/RFC5322.
const VENDOR_PREFIXES = Object.freeze([
  /^sk-[A-Za-z0-9\-_]{20,}/,             // OpenAI (sk-..., sk-proj-...)
  /^ghp_[A-Za-z0-9]{36}/,                // GitHub Personal Access Token
  /^gho_[A-Za-z0-9]{36}/,                // GitHub OAuth token
  /^github_pat_[A-Za-z0-9_]{82}/,        // GitHub fine-grained PAT
  /^xoxb-\d+-[A-Za-z0-9\-]+/,            // Slack Bot token
  /^xoxp-\d+-[A-Za-z0-9\-]+/,            // Slack User token
  /^AKIA[A-Z0-9]{16}/,                   // AWS Access Key ID
  /^AIza[A-Za-z0-9\-_]{35}/,             // Google API key
  /^ya29\.[A-Za-z0-9\-_]+/,              // Google OAuth access token
]);

/**
 * TASK-4.6: Structural vendor-prefix check for use in the web worker path.
 * @param {string} raw - the full raw match from the regex
 * @returns {boolean} true if the value matches a known vendor key prefix
 */
function structuralValidateApiKey(raw) {
  // Extract the value portion (after any label=... prefix)
  const valueMatch = raw.match(/[:=]\s*["']?(.+?)["']?\s*$/) || raw.match(/^(.+)$/);
  const value = valueMatch ? valueMatch[1].trim() : raw.trim();
  return VENDOR_PREFIXES.some(re => re.test(value));
}

// ── Pre-compiled regex patterns for performance optimization ─────────────────────
// These are compiled once at module load time and reused across validator calls,
// eliminating regex compilation overhead in the hot path.
const REGEX_12_DIGITS = /^\d{12}$/;
const REGEX_10_DIGITS = /^\d{10}$/;
const REGEX_11_CHARS = /^[A-Za-z0-9]{11}$/;
const REGEX_6_TO_7_DIGITS = /^\d{6,7}$/;
const REGEX_9_DIGITS = /^\d{9}$/;
const REGEX_8_TO_13_DIGITS = /^\d{8,13}$/;
const REGEX_7_TO_10_DIGITS = /^\d{7,10}$/;
const REGEX_4_TO_8_DIGITS = /^\d{4,8}$/;
const REGEX_8_TO_9_DIGITS = /^\d{8,9}$/;

// ── TASK 2.3: Philippine UMID Structural Validator ────────────────────────────────
/**
 * Validates the structural integrity of a Philippine UMID (Unified Multi-Purpose ID).
 * 
 * UMID Format Specification:
 *   - Exactly 12 numeric digits (separators optional and stripped)
 *   - Digits 1-4: SSS system code (1000-1999, must start with 1)
 *   - Digits 5-8: Issuance date in MMYY format (MM=01-12, YY=00-99)
 *   - Digits 9-11: Batch/series code (000-999)
 *   - Digit 12: Check digit (0-9, calculated via modulo 10)
 * 
 * Check Digit Calculation:
 *   - Sum all digits 1-11
 *   - Divide by 10, take remainder (modulo 10)
 *   - Check digit should equal 10 - remainder (or 0 if remainder is 0)
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * Optimizations: Uses pre-compiled regex, early exits, and cached length checks.
 * 
 * Examples:
 *   structuralValidatePHID_UMID("100001230451")   → true (valid UMID)
 *   structuralValidatePHID_UMID("1000-0123-045-1") → true (valid with separators)
 *   structuralValidatePHID_UMID("000001230451")    → false (system code < 1000)
 *   structuralValidatePHID_UMID("100013230451")    → false (invalid month: 13)
 *   structuralValidatePHID_UMID("1000012304519")   → false (13 digits, not 12)
 * 
 * @param {string} raw - the raw matched UMID value (may contain separators)
 * @returns {boolean} true if the UMID structure is valid, false otherwise
 */
function structuralValidatePHID_UMID(raw) {
  // Early exit for invalid types
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing separators (hyphens, spaces, dots)
  const normalized = normalizePHID(raw);

  // Early exit for wrong length
  if (normalized.length !== 12) {
    return false;
  }

  // Validate all characters are digits using pre-compiled regex
  if (!REGEX_12_DIGITS.test(normalized)) {
    return false;
  }

  // OPTIMIZATION: Early exit for invalid SSS system code (must start with 1)
  if (normalized[0] !== '1') {
    return false;
  }
  const sssSystemCode = (normalized.charCodeAt(0) - 48) * 1000 +
                        (normalized.charCodeAt(1) - 48) * 100 +
                        (normalized.charCodeAt(2) - 48) * 10 +
                        (normalized.charCodeAt(3) - 48);
  if (sssSystemCode > 1999) {
    return false;
  }

  // Validation 2: Month must be 01-12
  const month = (normalized.charCodeAt(4) - 48) * 10 + (normalized.charCodeAt(5) - 48);
  if (month < 1 || month > 12) {
    return false;
  }

  // Validation 3-4: Year and batch are implicitly valid (regex already validated all digits)

  // Validation 5: Check digit validation (modulo 10)
  // OPTIMIZATION: Use charCodeAt to avoid repeated parseInt calls
  let digitSum = 0;
  for (let i = 0; i < 11; i++) {
    digitSum += normalized.charCodeAt(i) - 48;
  }

  const remainder = digitSum % 10;
  const expectedCheckDigit = remainder === 0 ? 0 : 10 - remainder;
  const checkDigitProvided = normalized.charCodeAt(11) - 48;

  return checkDigitProvided === expectedCheckDigit;
}

// ── TASK-2.1: SSS (Social Security System) Number Validator ──────────────────
// Implements structural validation for Philippine SSS numbers (10 digits).
// Validates:
//   - Exactly 10 numeric digits (separators already stripped by caller)
//   - Branch code (digits 1-2): 01-59 for Philippine SSS branches
//   - Membership sequence (digits 3-8): 000000-999999 (any value)
//   - Check digits (digits 9-10): modulo 11 validation
// Reference: Requirement 5, PH_ID_METADATA.sss configuration

/**
 * Structural validator for SSS (Social Security System) numbers.
 * Validates branch code, membership sequence, and check digits via modulo 11.
 *
 * Format: 10 digits total
 *   - Digits 1-2: Branch code (01-59 for Philippine SSS branches)
 *   - Digits 3-8: Membership sequence (000000-999999)
 *   - Digits 9-10: Check digits (modulo 11 validation)
 *
 * The check digit algorithm uses modulo 11 against digits 1-8.
 * Weights pattern: [5, 4, 3, 2, 9, 8, 7, 6]
 * If remainder is 0, check digit is 0; otherwise check digit is (11 - remainder)
 * For remainder = 1, check digit is 10 (represented as "0" for single digit, or "10" for two digits)
 *
 * Example valid: "0412345678"
 * Example invalid: "0012345678" (branch code 00 is invalid, must be 01-59)
 *
 * @param {string} raw - normalized SSS number (10 digits, separators already stripped)
 * @returns {boolean} true if valid SSS structure; false otherwise
 */
function structuralValidatePHID_SSS(raw) {
  // Never throw errors - return false for malformed input
  if (!raw || typeof raw !== "string") return false;

  // Ensure exactly 10 numeric digits
  if (!/^\d{10}$/.test(raw)) return false;

  // OPTIMIZATION: Branch code check using charCodeAt (faster than slice+parseInt)
  // Branch must be 01-59
  const branchFirst = raw.charCodeAt(0) - 48;
  const branchSecond = raw.charCodeAt(1) - 48;
  const branchCode = branchFirst * 10 + branchSecond;
  if (branchCode < 1 || branchCode > 59) return false;

  // Validate check digits via modulo 11
  // OPTIMIZATION: Pre-computed weight array, use charCodeAt instead of parseInt
  const weights = [5, 4, 3, 2, 9, 8, 7, 6];
  let checksum = 0;
  for (let i = 0; i < 8; i++) {
    checksum += (raw.charCodeAt(i) - 48) * weights[i];
  }

  const remainder = checksum % 11;
  let expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;

  // Get the check digit field (digits 9-10)
  const checkDigit9 = raw.charCodeAt(8) - 48;
  const checkDigit10 = raw.charCodeAt(9) - 48;
  
  // If expectedCheckDigit < 10, check digits should be stored as "0X"
  if (expectedCheckDigit < 10) {
    return checkDigit9 === 0 && checkDigit10 === expectedCheckDigit;
  } else if (expectedCheckDigit === 10) {
    // Check digit 10 is stored as "10"
    return checkDigit9 === 1 && checkDigit10 === 0;
  } else {
    // expectedCheckDigit === 11 shouldn't happen with remainder === 0 handled above
    return false;
  }
}

// ── TASK-2.2: GSIS (Government Service Insurance System) Number Validator ──────
// Implements structural validation for Philippine GSIS numbers (10 digits).
// Validates:
//   - Exactly 10 numeric digits (separators already stripped by caller)
//   - Agency/account type code (digits 1-4): 0001-9999 (not 0000)
//   - Member sequence (digits 5-9): 00000-99999 (any value)
//   - Check digit (digit 10): modulo 10 validation
// Reference: Requirement 6, PH_ID_METADATA.gsis configuration

/**
 * Structural validator for GSIS (Government Service Insurance System) numbers.
 * Validates agency code, member sequence, and check digit via modulo 10.
 *
 * Format: 10 digits total
 *   - Digits 1-4: Agency/account type code (0001-9999)
 *   - Digits 5-9: Member sequence (00000-99999)
 *   - Digit 10: Check digit (modulo 10 validation)
 *
 * Example valid: "0001234560"
 * Example invalid: "0000234560" (agency code 0000 is invalid, must be 0001-9999)
 *
 * @param {string} raw - normalized GSIS number (10 digits, separators already stripped)
 * @returns {boolean} true if valid GSIS structure; false otherwise
 */
function structuralValidatePHID_GSIS(raw) {
  // Never throw errors - return false for malformed input
  if (!raw || typeof raw !== "string") return false;

  // Ensure exactly 10 numeric digits
  if (!/^\d{10}$/.test(raw)) return false;

  // OPTIMIZATION: Extract agency code using charCodeAt (faster than slice+parseInt)
  // Agency must be 0001-9999, so first 3 digits cannot all be zero
  const agencyCode = (raw.charCodeAt(0) - 48) * 1000 +
                     (raw.charCodeAt(1) - 48) * 100 +
                     (raw.charCodeAt(2) - 48) * 10 +
                     (raw.charCodeAt(3) - 48);

  if (agencyCode < 1 || agencyCode > 9999) return false;

  // Validate check digit via modulo 10
  // Sum first 9 digits using charCodeAt
  let digitSum = 0;
  for (let i = 0; i < 9; i++) {
    digitSum += raw.charCodeAt(i) - 48;
  }

  const remainder = digitSum % 10;
  const expectedCheckDigit = (10 - remainder) % 10;
  const checkDigitProvided = raw.charCodeAt(9) - 48;

  return checkDigitProvided === expectedCheckDigit;
}

// ── TASK-4.1: Philippine Passport Structural Validator ────────────────────────
// Validates Philippine passport numbers in the format:
//   - Optional "P" or "PH" prefix
//   - 8-9 numeric digits
//   - First digit: 1-3 (passport type: 1=standard, 2=official, 3=diplomatic)
//   - Remaining digits: unique sequence within issuance batch
// Reference: Requirement 3, PH_ID_METADATA.passport configuration

/**
 * Validates the structural integrity of a Philippine passport number.
 *
 * Passport Format Specification:
 *   - Optional "P" or "PH" prefix (for newer formats)
 *   - 8-9 numeric digits
 *   - First digit (position 1): 1-3 representing passport type
 *     - 1 = standard passport
 *     - 2 = official passport
 *     - 3 = diplomatic passport
 *   - Remaining digits (positions 2-9): unique sequence within issuance batch
 *
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * Separators (hyphens, spaces, dots) are stripped before validation.
 *
 * Examples:
 *   structuralValidatePHID_Passport("P123456789")   → true (valid with prefix)
 *   structuralValidatePHID_Passport("123456789")    → true (valid without prefix)
 *   structuralValidatePHID_Passport("P12345678")    → true (valid 8-digit variant)
 *   structuralValidatePHID_Passport("P423456789")   → false (first digit 4 is invalid, must be 1-3)
 *   structuralValidatePHID_Passport("P1234567")     → false (7 digits, must be 8-9)
 *   structuralValidatePHID_Passport("PH12345678")   → true (valid with PH prefix)
 *
 * @param {string} raw - the raw matched passport value (may contain prefix and separators)
 * @returns {boolean} true if the passport structure is valid, false otherwise
 */
function structuralValidatePHID_Passport(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing the optional "P" or "PH" prefix and separators
  // stripChars parameter removes "P", "PH", hyphens, spaces, dots
  let normalized = normalizePHID(raw, "P-");
  
  // If normalizePHID removed "P" prefix but left a "H", remove it too
  // This handles "PH" prefix: P is stripped by stripChars, then we need to remove H
  if (normalized.length > 0 && normalized[0].toUpperCase() === "H") {
    normalized = normalized.slice(1);
  }

  // Validate digit count: must be 8 or 9 digits
  if (normalized.length !== 8 && normalized.length !== 9) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{8,9}$/.test(normalized)) {
    return false;
  }

  // Extract the first digit (passport type)
  const firstDigit = parseInt(normalized[0], 10);

  // Validate first digit: must be 1, 2, or 3
  // 1 = standard passport
  // 2 = official passport
  // 3 = diplomatic passport
  if (firstDigit < 1 || firstDigit > 3) {
    return false;
  }

  // Remaining digits (2-9 or 2-8) are just verified to be numeric (already checked above)
  // No specific ranges required for the sequence portion

  // All validations passed
  return true;
}

/**
 * Validates TIN (Taxpayer Identification Number) structure.
 * 
 * Format: 9 digits total
 *   - Digits 1-3: Registration area code (100-900 for Philippine regions)
 *   - Digits 4-6: Sequence of registration within that area (000-999)
 *   - Digits 7-8: Further classification (00-99)
 *   - Digit 9: Check digit (0-9, calculated via modulo 11)
 *
 * Example valid: "123456789"
 * Example invalid: "023456789" (area code 023 is invalid, must be 100-900)
 *
 * @param {string} raw - normalized TIN number (9 digits, separators already stripped)
 * @returns {boolean} true if valid TIN structure; false otherwise
 */
function structuralValidatePHID_TIN(raw) {
  // Never throw errors - return false for malformed input
  if (!raw || typeof raw !== "string") return false;

  // Ensure exactly 9 numeric digits
  if (!/^\d{9}$/.test(raw)) return false;

  // OPTIMIZATION: Extract area code using charCodeAt (faster than slice+parseInt)
  // Area must be 100-900
  const areaCode = (raw.charCodeAt(0) - 48) * 100 +
                   (raw.charCodeAt(1) - 48) * 10 +
                   (raw.charCodeAt(2) - 48);
  if (areaCode < 100 || areaCode > 900) return false;

  // Validate check digit via modulo 11
  // OPTIMIZATION: Pre-computed weight array, use charCodeAt instead of parseInt
  const weights = [6, 5, 4, 3, 2, 7, 6, 5];
  let checksum = 0;
  for (let i = 0; i < 8; i++) {
    checksum += (raw.charCodeAt(i) - 48) * weights[i];
  }

  const remainder = checksum % 11;
  const expectedCheckDigit = remainder === 0 ? 0 : 11 - remainder;
  const finalCheckDigit = expectedCheckDigit === 10 ? 0 : expectedCheckDigit;
  const checkDigitProvided = raw.charCodeAt(8) - 48;

  return checkDigitProvided === finalCheckDigit;
}

// ── TASK-3.1: PhilHealth Structural Validator ──────────────────────────────────
// Validates PhilHealth member ID numbers in both recent (12-digit) and legacy
// (15-alphanumeric) RF card formats per Requirement 9.
//
// Recent format (12 digits):
//   - Digits 1-2: Member category (00-99)
//   - Digits 3-8: Member sequence number (000000-999999)
//   - Digits 9-11: Check code (000-999)
//   - Digit 12: Version/type indicator (0-9)
//
// Legacy format (15 alphanumeric):
//   - Alphanumeric only, no specific digit ranges required
//   - Used for RF card format
//
// Performance target: <1ms per call
// Reference: Requirement 9, TASK-3.1

// ── TASK-4.2: Driver's License (LTO) Structural Validator ────────────────────────
/**
 * Validates the structural integrity of a Philippine Driver's License.
 * 
 * Driver's License Format Specification (LTO):
 *   - Exactly 11 characters (numeric or alphanumeric mix)
 *   - Characters 1-2: Region code (01-16 for Philippine regions)
 *   - Characters 3-4: City/municipality code (00-99)
 *   - Characters 5-8: Series/batch code (numeric or alphanumeric)
 *   - Characters 9-11: Sequence number (000-999 for numeric, AAA-ZZZ for alphanumeric, or mixed)
 * 
 * LTO Issues both numeric-only and alphanumeric variants:
 *   - Numeric variant: all 11 characters are digits (0-9)
 *   - Alphanumeric variant: mix of digits and letters (0-9, A-Z, a-z)
 * 
 * Validation Rules:
 *   - Must be exactly 11 characters
 *   - Must contain only alphanumeric characters (0-9, A-Z, a-z)
 *   - First 2 characters must be digits (region code 01-16)
 *   - Characters 3-4 must be digits (city/municipality code 00-99)
 *   - Characters 5-8 can be alphanumeric (series/batch code)
 *   - Characters 9-11 can be alphanumeric (sequence number)
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * 
 * Examples:
 *   structuralValidatePHID_DriversLicense("12345678901")      → true (valid numeric)
 *   structuralValidatePHID_DriversLicense("12-34-ABCD-567")   → true (valid with separators, alphanumeric)
 *   structuralValidatePHID_DriversLicense("00-12-ABCD-567")   → false (region code 00 is invalid, must be 01-16)
 *   structuralValidatePHID_DriversLicense("17-34-ABCD-567")   → false (region code 17 is invalid, must be 01-16)
 *   structuralValidatePHID_DriversLicense("12-AB-ABCD-567")   → false (city code 'AB' not numeric)
 *   structuralValidatePHID_DriversLicense("1234567890")       → false (only 10 characters)
 * 
 * @param {string} raw - the raw matched driver's license value (may contain separators)
 * @returns {boolean} true if the driver's license structure is valid, false otherwise
 */
function structuralValidatePHID_DriversLicense(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing separators (hyphens, spaces, dots)
  const normalized = normalizePHID(raw);

  // Validate character count: must be exactly 11
  if (normalized.length !== 11) {
    return false;
  }

  // Validate all characters are alphanumeric (0-9, A-Z, a-z)
  if (!/^[0-9A-Za-z]{11}$/.test(normalized)) {
    return false;
  }

  // Extract character sections
  const regionCodeStr = normalized.slice(0, 2);                     // characters 1-2
  const cityCodeStr = normalized.slice(2, 4);                       // characters 3-4
  const seriesBatchCode = normalized.slice(4, 8);                   // characters 5-8
  const sequenceNumber = normalized.slice(8, 11);                   // characters 9-11

  // Validation 1: Region code (characters 1-2) must be digits 01-16
  if (!/^\d{2}$/.test(regionCodeStr)) {
    return false;
  }
  const regionCode = parseInt(regionCodeStr, 10);
  if (regionCode < 1 || regionCode > 16) {
    return false;
  }

  // Validation 2: City/municipality code (characters 3-4) must be digits 00-99
  if (!/^\d{2}$/.test(cityCodeStr)) {
    return false;
  }
  const cityCode = parseInt(cityCodeStr, 10);
  if (cityCode < 0 || cityCode > 99) {
    return false;
  }

  // Validation 3: Series/batch code (characters 5-8) must be alphanumeric (format-only)
  // No specific range validation; any alphanumeric combination is valid
  if (!/^[0-9A-Za-z]{4}$/.test(seriesBatchCode)) {
    return false;
  }

  // Validation 4: Sequence number (characters 9-11) must be alphanumeric (format-only)
  // Can be numeric (000-999) or alphanumeric (AAA-ZZZ or mixed)
  // No specific range validation; any alphanumeric combination is valid
  if (!/^[0-9A-Za-z]{3}$/.test(sequenceNumber)) {
    return false;
  }

  // All validations passed
  return true;
}

/**
 * Validate PhilHealth member ID number structure.
 * Supports both 12-digit recent format and 15-alphanumeric legacy RF card format.
 *
 * Recent format (12 digits): MMccssssss-ccc-v
 *   - Digits 1-2: Member category (00-99)
 *   - Digits 3-8: Member sequence number (000000-999999)
 *   - Digits 9-11: Check code (000-999)
 *   - Digit 12: Version/type indicator (0-9)
 *
 * Legacy format (15 alphanumeric):
 *   - 15 alphanumeric characters
 *   - Used for RF card format, no specific digit ranges validated
 *
 * @param {string} raw - raw PhilHealth ID value (may include separators/labels)
 * @returns {boolean} true if valid PhilHealth structure, false otherwise
 */
function structuralValidatePHID_PhilHealth(raw) {
  // Never throw errors - return false for malformed input
  if (!raw || typeof raw !== "string") return false;

  try {
    // Extract the PhilHealth value (remove labels like "PhilHealth:", "PhilHealth No.")
    let value = extractPHIDValue(raw);
    if (!value) return false;

    // Normalize by removing separators (hyphens, spaces, dots)
    value = normalizePHID(value);
    if (!value) return false;

    const length = value.length;

    // CASE 1: Recent format (12 numeric digits)
    if (length === 12) {
      // Verify all characters are numeric
      if (!/^\d{12}$/.test(value)) return false;

      // Extract structural components
      const memberCategory = parseInt(value.slice(0, 2), 10);  // digits 1-2 (00-99)
      const memberSequence = parseInt(value.slice(2, 8), 10); // digits 3-8 (000000-999999)
      const checkCode = parseInt(value.slice(8, 11), 10);     // digits 9-11 (000-999)
      const versionIndicator = parseInt(value.slice(11, 12), 10); // digit 12 (0-9)

      // Validate member category: 00-99 (always valid for 2-digit range)
      if (memberCategory < 0 || memberCategory > 99) return false;

      // Validate member sequence: 000000-999999 (always valid for 6-digit range)
      if (memberSequence < 0 || memberSequence > 999999) return false;

      // Validate check code: 000-999 (always valid for 3-digit range)
      if (checkCode < 0 || checkCode > 999) return false;

      // Validate version/type indicator: 0-9 (single digit)
      if (versionIndicator < 0 || versionIndicator > 9) return false;

      // All structural rules passed
      return true;
    }

    // CASE 2: Legacy RF card format (15 alphanumeric characters)
    if (length === 15) {
      // Verify all characters are alphanumeric (letters A-Z, a-z, digits 0-9)
      if (!/^[A-Za-z0-9]{15}$/.test(value)) return false;

      // Legacy format only requires length and alphanumeric charset
      // No specific digit ranges are validated for legacy RF cards
      return true;
    }

    // Neither format matched (not 12 digits, not 15 alphanumeric)
    return false;

  } catch (e) {
    // Catch any unexpected errors and return false (fail-safe)
    return false;
  }
}

// ── TASK-4.3: PRC (Professional Regulation Commission) License Validator ─────────
// Validates PRC license number structure per Requirement 7.
//
// Format specification:
//   - Optional 4-digit year prefix (1900-2099) followed by license ID
//   - License ID: 6-7 numeric digits
//   - First 2 digits of license ID: profession category (01-99)
//   - Remaining 4-5 digits: unique license sequence
//
// Examples:
//   "1234567" → 7-digit license ID (valid if profession code 12 is valid)
//   "2021-1234567" → 4-digit year + 7-digit license ID
//   "123456" → 6-digit license ID
//   "2021-123456" → 4-digit year + 6-digit license ID
//
// Implementation note: Never throws errors. Returns false for any malformed input,
// null/undefined values, or validation failures. Performance target: <1ms per call.

/**
 * Validates the structural integrity of a Philippine PRC (Professional Regulation Commission) license number.
 * 
 * PRC License Format Specification:
 *   - Optional 4-digit year prefix (1900-2099)
 *   - 6-7 numeric digits representing license ID
 *   - First 2 digits of license ID: profession category (01-99 for different professions)
 *   - Remaining 4-5 digits: unique license sequence (any value)
 * 
 * Examples:
 *   structuralValidatePHID_PRC("1234567")       → true (7-digit license, profession 12)
 *   structuralValidatePHID_PRC("2021-1234567")  → true (year prefix + license)
 *   structuralValidatePHID_PRC("123456")        → true (6-digit license)
 *   structuralValidatePHID_PRC("1899-123456")   → false (year 1899 out of range)
 *   structuralValidatePHID_PRC("2021-001234")   → false (profession code 00, must be 01-99)
 *   structuralValidatePHID_PRC("2021-12345")    → false (only 5 digits after year, need 6-7)
 * 
 * @param {string} raw - the raw matched PRC value (may contain separators or year prefix)
 * @returns {boolean} true if the PRC structure is valid, false otherwise
 */
function structuralValidatePHID_PRC(raw) {
  // Never throw errors - return false for malformed input
  if (!raw || typeof raw !== "string") return false;

  try {
    // Normalize by removing separators (hyphens, spaces, dots)
    let normalized = normalizePHID(raw);
    if (!normalized) return false;

    // Verify all characters are numeric
    if (!/^\d+$/.test(normalized)) return false;

    let licenseID;
    let year = null;

    // Check if the value has a year prefix (4 digits at the start)
    // Year prefix is optional: if total length is 10 or 11 digits, first 4 are year
    if (normalized.length === 10 || normalized.length === 11) {
      // Might have year prefix - check if first 4 digits form a valid year
      const possibleYear = parseInt(normalized.slice(0, 4), 10);
      if (possibleYear >= 1900 && possibleYear <= 2099) {
        // Valid year prefix found
        year = possibleYear;
        licenseID = normalized.slice(4);  // remaining 6 or 7 digits
      } else {
        // First 4 digits don't form a valid year, treat entire string as license ID
        licenseID = normalized;
      }
    } else if (normalized.length === 6 || normalized.length === 7) {
      // No year prefix - just the license ID
      licenseID = normalized;
    } else {
      // Invalid length (not 6, 7, 10, or 11 digits)
      return false;
    }

    // Validate license ID length: must be 6 or 7 digits
    if (licenseID.length !== 6 && licenseID.length !== 7) return false;

    // Extract profession category (first 2 digits of license ID)
    const professionCategory = parseInt(licenseID.slice(0, 2), 10);

    // Validate profession category: must be 01-99 (not 00)
    if (professionCategory < 1 || professionCategory > 99) return false;

    // Remaining digits (positions 3-6 or 3-7) represent unique license sequence
    // These can be any numeric values (000000-9999 for 6-digit, or 0000-99999 for 7-digit)
    // No additional validation needed for sequence numbers

    // All structural rules passed
    return true;

  } catch (e) {
    // Catch any unexpected errors and return false (fail-safe)
    return false;
  }
}

// ── TASK-5.1: PSA Certificate Structural Validator ───────────────────────────
/**
 * Validates the structural integrity of a Philippine PSA Certificate number
 * (birth, marriage, death certificates issued by PSA - Philippine Statistics Authority).
 * 
 * PSA Certificate Format Specification:
 *   - 8–13 numeric digits (separators optional and stripped)
 *   - Digits 1–3: Certificate type code (e.g., 101=birth, 201=marriage, 301=death)
 *   - Digits 4–6: Province/city code (000–999)
 *   - Digits 7–10: Year and batch number
 *   - Remaining digits: Sequence within that batch
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * 
 * Examples:
 *   structuralValidatePHID_PSACertificate("12345678")   → true (8 digits, valid structure)
 *   structuralValidatePHID_PSACertificate("123-4567-8901-23") → true (13 digits with separators)
 *   structuralValidatePHID_PSACertificate("1234567")    → false (7 digits, too short)
 *   structuralValidatePHID_PSACertificate("12345678901234") → false (14 digits, too long)
 *   structuralValidatePHID_PSACertificate("abcd5678")    → false (contains letters)
 * 
 * Validation rules:
 *   - Must be 8–13 numeric digits after normalization (no letters or special chars except separators)
 *   - Certificate type (digits 1–3): any 3-digit value (common: 101, 201, 301, but not strictly validated)
 *   - Province/city code (digits 4–6): any 3-digit value (000–999 range always valid for 3 digits)
 *   - Year and batch (digits 7–10): any 4-digit value
 *   - Sequence (digits 11–13): any remaining digits (1–3 digits for positions 11–13)
 * 
 * @param {string} raw - the raw matched PSA certificate value (may contain separators)
 * @returns {boolean} true if the PSA certificate structure is valid, false otherwise
 */
function structuralValidatePHID_PSACertificate(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing separators (hyphens, spaces, dots)
  const normalized = normalizePHID(raw);

  // Validate digit count: must be 8-13 digits
  if (normalized.length < 8 || normalized.length > 13) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{8,13}$/.test(normalized)) {
    return false;
  }

  // Extract certificate type (digits 1-3)
  const certTypeStr = normalized.slice(0, 3);
  const certType = parseInt(certTypeStr, 10);

  // Extract province/city code (digits 4-6)
  const provinceCodeStr = normalized.slice(3, 6);
  const provinceCode = parseInt(provinceCodeStr, 10);

  // Extract year and batch (digits 7-10)
  const yearBatchStr = normalized.slice(6, 10);
  const yearBatch = parseInt(yearBatchStr, 10);

  // Extract sequence (remaining digits 11-13, if present)
  // For 8-digit format: no sequence digits
  // For 9-13 digit formats: 1-4 sequence digits (positions 10+)
  const sequenceStr = normalized.slice(10);

  // Basic structural validation (no strict checks on values, just format):
  // Certificate type: 0-999 (any 3-digit value; common types are 101, 201, 301)
  if (certType < 0 || certType > 999) {
    return false;
  }

  // Province/city code: 0-999 (any 3-digit value is valid)
  if (provinceCode < 0 || provinceCode > 999) {
    return false;
  }

  // Year and batch: 0-9999 (any 4-digit value is valid)
  if (yearBatch < 0 || yearBatch > 9999) {
    return false;
  }

  // Sequence: if present, must be 1-4 digits (0-9999)
  if (sequenceStr.length > 0) {
    const sequence = parseInt(sequenceStr, 10);
    if (sequence < 0 || sequence > 9999) {
      return false;
    }
  }

  // All structural validations passed
  return true;
}

// ── TASK-3.2: Pag-IBIG (Home Development Mutual Fund) Structural Validator ────────
// Validates Pag-IBIG member ID numbers in 12-digit format per Requirement 15, 17.
//
// Pag-IBIG Format:
//   - Exactly 12 numeric digits
//   - Optional separators (hyphens, spaces, dots) removed during normalization
//   - Typically displayed as XXXX-XX-XXXXXX (4-2-6) but may vary
//   - No specific checksum algorithm documented; structural validation only
//
// Validation Rules:
//   - Exactly 12 numeric digits (separators optional and stripped by caller)
//   - No specific digit range constraints documented for Pag-IBIG
//   - Format-only validation (digit count and numeric character set)
//
// Performance target: <1ms per call
// Reference: Requirements 15, 17, Design.md Pag-IBIG section

/**
 * Validates the structural integrity of a Philippine Pag-IBIG (Home Development Mutual Fund) member ID.
 * 
 * Pag-IBIG Format Specification:
 *   - Exactly 12 numeric digits (separators optional and stripped)
 *   - Typical display format: XXXX-XX-XXXXXX (4-2-6 grouping) or XXXXXXXXXXXX
 *   - No specific digit range constraints for Pag-IBIG; structural validation only
 *
 * Pag-IBIG (Home Development Mutual Fund) is the housing and savings benefit system for Filipino workers.
 * The 12-digit member ID uniquely identifies an individual in the HDMF system.
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * 
 * Examples:
 *   structuralValidatePHID_PagIBIG("123456789012")   → true (valid 12-digit Pag-IBIG)
 *   structuralValidatePHID_PagIBIG("1234-56-789012") → true (valid with separators)
 *   structuralValidatePHID_PagIBIG("12345678901")    → false (11 digits, too short)
 *   structuralValidatePHID_PagIBIG("1234567890123")  → false (13 digits, too long)
 *   structuralValidatePHID_PagIBIG("1234-56-78901A") → false (non-numeric character 'A')
 *   structuralValidatePHID_PagIBIG(null)             → false (null input)
 * 
 * @param {string} raw - the raw matched Pag-IBIG value (may contain separators)
 * @returns {boolean} true if the Pag-IBIG structure is valid, false otherwise
 */
function structuralValidatePHID_PagIBIG(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing separators (hyphens, spaces, dots)
  const normalized = normalizePHID(raw);

  // Validate digit count: must be exactly 12 digits
  if (normalized.length !== 12) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{12}$/.test(normalized)) {
    return false;
  }

  // All structural rules passed
  return true;
}

// ── TASK-5.2: NBI Clearance Structural Validator ─────────────────────────────────
/**
 * Validates the structural integrity of a Philippine NBI (National Bureau of Investigation) clearance number.
 * 
 * NBI Clearance Format Specification:
 *   - 7–10 numeric digits (separators optional and stripped)
 *   - Optional "NBI" prefix (case-insensitive)
 *   - Digits 1-2: Year of issuance (00-99 for YY format, representing 1900-2099)
 *   - Digits 3-5: Office code (001-999 for NBI regional/branch offices, not 000)
 *   - Remaining digits: Clearance sequence within that period and office
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * Sanitize format: "12-34-****-890" or "NBI-****567"
 * 
 * Examples:
 *   structuralValidatePHID_NBIClearance("NBI1234567890")   → true (valid with NBI prefix)
 *   structuralValidatePHID_NBIClearance("1234567890")      → true (valid 10-digit clearance)
 *   structuralValidatePHID_NBIClearance("12-34-567-890")   → true (valid with separators)
 *   structuralValidatePHID_NBIClearance("NBI-1234567")     → true (valid with prefix and separators)
 *   structuralValidatePHID_NBIClearance("1200000000")      → false (office code 000 is invalid)
 *   structuralValidatePHID_NBIClearance("12345")           → false (5 digits, too short)
 *   structuralValidatePHID_NBIClearance("123456789012345") → false (15 digits, too long)
 *   structuralValidatePHID_NBIClearance(null)              → false (null input)
 * 
 * @param {string} raw - the raw matched NBI clearance value (may contain prefix and separators)
 * @returns {boolean} true if the NBI clearance structure is valid, false otherwise
 */
function structuralValidatePHID_NBIClearance(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing the optional "NBI" prefix and separators (hyphens, spaces, dots)
  let normalized = normalizePHID(raw, "NBI");

  // Validate digit count: must be 7-10 digits
  if (normalized.length < 7 || normalized.length > 10) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{7,10}$/.test(normalized)) {
    return false;
  }

  // Extract structural components
  const yearStr = normalized.slice(0, 2);                          // digits 1-2
  const officeCodeStr = normalized.slice(2, 5);                    // digits 3-5
  const sequenceStr = normalized.slice(5);                         // remaining digits

  // Validate year: 00-99 (any 2-digit value is valid in YY format)
  const year = parseInt(yearStr, 10);
  if (year < 0 || year > 99) {
    return false;
  }

  // Validate office code: 001-999 (not 000)
  const officeCode = parseInt(officeCodeStr, 10);
  if (officeCode < 1 || officeCode > 999) {
    return false;
  }

  // Sequence: no specific range constraints, just verify digits (already checked above)
  // Sequence can be 2-5 digits for a total of 7-10 digits
  if (sequenceStr.length < 2 || sequenceStr.length > 5) {
    return false;
  }

  // All structural validations passed
  return true;
}

// ── TASK-5.3: Police Clearance Structural Validator ────────────────────────────
/**
 * Validates the structural integrity of a Philippine Police (PNP) clearance number.
 * 
 * Police Clearance Format Specification:
 *   - 6–10 alphanumeric characters (separators optional and stripped)
 *   - Optional "PNP" prefix (case-insensitive)
 *   - Optional 4-digit year prefix (1900-2099) before the main clearance ID
 *   - Office/region codes (first 1-2 digits after prefix): 01-99 for PNP units
 *   - Remaining digits: sequence within issuance period
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * Sanitize format: "PNP-2021-****-56" or "*-*-***456"
 * 
 * Examples:
 *   structuralValidatePHID_PoliceClearance("PNP-2021-123456")  → true (valid with PNP and year)
 *   structuralValidatePHID_PoliceClearance("2021-123456")      → true (valid with year, no PNP prefix)
 *   structuralValidatePHID_PoliceClearance("123456")           → true (valid 6-digit base clearance)
 *   structuralValidatePHID_PoliceClearance("PNP-123456")       → true (valid with PNP prefix)
 *   structuralValidatePHID_PoliceClearance("1234567890AB")     → true (valid alphanumeric)
 *   structuralValidatePHID_PoliceClearance("PNP-0123456")      → false (office code 01 but 7+ chars may be invalid)
 *   structuralValidatePHID_PoliceClearance("12345")            → false (5 characters, too short)
 *   structuralValidatePHID_PoliceClearance("12345678901")      → false (11 characters, too long)
 *   structuralValidatePHID_PoliceClearance(null)               → false (null input)
 * 
 * @param {string} raw - the raw matched Police clearance value (may contain prefix/year and separators)
 * @returns {boolean} true if the Police clearance structure is valid, false otherwise
 */
function structuralValidatePHID_PoliceClearance(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing the optional "PNP" prefix and separators (hyphens, spaces, dots)
  let normalized = normalizePHID(raw, "PNP");

  // After normalization, check for optional 4-digit year prefix (1900-2099)
  let baseID = normalized;
  let year = null;

  if (normalized.length > 6 && /^\d+$/.test(normalized)) {
    // Check if the first 4 digits form a valid year
    const possibleYear = parseInt(normalized.slice(0, 4), 10);
    if (possibleYear >= 1900 && possibleYear <= 2099) {
      year = possibleYear;
      baseID = normalized.slice(4);  // remaining digits after year prefix
    }
  }

  // Validate character count for base ID (excluding optional year prefix): 6-10 characters
  if (baseID.length < 6 || baseID.length > 10) {
    return false;
  }

  // Validate all characters are alphanumeric (0-9, A-Z, a-z)
  if (!/^[A-Za-z0-9]{6,10}$/.test(baseID)) {
    return false;
  }

  // If year was detected, validate remaining length (6-10 chars)
  // Total with year: 4 (year) + 6-10 (base) = 10-14 chars
  if (year !== null && (year < 1900 || year > 2099)) {
    return false;
  }

  // Extract office/region code (first 2 digits of base ID if numeric, or first digit if mixed)
  // For numeric-only: first 1-2 digits should represent office code (01-99)
  if (/^\d+$/.test(baseID)) {
    // All numeric: extract first 2 digits as office code
    const officeCodeStr = baseID.slice(0, 2);
    const officeCode = parseInt(officeCodeStr, 10);
    // Office/region code: 01-99 (not 00)
    if (officeCode < 1 || officeCode > 99) {
      return false;
    }
  }
  // If alphanumeric (contains letters), the office code validation is skipped
  // as the structure is less standardized for mixed formats

  // All structural validations passed
  return true;
}

// ── TASK-5.4: Barangay Clearance Structural Validator ────────────────────────────
/**
 * Validates the structural integrity of a Philippine Barangay Clearance number.
 * 
 * Barangay Clearance Format Specification:
 *   - 4–8 numeric digits (separators optional and stripped)
 *   - Optional "BC" or "Barangay" prefix (case-insensitive)
 *   - Optional 4-digit year prefix (1900-2099, YYYY format)
 *   - Barangay code: 2 digits (01-99 for barangay ID within municipality)
 *   - Sequence number: remaining digits (0-9999)
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * Risk Level: MODERATE (unlike other IDs which are HIGH)
 * Sanitize format: "BC-2021-****" or "2021-12-****"
 * 
 * Examples:
 *   structuralValidatePHID_BarangayClearance("BC-2021-01-1234")  → true (valid with prefix and year)
 *   structuralValidatePHID_BarangayClearance("2021-01-1234")     → true (valid with year, no BC prefix)
 *   structuralValidatePHID_BarangayClearance("01-1234")          → true (valid barangay + sequence)
 *   structuralValidatePHID_BarangayClearance("BC-011234")        → true (valid with BC prefix, no year)
 *   structuralValidatePHID_BarangayClearance("2021-00-1234")     → false (barangay code 00 is invalid, must be 01-99)
 *   structuralValidatePHID_BarangayClearance("011234")           → true (6 digits: 01 barangay + 1234 sequence)
 *   structuralValidatePHID_BarangayClearance("012")              → false (3 digits, too short)
 *   structuralValidatePHID_BarangayClearance("01234567890")      → false (11 digits, too long)
 *   structuralValidatePHID_BarangayClearance(null)               → false (null input)
 * 
 * @param {string} raw - the raw matched Barangay clearance value (may contain prefix/year and separators)
 * @returns {boolean} true if the Barangay clearance structure is valid, false otherwise
 */
function structuralValidatePHID_BarangayClearance(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing the optional "BC" or "Barangay" prefix and separators
  // stripChars: "BC-" covers both "BC" and "Barangay" prefixes (will strip leading BC/Barangay)
  let normalized = normalizePHID(raw, "BC");
  
  // Also handle "Barangay" prefix if present (after normalizePHID removes separators)
  if (normalized.toLowerCase().startsWith("barangay")) {
    normalized = normalized.slice(8);  // remove "barangay" (8 characters)
  }

  normalized = normalized.trim();

  // After prefix removal, check for optional 4-digit year prefix (1900-2099)
  let baseID = normalized;
  let year = null;

  if (normalized.length > 4 && /^\d+$/.test(normalized)) {
    // Check if the first 4 digits form a valid year
    const possibleYear = parseInt(normalized.slice(0, 4), 10);
    if (possibleYear >= 1900 && possibleYear <= 2099) {
      year = possibleYear;
      baseID = normalized.slice(4);  // remaining digits after year prefix
    }
  }

  // Validate digit count for base ID (excluding optional year prefix): 4-8 digits
  if (baseID.length < 4 || baseID.length > 8) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{4,8}$/.test(baseID)) {
    return false;
  }

  // Extract barangay code (first 2 digits of base ID)
  const barangayCodeStr = baseID.slice(0, 2);
  const barangayCode = parseInt(barangayCodeStr, 10);

  // Validate barangay code: 01-99 (not 00)
  if (barangayCode < 1 || barangayCode > 99) {
    return false;
  }

  // Extract sequence (remaining 2-6 digits)
  const sequenceStr = baseID.slice(2);
  const sequence = parseInt(sequenceStr, 10);

  // Validate sequence: 0-9999 (for 2-4 digit sequences)
  // For 5-6 digit sequences: 0-99999 or 0-999999
  const maxSequence = Math.pow(10, sequenceStr.length) - 1;
  if (sequence < 0 || sequence > maxSequence) {
    return false;
  }

  // All structural validations passed
  return true;
}

// ── TASK-5.5: COMELEC Voter's ID Structural Validator ────────────────────────────
/**
 * Validates the structural integrity of a Philippine COMELEC (Commission on Elections) Voter's ID.
 * 
 * COMELEC Voter's ID Format Specification:
 *   - 10–14 numeric digits (separators optional and stripped)
 *   - Digits 1-2: Province code (01-82 for Philippine provinces)
 *   - Digits 3-4: City/municipality code (01-99 for cities/municipalities within province)
 *   - Digits 5-6: Barangay code (01-99 for barangays within city/municipality)
 *   - Digits 7-10: Precinct number (0000-9999 for voting precincts)
 *   - Remaining digits (if present): Voter sequence within that precinct (0-9999)
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * Sanitize format: "12-34-56-****-****" (province-city-barangay + precinct redacted + sequence)
 * 
 * Examples:
 *   structuralValidatePHID_COMELECVoterID("12-34-56-7890-1234")  → true (valid 14-digit with separators)
 *   structuralValidatePHID_COMELECVoterID("12345678901234")      → true (valid 14-digit no separators)
 *   structuralValidatePHID_COMELECVoterID("1234567890")          → true (valid 10-digit base)
 *   structuralValidatePHID_COMELECVoterID("00-34-56-7890-1234")  → false (province code 00, must be 01-82)
 *   structuralValidatePHID_COMELECVoterID("83-34-56-7890-1234")  → false (province code 83, must be 01-82)
 *   structuralValidatePHID_COMELECVoterID("12-00-56-7890-1234")  → false (city code 00, must be 01-99)
 *   structuralValidatePHID_COMELECVoterID("12-34-00-7890-1234")  → false (barangay code 00, must be 01-99)
 *   structuralValidatePHID_COMELECVoterID("123456789")           → false (9 digits, too short)
 *   structuralValidatePHID_COMELECVoterID("123456789012345")     → false (15 digits, too long)
 *   structuralValidatePHID_COMELECVoterID(null)                  → false (null input)
 * 
 * @param {string} raw - the raw matched COMELEC Voter's ID value (may contain separators)
 * @returns {boolean} true if the COMELEC Voter's ID structure is valid, false otherwise
 */
function structuralValidatePHID_COMELECVoterID(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing separators (hyphens, spaces, dots)
  const normalized = normalizePHID(raw);

  // Validate digit count: must be 10-14 digits
  if (normalized.length < 10 || normalized.length > 14) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{10,14}$/.test(normalized)) {
    return false;
  }

  // Extract structural components
  const provinceCodeStr = normalized.slice(0, 2);              // digits 1-2
  const cityCodeStr = normalized.slice(2, 4);                  // digits 3-4
  const barangayCodeStr = normalized.slice(4, 6);              // digits 5-6
  const precinctStr = normalized.slice(6, 10);                 // digits 7-10
  const sequenceStr = normalized.slice(10);                    // remaining digits (if any)

  // Validate province code: 01-82 for Philippine provinces
  const provinceCode = parseInt(provinceCodeStr, 10);
  if (provinceCode < 1 || provinceCode > 82) {
    return false;
  }

  // Validate city/municipality code: 01-99
  const cityCode = parseInt(cityCodeStr, 10);
  if (cityCode < 1 || cityCode > 99) {
    return false;
  }

  // Validate barangay code: 01-99
  const barangayCode = parseInt(barangayCodeStr, 10);
  if (barangayCode < 1 || barangayCode > 99) {
    return false;
  }

  // Validate precinct number: 0000-9999
  const precinct = parseInt(precinctStr, 10);
  if (precinct < 0 || precinct > 9999) {
    return false;
  }

  // Validate sequence (if present): 0-9999 for 4 remaining digits, or less for fewer digits
  if (sequenceStr.length > 0) {
    const sequence = parseInt(sequenceStr, 10);
    const maxSequence = Math.pow(10, sequenceStr.length) - 1;
    if (sequence < 0 || sequence > maxSequence) {
      return false;
    }
  }

  // All structural validations passed
  return true;
}

// ── TASK-5.6: PhilID (PSA National ID) Structural Validator ─────────────────────
/**
 * Validates the structural integrity of a Philippine PhilID (PSA National ID).
 * 
 * PhilID Format Specification:
 *   - Exactly 12 numeric digits (separators optional and stripped)
 *   - Digits 1-6: Birth date in YYMMDD format
 *     - YY: 00-99 (year of birth within 1900-2099 range)
 *     - MM: 01-12 (month of birth)
 *     - DD: 01-31 (day of birth, varies by month; basic range 01-31)
 *   - Digits 7-9: City/municipality code (000-999 for city codes)
 *   - Digits 10-11: Registration order (00-99, order within city/municipality)
 *   - Digit 12: Sex digit (1 = male, 2 = female)
 * 
 * Implementation note: Never throws errors. Returns false for any malformed input,
 * null/undefined values, or validation failures. Performance target: <1ms per call.
 * Sanitize format: "12-****-****-**12" (first 2 + middle redacted + last 2+2)
 * 
 * Examples:
 *   structuralValidatePHID_PhilID("920315123456")     → true (valid 12-digit PhilID)
 *   structuralValidatePHID_PhilID("92-03-15-1234-56") → true (valid with separators)
 *   structuralValidatePHID_PhilID("920315123451")     → true (sex digit 1 for male)
 *   structuralValidatePHID_PhilID("920315123452")     → true (sex digit 2 for female)
 *   structuralValidatePHID_PhilID("920315123450")     → false (sex digit 0, must be 1 or 2)
 *   structuralValidatePHID_PhilID("920315123459")     → false (sex digit 9, must be 1 or 2)
 *   structuralValidatePHID_PhilID("921315123451")     → false (month 13, must be 01-12)
 *   structuralValidatePHID_PhilID("920032123451")     → false (day 00, must be 01-31)
 *   structuralValidatePHID_PhilID("9203151234561")    → false (13 digits, must be exactly 12)
 *   structuralValidatePHID_PhilID("92031512345")      → false (11 digits, too short)
 *   structuralValidatePHID_PhilID(null)               → false (null input)
 * 
 * @param {string} raw - the raw matched PhilID value (may contain separators)
 * @returns {boolean} true if the PhilID structure is valid, false otherwise
 */
function structuralValidatePHID_PhilID(raw) {
  // Graceful input handling: return false for null, undefined, or non-string values
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // Normalize by removing separators (hyphens, spaces, dots)
  const normalized = normalizePHID(raw);

  // Validate digit count: must be exactly 12 digits
  if (normalized.length !== 12) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{12}$/.test(normalized)) {
    return false;
  }

  // Extract structural components
  const yearStr = normalized.slice(0, 2);                       // digits 1-2 (YY)
  const monthStr = normalized.slice(2, 4);                      // digits 3-4 (MM)
  const dayStr = normalized.slice(4, 6);                        // digits 5-6 (DD)
  const cityCodeStr = normalized.slice(6, 9);                   // digits 7-9 (city/municipality code)
  const registrationOrderStr = normalized.slice(9, 11);         // digits 10-11 (registration order)
  const sexDigitStr = normalized.slice(11, 12);                 // digit 12 (sex)

  // Validate birth date format (YYMMDD)
  const year = parseInt(yearStr, 10);      // 00-99 (represents 1900-2099)
  const month = parseInt(monthStr, 10);    // 01-12
  const day = parseInt(dayStr, 10);        // 01-31 (basic range, not month-specific)

  // Year validation: 00-99 (always valid in YY format)
  if (year < 0 || year > 99) {
    return false;
  }

  // Month validation: 01-12
  if (month < 1 || month > 12) {
    return false;
  }

  // Day validation: 01-31 (basic range; stricter validation would check month-specific days)
  if (day < 1 || day > 31) {
    return false;
  }

  // Validate city/municipality code: 000-999 (any 3-digit value is valid)
  const cityCode = parseInt(cityCodeStr, 10);
  if (cityCode < 0 || cityCode > 999) {
    return false;
  }

  // Validate registration order: 00-99 (any 2-digit value is valid)
  const registrationOrder = parseInt(registrationOrderStr, 10);
  if (registrationOrder < 0 || registrationOrder > 99) {
    return false;
  }

  // Validate sex digit: must be 1 (male) or 2 (female)
  const sexDigit = parseInt(sexDigitStr, 10);
  if (sexDigit !== 1 && sexDigit !== 2) {
    return false;
  }

  // All structural validations passed
  return true;
}


const TRUSTPROMPT_PATTERNS = [

  // ── HIGH RISK ──────────────────────────────────────────────────────────────

  {
    id: "credit_card",
    label: "Credit / Debit Card Number",
    reason: "Card numbers give direct access to your financial accounts. Sharing one with an AI model means it is transmitted to and stored by a third-party server.",
    regex: /\b(?:\d[ -]?){13,19}\b/g,
    risk: "high",
    validate: "isCreditCard",
    sanitize: (m) => m.replace(/\d(?=\d{4})/g, "*")
  },

  // TASK-4.2: Hardened api_key pattern.
  //
  // Changes from original:
  //   (1) Tightened keyword list — dropped bare `secret` and bare `token` as
  //       standalone keywords; these caused false positives on natural language
  //       (e.g. "my secret recipe", "access token: pending_approval_by_admin").
  //       Retained: api_key, api-key, access_key, access-key, client_secret,
  //       client-secret, auth_token, auth-token, bearer.
  //
  //   (2) Added vendor-prefix OR branch — detects well-known API key shapes
  //       without requiring a label prefix: OpenAI (sk-), GitHub (ghp_, gho_,
  //       github_pat_), Slack (xoxb-, xoxp-), AWS (AKIA), Google (AIza, ya29.).
  //       These are structurally distinctive enough to confirm without a label.
  //
  //   (3) minEntropy: 3.5 — rejects low-entropy dummy values (all-same-char
  //       strings, sequential patterns) that pass the regex shape. See TASK-4.5.
  //
  //   (4) structuralValidate — allows the web worker path to set validated:true
  //       for vendor-prefix matches, enabling governance Rule 1 escalation to
  //       HIGH. See TASK-4.6.
  {
    id: "api_key",
    label: "API Key / Secret Token",
    reason: "API keys and secret tokens authenticate your identity with a service — they are the equivalent of a password for software systems. Exposing one allows anyone who sees it to make requests on your behalf, potentially incurring charges, accessing private data, or compromising connected systems. This includes vendor-specific formats: OpenAI (sk-...), GitHub (ghp_...), Slack (xoxb-...), AWS (AKIA...), and Google (AIza...). Keys included in prompts may be logged by the AI provider.",
    // Labelled-key branch: tightened keyword list (no bare `secret` or `token`)
    // Vendor-prefix branch: structurally distinctive prefixes without requiring a label
    regex: /(?:(?:api[_\-\s]?key|access[_\-\s]?key|client[_\-\s]?secret|auth[_\-\s]?token|bearer)\s*[:=]\s*["']?([A-Za-z0-9\-_\.+\/=]{20,})["']?|(?:sk-[A-Za-z0-9\-_]{20,}|ghp_[A-Za-z0-9]{36,}|gho_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{82,}|xoxb-\d{9,}-[A-Za-z0-9\-]{20,}|xoxp-\d{9,}-[A-Za-z0-9\-]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9\-_]{35}|ya29\.[A-Za-z0-9\-_]{50,}))/g,
    risk: "high",
    validate: null,  // no single validator covers all key formats; entropy + structural checks used instead
    minEntropy: 3.5, // TASK-4.5: reject low-entropy dummy values
    structuralValidate: structuralValidateApiKey, // TASK-4.6: worker-path vendor-prefix check
    sanitize: (m) => {
      // Preserve label if present, redact the value
      const colonIdx = m.search(/[:=]/);
      if (colonIdx !== -1) {
        return m.slice(0, colonIdx + 1) + " [REDACTED-KEY]";
      }
      return "[REDACTED-KEY]";
    }
  },

  // TASK-4.3: Hardened JWT pattern.
  //
  // Changes from original:
  //   (1) Added segment-length guards in the regex: header ≥ 10 chars,
  //       payload ≥ 10 chars, signature ≥ 20 chars. This rejects truncated
  //       or malformed strings that happen to contain dots.
  //
  //   (2) minEntropy: 3.5 — same entropy guard as api_key. A real JWT has
  //       high entropy across all three segments.
  //
  //   (3) Sanitize decision (TASK-4.3.4): full [REDACTED-JWT] is the correct
  //       behaviour. A partial token is still a security risk (header reveals
  //       algorithm; payload may contain claims). Full redaction is intentional.
  {
    id: "jwt",
    label: "JSON Web Token (JWT)",
    reason: "A JSON Web Token is a session credential that proves you are logged in to a service. Sharing a live JWT gives anyone who obtains it the ability to impersonate your session until it expires. JWTs are often short-lived but can grant access to sensitive APIs, dashboards, or user data.",
    // Segment-length guards: header ≥10, payload ≥10, signature ≥20 chars
    regex: /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\.[A-Za-z0-9\-_.+\/=]{20,}/g,
    risk: "high",
    validate: "isJWT",
    minEntropy: 3.5, // TASK-4.5
    sanitize: (_m) => "[REDACTED-JWT]"
    // Full redaction is intentional: partial tokens still reveal algorithm (header)
    // and payload claims. [REDACTED-JWT] is the safe version. (TASK-4.3.4)
  },

  // {
  //   id: "password_inline",
  //   label: "Inline Password",
  //   reason: "Passwords are the primary authentication credential for most accounts. Including one in a prompt sends it as plain text to the AI provider's servers where it may be logged, used for model training, or exposed in a data breach. No legitimate debugging scenario requires sharing a real password.",
  //   regex: /(?:password|passwd|pwd|pass)\s*[:=]\s*["']?([^\s"',;]{6,})["']?/gi,
  //   risk: "high",
  //   validate: null,
  //   sanitize: (m) => m.replace(/([^\s"',;]{6,})$/, "[REDACTED-PASSWORD]")
  // },

  // ── MODERATE RISK ────────────────────────────────────────────────────────────

  {
    id: "email",
    label: "Email Address",
    reason: "Email addresses are personally identifiable information (PII) under the Philippine Data Privacy Act (RA 10173). Sharing someone else's email without consent may violate data privacy law. Even your own email can be used for targeted phishing, spam, or account enumeration attacks if exposed.",
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    risk: "moderate",
    validate: "isEmail",
    sanitize: (m) => {
      const [local, domain] = m.split("@");
      return local[0] + "***@" + domain;
    }
  },

  {
    id: "ph_mobile",
    label: "Philippine Mobile Number",
    reason: "Philippine mobile numbers (09XX or +639XX format) are directly tied to a person's identity through SIM registration (RA 11934). Exposing a mobile number enables unsolicited contact, SIM-swap fraud, and social engineering attacks.",
    validate: "isMobilePhone_PH",
    sanitize: (m) => m.slice(0, -6) + "xxxxxx"
  },

  {
    id: "phone_intl",
    label: "Phone Number (International)",
    reason: "International phone numbers are contact identifiers that can be used for unsolicited calls, SMS phishing (smishing), and identity verification bypass. Including phone numbers in AI prompts sends them to third-party servers, where they may be retained and potentially linked to other data.",
    regex: /\+?1?\s?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}/g,
    risk: "moderate",
    validate: "isMobilePhone",
    sanitize: (m) => m.slice(0, -4) + "xxxx"
  },

  {
    id: "ipv4",
    label: "IPv4 Address",
    reason: "Internal or private IP addresses reveal your network topology, which can assist attackers in mapping your infrastructure. Public IPs can be used to geolocate you or target your connection. Sharing server IPs in prompts may expose backend systems to reconnaissance.",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    risk: "moderate",
    validate: "isIP",
    sanitize: (m) => {
      const parts = m.split(".");
      parts[2] = "xxx";
      parts[3] = "xxx";
      return parts.join(".");
    }
  },

  {
    id: "ipv6",
    label: "IPv6 Address",
    reason: "IPv6 addresses can uniquely identify a specific device on the internet and may be directly tied to your hardware. Exposing an IPv6 address reveals more precise device and network information than an IPv4 address, and can be used for tracking or targeted attacks.",
    regex: /(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}|(?:[A-Fa-f0-9]{1,4}:){1,7}:|::(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}/g,
    risk: "moderate",
    validate: "isIPv6",
    sanitize: (_m) => "[REDACTED-IPv6]"
  },

  {
    id: "mac_address",
    label: "MAC Address",
    reason: "A MAC address is a hardware identifier burned into your network interface. It can be used to uniquely fingerprint and track a specific device across networks. MAC addresses are treated as device identifiers and their exposure can assist in device-level tracking or impersonation.",
    regex: /\b([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
    risk: "moderate",
    validate: "isMACAddress",
    sanitize: (m) => {
      const sep = m.includes(":") ? ":" : "-";
      const parts = m.split(sep);
      return parts[0] + sep + parts[1] + sep + "xx" + sep + "xx" + sep + "xx" + sep + "xx";
    }
  },

  // ── LOW RISK ───────────────────────────────────────────────────────────────

  {
    id: "source_code",
    label: "Source Code Block",
    reason: "Code blocks may contain hardcoded credentials, internal logic, proprietary algorithms, or configuration details that should not be shared externally. Even seemingly harmless code can reveal system architecture or security assumptions.",
    regex: /```[\s\S]*?```|`[^`\n]{10,}`/g,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[CODE BLOCK REMOVED]"
  },

  {
    id: "id_label",
    label: "Government-Issued ID Field",
    reason: "Government-issued identifiers classified are classified as Sensitive Personal Information under RA 10173. Sharing these — even just the field label with a value — with an AI assistant transmits them to a third-party server where they may be logged or retained. These identifiers can be used for identity theft, benefit fraud, or account takeover.",
    regex: /\b(?:sss|gsis|philhealth|pagibig|pag[- ]?ibig|tin|passport(?:\s?no(?:\.|\b))?|driver.?s?\s?licen[cs]e(?:\s?no(?:\.|\b))?|license\s?no|plate\s?no|student\s?id|employee\s?id|id\s?number|mother.?s?\s?maiden(?:\s?name)?|umid|postal\s?id|voter.?s?\s?id|national\s?id|philsys)\s*:[ \t]*.+/gi,
    risk: "high",
    validate: null,
    sanitize: (m) => {
      const colonIdx = m.indexOf(":");
      return m.slice(0, colonIdx + 1) + " [REDACTED]";
    }
  },

  {
    id: "personal_label",
    label: "Labelled Personal Field",
    reason: "Explicitly labelled fields are indicators of structured personal data. Under the Philippine Data Privacy Act (RA 10173), these are Personal Information (PI) that may contribute to individual identification when combined with other data.",
    regex: /\b(?:name|pangalan|full\s?name|buong\s?pangalan|age|edad|birthday|birthdate|petsa\s?ng\s?kapanganakan|civil\s?status|relationship\s?status|nationality|nasyonalidad|gender|kasarian|sex|religion|relihiyon|employer|trabaho|company|occupation|hanapbuhay|emergency\s?contact)\s*:[ \t]*.+/gi,
    risk: "low",
    validate: null,
    sanitize: (m) => {
      const colonIdx = m.indexOf(":");
      return m.slice(0, colonIdx + 1) + " [REDACTED]";
    }
  },

  {
    id: "ph_address",
    label: "Philippine Physical Address",
    reason: "Physical addresses are sensitive location data under the Data Privacy Act. A Philippine address (barangay, street, subdivision, etc.) can precisely identify where a person lives or works. Combined with a name or contact number, it enables stalking, physical harassment, or targeted fraud.",
    regex: /\b(?:barangay|brgy\.?|sitio|purok|street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|subdivision|subd\.?|village|vill\.?)\b[^.!?]{0,80}/gi,
    risk: "low",
    validate: "isPHAddress",
    sanitize: (_m) => "[PHILIPPINE ADDRESS REMOVED]"
  },

  // ── PATH C: LINGUISTIC NLP-BASED PATTERNS ──────────────────────────────────

  {
    id: "nlp_person_name",
    label: "Person Name (NLP)",
    reason: "Person names are direct personal identifiers under RA 10173. While a name alone may not uniquely identify an individual, it is classified as Personal Information and is sensitive contextual data. The system detects names using Named Entity Recognition (NER) on normalized text to capture natural language mentions (e.g., 'My name is Alice', 'I am John') that regex and gazetteers may miss.",
    regex: null,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[NAME REDACTED]"
  },

  {
    id: "nlp_job_title",
    label: "Job Title (NLP)",
    reason: "Job titles and professional roles are contextual personal information under RA 10173. While not uniquely identifying on their own, they represent sensitive occupational data that, combined with name or organization, can infer identity. The system detects job titles using POS tagging and named entity recognition on normalized text to identify occupational mentions in natural language (e.g., 'I am a Senior Engineer', 'My role is Project Manager').",
    regex: null,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[JOB TITLE REDACTED]"
  },

  {
    id: "nlp_organization",
    label: "Organization (NLP)",
    reason: "Organization and company names are contextual personal information under RA 10173. They represent workplace affiliations that, combined with a person's name or job title, can infer identity and enable social engineering or targeted attacks. The system detects organizations using Named Entity Recognition (NER) on normalized text to identify company and institutional mentions (e.g., 'I work at Google', 'I'm employed by Acme Corp').",
    regex: null,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[ORGANIZATION REDACTED]"
  },

  // ── PHILIPPINE GOVERNMENT IDs (HIGH RISK, except Barangay Clearance) ──────────

  {
    id: "ph_id_nbi_clearance",
    label: "NBI Clearance",
    reason: "NBI clearance numbers are background check credentials that identify individuals and their criminal record status under RA 10173. Issued by the National Bureau of Investigation (NBI), they are sensitive government identifiers that require protection.",
    regex: /(?:nbi\s*[:\-\s]?\s*)?(?:\d{2}[_\-\s]?\d{3}[_\-\s]?\d{2,6}|\d{7,10})/gi,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_NBIClearance,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length >= 7) {
        return digits.slice(0, 2) + "-" + digits.slice(2, 5) + "-" + "****" + (digits.length > 5 ? digits.slice(-3) : "");
      }
      return "[REDACTED-NBI]";
    }
  },

  {
    id: "ph_id_police_clearance",
    label: "Police Clearance (PNP)",
    reason: "Police clearance numbers identify individuals and their police record status under RA 10173. Issued by the Philippine National Police (PNP), they are sensitive law enforcement credentials that require protection from unauthorized access.",
    regex: /(?:pnp\s*[:\-\s]?\s*)?(?:\d{4}[_\-\s]?)?[a-z0-9]{6,10}(?:[_\-\s]?[a-z0-9]{2,4})?/gi,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PoliceClearance,
    sanitize: (m) => {
      const alphanumeric = m.replace(/[^\w]/g, "");
      if (alphanumeric.length >= 6) {
        const midPoint = Math.floor(alphanumeric.length / 2);
        return alphanumeric.slice(0, 2) + "-" + "*".repeat(Math.max(2, midPoint - 4)) + "-" + alphanumeric.slice(-2);
      }
      return "[REDACTED-POLICE]";
    }
  },

  {
    id: "ph_id_barangay_clearance",
    label: "Barangay Clearance",
    reason: "Barangay clearance is a local credential issued by barangay government units under RA 10173. While more sensitive than generic labels, it is less critical than national government IDs and thus classified as MODERATE risk.",
    regex: /(?:bc|barangay)\s*[:\-\s]?(?:\d{4}[_\-\s]?)?\d{4,8}|(?:\d{4}[_\-\s]?)?\d{2}[_\-\s]?\d{2,6}/gi,
    risk: "moderate",
    validate: null,
    structuralValidate: structuralValidatePHID_BarangayClearance,
    sanitize: (m) => {
      const prefix = m.match(/^[a-z]+/i) ? m.match(/^[a-z]+/i)[0] + "-" : "";
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length >= 4) {
        return prefix + digits.slice(0, 4) + "-" + "*".repeat(Math.max(1, digits.length - 4));
      }
      return "[REDACTED-BARANGAY]";
    }
  },

  {
    id: "ph_id_comelec_voter_id",
    label: "COMELEC Voter's ID",
    reason: "COMELEC Voter's ID is an electoral credential that identifies eligible voters and voting location under RA 10173. Issued by the Commission on Elections (COMELEC), these are critical government identifiers that require protection.",
    regex: /\d{2}[_\-\s]?\d{2}[_\-\s]?\d{2}[_\-\s]?\d{4}[_\-\s]?\d{0,4}|\b\d{10,14}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_COMELECVoterID,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length >= 10) {
        const part1 = digits.slice(0, 2);
        const part2 = digits.slice(2, 4);
        const part3 = digits.slice(4, 6);
        const part4 = "*".repeat(Math.min(4, digits.length - 6));
        const part5 = digits.slice(-4);
        return part1 + "-" + part2 + "-" + part3 + "-" + part4 + "-" + part5;
      }
      return "[REDACTED-COMELEC]";
    }
  },

  {
    id: "ph_id_philid",
    label: "PhilID (PSA National ID)",
    reason: "PhilID is the government-issued national identification card from the Philippine Statistics Authority (PSA). It contains unique personal identifiers including birthdate and sex, making it a critical identifier under RA 10173 that requires strict protection.",
    regex: /\d{2}[_\-\s]?\d{2}[_\-\s]?\d{2}[_\-\s]?\d{3}[_\-\s]?\d{2}[_\-\s]?\d{1}|\b\d{12}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PhilID,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 12) {
        return digits.slice(0, 2) + "-****-****-**" + digits.slice(-2);
      }
      return "[REDACTED-PHILID]";
    }
  },

  {
    id: "ph_id_drivers_license",
    label: "Driver's License (LTO)",
    reason: "Driver's License issued by the Land Transportation Office (LTO) is a widely-used authentication and identification credential under RA 10173. LTO issues both numeric and alphanumeric variants that serve as primary identity documents for vehicle operation and identification.",
    regex: /\b[a-z0-9]{2}[_\-\s]?[a-z0-9]{2}[_\-\s]?[a-z0-9]{2}[_\-\s]?[a-z0-9]{2}[_\-\s]?[a-z0-9]{3}|\b[a-z0-9]{11}\b/gi,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_DriversLicense,
    sanitize: (m) => {
      const alphanumeric = m.replace(/[^\w]/g, "");
      if (alphanumeric.length === 11) {
        return alphanumeric.slice(0, 2) + "-" + "*".repeat(7) + "-" + alphanumeric.slice(-3);
      }
      return "[REDACTED-DL]";
    }
  },

  {
    id: "ph_id_passport",
    label: "Passport (BI)",
    reason: "Passport issued by the Bureau of Immigration (BI) is an international travel credential and critical identifier under RA 10173 and UNCHR standards. Philippine passports are recognized globally for travel and identity verification purposes.",
    regex: /(?:ph?[_\-\s]?)?[a-z0-9]{1}[_\-\s]?\d{2}[_\-\s]?\d{2}[_\-\s]?\d{2}[_\-\s]?\d{2}|\bph?\d{8,9}\b|(?:p|ph)[_\-\s]?\d{8,9}/gi,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_Passport,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length >= 8) {
        const prefix = m.match(/^[a-z]+/i) ? m.match(/^[a-z]+/i)[0] : "";
        // Redact digits 3-7 (5 positions) from the 8-9 digit passport number
        const redacted = digits.slice(0, 2) + "*".repeat(5) + digits.slice(7);
        return (prefix ? prefix + "-" : "") + redacted.slice(0, 1) + "-" + redacted.slice(1, 5) + redacted.slice(-2);
      }
      return "[REDACTED-PASSPORT]";
    }
  },

  {
    id: "ph_id_umid",
    label: "UMID (Unified Multi-Purpose ID)",
    reason: "UMID is the Unified Multi-Purpose ID issued by SSS and represents a unified government identifier credential under RA 10173. Contains SSS system code and includes check digit validation for authentication.",
    regex: /\d{4}[_\-\s]?\d{2}[_\-\s]?\d{2}[_\-\s]?\d{3}[_\-\s]?\d{1}|\b\d{12}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_UMID,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 12) {
        return digits.slice(0, 4) + "-" + "*".repeat(6) + "-" + digits.slice(-2);
      }
      return "[REDACTED-UMID]";
    }
  },

  {
    id: "ph_id_sss",
    label: "SSS (Social Security System)",
    reason: "SSS number is a social insurance identifier linked to employment and benefits under RA 10173. Required for employee registration and benefit claims, it serves as a key employment identifier in the Philippines.",
    regex: /\d{2}[_\-\s]?\d{6}[_\-\s]?\d{2}|\b\d{10}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_SSS,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 10) {
        return digits.slice(0, 2) + "-" + "*".repeat(6) + "-" + digits.slice(-2);
      }
      return "[REDACTED-SSS]";
    }
  },

  {
    id: "ph_id_gsis",
    label: "GSIS (Government Service Insurance System)",
    reason: "GSIS number identifies government employees and their benefits under RA 10173. Used for government employee payroll and benefit administration, it is a critical identifier for the public sector workforce.",
    regex: /\d{4}[_\-\s]?\d{5}[_\-\s]?\d{1}|\b\d{10}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_GSIS,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 10) {
        return digits.slice(0, 4) + "-" + "*".repeat(5) + "-" + digits.slice(-1);
      }
      return "[REDACTED-GSIS]";
    }
  },

  {
    id: "ph_id_prc",
    label: "PRC (Professional Regulation Commission)",
    reason: "PRC license number is a professional credential that identifies individuals in regulated professions under RA 10173. Includes physicians, engineers, lawyers, and other licensed professionals whose identity is critical for professional accountability.",
    regex: /(?:\d{4}[_\-\s]?)?\d{2}[_\-\s]?\d{5,6}|\b(?:\d{4})?\d{6,7}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PRC,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length >= 6) {
        const midPoint = Math.floor(digits.length / 2);
        return digits.slice(0, 2) + "-" + "*".repeat(Math.max(2, midPoint - 2)) + "-" + digits.slice(-2);
      }
      return "[REDACTED-PRC]";
    }
  },

  {
    id: "ph_id_tin",
    label: "TIN (Taxpayer Identification Number)",
    reason: "TIN is a critical financial identifier linked to taxation, income, and financial status under RA 10173. Issued by Bureau of Internal Revenue (BIR), it is essential for tax compliance and financial transactions.",
    regex: /\d{3}[_\-\s]?\d{3}[_\-\s]?\d{2}[_\-\s]?\d{1}|\b\d{9}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_TIN,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 9) {
        return digits.slice(0, 3) + "-****-" + digits.slice(-2);
      }
      return "[REDACTED-TIN]";
    }
  },

  {
    id: "ph_id_philhealth",
    label: "PhilHealth (Health Insurance)",
    reason: "PhilHealth number is a healthcare identifier linked to medical records and insurance coverage under RA 10173. Used for health insurance claims and medical services access, it is critical for healthcare identity and benefit verification.",
    regex: /\d{2}[_\-\s]?\d{6}[_\-\s]?\d{3}[_\-\s]?\d{1}|\b\d{12}\b|\b[a-z0-9]{15}\b/gi,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PhilHealth,
    sanitize: (m) => {
      const alphanumeric = m.replace(/[^\w]/g, "");
      if (alphanumeric.length === 12) {
        return alphanumeric.slice(0, 2) + "-" + "*".repeat(9) + "-" + alphanumeric.slice(-1);
      } else if (alphanumeric.length === 15) {
        return alphanumeric.slice(0, 2) + "-" + "*".repeat(11) + "-" + alphanumeric.slice(-2);
      }
      return "[REDACTED-PHILHEALTH]";
    }
  },

  {
    id: "ph_id_psa_certificate",
    label: "PSA Certificate (Vital Records)",
    reason: "PSA certificate number is a vital record that identifies individuals and their life events under RA 10173. Issued by Philippine Statistics Authority for birth, marriage, death certificates, they are foundational government documents for identity verification.",
    regex: /\d{3}[_\-\s]?\d{4}[_\-\s]?\d{4}[_\-\s]?\d{2}|\b\d{8,13}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PSACertificate,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length >= 8) {
        return digits.slice(0, 3) + "-" + "*".repeat(Math.max(2, digits.length - 7)) + "-" + digits.slice(-4);
      }
      return "[REDACTED-PSA]";
    }
  }

];

// ── PHILIPPINE GOVERNMENT ID PATTERNS CONFIGURATION ─────────────────────────────
// TASK 1.2: ID Type Metadata and Configuration Structure
//
// This configuration object (PH_ID_METADATA) maps all 14 Philippine ID types to
// their structural validation rules, regex templates, digit count requirements,
// and sanitization specifications. This is the source of truth for validator
// implementations and pattern registry definitions.
//
// Structure per ID type:
//   - id: patternId in TRUSTPROMPT_PATTERNS (e.g., "ph_id_philid")
//   - label: human-readable name
//   - risk: "high" or "moderate" (13 types = high, barangay = moderate)
//   - digitCount: exact digit count required (or array for variable counts)
//   - format: description of the format rule (e.g., "YYMMDD + city code + sex")
//   - separators: allowed formatting characters (hyphens, spaces, dots, etc.)
//   - regexTemplate: pattern with placeholders for digit counts and separators
//   - structuralRules: array of validation checks (branch codes, date formats, etc.)
//   - sanitizeFormat: template showing how to redact (e.g., "12-****-90")
//   - exampleValid: sample valid ID for reference
//   - exampleInvalid: sample invalid ID for reference

const PH_ID_METADATA = Object.freeze({
  philid: {
    id: "ph_id_philid",
    label: "PhilID (PSA National ID)",
    reason: "PhilID is the government-issued national identification card from the Philippine Statistics Authority (PSA). It contains unique personal identifiers including birthdate and sex, making it highly sensitive under RA 10173.",
    risk: "high",
    digitCount: 12,
    format: "12 digits: YYMMDD (birthdate) + city code (3 digits) + registration order (2 digits) + sex (1 digit: 1=male, 2=female)",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{2}[\\s-]?\\d{2}[\\s-]?\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{2}[\\s-]?\\d{1}|\\d{12}",
    structuralRules: [
      { rule: "exactDigitCount", value: 12, description: "Must be exactly 12 digits" },
      { rule: "birthdateRange", digits: "1-6", format: "YYMMDD", description: "First 6 digits must be valid birth date in YYMMDD format" },
      { rule: "cityCodeRange", digits: "7-9", min: 0, max: 999, description: "City code must be 000-999" },
      { rule: "sexDigit", digit: 12, validValues: [1, 2], description: "Last digit must be 1 (male) or 2 (female)" }
    ],
    sanitizeFormat: "first 2 + middle redacted + last 2 (e.g., 12-****-****-**12)",
    sanitizePattern: (val) => val.slice(0, 2) + "-****-****-**" + val.slice(-2),
    exampleValid: "920315123456",
    exampleInvalid: "920315123499"  // invalid sex digit (9)
  },

  drivers_license: {
    id: "ph_id_drivers_license",
    label: "Driver's License (LTO)",
    reason: "Driver's License issued by the Land Transportation Office (LTO) is a widely-used authentication and identification credential under RA 10173. LTO issues both numeric and alphanumeric variants.",
    risk: "high",
    digitCount: 11,
    format: "11 characters (numeric or alphanumeric): region code (2 digits) + city/municipality code (2 digits) + series code (4 digits) + sequence (3 digits or AAA-ZZZ)",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{2}[\\s-]?\\d{2}[\\s-]?[\\w]{4}[\\s-]?[\\w]{3}|[\\w]{11}",
    structuralRules: [
      { rule: "exactCharCount", value: 11, description: "Must be exactly 11 characters" },
      { rule: "regionCodeRange", digits: "1-2", min: 1, max: 16, description: "Region code (01-16 for Philippine regions)" },
      { rule: "cityCodeRange", digits: "3-4", min: 0, max: 99, description: "City/municipality code (00-99)" },
      { rule: "charactersAlphanumeric", description: "Characters must be numeric or alphanumeric" }
    ],
    sanitizeFormat: "first 2 + middle 7 redacted + last 3 (e.g., 12-*******-890)",
    sanitizePattern: (val) => val.slice(0, 2) + "-*******-" + val.slice(-3),
    exampleValid: "12-34-ABCD-567",
    exampleInvalid: "12-34-ABCD-5"  // too short
  },

  passport: {
    id: "ph_id_passport",
    label: "Passport (BI)",
    reason: "Passport issued by the Bureau of Immigration (BI) is an international travel credential and critical identifier under RA 10173 and UNCHR standards. May have optional 'P' or 'PH' prefix.",
    risk: "high",
    digitCount: [8, 9],  // variable length
    format: "Optional 'P' or 'PH' prefix + 8-9 numeric digits. First digit indicates passport type (1-3 for standard/official/diplomatic).",
    separators: ["-", " ", ""],
    regexTemplate: "(?:P|PH)?[\\s-]?\\d{8,9}|[Pp]\\d{8,9}",
    structuralRules: [
      { rule: "digitCountRange", min: 8, max: 9, description: "Must be 8-9 digits" },
      { rule: "passportTypeDigit", digit: 1, validValues: [1, 2, 3], description: "First digit must be 1 (standard), 2 (official), or 3 (diplomatic)" },
      { rule: "optionalPrefix", validPrefixes: ["P", "PH"], description: "Optional 'P' or 'PH' prefix allowed" }
    ],
    sanitizeFormat: "digits 1-2 + middle redacted + last 2 (e.g., P1-****89 or 12-****89)",
    sanitizePattern: (val) => {
      const digits = val.replace(/[^\d]/g, "");
      return digits.slice(0, 2) + "-****" + digits.slice(-2);
    },
    exampleValid: "P123456789",
    exampleInvalid: "P12345"  // too short (5 digits)
  },

  umid: {
    id: "ph_id_umid",
    label: "UMID (Unified Multi-Purpose ID)",
    reason: "UMID is the Unified Multi-Purpose ID issued by SSS and represents a unified government identifier credential under RA 10173. Contains SSS system code and includes check digit validation.",
    risk: "high",
    digitCount: 12,
    format: "12 digits: SSS system code (4 digits, 1000-1999) + issuance date (MMYY, 4 digits) + batch/series (3 digits) + check digit (1 digit, modulo 10)",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{3}[\\s-]?\\d{1}|\\d{12}",
    structuralRules: [
      { rule: "exactDigitCount", value: 12, description: "Must be exactly 12 digits" },
      { rule: "sssSystemCode", digits: "1-4", min: 1000, max: 1999, description: "First 4 digits must be 1000-1999 (SSS system code)" },
      { rule: "issuanceDateRange", digits: "5-8", format: "MMYY", description: "Digits 5-8 represent MMYY (01-12 for month, 00-99 for year)" },
      { rule: "checkDigitModulo10", digit: 12, description: "Last digit is check digit calculated via modulo 10" }
    ],
    sanitizeFormat: "first 4 + middle 6 redacted + last 2 (e.g., 1234-****-90-12)",
    sanitizePattern: (val) => val.slice(0, 4) + "-****-" + val.slice(-2),
    exampleValid: "100001230451",
    exampleInvalid: "000001230451"  // invalid system code (0000)
  },

  sss: {
    id: "ph_id_sss",
    label: "SSS (Social Security System)",
    reason: "SSS number is a social insurance identifier linked to employment and benefits under RA 10173. Required for employee registration and benefit claims.",
    risk: "high",
    digitCount: 10,
    format: "10 digits: branch code (2 digits, 01-59) + membership sequence (6 digits) + check digits (2 digits, modulo 11)",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{2}[\\s-]?\\d{6}[\\s-]?\\d{2}|\\d{10}",
    structuralRules: [
      { rule: "exactDigitCount", value: 10, description: "Must be exactly 10 digits" },
      { rule: "branchCodeRange", digits: "1-2", min: 1, max: 59, description: "Branch code (01-59 for Philippine SSS branches)" },
      { rule: "checkDigitsModulo11", digits: "9-10", description: "Last 2 digits are check digits calculated via modulo 11" }
    ],
    sanitizeFormat: "first 2 + middle 6 redacted + last 2 (e.g., 12-XXXXXX-90)",
    sanitizePattern: (val) => val.slice(0, 2) + "-XXXXXX-" + val.slice(-2),
    exampleValid: "0412345678",
    exampleInvalid: "0012345678"  // invalid branch code (00)
  },

  gsis: {
    id: "ph_id_gsis",
    label: "GSIS (Government Service Insurance System)",
    reason: "GSIS number identifies government employees and their benefits under RA 10173. Used for government employee payroll and benefit administration.",
    risk: "high",
    digitCount: 10,
    format: "10 digits: agency/account type (4 digits, 0001-9999) + member sequence (5 digits) + check digit (1 digit, modulo 10)",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{4}[\\s-]?\\d{5}[\\s-]?\\d{1}|\\d{10}",
    structuralRules: [
      { rule: "exactDigitCount", value: 10, description: "Must be exactly 10 digits" },
      { rule: "agencyCodeRange", digits: "1-4", min: 1, max: 9999, description: "Agency/account type code (0001-9999)" },
      { rule: "checkDigitModulo10", digit: 10, description: "Last digit is check digit calculated via modulo 10" }
    ],
    sanitizeFormat: "first 4 + middle 5 redacted + last 1 (e.g., 1234-XXXXX-0)",
    sanitizePattern: (val) => val.slice(0, 4) + "-XXXXX-" + val.slice(-1),
    exampleValid: "0001234560",
    exampleInvalid: "0000234560"  // invalid agency code (0000)
  },

  prc: {
    id: "ph_id_prc",
    label: "PRC (Professional Regulation Commission)",
    reason: "PRC license number is a professional credential that identifies individuals in regulated professions under RA 10173. Includes physicians, engineers, lawyers, etc.",
    risk: "high",
    digitCount: [6, 7],  // variable length
    format: "6-7 digits with optional 4-digit year prefix. Profession category (2 digits, 01-99) + license sequence.",
    separators: ["-", " ", ""],
    regexTemplate: "(?:\\d{4}[\\s-])?\\d{6,7}|\\d{4}-\\d{6,7}",
    structuralRules: [
      { rule: "digitCountRange", min: 6, max: 7, description: "6-7 digits (excluding optional year prefix)" },
      { rule: "professionCategoryRange", digits: "1-2", min: 1, max: 99, description: "Profession category code (01-99)" },
      { rule: "optionalYearPrefix", format: "YYYY", range: [1900, 2099], description: "Optional 4-digit year prefix (1900-2099)" }
    ],
    sanitizeFormat: "year prefix + first 2 + middle redacted + last 2 (e.g., 2021-12-****67)",
    sanitizePattern: (val) => {
      const digits = val.replace(/[^\d]/g, "");
      if (digits.length === 10) return digits.slice(0, 4) + "-" + digits.slice(4, 6) + "-****" + digits.slice(-2);
      return digits.slice(0, 2) + "-****" + digits.slice(-2);
    },
    exampleValid: "2021-1234567",
    exampleInvalid: "2021-12345"  // too short
  },

  tin: {
    id: "ph_id_tin",
    label: "TIN (Taxpayer Identification Number)",
    reason: "TIN is a critical financial identifier linked to taxation, income, and financial status under RA 10173. Issued by Bureau of Internal Revenue (BIR).",
    risk: "high",
    digitCount: 9,
    format: "9 digits: registration area code (3 digits, 100-900) + sequence (3 digits) + classification (2 digits) + check digit (1 digit, modulo 11)",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{3}[\\s-]?\\d{3}[\\s-]?\\d{2}[\\s-]?\\d{1}|\\d{9}",
    structuralRules: [
      { rule: "exactDigitCount", value: 9, description: "Must be exactly 9 digits" },
      { rule: "areaCodeRange", digits: "1-3", min: 100, max: 900, description: "Registration area code (100-900)" },
      { rule: "checkDigitModulo11", digit: 9, description: "Last digit is check digit calculated via modulo 11" }
    ],
    sanitizeFormat: "first 3 + middle 4 redacted + last 2 (e.g., 123-****-89)",
    sanitizePattern: (val) => val.slice(0, 3) + "-****-" + val.slice(-2),
    exampleValid: "123456789",
    exampleInvalid: "023456789"  // invalid area code (023)
  },

  philhealth: {
    id: "ph_id_philhealth",
    label: "PhilHealth (Health Insurance)",
    reason: "PhilHealth number is a healthcare identifier linked to medical records and insurance coverage under RA 10173. Used for health insurance claims and medical services access.",
    risk: "high",
    digitCount: [12, 15],  // 12 digits (recent) or 15 alphanumeric (legacy RF card)
    format: "12 numeric digits (recent format) or 15 alphanumeric characters (legacy RF card format). Recent: member category (2) + sequence (6) + check code (3) + version (1).",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{2}[\\s-]?\\d{6}[\\s-]?\\d{3}[\\s-]?\\d{1}|\\d{12}|[A-Za-z0-9]{15}",
    structuralRules: [
      { rule: "digitCountRange", validCounts: [12, 15], description: "Must be 12 digits (recent) or 15 alphanumeric (legacy)" },
      { rule: "memberCategoryRange", digits: "1-2", min: 0, max: 99, description: "Member category (00-99)" }
    ],
    sanitizeFormat: "first 2 + middle 9 redacted + last 1 (e.g., 12-*********-2)",
    sanitizePattern: (val) => val.slice(0, 2) + "-" + "*".repeat(val.length - 4) + "-" + val.slice(-1),
    exampleValid: "123456789012",
    exampleInvalid: "12345678901"  // too short (11 digits)
  },

  nbi_clearance: {
    id: "ph_id_nbi_clearance",
    label: "NBI Clearance",
    reason: "NBI clearance number is a background check credential that identifies individuals and their criminal record status under RA 10173. Issued by National Bureau of Investigation.",
    risk: "high",
    digitCount: [7, 8, 9, 10],  // variable length
    format: "7-10 digits with optional 'NBI' prefix. Year of issuance (2 digits, 00-99) + office code (3 digits, 001-999) + sequence.",
    separators: ["-", " ", ""],
    regexTemplate: "(?:NBI[\\s-]?)?\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{3,6}|NBI\\d{7,10}|\\d{7,10}",
    structuralRules: [
      { rule: "digitCountRange", min: 7, max: 10, description: "7-10 digits" },
      { rule: "officeCodeRange", digits: "3-5", min: 1, max: 999, description: "Office code (001-999 for NBI regional/branch offices)" },
      { rule: "optionalNBIPrefix", description: "Optional 'NBI' prefix allowed" }
    ],
    sanitizeFormat: "year + office + middle redacted + sequence (e.g., 12-34-****-890)",
    sanitizePattern: (val) => {
      const digits = val.replace(/[^\d]/g, "");
      const midPoint = Math.floor(digits.length / 2);
      return digits.slice(0, 2) + "-" + digits.slice(2, 5) + "-" + "*".repeat(midPoint - 5) + digits.slice(-3);
    },
    exampleValid: "NBI-12-345-6789",
    exampleInvalid: "NBI-12-345"  // too short (5 digits)
  },

  police_clearance: {
    id: "ph_id_police_clearance",
    label: "Police Clearance (PNP)",
    reason: "Police clearance number identifies individuals and their police record status under RA 10173. Issued by Philippine National Police (PNP).",
    risk: "high",
    digitCount: [6, 7, 8, 9, 10],  // variable length, alphanumeric
    format: "6-10 alphanumeric characters with optional 'PNP' prefix and optional year (YYYY format). Office code + sequence.",
    separators: ["-", " ", ""],
    regexTemplate: "(?:PNP[\\s-]?)?(?:\\d{4}[\\s-])?[A-Za-z0-9]{6,10}|PNP-\\d{4}-[A-Za-z0-9]{4,6}",
    structuralRules: [
      { rule: "charCountRange", min: 6, max: 10, description: "6-10 characters (excluding prefix and year)" },
      { rule: "optionalPNPPrefix", description: "Optional 'PNP' prefix allowed" },
      { rule: "optionalYearPrefix", format: "YYYY", range: [1900, 2099], description: "Optional 4-digit year prefix" }
    ],
    sanitizeFormat: "prefix + year + first 2 + middle redacted + last 2 (e.g., PNP-2021-**-****-56)",
    sanitizePattern: (val) => {
      const alphanumeric = val.replace(/[^\w]/g, "");
      const midPoint = Math.floor(alphanumeric.length / 2);
      return alphanumeric.slice(0, 2) + "-" + "*".repeat(midPoint - 4) + "-" + alphanumeric.slice(-2);
    },
    exampleValid: "PNP-2021-123456",
    exampleInvalid: "PNP-2021-12"  // too short
  },

  psa_certificate: {
    id: "ph_id_psa_certificate",
    label: "PSA Certificate (Vital Records)",
    reason: "PSA certificate number is a vital record that identifies individuals and their life events under RA 10173. Issued by Philippine Statistics Authority for birth, marriage, death certificates.",
    risk: "high",
    digitCount: [8, 9, 10, 11, 12, 13],  // variable length
    format: "8-13 digits: certificate type (3 digits: 101=birth, 201=marriage, 301=death) + province/city code (3 digits) + year and batch + sequence.",
    separators: ["-", " ", ""],
    regexTemplate: "(?:101|201|301)[\\s-]?\\d{3}[\\s-]?\\d{2,7}|\\d{8,13}",
    structuralRules: [
      { rule: "digitCountRange", min: 8, max: 13, description: "8-13 digits" },
      { rule: "certificateTypeCode", digits: "1-3", validValues: [101, 201, 301], description: "Type code: 101=birth, 201=marriage, 301=death" },
      { rule: "provinceCodeRange", digits: "4-6", min: 0, max: 999, description: "Province/city code (000-999)" }
    ],
    sanitizeFormat: "type+location + middle redacted + year+sequence (e.g., 101-123-****-8901-23)",
    sanitizePattern: (val) => {
      if (val.length <= 6) return val;
      return val.slice(0, 6) + "-" + "*".repeat(val.length - 10) + "-" + val.slice(-4);
    },
    exampleValid: "101-234-567-8901",
    exampleInvalid: "201-234-5"  // too short
  },

  barangay_clearance: {
    id: "ph_id_barangay_clearance",
    label: "Barangay Clearance",
    reason: "Barangay clearance is a local credential issued by barangay government units. More sensitive than generic labels but less critical than national IDs, classified as MODERATE risk under RA 10173.",
    risk: "moderate",
    digitCount: [4, 5, 6, 7, 8],  // variable length
    format: "4-8 digits with optional 'BC' or 'Barangay' prefix and optional year (YYYY format). Barangay code (2 digits, 01-99) + sequence.",
    separators: ["-", " ", ""],
    regexTemplate: "(?:BC|Barangay)[\\s-]?(?:\\d{4}[\\s-])?\\d{4,8}|\\d{4}[\\s-]\\d{2}[\\s-]\\d{4}",
    structuralRules: [
      { rule: "digitCountRange", min: 4, max: 8, description: "4-8 digits (excluding optional prefix and year)" },
      { rule: "optionalBCPrefix", validPrefixes: ["BC", "Barangay"], description: "Optional 'BC' or 'Barangay' prefix" },
      { rule: "optionalYearPrefix", format: "YYYY", range: [1900, 2099], description: "Optional 4-digit year prefix" },
      { rule: "barangayCodeRange", min: 1, max: 99, description: "Barangay code (01-99)" }
    ],
    sanitizeFormat: "prefix + year + barangay + sequence redacted (e.g., BC-2021-01-****)",
    sanitizePattern: (val) => {
      const digits = val.replace(/[^\d]/g, "");
      if (digits.length >= 6) return digits.slice(0, 4) + "-" + "*".repeat(digits.length - 4);
      return digits.slice(0, 2) + "-" + "*".repeat(Math.max(0, digits.length - 2));
    },
    exampleValid: "BC-2021-01-1234",
    exampleInvalid: "BC-2021-99"  // too short
  },

  comelec_voter_id: {
    id: "ph_id_comelec_voter_id",
    label: "COMELEC Voter's ID",
    reason: "COMELEC Voter's ID is an electoral credential that identifies eligible voters and voting location under RA 10173. Issued by Commission on Elections (COMELEC).",
    risk: "high",
    digitCount: [10, 11, 12, 13, 14],  // variable length
    format: "10-14 digits: province code (2 digits, 01-82) + city/municipality code (2 digits, 01-99) + barangay code (2 digits, 01-99) + precinct number (4 digits) + voter sequence.",
    separators: ["-", " ", ""],
    regexTemplate: "\\d{2}[\\s-]?\\d{2}[\\s-]?\\d{2}[\\s-]?\\d{4}[\\s-]?\\d{0,4}|\\d{10,14}",
    structuralRules: [
      { rule: "digitCountRange", min: 10, max: 14, description: "10-14 digits" },
      { rule: "provinceCodeRange", digits: "1-2", min: 1, max: 82, description: "Province code (01-82)" },
      { rule: "cityCodeRange", digits: "3-4", min: 1, max: 99, description: "City/municipality code (01-99)" },
      { rule: "barangayCodeRange", digits: "5-6", min: 1, max: 99, description: "Barangay code (01-99)" },
      { rule: "precinctRange", digits: "7-10", min: 0, max: 9999, description: "Precinct number (0000-9999)" }
    ],
    sanitizeFormat: "province-city-barangay + precinct redacted + sequence (e.g., 12-34-56-****-****)",
    sanitizePattern: (val) => {
      const digits = val.replace(/[^\d]/g, "");
      if (digits.length >= 10) {
        return digits.slice(0, 6) + "-" + "*".repeat(4) + "-" + (digits.length > 10 ? digits.slice(-4) : "");
      }
      return val;
    },
    exampleValid: "12-34-56-7890-1234",
    exampleInvalid: "12-34-56-7890"  // only 10 digits, needs voter sequence
  }
});

// Freeze to prevent accidental mutation at runtime.
Object.freeze(TRUSTPROMPT_PATTERNS);
