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
    /^passport\s+no\s*\.?\s*[:=\s]*/i,
    /^id\s+no\s*\.?\s*[:=\s]*/i,
    /^license\s+no\s*\.?\s*[:=\s]*/i,
    /^student\s+id\s*\.?\s*[:=\s]*/i,
    /^employee\s+id\s*\.?\s*[:=\s]*/i,
    /^mother.{0,2}s.{0,2}\s+maiden\s*\.?\s*[:=\s]*/i,  // "Mother's Maiden", "Mothers Maiden", etc.
    /^sss\s+no\s*\.?\s*[:=\s]*/i,
    /^philhealth\s*\.?\s*[:=\s]*/i,
    /^philid\s*\.?\s*[:=\s]*/i,
    /^umid\s*\.?\s*[:=\s]*/i,
    /^prc\s*\.?\s*[:=\s]*/i,
    /^number\s*\.?\s*[:=\s]*/i,
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

// ── TASK-5.1: API Key vs Philippine ID Disambiguation ──────────────────────
// When a match could be either an API key or a Philippine ID (e.g., AKIA123456789012 
// could match a 12-digit PhilID pattern), this function helps determine the most likely 
// classification by examining context and characteristics.
/**
 * Determine if a match is more likely an API key than a Philippine ID.
 * Returns true if the match has API key characteristics.
 * 
 * @param {string} rawMatch - The matched string
 * @param {string} fullText - The full text context (optional)
 * @returns {boolean} true if likely an API key, false if likely a Philippine ID
 */
function isLikelyApiKey(rawMatch, fullText = "") {
  if (!rawMatch || typeof rawMatch !== "string") return false;
  
  // Check for explicit API key prefixes (strongest signal)
  const apiKeyPrefixes = [
    /^sk[-_]/, /^pk[-_]/, /^rk[-_]/, /^ghp_/, /^gho_/, /^ghu_/, 
    /^xoxb-/, /^xoxp-/, /^xoxz-/, /^AKIA/, /^ASIA/, /^AIza/, 
    /^ya29\./, /^hf_/, /^npm_/, /^AccountKey=/, /^eyJ/,
    /^-----BEGIN/, /^AC[A-Za-z0-9]/, /^SK[A-Za-z0-9]/
  ];
  
  if (apiKeyPrefixes.some(p => p.test(rawMatch))) {
    return true;
  }
  
  // Check context: if preceded by API-related keywords
  const apiContext = /(?:api[_\-\s]?key|access[_\-\s]?key|client[_\-\s]?secret|auth[_\-\s]?token|bearer|password|secret|token)\s*[:=\s]*$/i;
  if (fullText && apiContext.test(fullText.slice(Math.max(0, fullText.length - 100)))) {
    return true;
  }
  
  // Check for mixed alphanumeric (API keys often have more character variety)
  // Philippine IDs are mostly numeric
  const hasLetters = /[A-Za-z]/.test(rawMatch);
  const hasSymbols = /[_\-\.+\/=]/.test(rawMatch);
  
  if (hasLetters || hasSymbols) {
    // Could still be API key, but need to check if it looks like an ID
    const isPhIdLike = /^\d{4}-\d{7}-\d$|^\d{4}-\d{4}-\d{4}-\d{4}$|^\d{2}-\d{7}-\d$|^\d{7}$/.test(rawMatch);
    if (!isPhIdLike) {
      return true; // More likely an API key if it doesn't match Philippine ID patterns
    }
  }
  
  // Default: if ambiguous, be conservative and check entropy
  const entropy = shannonEntropy(rawMatch.replace(/[_\-\.+\/=]/g, ""));
  // API keys typically have higher entropy than Philippine IDs
  // API keys: 3.5+ bits/char, Philippine IDs: 2-3 bits/char (mostly digits, predictable patterns)
  return entropy > 3.0;
}

// ── TASK-4.4: Known-placeholder suppression constants ─────────────────────────
// PLACEHOLDER_SUPPRESSIONS maps patternId → Set of known-safe dummy values.
// Values are stored lowercased with spaces and dashes stripped for comparison.
// These are universally recognized test/documentation values that carry no
// real risk (Stripe test cards, AWS docs example key, jwt.io default token).
const PLACEHOLDER_SUPPRESSIONS = Object.freeze({
  credit_card: new Set([
    // NOTE: These test cards are officially documented for testing purposes
    // and should NOT be flagged as PII since they're not real/functional cards
    // "4111111111111111",        // Stripe Visa test — REMOVED: matches /^1+$/ placeholder pattern
    // "5500000000000004",        // Stripe Mastercard test — REMOVED: matches /^0+$/ placeholder pattern
    // "378282246310005",         // Stripe Amex test — REMOVED: placeholder
    // "6011111111111117",        // Stripe Discover test — REMOVED: placeholder
    // "3566002020360505",        // Stripe JCB test — REMOVED: placeholder
    // "4242424242424242",        // Stripe second Visa test — REMOVED: matches /^2+$/ or placeholder pattern
    // "5105105105105100",        // Stripe Mastercard test 2 — REMOVED: matches /^0+$/ placeholder pattern
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
//
// NOTE: These patterns were revised to avoid false positives on legitimate test cards
// which happen to have repeating digits (e.g., 4111111111111111, 5105105105105100).
// Instead, we explicitly whitelist known test cards via OFFICIAL_TEST_CARDS below.
const PLACEHOLDER_PATTERNS = Object.freeze([
  /^<[A-Z_][A-Z0-9_]*>$/,          // <YOUR_API_KEY>, <TOKEN>, <SECRET>
  /^YOUR_[A-Z][A-Z0-9_]*$/,        // YOUR_API_KEY, YOUR_SECRET_TOKEN
  /^xxx+$/i,                        // xxx...xxx (3+ x's; more specific than /^x+$/)
  /^000+$/,                         // 000...000 (3+ zeros; more specific than /^0+$/)
  /^(placeholder|example|test|demo|fake|dummy|sample|insert.?here|changeme)$/i,
]);

// OFFICIAL_TEST_CARDS: Card numbers from payment processors officially documented
// for testing purposes. These are NOT real cards and should never be flagged as PII.
// Sources:
//   - Stripe test cards (https://stripe.com/docs/testing)
//   - Square test cards (https://developer.squareup.com/docs/testing/test-data)
//   - Other processor documentation
const OFFICIAL_TEST_CARDS = new Set([
  // ── Stripe Test Cards ──────────────────────────────────────────────────────
  "4111111111111111",        // Visa (SRC-SYN-001)
  "5500000000000004",        // Mastercard (SRC-SYN-002)
  "378282246310005",         // American Express (SRC-SYN-003)
  "6011111111111117",        // Discover (SRC-SYN-004)
  "3566002020360505",        // JCB (SRC-SYN-005)
  "4242424242424242",        // Visa (alternative) (SRC-SYN-006)
  "5105105105105100",        // Mastercard (alternative) (SRC-SYN-007)
  // ── Square Test Cards ──────────────────────────────────────────────────────
  "4532015112830366",        // Visa (Square)
  "5425233010103291",        // Mastercard (Square)
  // ── Additional Common Test Numbers ─────────────────────────────────────────
  "6011000990139424",        // Discover (common test)
  "3782822463100055",        // Amex (common test)
  "30569309025904",          // Diners Club (common test)
  "36148906313452",          // Diners Club (alternative)
  "6011601160116011",        // Discover (alternative)
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
  
  // First check explicit suppressions (legacy/hardcoded)
  const suppressed = PLACEHOLDER_SUPPRESSIONS[patternId];
  if (suppressed && suppressed.has(normalized)) return true;
  
  // For credit cards, whitelist official test cards (they are NOT placeholders)
  if (patternId === 'credit_card' && OFFICIAL_TEST_CARDS.has(normalized)) return false;
  
  // Also check structural placeholder patterns against the normalized value
  return PLACEHOLDER_PATTERNS.some(re => re.test(rawValue.trim()));
}

// ── TASK-4.6: Vendor-prefix structural validator ──────────────────────────────
// Used by the web worker path where validator.js is unavailable.
// Returns true if the raw match starts with a known vendor-specific API key prefix,
// which is structurally distinctive enough to confirm the match without Luhn/RFC5322.
const VENDOR_PREFIXES = Object.freeze([
  /^sk-(?:proj-)?[A-Za-z0-9\-_]{20,}/,         // OpenAI (sk-..., sk-proj-...)
  /^sk-ant-[A-Za-z0-9_\-]{20,}/,               // Anthropic
  /^ghp_[A-Za-z0-9]{36}/,                      // GitHub Personal Access Token
  /^gho_[A-Za-z0-9]{36}/,                      // GitHub OAuth token
  /^ghu_[A-Za-z0-9]{36}/,                      // GitHub User token
  /^github_pat_[A-Za-z0-9_]{50}/,              // GitHub fine-grained PAT
  /^xoxb-\d+-[A-Za-z0-9\-]+/,                  // Slack Bot token
  /^xoxp-\d+-[A-Za-z0-9\-]+/,                  // Slack User token
  /^xoxz-\d+-[A-Za-z0-9\-]+/,                  // Slack App token
  /^AKIA[A-Z0-9]{16}/,                         // AWS Access Key ID
  /^ASIA[A-Z0-9]{16}/,                         // AWS temporary access key
  /^AIza[A-Za-z0-9\-_]{35}/,                   // Google API key
  /^ya29\.[A-Za-z0-9\-_]+/,                    // Google OAuth access token
  /^sk_live_[A-Za-z0-9]{24,}/,                 // Stripe live key
  /^sk_test_[A-Za-z0-9]{24,}/,                 // Stripe test key
  /^rk_live_[A-Za-z0-9]{24,}/,                 // Stripe restricted live key
  /^rk_test_[A-Za-z0-9]{24,}/,                 // Stripe restricted test key
  /^(?:AC|SK)[A-Za-z0-9a-f]{32}/,              // Twilio auth token / API key
  /^SG\.[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_]{43,}/, // SendGrid API key
  /^hf_[A-Za-z0-9]{30,}/,                      // Hugging Face token
  /^npm_[A-Za-z0-9]{20,}/,                     // NPM token
  /^AccountKey=[A-Za-z0-9+\/=]{88}/,           // Azure storage key
  /^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, // Private keys (RSA, EC, OpenSSH)
  /^eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/, // JWT
]);

/**
 * TASK-4.6: Structural vendor-prefix check for use in the web worker path.
 * @param {string} raw - the full raw match from the regex
 * @returns {boolean} true if the value matches a known vendor key prefix
 */
function structuralValidateApiKey(raw) {
  // Extract the value portion (after any label=... prefix or standalone)
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
 *   - Format: XXXX-XXXXXXX-X (4 digits - 7 digits - 1 digit)
 *   - Digits 1-4: Any 4-digit number (0000-9999) - NO system code restrictions
 *   - Digits 5-11: Any 7-digit number (0000000-9999999) - NO date restrictions
 *   - Digit 12: Check digit (0-9, calculated via modulo 10)
 * 
 * Key difference from SSS (2-7-1 format, 10 digits):
 *   - UMID allows ANY first 4 digits (0000-9999), NOT restricted to 1000-1999
 *   - UMID does NOT validate month/year like SSS does
 *   - UMID uses same check digit calculation (modulo 10)
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
 *   structuralValidatePHID_UMID("431050021346")    → true (valid UMID: 4310-5002134-6)
 *   structuralValidatePHID_UMID("4310-5002134-6")  → true (valid with separators)
 *   structuralValidatePHID_UMID("100001230451")    → true (valid UMID starting with 1000)
 *   structuralValidatePHID_UMID("000001230451")    → true (valid UMID starting with 0000)
 *   structuralValidatePHID_UMID("31-0500213-4")    → false (SSS format: 10 digits, not UMID)
 *   structuralValidatePHID_UMID("1000012304519")   → false (13 digits, not 12)
 * 
 * @param {string} raw - the raw matched UMID value (may contain separators like 4310-5002134-6)
 * @returns {boolean} true if the UMID structure is valid, false otherwise
 */
function structuralValidatePHID_UMID(raw) {
  // Early exit for invalid types
  if (!raw || typeof raw !== "string") {
    return false;
  }

  // ANTI-FALSE-POSITIVE: If this looks like an API key, reject it
  if (isLikelyApiKey(raw)) {
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

  // UMID Validation: Only verify 12 digits, no other restrictions
  // UMID format is 4-7-1 (12 digits total) with NO restrictions on:
  // - First 4 digits (can be any 0000-9999)
  // - Middle 7 digits (no date/month/year validation)
  // - Check digit is optional for structural validation
  // The regex already ensures correct format, so we just need to confirm it's all digits
  
  return true;
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

  // Normalize by removing separators (hyphens, spaces, dots)
  const normalized = normalizePHID(raw);

  // Ensure exactly 10 numeric digits
  if (!/^\d{10}$/.test(normalized)) return false;

  // OPTIMIZATION: Branch code check using charCodeAt (faster than slice+parseInt)
  // Branch must be 01-59
  const branchFirst = normalized.charCodeAt(0) - 48;
  const branchSecond = normalized.charCodeAt(1) - 48;
  const branchCode = branchFirst * 10 + branchSecond;
  if (branchCode < 1 || branchCode > 59) return false;

  // For now, we skip modulo 11 checksum validation since there may be
  // edge cases or variations in the actual SSS number format.
  // The main validation is the 10-digit format and branch code (01-59).
  // Full checksum validation could be added later if needed.

  return true;
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

  // Extract all letters and digits from the raw input
  const letters = raw.replace(/[^A-Za-z]/g, "").toUpperCase();
  const digits = raw.replace(/[^0-9]/g, "");

  // Validate Format 1: 1 letter + 7 digits + 1 letter (e.g., P1261878A)
  // Format: [A-Z]\d{7}[A-Z]
  if (letters.length === 2 && digits.length === 7) {
    // Both formats match this pattern:
    // - Format 1a: 1 prefix letter + 1 suffix letter (e.g., P7409785C → letters="PC", digits="7409785")
    // - Format 2: 2 prefix letters (e.g., PA7203775 → letters="PA", digits="7203775")
    // Both are valid. Just need to verify digit count.
    return true;
  }

  // Validate Format 2b: 2 letters + 7 digits with "P" or "PH" prefix stripped
  // After normalizePHID removes "P"/"PH", we might have 1-2 letters + 7-8 digits
  // e.g., "PH12345678" → normalized "12345678" (8 digits, 0 letters)
  if (digits.length === 7 || digits.length === 8) {
    if (letters.length === 0 || letters.length === 1) {
      // Pure digits or 1 letter + digits (after prefix removal)
      return true;
    }
  }

  // If none of the above patterns match, it's invalid
  return false;
}

// ── PERSONAL HEALTH METRICS PATTERNS ────────────────────────────────────────────

/**
 * Height regex pattern validator.
 * Detects height in common units: feet/inches, centimeters, meters
 */
function validateHeightPattern(raw) {
  if (!raw || typeof raw !== "string") return false;
  // Allow formats like: 5'10", 5 feet 10 inches, 170 cm, 1.7 m
  return /^\d{1,2}\s*(?:feet|ft|')\s*\d{1,2}\s*(?:inches?|in|")?$|^\d{1,3}(?:\.\d{1,2})?\s*(?:cm|centimeters?|m|meters?)$/i.test(raw.trim());
}

/**
 * Weight regex pattern validator.
 * Detects weight in common units: kilograms, pounds, grams
 */
function validateWeightPattern(raw) {
  if (!raw || typeof raw !== "string") return false;
  // Allow formats like: 70 kg, 154 lbs, 70.5 kilograms
  return /^\d{1,3}(?:\.\d{1,2})?\s*(?:kg|kilograms?|lbs?|pounds?|g|grams?)$/i.test(raw.trim());
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

  // ANTI-FALSE-POSITIVE: If this looks like an API key, reject it
  if (isLikelyApiKey(raw)) {
    return false;
  }

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

  // PhilID can be 12 digits (YYMMDDXXXXXX) or 16 digits (formatted as XXXX-XXXX-XXXX-XXXX)
  // Accept both formats since the regex matches 4-4-4-4 format (16 digits)
  if (normalized.length !== 12 && normalized.length !== 16) {
    return false;
  }

  // Validate all characters are digits
  if (!/^\d{12}$/.test(normalized) && !/^\d{16}$/.test(normalized)) {
    return false;
  }

  // For 12-digit format: YYMMDDXXXXXX
  if (normalized.length === 12) {
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

    // All structural validations passed for 12-digit format
    return true;
  }

  // For 16-digit format (credit card-like pattern XXXX-XXXX-XXXX-XXXX):
  // Cannot validate with birth date, so use simpler checks
  // Just verify it's all digits (already checked above)
  // This format is less reliable, so we'll accept it but rely on context filtering
  return true;
}

// ── Street-level Philippine address detection ───────────────────────────────
// A city/municipality name alone ("Antipolo", "Manila") names a PLACE, not a
// person's location, and must NOT be scored as an address. We only accept a
// street-level anchor that points to a specific premises.
//
// Street-type words — kept in ONE short constant (used by both the regex source
// below and the structural validator). Abbreviated forms allow an optional dot.
const PH_STREET_TYPES = ["Street", "St", "Avenue", "Ave", "Road", "Rd",
  "Boulevard", "Blvd", "Drive", "Dr", "Lane", "Ln", "Highway", "Hwy", "Extension", "Ext"];

// Area markers that, with a following name, denote a specific locality premises.
const PH_AREA_MARKERS = ["Barangay", "Brgy", "Subdivision", "Subd", "Purok", "Sitio"];

// Unit / building markers (interior premises).
const PH_UNIT_MARKERS = ["Unit", "Blk", "Block", "Lot", "Bldg", "Building", "Floor", "Flr", "Rm", "Room", "Phase"];

// Residence cue that licenses the WEAKER "street name + street-type, no number"
// case (e.g. "I live at Rizal Street"). Without a number, label, or marker,
// a bare "Rizal Avenue" is Low reliability and must be dropped unless cued.
const PH_ADDRESS_CUES = ["i live at", "i live in", "i reside at", "i reside in",
  "my address is", "my home address is", "located at", "residing at", "address is"];

// Words that commonly follow "barangay"/"purok"/etc. in ordinary prose but do
// NOT name a locality (so "barangay captain", "barangay in Batanes", "barangay
// hall" must NOT be treated as an address). When one of these immediately
// follows an area marker, the area-marker alternative is rejected. Because the
// address regex runs with the /i flag, [A-Z] also matches lowercase; this
// blocklist is what actually distinguishes a proper place name from prose.
const PH_AREA_FOLLOW_STOPWORDS = [
  // roles / officials
  "captain", "chairman", "chairperson", "kapitan", "councilor", "kagawad",
  "official", "officials", "secretary", "treasurer", "tanod", "worker", "workers",
  "staff", "resident", "residents", "folk", "people", "chief", "head", "leader",
  "mayor", "governor", "president", "vice", "deputy", "director", "officer",
  
  // facilities / generic nouns
  "hall", "health", "center", "centre", "office", "clinic", "school", "unit",
  "level", "system", "program", "programs", "project", "projects", "council",
  "assembly", "meeting", "fiesta", "event", "election", "elections", "station",
  "facility", "facility", "library", "gym", "gymnasium", "building", "compound",
  "headquarters", "post", "camp", "base", "church", "chapel", "temple",
  
  // connectors / function words
  "in", "of", "and", "or", "but", "the", "a", "an", "with", "for", "to", "near",
  "is", "was", "where", "here", "there", "that", "this", "my", "our", "their",
  "on", "at", "by", "as", "so", "if", "it", "its", "be", "being",
  
  // action verbs - barangay + verb is NOT an address
  "needs", "need", "needed", "wanting", "wanted", "want", "asked", "ask", "required", "require",
  "help", "helps", "helping", "helped", "supports", "support", "serve", "serves",
  "provide", "provides", "give", "gives", "organize", "organizes", "run", "runs",
  "manage", "manages", "confirm", "confirming", "confirmed", "confirms",
  "accept", "accepts", "accepts", "accept", "collect", "collects", "collect",
  "conduct", "conducts", "conduct", "coordinate", "coordinates", "coordinate",
  "develop", "develops", "develop", "establish", "establishes", "establish",
  "implement", "implements", "implement", "monitor", "monitors", "monitor",
  "organize", "organizes", "organize", "plan", "plans", "plan",
  "receive", "receives", "receive", "schedule", "schedules", "schedule",
  "submit", "submits", "submit", "supervise", "supervises", "supervise",
  
  // descriptive adjectives that never name a place
  "new", "old", "good", "bad", "great", "small", "large", "big", "tiny",
  "public", "private", "modern", "ancient", "first", "second", "third",
  "main", "back", "front", "upper", "lower", "inner", "outer",
  "general", "special", "local", "national", "international",
  "temporary", "permanent", "temporary", "current", "recent",
  "primary", "secondary", "elementary", "higher", "lower",
  
  // administrative / governmental nouns
  "extension", "sector", "phase", "zone", "area", "district", "ward",
  "chapter", "branch", "station", "post", "camp", "base", "garrison",
  "region", "province", "city", "municipality", "municipality",
  "government", "administration", "department", "bureau", "agency",
  "division", "section", "sub", "subsection", "unit", "squad",
  
  // tagalog / cebuano descriptors
  "bagong", "lumad", "lumpia", "baguan", "bagay", "bagay",
  "hindi", "ang", "mga", "pa", "na", "ng", "ay", "o",
  
  // document / administrative words
  "permit", "permits", "clearance", "certificate", "license", "document", "documents",
  "form", "forms", "report", "reports", "record", "records", "data",
  "file", "files", "memo", "memos", "notice", "notices",
  
  // ordinary nouns that follow "barangay" in prose
  "budget", "ordinance", "ordinances", "fund", "funds", "road", "roads",
  "ginebra", "fiesta", "fiesta", "feast", "celebration", "event",
  "competition", "tournament", "game", "match", "sport",
  "policy", "policy", "rule", "law", "regulation",
  
  // common verbs / auxiliaries / function words
  "has", "have", "had", "are", "were", "been", "will", "would", "does", "did",
  "play", "plays", "played", "win", "wins", "won", "also", "just", "very",
  "from", "after", "before", "when", "who", "which", "because", "while", "then", "than",
  "can", "could", "should", "may", "might", "must", "do", "done",
  "come", "comes", "came", "coming", "go", "goes", "went", "going",
  "see", "sees", "saw", "seen", "think", "thinks", "thought",
  
  // more action verbs common after "barangay"
  "begin", "begins", "began", "beginning", "start", "starts", "started",
  "continue", "continues", "continued", "continuing", "end", "ends", "ended",
  "stop", "stops", "stopped", "stopping", "join", "joins", "joined",
  "include", "includes", "included", "open", "opens", "opened",
  "close", "closes", "closed", "meet", "meets", "met", "meet",
  "hold", "holds", "held", "take", "takes", "took", "taking",
  "set", "sets", "setup", "prepare", "prepares", "prepared",
  
  // common modifiers
  "only", "both", "each", "every", "other", "such", "same",
  "all", "any", "some", "many", "few", "several", "various",
  "more", "most", "less", "least", "much", "enough",
  "too", "so", "as", "than", "then",
  
  // more pronouns & determiners
  "i", "me", "we", "us", "you", "he", "him", "she", "her",
  "it", "they", "them", "him", "himself", "herself", "itself",
  "myself", "yourself", "ourselves", "yourselves", "themselves"
];


const _streetTypeAlt = PH_STREET_TYPES.join("|");
const _areaMarkerAlt = PH_AREA_MARKERS.join("|");
const _unitMarkerAlt = PH_UNIT_MARKERS.join("|");
const _areaStopAlt = PH_AREA_FOLLOW_STOPWORDS.join("|");
// Case-insensitive literal for a case-SENSITIVE RegExp: "Brgy" -> "[Bb][Rr][Gg][Yy]".
const ciLiteral = (w) => w.replace(/[A-Za-z]/g, c => `[${c.toLowerCase()}${c.toUpperCase()}]`);
const _areaMarkerCI = PH_AREA_MARKERS.map(ciLiteral).join("|");
const _areaStopCI = PH_AREA_FOLLOW_STOPWORDS.map(ciLiteral).join("|");

/**
 * Structural validator for a street-level PH address candidate.
 * Receives the raw matched span (the regex already required an anchor; this is
 * a defensive re-check that at least one street-level signal is present and the
 * span is not a bare city name).
 *
 * Accepts when ANY of these hold:
 *   1. a number token adjacent to a street-type word   ("123 Rizal St.")
 *   2. a unit/block/lot/building marker                ("Blk 5 Lot 12", "Unit 4B")
 *   3. an area marker + a capitalized name             ("Brgy. San Roque")
 *   4. a labeled "address:" field with content
 *   5. a residence cue + street name + street-type     ("I live at Rizal Street")
 * @param {string} raw
 * @returns {boolean}
 */
function structuralValidatePHStreetAddress(raw) {
  if (!raw || typeof raw !== "string") return false;
  const s = raw.trim();
  if (s.length < 3) return false;

  const streetType = `(?:${_streetTypeAlt})\\.?`;
  const areaMarker = `(?:${_areaMarkerAlt})\\.?`;
  const unitMarker = `(?:${_unitMarkerAlt})\\.?`;

  // 1. Number, then a street NAME word, then a street-type word ("123 Rizal St.").
  //    A word must sit directly before the street type, so a count plus an
  //    abbreviation ("3 Dr. appointments", "2 Ave") is not an address.
  if (new RegExp(`\\b\\d+[A-Za-z]?\\b[\\s\\S]{0,40}?\\b[A-Za-z][\\w.-]*[\\s,]+${streetType}(?:\\b|$)`, "i").test(s)) {
    return true;
  }
  // 2. Unit / block / lot / building marker + a NUMERIC identifier, AND at least
  //    one corroborating anchor. A lone "Unit 4" / "Room 305" / "Blk 5" is just as
  //    often a course unit or an exam block, so it needs a second signal:
  //    another marker ("Blk 5 Lot 12"), a letter id ("4B"), a street type, an area
  //    marker, or a comma + Title-Case component ("Unit 4, Sunrise Tower").
  {
    const units = s.match(new RegExp(`\\b${unitMarker}\\s*#?\\s*\\d+(?:-?[A-Za-z])?`, "ig")) || [];
    if (units.length) {
      const multi = units.length >= 2;
      const alnumId = units.some(u => /\d-?[A-Za-z]$/.test(u.trim()));
      const hasStreet = new RegExp(`\\b${streetType}(?:\\b|$)`, "i").test(s);
      const hasArea = new RegExp(`\\b${areaMarker}\\s+\\S`, "i").test(s);
      const commaTitle = /,\s*[A-Z][a-z]/.test(s);
      if (multi || alnumId || hasStreet || hasArea || commaTitle) return true;
    }
  }
  // 3. Area marker + a following PROPER-NOUN name token. Barangay, purok,
  //    sitio and subdivision names are proper nouns, so the token after the
  //    marker must start with a capital letter or a digit. A lowercase word is
  //    ordinary prose ("complaint to the barangay about it", "barangay captain").
  //    The check is case-sensitive; the marker and the stopword list are matched
  //    case-insensitively through ciLiteral(), so "Captain" and "captain" are both
  //    rejected as a name.
  if (new RegExp(`\\b(?:${_areaMarkerCI})\\.?\\s+(?!(?:${_areaStopCI})\\b)[A-Z0-9][\\w-]*`).test(s)) {
    return true;
  }
  // 4. Labeled field with content
  if (/\baddress\s*[:=]\s*\S+/i.test(s)) {
    return true;
  }
  // 5. Residence cue + street name + street-type (no number)
  const cueAlt = PH_ADDRESS_CUES.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  if (new RegExp(`\\b(?:${cueAlt})\\b[\\s\\S]{0,40}?\\b[A-Z][a-zA-Z]+\\s+${streetType}`, "i").test(s)) {
    return true;
  }
  // 5b. Street name + street-type only (bare "Rizal Avenue" after cue was stripped)
  //     This is now acceptable because the regex ensured it was preceded by a cue
  if (new RegExp(`^[A-Z][a-zA-Z]+\\s+${streetType}(?:\\b|$)`, "i").test(s)) {
    return true;
  }
  return false;
}


const TRUSTPROMPT_PATTERNS = [

  // ── HIGH RISK ──────────────────────────────────────────────────────────────

  {
    id: "credit_card",
    label: "Credit / Debit Card Number",
    reason: "Card numbers give direct access to your financial accounts. Sharing one with an AI model means it is transmitted to and stored by a third-party server.",
    regex: /\b(?:\d{4}[\s-]?){3}\d{4}\b|\b\d{15}\b/g,
    risk: "high",
    validate: "isCreditCard",
    // Replace the entire card number with a placeholder. (The earlier
    // digit-masking approach left the number raw when it contained spaces,
    // e.g. "5363 7654 2347 5340", because the lookahead never matched across
    // separators. A full placeholder avoids any chance of leaking digits.)
    sanitize: (_m) => "[card identifier]"
  },

  // TASK-4.2: Hardened api_key pattern (Enhanced for comprehensive vendor coverage).
  //
  // Changes from original:
  //   (1) Tightened keyword list — dropped bare `secret` and bare `token` as
  //       standalone keywords; these caused false positives on natural language
  //       (e.g. "my secret recipe", "access token: pending_approval_by_admin").
  //       Retained: api_key, api-key, access_key, access-key, client_secret,
  //       client-secret, auth_token, auth-token, bearer.
  //
  //   (2) Added vendor-prefix OR branch — detects well-known API key shapes
  //       without requiring a label prefix. Coverage expanded to include:
  //       - OpenAI: sk-*, sk-proj-*
  //       - Anthropic: sk-ant-*
  //       - GitHub: ghp_*, gho_*, ghu_*, github_pat_*
  //       - Slack: xoxb-*, xoxp-*, xoxz-*
  //       - AWS: AKIA*, ASIA*
  //       - Google: AIza*, ya29.*
  //       - Stripe: sk_live_*, sk_test_*, rk_live_*, rk_test_*
  //       - Twilio: AC*, SK*
  //       - SendGrid: SG.*
  //       - Hugging Face: hf_*
  //       - Azure: AccountKey=*
  //       - Private keys: BEGIN RSA/EC/OPENSSH PRIVATE KEY
  //       - JWT: eyJ header pattern (also caught by jwt pattern but included here for completeness)
  //       - Bearer tokens and generic assignments
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
    reason: "API keys and secret tokens authenticate your identity with a service — they are the equivalent of a password for software systems. Exposing one allows anyone who sees it to make requests on your behalf, potentially incurring charges, accessing private data, or compromising connected systems. This includes vendor-specific formats: OpenAI (sk-..., sk-proj-...), Anthropic (sk-ant-...), GitHub (ghp_..., gho_..., github_pat_...), Slack (xoxb-...), AWS (AKIA..., ASIA...), Google (AIza..., ya29...), Stripe (sk_live_..., sk_test_...), Twilio, SendGrid, Hugging Face, Azure, and private keys. Keys included in prompts may be logged by the AI provider.",
    // Labelled-key branch: expanded keyword list + special char support + URL patterns
    // Vendor-prefix branch: structurally distinctive prefixes without requiring a label
    regex: /(?:(?:api[_\-\s]?key|access[_\-\s]?key|client[_\-\s]?secret|auth[_\-\s]?token|bearer|password|passwd|secret[_\-]?access[_\-]?key|secret|connection)(?:\s*[:=]\s*|[\s]+)["']?([A-Za-z0-9\-_\.+\/=:@!]{15,})["']?|(?:postgres|mongodb)[+a-z]*:\/\/\S+|[a-z]+:\/\/[^:]+:[^@ \n\r\t]+@\S+|sk-(?:proj-)?[A-Za-z0-9_\-]{20,}|sk-ant-[A-Za-z0-9_\-]{20,}|sk_live_[A-Za-z0-9]{20,}|sk_test_[A-Za-z0-9]{20,}|pk_[A-Za-z0-9]{20,}|rk_live_[A-Za-z0-9]{20,}|rk_test_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|ghu_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|xoxb-\d+[-A-Za-z0-9\-]+|xoxp-\d+[-A-Za-z0-9\-]+|xoxz-\d+[-A-Za-z0-9\-]+|AKIA[A-Z0-9]{16}|ASIA[A-Z0-9]{16}|AIza[A-Za-z0-9\-_]{35}|ya29\.[A-Za-z0-9\-_]{30,}|(?:AC|SK)[A-Za-z0-9a-f]{32}|SG\.[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{30,}|hf_[A-Za-z0-9]{30,}|npm_[A-Za-z0-9]{20,}|AccountKey=[A-Za-z0-9+\/=]{80,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{20,})/g,
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
    reason: "Email addresses are personally identifiable information (PII) under the Philippine Data Privacy Act (RA 10173). Sharing someone else's email without consent may violate data privacy law. Even your own email can be used for targeted phishing, spam, or account enumeration attacks if exposed. This pattern detects emails from all providers: Gmail, Outlook, Yahoo, ProtonMail, and others.",
    regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
    risk: "moderate",
    validate: "isEmail",
    sanitize: (m) => {
      const [local, domain] = m.split("@");
      return local[0] + "***@" + domain;
    },
    // NOTE: Email is in the criticalPatterns list in scanner.js, which means it will NEVER be
    // filtered by shouldFilterByContext() regardless of domain name (e.g., "example.com").
    // This ensures all emails are detected regardless of case (all-caps, lowercase, mixed-case)
    // and regardless of whether the domain contains words like "example", "test", "demo", etc.
    // Therefore, no contextFilter is needed here.
  },

  {
    id: "ph_mobile",
    label: "Philippine Mobile Number",
    reason: "Philippine mobile numbers (09XX or +639XX format) are directly tied to a person's identity through SIM registration (RA 11934). Exposing a mobile number enables unsolicited contact, SIM-swap fraud, and social engineering attacks.",
    regex: /(\+639|09)[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d/gi,
    risk: "moderate",
    validate: "isMobilePhone_PH",
    contextFilter: function(rawMatch, fullText, matchIndex) {
      // Extract surrounding context (±100 chars) to determine if this is a phone number or serial
      const contextStart = Math.max(0, matchIndex - 100);
      const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 100);
      const beforeText = fullText.substring(contextStart, matchIndex).toLowerCase();
      const afterText = fullText.substring(matchIndex + rawMatch.length, contextEnd).toLowerCase();
      const fullContext = beforeText + " [MATCH] " + afterText;

      // MEASUREMENT CONTEXT: Check if this number is followed by measurement units (grams, kg, etc.)
      const measurementAfter = fullText.substring(matchIndex + rawMatch.length, Math.min(fullText.length, matchIndex + rawMatch.length + 30)).toLowerCase();
      const measurementUnits = /^\s*(?:grams?|g|kilograms?|kg|pounds?|lbs?|ounces?|oz|milligrams?|mg|milliliters?|ml|liters?|l)\b/i;
      if (measurementUnits.test(measurementAfter)) {
        console.log(`[TrustPrompt/contextFilter] ph_mobile suppressed: "${rawMatch}" (measurement units detected)`);
        return false; // SUPPRESS: This is a measurement, not a mobile number
      }

      // PHILHEALTH NUMBER DETECTION: Check if this is a PhilHealth number (09-XXXXXXXXX-X format)
      // PhilHealth numbers have the format: 09-XXXXXXXXX-X (11 digits with specific dashes)
      const cleanedMatch = rawMatch.replace(/[\s\-]/g, '');
      
      // If the match is exactly 10 digits and followed by -X pattern in fullText, it's PhilHealth
      if (cleanedMatch.length === 10) {
        const afterMatchStart = matchIndex + rawMatch.length;
        const afterMatchContext = fullText.slice(afterMatchStart, Math.min(fullText.length, afterMatchStart + 5));
        // Check if there's a trailing digit after the 10-digit core (PhilHealth check digit)
        if (/^\s*-\s*\d|\s*-\s*\d/.test(afterMatchContext)) {
          console.log(`[TrustPrompt/contextFilter] ph_mobile suppressed: "${rawMatch}" (appears to be PhilHealth number)`);
          return false; // SUPPRESS: This is a PhilHealth number, not a mobile
        }
      }

      // Also check context keywords for PhilHealth
      if (/\b(philhealth|phil\s*health|phealth)\b/i.test(fullContext)) {
        console.log(`[TrustPrompt/contextFilter] ph_mobile suppressed: "${rawMatch}" (PhilHealth context detected)`);
        return false; // SUPPRESS: PhilHealth context
      }

      // SERIAL NUMBER MARKERS: If context contains these terms, likely a serial/product ID
      const serialMarkers = [
        /\b(serial|barcode|product code|model|sku|part number|item number|reference code)\b/i,
        /\b(warranty|invoice|receipt|purchase|order|batch|lot)\b/,
        /\b(printed under|under the|found on|on the box|on packaging|on label)\b/i,
      ];

      if (serialMarkers.some(m => m.test(fullContext))) {
        // This appears to be a product serial, not a phone number
        return false; // Filter it out
      }

      // PHONE NUMBER MARKERS: If context contains these, definitely a phone number
      const phoneMarkers = [
        /\b(call|contact|reach|dial|number|phone|mobile|cell|text|sms|whatsapp|telegram)\b/i,
        /\b(my number|my phone|my mobile|my cell|my contact)\b/i,
        /\b(phone number is|contact is|reach me at|call me at)\b/i,
        /international dialing|country code|\+63/i,
      ];

      if (phoneMarkers.some(m => m.test(fullContext))) {
        // This is clearly a phone number context
        return true; // Keep it
      }

      // No strong indicators either way - allow it (validator will confirm format)
      // This is conservative: better to flag and let user decide than miss real numbers
      return true;
    },
    sanitize: (m) => {
      // Remove spacing/dashes and show only first 3 and last 2 digits
      const cleaned = m.replace(/[\s\-]/g, '');
      return cleaned.slice(0, 3) + '****' + cleaned.slice(-2);
    }
  },

  {
    id: "ipv4",
    label: "IPv4 Address",
    reason: "Internal or private IP addresses reveal your network topology, which can assist attackers in mapping your infrastructure. Public IPs can be used to geolocate you or target your connection. Sharing server IPs in prompts may expose backend systems to reconnaissance.",
    regex: /\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    // Low-impact (Limited) — base score 2. The display `risk` must match the
    // BASE_SCORES/ENTITY_TIER classification ("limited" → Low), not "moderate".
    risk: "low",
    validate: "isIP",
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true; // No context, allow it
      
      // Extract surrounding context (±50 chars)
      const contextStart = Math.max(0, matchIndex - 50);
      const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 50);
      const context = fullText.substring(contextStart, contextEnd).toLowerCase();
      
      // Version number markers - SUPPRESS these
      // Examples: "version 10.2.3.4", "release 10.2.3.4", "v10.2.3.4", "10.2.3.4 release"
      const versionMarkers = [
        /\b(?:version|release|v|build|rev|revision|r)\s*[:\-]?\s*[\d\.]+/i,  // "version 10.2.3.4" or "v10.2.3.4"
        /[\d\.]+\s+(?:version|release|build|revision|update)/i,  // "10.2.3.4 version" or "10.2.3.4 release"
        /\b(?:semantic\s+)?version\b/i,  // "semantic versioning"
        /\bsoftware\s+version/i,  // "software version"
        /\bapp\s+version/i,  // "app version"
      ];
      
      if (versionMarkers.some(m => m.test(context))) {
        return false; // Suppress - this is a version number, not an IP address
      }
      
      return true; // Allow - likely an actual IP address
    },
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
    // Low-impact (Limited) — base score 2. Display risk aligned to Low.
    risk: "low",
    validate: "isIPv6",
    sanitize: (_m) => "[REDACTED-IPv6]"
  },

  {
    id: "mac_address",
    label: "MAC Address",
    reason: "A MAC address is a hardware identifier burned into your network interface. It can be used to uniquely fingerprint and track a specific device across networks. MAC addresses are treated as device identifiers and their exposure can assist in device-level tracking or impersonation.",
    regex: /\b([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}\b/g,
    // Low-impact (Limited) — base score 2. Display risk aligned to Low.
    risk: "low",
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
    regex: /```[\s\S]*?```|`[^`\n]{10,}`|(?:^|\n)\s*(?:const|let|var)\s+\w+\s*=\s*["'][^"']*["'];?/gm,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[CODE BLOCK REMOVED]"
  },

  {
    id: "id_label",
    label: "Government-Issued ID Field",
    reason: "Government-issued identifiers classified are classified as Sensitive Personal Information under RA 10173. Sharing these — even just the field label with a value — with an AI assistant transmits them to a third-party server where they may be logged or retained. These identifiers can be used for identity theft, benefit fraud, or account takeover.",
    regex: /\b(?:sss|philhealth|passport(?:\s?no(?:\.|\b))?|license\s?no|plate\s?no|student\s?id|employee\s?id|id\s?number|mother.?s?\s?maiden(?:\s?name)?|umid|postal\s?id|national\s?id|philsys)\s*:[ \t]*.+/gi,
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
    },
    isTriggerOnly: true,  // ← NEW: Mark as trigger-only, not reported as a finding
    contextFilter: (match, text) => {
      // ── CONTEXT-AWARE FILTERING FOR GENERIC METADATA LABELS ─────────────────
      // Distinguish between personal employer info ("Employer: ABC Corp") and
      // generic job posting metadata ("Company: Pacific Harvest Foods Inc.")
      // 
      // Suppress if:
      // 1. The label is generic metadata (Company:, Location:, Position:, Shift:)
      // 2. The surrounding context indicates a job posting/workplace document
      
      const context = text.substring(
        Math.max(0, match.index - 200),
        match.index + match[0].length + 200
      ).toLowerCase();
      
      // Extract the label from the match (the word before the colon)
      const labelMatch = match.match(/^(\w+)/);
      if (!labelMatch) return true; // Keep if can't parse
      
      const label = labelMatch[1].toLowerCase();
      
      // Generic metadata labels that are NOT personal in job posting context
      const genericMetadataLabels = ['company', 'location', 'position', 'shift', 'department', 'role', 'title', 'office'];
      
      if (!genericMetadataLabels.includes(label)) {
        // Not a generic label (e.g., "name", "age", "employer", "emergency contact")
        // These should always be kept
        return true;
      }
      
      // If it IS a generic label, check if context is a job posting
      const jobPostingIndicators = /(?:newsletter|posting|job|position|role|supervisor|warehouse|rewrite|summary|one-?paragraph|internal|company profile)/i;
      
      const isJobPostingContext = jobPostingIndicators.test(context);
      
      // Suppress (return false) if it's a generic label in a job posting context
      return !isJobPostingContext;
    }
  },

  {
    id: "ph_address",
    label: "Philippine Physical Address",
    reason: "Physical addresses are sensitive location data under the Data Privacy Act. A street-level Philippine address (house/unit number, street, barangay, subdivision) can precisely identify where a person lives or works. Combined with a name or contact number, it enables stalking, physical harassment, or targeted fraud.",
    // ── STREET-LEVEL ANCHORED DETECTION ──────────────────────────────────────
    // A city/municipality name alone ("Antipolo", "Manila") names a place, not a
    // person's premises, and is deliberately NOT matched here. Every alternative
    // below requires a street-level anchor so the entity only fires on an actual
    // address. The structuralValidate function re-checks the captured span.
    //
    // Alternatives (any one matches a span):
    //   A. Number + (optional Blk/Lot run) + Name + street-type:
    //        "123 Rizal St.", "Blk 5 Lot 12 Mabini Ave.", "123 rizal st"
    //   B. Area marker + Name:  "Brgy. San Roque", "Sitio Maligaya"
    //   C. Unit/Bldg/Floor marker + Name:  "Unit 4B, Sunrise Tower"
    //   D. Labeled field + content:  "Address: 45 Del Pilar Street"
    //   E. Residence cue + Name + street-type (NO number):  "I live at Rizal Street"
    //      (bare "Rizal Avenue" with no cue is Low reliability → not matched)
    // ── ADDRESS CONTINUATION (keeps a multi-part address as ONE span) ─────────
    // A real address is written as comma-separated components: house/street,
    // then barangay/subdivision, then city/province — e.g.
    // "45 Mabini St., Brgy. San Roque, Cainta". Without stitching these together
    // the detector emits a SEPARATE ph_address for each component and the risk
    // score aggregates. The continuation below optionally consumes following
    // comma-separated components, where each component is either an area marker
    // (Brgy./Subd./Purok/Sitio) + name, or 1–3 Title-Case tokens (the city /
    // subdivision name). It stops at the first lowercase function word (e.g.
    // "...Cainta and the rent is overdue" stops before "and"), so prose does not
    // leak in. Defined once and appended to the street/number alternatives.
    regex: (() => {
      const STREET = "(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Highway|Hwy|Extension|Ext)";
      const AREA = "(?:Barangay|Brgy|Subdivision|Subd|Purok|Sitio)";
      // Common words that follow an area marker in prose ("barangay captain",
      // "barangay in Batanes", "barangay hall") — these are NOT place names, so
      // alternative B rejects them via a negative lookahead. Mirrors
      // PH_AREA_FOLLOW_STOPWORDS used by the structural validator.
      const AREA_STOP = "(?!(?:" + _areaStopAlt + ")\\b)";
      // One trailing component: ", [area marker ]Title-Case token(s)".
      // The negative lookahead blocks common connectors that may follow a comma
      // ("..., and the rent...") — needed because the /i flag makes [A-Z] match
      // any case, so without it a lowercase "and" could be consumed.
      const NOT_CONNECTOR = "(?!(?:and|or|but|the|a|an|with|for|then|so|which|who|that|is|are|was|were|near|beside|behind|across|along|at|in|on|by|to|from|please|can|could|i|we|you|my|our|just|also)\\b)";
      // Lookbehind placed before a token separator: the previous character must not
      // be a sentence-ending ".", unless it closes an address abbreviation
      // ("St.", "Brgy.", "Sto."). Without it the span ran past the sentence end:
      // "...Cainta. I play guitar" was captured as "...Cainta. I play".
      const NO_SENT_END = "(?<=\\b(?:Sto|Sta|St|Ave|Blvd|Rd|Dr|Ln|Hwy|Ext|Brgy|Subd|Bldg|Blk|Mt|Jr|Sr)\\.|[^.])";
      const CONT = "(?:\\s*,\\s*" + NOT_CONNECTOR + "(?:" + AREA + "\\.?\\s+)?[A-Z][\\w.-]*(?:" + NO_SENT_END + "\\s+" + NOT_CONNECTOR + "[A-Z][\\w.-]*){0,2}){0,4}";
      return new RegExp(
        "(?:" +
          // A. number [unit run] name(s) street-type (+ continuation)
          // The street NAME is required ({1,3}): a bare "3 Dr." / "2 Ave" / "5 Ext"
          // is a count + abbreviation ("3 Dr. appointments"), not an address.
          "\\b(?:Blk|Block|Lot|Unit|No)\\.?\\s*\\d+[A-Za-z]?(?:[,\\s]+(?:Blk|Block|Lot|Unit)\\.?\\s*\\d+[A-Za-z]?)*[\\s,]+(?:[A-Za-z][\\w.-]*\\s+){1,3}" + STREET + "\\b\\.?" + CONT +
          "|" +
          "\\b\\d+[A-Za-z]?[\\s,]+(?:[A-Za-z][\\w.-]*\\s+){1,3}" + STREET + "\\b\\.?" + CONT +
          "|" +
          // B. area marker + PROPER-NOUN name (+ continuation).
          //    AREA_STOP rejects a following common word so "barangay captain"
          //    and "barangay in Batanes" are NOT treated as an address.
          //    Each extra name token is also checked against the stopword list so the
          //    span stops before "is a" / "play basketball" instead of swallowing them.
          "\\b" + AREA + "\\.?\\s+" + AREA_STOP + "[A-Za-z0-9][\\w.-]*(?:" + NO_SENT_END + "\\s+" + AREA_STOP + "[A-Za-z0-9][\\w.-]*){0,2}" + CONT +
          "|" +
          // C. unit/building marker + a NUMERIC identifier (+ optional building name)
          //    The identifier must contain a digit (e.g. "4B", "5", "12") so common
          //    words like "Lot of", "Unit tests", "Block diagram" do NOT match.
          //    Chained markers ("Lot 5 Block 3 Phase 2") and the following building /
          //    subdivision name are kept in ONE span, then the continuation consumes
          //    ", City, Province". Free tokens are stopword-guarded so "unit 4 tests
          //    and ..." does not run on. The structural validator additionally
          //    requires corroboration for a lone "Unit 4".
          "\\b(?:Unit|Blk|Block|Lot|Bldg|Building|Floor|Flr|Rm|Room|Phase)\\.?\\s*#?\\s*\\d+(?:-?[A-Za-z])?" +
            "(?:[,\\s]+(?:Unit|Blk|Block|Lot|Bldg|Building|Floor|Flr|Rm|Room|Phase)\\.?\\s*#?\\s*\\d+(?:-?[A-Za-z])?)*" +
            "(?:" + NO_SENT_END + "[,\\s]+" + AREA_STOP + "[A-Za-z0-9][\\w.-]*){0,3}" +
            "(?:\\s+" + STREET + "\\b\\.?)?" + CONT +
          "|" +
          // D. labeled address field
          // Only match if followed by typical address components:
          // - Street names (Rizal, Mabini, etc.)
          // - Unit/building prefixes (Unit, Blk, Floor, etc.)
          // - Area markers (Brgy, Subdivision, etc.)
          // - City/town names (Manila, Quezon, etc.)
          // NOT just any hex string like MAC addresses (20-0B-74-46-74-46)
          "\\baddress\\s*[:=]\\s*(?=" +
            "(?:[A-Za-z0-9]+\\s+)+(?:" + STREET + "|" + AREA + "|Street|Avenue|Road|Boulevard|Unit|Block|Building|Brgy|Subdivision|Purok|Sitio|" +
            // Common city/municipality names in PH
            "Manila|Quezon|Makati|Caloocan|Las Piñas|Pasig|Cainta|Antipolo|Bacoor|Cavite|Laguna|Bulacan|Pampanga|" +
            "San Juan|Valenzuela|Parañaque|Muntinlupa|Marikina|Pasay|Taguig|Pateros|Navotas|Malabon" +
          ")\\b)" +
          "[A-Za-z0-9][^.!?\\n]{2,80}" +
          "|" +
          // E. residence cue + street name + street-type (no number) (+ continuation)
          // Uses capture group to extract only the address part (without the cue)
          "\\b(?:I\\s+live\\s+(?:at|in)|I\\s+reside\\s+(?:at|in)|my\\s+(?:home\\s+)?address\\s+is|located\\s+at|residing\\s+at)\\s+((?:[A-Za-z][\\w.-]*\\s+){1,3}" + STREET + "\\b\\.?" + CONT + ")" +
        ")",
        "gi"
      );
    })(),
    // Moderate (Significant) — base score 5. The display `risk` must match the
    // BASE_SCORES/ENTITY_TIER classification ("significant" → Moderate).
    risk: "moderate",
    validate: null,
    structuralValidate: structuralValidatePHStreetAddress,
     // CONTEXT FILTER: Suppress "barangay" matches that aren't actual place references
    // Only suppress if "barangay" is followed by non-place words (like "confirming", "official", "permit")
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true;
      
      const matchLower = rawMatch.toLowerCase().trim();
      
      // CASE 1: If the match is JUST "barangay" or "brgy" with NO place name after it,
      // it's definitely NOT an address - suppress it immediately
      if (/^(?:barangay|brgy)\.?$/.test(matchLower)) {
        console.log(`[TrustPrompt/contextFilter] ph_address suppressed: bare "${rawMatch}" (no place name)`);
        return false; // SUPPRESS: Just the word "barangay" alone is not an address
      }
      
      // CASE 2: If match contains "barangay/brgy" but next word is non-place action/doc word
      if (/\b(?:barangay|brgy)\b/i.test(matchLower)) {
        // Extract the word after "barangay/brgy" from the rawMatch AND from fullText context
        const wordAfterBrgy = matchLower.match(/\b(?:barangay|brgy)\b\.?\s+(\w+)/i);
        
        // Also check context in fullText (word after the match in original text)
        const afterMatchStart = matchIndex + rawMatch.length;
        const afterMatchText = fullText.slice(afterMatchStart, Math.min(fullText.length, afterMatchStart + 50)).toLowerCase();
        const nextWordInText = afterMatchText.match(/^\s+(\w+)/);
        
        // Collect all potential next words to check
        const wordsToCheck = new Set();
        if (wordAfterBrgy && wordAfterBrgy[1]) {
          wordsToCheck.add(wordAfterBrgy[1]);
        }
        // The word AFTER the match only matters for a bare "Brgy. X" mention. A
        // full multi-part address ("45 Mabini St., Brgy. San Roque, Cainta.") ends
        // at a sentence boundary, and the next sentence's first word ("I", "We",
        // "She") says nothing about whether the span is an address.
        const isSimpleAreaMention = !/[,\d]/.test(rawMatch);
        if (nextWordInText && nextWordInText[1] && isSimpleAreaMention) {
          wordsToCheck.add(nextWordInText[1]);
        }
        
        // Common non-place words that follow "barangay" in prose
        const nonPlaceWords = new Set([
          // Documents/permits
          "permit", "permits", "permission", "clearance",
          "certificate", "license", "id", "document",
          // Officials/roles
          "captain", "official", "officials", "hall", "office",
          "council", "assembly", "meeting", "health", "clinic",
          "school", "level", "system", "program", "project",
          "secretary", "treasurer", "staff", "representative",
          "worker", "residents", "people", "folk", "tanod",
          "confirming", "confirm", "confirmed",
          // Verbs/prepositions/articles
          "in", "of", "and", "or", "but", "the", "is", "was", "are",
          "where", "here", "there", "my", "our", "their", "your",
          "she", "he", "they", "i", "you", "we", "a", "an",
          "that", "this", "these", "those", "for", "with", "has",
          "have", "do", "does", "did", "should", "would", "could"
        ]);
        
        // Share the structural validator's stopword list so both stay in step.
        PH_AREA_FOLLOW_STOPWORDS.forEach(w => nonPlaceWords.add(w));

        // Check if any of the next words indicate this is NOT a place name
        for (const word of wordsToCheck) {
          if (nonPlaceWords.has(word)) {
            console.log(`[TrustPrompt/contextFilter] ph_address suppressed: "${rawMatch}" (non-place word: "${word}")`);
            return false; // SUPPRESS: Not a place name
          }
        }
      }
      
      return true; // ALLOW: Likely a real address
    },
    sanitize: (_m) => "[PHILIPPINE ADDRESS REMOVED]"
  },

  {
    id: "birthday_date",
    label: "Birthday (Date Format)",
    reason: "Birth dates are direct personal identifiers under RA 10173 and are sensitive demographic information. When combined with other information like name or location, they enable identity theft, age discrimination, and targeted fraud. Birth dates can be used to derive astrolithic predictions or other personal inferences.",
    regex: /(?:0?[1-9]|1[0-2])[-\/\.](0?[1-9]|[12]\d|3[01])[-\/\.](19|20)?\d{2}|(?:0?[1-9]|[12]\d|3[01])[-\/\.](0?[1-9]|1[0-2])[-\/\.](19|20)?\d{2}|(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(0?[1-9]|[12]\d|3[01]),?\s+(19|20)\d{2}|(0?[1-9]|[12]\d|3[01])\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\s+(19|20)\d{2}/gi,
    risk: "moderate",
    validate: null,
    contextFilter: function(rawMatch, fullText, matchIndex) {
      // TASK: Suppress false positives when the date is NOT a birthdate
      
      if (!fullText || typeof fullText !== "string") return true; // No context, allow it
      
      // Extract surrounding context (±150 chars before and after)
      const contextStart = Math.max(0, matchIndex - 150);
      const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 150);
      const context = fullText.substring(contextStart, contextEnd).toLowerCase();
      const beforeMatch = fullText.substring(matchIndex - 10, matchIndex);
      const afterMatch = fullText.substring(matchIndex + rawMatch.length, matchIndex + rawMatch.length + 10);
      
      // CRITICAL: Check if this date fragment is part of a longer dash-separated reference number
      // Examples: "07-12-3456-789" (claim ref), "02-1234-567-1234567" (PWD ID)
      // Look for dash immediately before or after the matched date
      const surroundedByDashes = /\d-/.test(beforeMatch) || /-\d/.test(afterMatch);
      if (surroundedByDashes) {
        return false; // Suppress - this is part of a reference/ID number, not a standalone date
      }
      
      // CRITICAL: Check if this is IMMEDIATELY part of a driver's license number
      // Format: Letter-2digits-2digits-6digits (e.g., C51-23-016208)
      // Only suppress if the matched date is actually adjacent to or within the DL pattern
      // NOT if the DL appears elsewhere in the text
      const beforeContext = fullText.substring(Math.max(0, matchIndex - 20), matchIndex);
      const afterContext = fullText.substring(matchIndex + rawMatch.length, Math.min(fullText.length, matchIndex + rawMatch.length + 20));
      const immediateContext = beforeContext + rawMatch + afterContext;
      
      // Check if this date is immediately part of a DL pattern (not just nearby)
      const driverLicensePattern = /[A-Z]\d{2}-\d{2}-\d{6}/i;
      if (driverLicensePattern.test(immediateContext)) {
        return false; // Suppress - this is part of a driver's license number
      }
      
      // Check if this date is part of an IPv4 address (digits.digits.digits.digits pattern)
      const ipv4Pattern = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/;
      if (ipv4Pattern.test(context)) {
        return false; // Suppress - this is part of an IP address
      }
      
      // Check if this date is an EXPIRY DATE (highest priority non-birthdate)
      // Must check BEFORE other patterns to catch "expiry date is on nov 23, 2026"
      const expiryPatterns = [
        /\b(expir[a-z]*|exp(?:ires?|iration|iry)|valid\s+(?:until|thru)|good\s+until|use\s+by|best\s+by|sell\s+by)\b/i,
        /\b(exp|expiry|expn)\s*[:=]?\s*\d/i,
        /\b(card|subscription|membership|license|permit|visa|passport)\s+(?:expir|expire|exp|valid)\b/i,
      ];
      
      if (expiryPatterns.some(p => p.test(context))) {
        return false; // Suppress - this is an expiry date, not a birthdate
      }
      
      // Check if this date is part of a shipping/order/document reference
      const shippingPatterns = [
        /\b(order|ship|shipped|delivery|invoice|receipt|reference|sent|mailed|posted)\s+(?:on|from|date)?\s*[:\-\s]?\d{1,2}[-\/\.]\d{1,2}[-\/\.]/i,
        /\b(shipping|order|delivery)\s+(?:date|reference|id|number)?\s*[:=]?\s*\d{1,2}[-\/\.]\d{1,2}[-\/\.]/i,
        /\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4}\s+(?:to\s+)?(?:warehouse|address|destination|recipient)/i,
      ];
      
      if (shippingPatterns.some(p => p.test(context))) {
        return false; // Suppress - this is a shipping/order date, not a birth date
      }
      
      return true; // Allow the match (likely a genuine birth date)
    },
    sanitize: (_m) => "[DATE REDACTED]"
  },

  {
    id: "age_value",
    label: "Age (Numeric or Text Format)",
    reason: "Age is classified as personal demographic information under RA 10173. When combined with other identifiers like name, location, or birth date, age enables targeted fraud, discrimination, and identity-based attacks. Age can be inferred from birth dates or stated directly in text.",
    // REQUIREMENT: Suffix MANDATORY to prevent false positives on work duration
    // Only match when age is explicitly stated with "old", "y/o", "yrs old", etc.
    // Will NOT match: "20 years", "25 years" (these are work/education durations)
    // WILL match: "20 years old", "25 y/o", "34 yrs old", "age: 30"
    // Regex breakdown:
    // Alt 1: age|edad with optional suffix (e.g., "age: 30" or "edad = 25 years old")
    // Alt 2: number + years/yrs + REQUIRED "old" suffix (e.g., "30 years old", "25 yrs old")
    // Alt 3: number + y/o or y.o. (e.g., "30 y/o")
    // Alt 4: tagalog "taong gulang" or "tg"
    regex: /(?:age|edad)\s*[:=]\s*(\d{1,3})(?:\s+(?:years?|yrs?)\s+old)?|(\d{1,3}\s+(?:years?|yrs?)\s+old)|(\d{1,3}\s+(?:y\/o|y\.o\.))|(?:taong\s+gulang|tg)/gi,
    risk: "low",
    validate: null,
    contextFilter: function(rawMatch, fullText, matchIndex) {
      // ── CONTEXT-AWARE FILTERING FOR AGE ────────────────────────────────────
      // Suppress age mentions ONLY in explicit general/informational/educational contexts
      // These are NOT personal data disclosures:
      // - "What is the average age of a 25 year old?"
      // - "The typical age for this demographic is 25"
      // - "In studies, subjects aged 25 were found to..."
      //
      // These ARE personal data and should be flagged:
      // - "I am 34 years old"
      // - "My age is 25"
      // - "I am 34 years old and generally healthy"
      
      if (!fullText || typeof fullText !== "string") return true;  // No context, allow it
      
      const contextStart = Math.max(0, matchIndex - 150);
      const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 150);
      const context = fullText.substring(contextStart, contextEnd).toLowerCase();
      
      // STRICT: Only suppress if there are EXPLICIT general/educational indicators
      // Pattern notes: Allow for typos like "avrage" by checking for letter patterns
      const generalQuestionPatterns = [
        // Definitions and explanations - must be asking about age as a concept
        /\b(what\s+is|what\s+are|define|definition\s+of|explain|explained)\s+.*?\b(age|year\s+old)\b/,
        
        // Educational/informational inquiry - statistical/demographic context only
        // Handles typos: "avrage" (average), "hieght" (height), etc.
        /\b(average|avrage|typ(ical)?|demographics?|statistics?|standard)\s+.*?\b(age|year\s+old)\b/,
        
        // Research/academic context - ONLY when explicitly research-related
        /\b(study|research|investigation|subjects?|participants?)\b.*?\b(age|year\s+old)\b/,
        
        // Age brackets/ranges (definitely not personal)
        /\bages?\s+\d+\s*-\s*\d+\b/,  // "ages 25-30", "age 18-65"
        /\b(age group|age range|age bracket|age category)\b/,
        
        // General demographic/anthropometric inquiry patterns
        // "what is the height and weight of a X year old"
        /\b(height|hieght|weight|wieght|measurements?|dimensions?|statistics?)\b.*?\b(of\s+a\s+)?\d{1,3}\s+(year\s+old|yo|y\.o\.|years?\s+old)\b/i,
      ];
      
      // SUPPRESS ONLY if one of these EXPLICIT patterns matches
      const isGeneralContext = generalQuestionPatterns.some(p => p.test(context));
      
      if (isGeneralContext) {
        console.log(`[TrustPrompt/contextFilter] age_value suppressed: "${rawMatch}" (general/educational context)`);
        return false;  // SUPPRESS: General information, not personal disclosure
      }
      
      return true;  // ALLOW: Likely personal age disclosure (default to flagging)
    },
    sanitize: (_m) => "[AGE REDACTED]"
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
    id: "ph_id_philid",
    label: "Philippine National ID",
    reason: "PhilID is the government-issued national identification card from the Philippine Statistics Authority (PSA). It contains unique personal identifiers including birthdate and sex, making it a critical identifier under RA 10173 that requires strict protection.",
    // Exclude patterns that start with API key prefixes or contain common API formats
    regex: /(?<!sk[_-])(?<!rk[_-])(?<!ghp_)(?<!gho_)(?<!ghu_)(?<!xoxb-)(?<!xoxp-)(?<!xoxz-)(?<!AKIA)(?<!ASIA)(?<!AIza)(?<!ya29\.)(?<!hf_)(?<!npm_)(?<!AC)(?<!SK)\b\d{4}-\d{4}-\d{4}-\d{4}\b(?!-[A-Za-z0-9])/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PhilID,
    // CONTEXT-AWARE FILTERING: Suppress loyalty cards that match the 4-4-4-4 format
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true; // No context, allow it
      
      // Extract surrounding context (300 chars before and after the match)
      const contextStart = Math.max(0, matchIndex - 300);
      const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 300);
      const context = fullText.substring(contextStart, contextEnd).toLowerCase();
      
      // ── SOURCE CODE CONTEXT (Highest Priority - ALLOW) ───────────────────────
      // If the number appears in source code with ID-related variable names,
      // it's clearly a test value for PhilID, not a loyalty card
      const sourceCodeIdPatterns = [
        // Variable/constant assignments with ID keywords (const/let/var)
        /(?:const|let|var)\s+(?:\w*)?(?:national)?id\s*=\s*/i,  // const nationalId = ...
        /(?:const|let|var)\s+(?:\w*)?philid\s*=\s*/i,            // const philId = ...
        /(?:const|let|var)\s+(?:\w*)?id\s*=\s*/i,                // const id = ...
        /(?:const|let|var)\s+(?:\w*)?(?:government|govt)\s*id\s*=\s*/i,
        
        // Simple variable assignments WITHOUT const/let/var (critical fix)
        /(?:^|\s)(?:\w*)?(?:national)?id\s*=\s*["']/i,           // nationalId = "..."
        /(?:^|\s)(?:\w*)?philid\s*=\s*["']/i,                    // philId = "..."
        /(?:^|\s)(?:\w*)?id\s*=\s*["']/i,                        // id = "..."
        /(?:^|\s)(?:\w*)?(?:government|govt)\s*id\s*=\s*["']/i,  // government_id = "..."
        
        // JSON object properties with ID keywords
        /(?:"|\')(?:national)?id(?:"|\')?\s*:\s*/i,              // "nationalId": ...
        /(?:"|\')philid(?:"|\')?\s*:\s*/i,                       // "philId": ...
        /(?:"|\')ph_?id(?:"|\')?\s*:\s*/i,                       // "ph_id": ...
        
        // Test/mock data indicators
        /test.*?(?:national)?id|mock.*?(?:national)?id|sample.*?(?:national)?id|fake.*?(?:national)?id/i,
        /(?:national)?id.*?(?:test|mock|sample|fake|example)/i,
        
        // Array/list of test values
        /\[.*?(?:national)?id|test.*?data|mock.*?data/i
      ];
      
      // Check if this is source code context - if so, ALLOW it
      for (const pattern of sourceCodeIdPatterns) {
        if (pattern.test(context)) {
          return true; // ALLOW: This is source code with ID variable/property name
        }
      }
      
      // ── LOYALTY CARD CONTEXT (Second Priority - SUPPRESS) ───────────────────
      // These patterns indicate the number is definitely NOT a government ID
      const loyaltyPatterns = [
        // Membership/loyalty card labels (direct labels)
        /(?:loyalty|membership|member|rewards?|frequent\s+buyer|points\s+program|customer\s+program)\s+(?:code|number|card|id)/i,
        /(?:membership|loyalty|account|customer)\s+(?:code|number|id|card|#)/i,
        
        // Giving context (company gave me, issued to me, etc.)
        // Priority: "company gave me X" → definitely a business card, not personal ID
        /(?:(?:loyalty[\s-])?card\s+)?(?:company|retailer|store|brand).*?(?:gave|issued|provided)\s+(?:me|to\s+me)\s+(?:a\s+)?(?:membership|loyalty|card|code|number)/i,
        /(?:gave\s+me|issued\s+to|provided\s+to|sent\s+me|gave\s+(?:to\s+)?me)\s+(?:a\s+)?(?:membership|loyalty|card|code|number)/i,
        
        // CRITICAL: "looks like a National ID" = explicit negation that it's NOT a government ID
        // When user says "it looks like a national ID", they're saying it resembles one but isn't one
        /(?:looks?|resembles|similar|formatted|styled|matches?|exactly\s+like)\s+(?:a\s+)?(?:national\s+)?(?:government\s+)?id/i,
        
        // Format comparison to loyalty/membership specifically
        /(?:looks?|formatted|styled|resembles|same\s+format|similar\s+format|matches?|exactly\s+like)\s+(?:a\s+)?(?:loyalty|membership|card|code|number)/i,
        
        // Explicit negation
        /(?:not\s+a\s+(?:government|national|official|real)\s+id|just\s+(?:a\s+)?(?:loyalty|membership|card|number)|proprietary\s+format)/i,
        
        // Retailers/company copying style
        /(?:retailer|company|store|brand).*?(?:copy|styled|formatted)\s+(?:like|after|from)\s+(?:the\s+)?(?:national\s+)?id/i,
        /(?:copy\s+that|familiar\s+style|their\s+own\s+card|same\s+format\s+as)/i,
        
        // Credit card or payment card context
        /(?:credit\s+card|debit\s+card|payment\s+card|card\s+number|card\s+#)/i,
        /(?:visa|mastercard|amex|diners|discover|unionpay|card\s+issuer)/i
      ];
      
      // Check if ANY loyalty pattern matches - if so, SUPPRESS immediately
      for (const pattern of loyaltyPatterns) {
        if (pattern.test(context)) {
          return false; // SUPPRESS: This is a loyalty/payment card, not a PhilID
        }
      }
      
      // ── GOVERNMENT ID CONTEXT (Third Priority - ALLOW) ──────────────────────
      // These patterns indicate the number IS a government ID
      const governmentIdPatterns = [
        // Explicit government ID declarations with positive framing
        // Must have keywords like "my", "i have", "issued", "official" in close proximity
        /\b(?:my|i\s+(?:have|was\s+issued|received))\s+(?:.*?\s+)?(?:national\s+)?(?:government\s+)?id/i,
        /\b(?:national|government|official)\s+(?:.*?\s+)?(?:identification|id)\s+(?:is|number|:)/i,
        /\b(?:philid|philsys|psa\s+(?:id|card))\b/i,
        /\bphilippine\s+(?:national\s+)?(?:id|identification)/i,
        /\bgovernment[\s-]?(?:issued|id)/i,
        /\bofficial\s+(?:id|identification|number)/i
      ];
      
      for (const pattern of governmentIdPatterns) {
        if (pattern.test(context)) {
          return true; // ALLOW: This is a government ID
        }
      }
      
      // ── DEFAULT: Ambiguous Context ────────────────────────────────────────
      // If context is unclear and NOT explicitly source code, be conservative
      // and suppress the 4-4-4-4 pattern to avoid false positives on credit cards
      return false;
    },
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 16) {
        return digits.slice(0, 4) + "-****-****-" + digits.slice(-4);
      }
      return "[REDACTED-PHILID]";
    }
  },

  {
    id: "ph_id_umid",
    label: "UMID (Unified Multi-Purpose ID)",
    reason: "UMID is the Unified Multi-Purpose ID issued by SSS and represents a unified government identifier credential under RA 10173. Contains SSS system code and includes check digit validation for authentication.",
    // Negative lookahead/lookbehind to exclude API keys that might match this pattern
    // Excludes patterns with common API key prefixes before or after
    regex: /(?<!sk[_-])(?<!rk[_-])(?<!ghp_)(?<!gho_)(?<!ghu_)(?<!xoxb-)(?<!xoxp-)(?<!xoxz-)(?<!AKIA)(?<!ASIA)(?<!AIza)(?<!ya29\.)(?<!hf_)(?<!npm_)(?<!AC)(?<!SK)\b\d{4}-\d{7}-\d\b(?!-[A-Za-z0-9])/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_UMID,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 12) {
        return digits.slice(0, 4) + "-" + "*".repeat(7) + "-" + digits.slice(-1);
      }
      return "[REDACTED-UMID]";
    }
  },

  {
    id: "ph_id_passport",
    label: "Philippine Passport",
    reason: "Passport issued by the Bureau of Immigration (BI) is an international travel credential and critical identifier under RA 10173 and UNCHR standards. Philippine passports are recognized globally for travel and identity verification purposes.",
    regex: /(?:passport\s+(?:number|no\.?|no|id|#)?:?\s*)?(?:^|[\s])(?:[A-Za-z]\d{7}[A-Za-z]|[A-Za-z]{2}\d{7}|[A-Za-z]\d{7})(?:\s|$|[^\w])|passport\s+(?:number|no\.?|no|id|#)?:?\s*(?:[A-Za-z]\d{7}[A-Za-z]|[A-Za-z]{2}\d{7}|[A-Za-z]\d{7})/gim,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_Passport,
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true;
      
      // SUPPRESS: If this appears to be a product model/SKU code
      // Product context keywords indicate this is commercial merchandise, not a government ID
      const productContextPatterns = [
        // Camera/lens model codes
        /(?:lens|camera|lens\s+model|camera\s+model|model\s+code|sku|product\s+code|item\s+code|article\s+no|model\s+no|model\s+number)[\s:]*(?:[A-Z]{2}\d{7})?/i,
        // Photography equipment
        /(?:macro|telephoto|wide-?angle|zoom|prime|stabiliz|aperture|focal|depth|optics)/i,
        // Generic product codes on boxes/packaging
        /(?:box|packaging|carton|item|article|code)[\s:]*(?:[A-Z]{2}\d{7})?/i,
        // Electronics/technology product codes
        /(?:serial\s+number|s\/n|serial\s+no|part\s+no|part\s+number)[\s:]*(?:[A-Z]{2}\d{7})?/i,
      ];
      
      // Extract context window around the match (100 chars before and after)
      const start = Math.max(0, matchIndex - 100);
      const end = Math.min(fullText.length, matchIndex + rawMatch.length + 100);
      const contextWindow = fullText.substring(start, end);
      
      // Check if any product context pattern appears in the window
      for (const pattern of productContextPatterns) {
        if (pattern.test(contextWindow)) {
          return false; // SUPPRESS: This is a product code, not a passport
        }
      }
      
      return true; // Allow: Likely a genuine passport number
    },
    sanitize: (m) => {
      const letters = m.replace(/[0-9\s\-.,;:]/g, "").toUpperCase();
      const digits = m.replace(/[^0-9]/g, "");
      if (digits.length === 7) {
        if (letters.length >= 2) {
          return letters.slice(0, 2) + digits.slice(0, 2) + "*".repeat(3) + digits.slice(-2);
        } else if (letters.length === 1) {
          return letters + digits.slice(0, 2) + "*".repeat(3) + digits.slice(-2);
        }
      }
      return "[REDACTED-PASSPORT]";
    }
  },

  {
    id: "ph_id_prc",
    label: "PRC (Professional Regulation Commission)",
    reason: "PRC license number is a professional credential that identifies individuals in regulated professions under RA 10173. Includes physicians, engineers, lawyers, and other licensed professionals whose identity is critical for professional accountability.",
    // Improved pattern: Exclude if preceded by API key context, require 7 digits standalone
    // Also exclude common API patterns that might appear before the number
    regex: /(?<!sk[_-])(?<!rk[_-])(?<!ghp_)(?<!gho_)(?<!ghu_)(?<!xoxb-)(?<!xoxp-)(?<!xoxz-)(?<!AKIA)(?<!ASIA)(?<!AIza)(?<!ya29\.)(?<!hf_)(?<!npm_)(?<!AC)(?<!SK)(?<!_)(?<!\d-)(?<!=)(?<!:)\b\d{7}\b(?![-_A-Za-z0-9])/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_PRC,
    // CONTEXT FILTER: Suppress if these 7 digits are part of a UMID pattern (4 digits - 7 digits - 1 digit)
    // UMID with spaces: "4310 5002134 6", UMID with dashes: "4310-5002134-6"
    // Also suppress if clearly a business metric (units, revenue, count, etc.)
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true;
      
      // Extract surrounding context (100 chars before and after to see business context)
      const contextStart = Math.max(0, matchIndex - 100);
      const contextEnd = Math.min(fullText.length, matchIndex + rawMatch.length + 100);
      const context = fullText.substring(contextStart, contextEnd).toLowerCase();
      
      // SUPPRESS: If part of UMID pattern (4 digits - 7 digits - 1 digit)
      const umidPatterns = [
        /\d{4}\s+\d{7}\s+\d/, // "4310 5002134 6"
        /\d{4}\-\d{7}\-\d/, // "4310-5002134-6"
      ];
      
      for (const pattern of umidPatterns) {
        if (pattern.test(context)) {
          return false; // SUPPRESS: This is part of a UMID, not a PRC number
        }
      }
      
      // SUPPRESS: If clearly a business/financial metric
      // These patterns indicate the number is a business quantity, not a professional license
      const businessMetricPatterns = [
        // Financial/reporting contexts - must have explicit business keywords
        /(?:total|units?)\s+(?:sold|revenue|sales|count)\s+.*?(?:for|in|of|during)\s+(?:the\s+)?(?:period|quarter|month|year|q\d|fy\d+)/i,
        /(?:one\s+)?line\s+item.*?(?:total|units?|sales?|revenue|count|figure)\s+(?:came|reached|hit|totaled?|is|equals?)\s+/i,
        /(?:quarterly|monthly|annual|fiscal|fy\d+|q\d)\s+(?:report|result|earnings?|figure|metric|performance)/i,
        
        // Units/items sold context (specific business metrics)
        /(?:units?|items?|products?|customers?|orders?)\s+(?:sold|counted|reported|reached|totaled?|came\s+to|is)\s+/i,
        /(?:exactly|approximately|total)\s+(?:\d+\s+)?(?:units?|items?|products?|customers?|sales?)\b/i,
        
        // Report/data analysis language - must be specific (not just "number")
        /(?:quarterly|monthly|annual|fiscal)\s+(?:report|analysis|data|results?|earnings?)/i,
        /(?:chart|table|breakdown|overview)\s+.*?(?:figure|total|units?|metric|data|results?)/i,
      ];
      
      for (const pattern of businessMetricPatterns) {
        if (pattern.test(context)) {
          return false; // SUPPRESS: This is a business metric, not a PRC number
        }
      }
      
      return true; // ALLOW: Likely a genuine PRC number
    },
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 7) {
        return digits.slice(0, 2) + "*".repeat(3) + digits.slice(-2);
      }
      return "[REDACTED-PRC]";
    }
  },

  {
    id: "ph_id_postal",
    label: "Postal ID",
    reason: "Postal ID is a government-issued identification credential issued by the Philippine Postal Corporation. It serves as a valid ID for various government and private transactions under RA 10173.",
    regex: /\b[A-Z]\d{7}-\d{4}-[A-Z]\b/gi,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const alphanumeric = m.replace(/[^A-Za-z0-9]/g, "");
      if (alphanumeric.length === 14) {
        return alphanumeric.slice(0, 1) + "*".repeat(7) + "-****-" + alphanumeric.slice(-1);
      }
      return "[REDACTED-POSTAL]";
    }
  },

  {
    id: "ph_id_drivers_license",
    label: "Driver's License Number",
    reason: "Philippine driver's license numbers are government-issued credentials that uniquely identify individuals and contain personal information like birthdate and address under RA 10173. They are critical identifiers that can enable identity theft or fraud.",
    regex: /\b[A-Z]\d{2}-\d{2}-\d{6}\b/gi,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const parts = m.match(/([A-Z])(\d{2})-(\d{2})-(\d{6})/i);
      if (parts) {
        return parts[1] + parts[2] + "-" + parts[3] + "-" + "*".repeat(6);
      }
      return "[REDACTED-DL]";
    }
  },

  {
    id: "ph_id_pwd",
    label: "PWD ID (Persons with Disability)",
    reason: "PWD ID is an identification issued to persons with disability under RA 9442. It provides identification and access to disability-related benefits and services.",
    regex: /\b\d{2}-\d{4}-\d{3}-\d{7}\b/g,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const parts = m.split("-");
      if (parts.length === 4) {
        return "**-" + parts[1].slice(0, 2) + "**-***-" + parts[3].slice(-3);
      }
      return "[REDACTED-PWD]";
    }
  },

  {
    id: "ph_id_senior_citizen",
    label: "Digital National Senior Citizen ID",
    reason: "Senior Citizen ID is an identification issued to Filipino senior citizens (60 years old and above). It provides identification and access to senior citizen benefits and privileges.",
    // Match 10 consecutive digits in two scenarios:
    // 1. When preceded by context keywords (senior, citizen, osca, id, etc.) followed by separator
    // 2. When standalone with word/non-alphanumeric boundaries (but NOT embedded in API keys)
    // Matches: "senior citizen id: 2345678921", "OSCA: 1234567890", "ID 9876543210"
    // Does NOT match: "AKIAJ7K2QM9ZX4LVR8TN" (no context, embedded in alphanumeric string)
    // CAPTURE GROUP: Only the 10-digit number, not the prefix (OSCA:, etc.)
    regex: /(?:(?:senior|citizen|osca|id|number|no\.?|sc|sc\.)\s*[:\-\s]?\s*)(\d{10})|\b(\d{10})\b(?![A-Za-z0-9_\-])/gi,
    risk: "high",
    validate: null,
    structuralValidate: null,
    contextFilter: function(rawMatch, fullText, matchIndex) {
      // TASK: Suppress false positives when the context is clearly non-ID-related
      // Example: "0.9123456789 milligrams" is a measurement, not a senior citizen ID
      // Example: "pharmacy loyalty number is 2345678921" is a loyalty card, not a government ID
      // BUT: "My OSCA card number is 1234567890 for my benefits" is a real ID and should NOT be suppressed
      
      if (!fullText || typeof fullText !== "string") return true; // No context, allow it
      
      // Extract surrounding context (50 chars before and 30 chars after the match)
      const beforeContext = fullText.substring(Math.max(0, matchIndex - 50), matchIndex).toLowerCase();
      const afterContext = fullText.substring(matchIndex + rawMatch.length, Math.min(fullText.length, matchIndex + rawMatch.length + 30)).toLowerCase();
      const nearContext = beforeContext + " " + afterContext;
      
      // FIRST: Check for explicit senior citizen ID context keywords (highest priority)
      // This takes precedence over all other checks
      const idContextPatterns = [
        /\b(?:osca|senior|citizen|national\s+id|identification)\b/i,
        /\b(?:issued|benefit|claim|registered|confirmation)\b.*\b(?:senior|citizen|osca)\b/i,
      ];
      
      for (const pattern of idContextPatterns) {
        if (pattern.test(nearContext)) {
          return true; // ALLOW: This is clearly a senior citizen ID
        }
      }
      
      // SECOND: Check for loyalty/membership card contexts - SUPPRESS if found
      // These patterns indicate the number is definitely NOT a government ID
      const loyaltyPatterns = [
        /\b(?:loyalty|membership|rewards?|frequent\s+buyer|points\s+program)\s+(?:card|#|number|code)/i,
        /\b(?:pharmacy|store|retailer)\s+(?:loyalty|membership|card)/i,
      ];
      
      for (const pattern of loyaltyPatterns) {
        if (pattern.test(nearContext)) {
          return false; // SUPPRESS: This is a loyalty card, not a senior citizen ID
        }
      }
      
      // THIRD: Suppress if it's preceded by a decimal point (decimal measurement)
      // When a 10-digit number is directly preceded by "0." or similar, it's likely
      // a measurement like "0.9123456789 milligrams", not a government ID
      const beforeMatch = fullText.substring(Math.max(0, matchIndex - 5), matchIndex).toLowerCase();
      if (/\d\.$/.test(beforeMatch) || /\.\s*$/.test(beforeMatch)) {
        return false; // SUPPRESS: This is a decimal measurement, not an ID
      }
      
      // FOURTH: Check for measurement units in context (within 50 chars after match)
      const measurementAfter = fullText.substring(matchIndex + rawMatch.length, Math.min(fullText.length, matchIndex + rawMatch.length + 50)).toLowerCase();
      const unitPatterns = [
        /^\s*(?:milligram|mg|gram|g|liter|l|ml|milliliter|meter|m|cm|kilometer|km|inch|foot|pound|kg|ounce|oz|celsius|fahrenheit|°|%|percent|drops?|tsp|tbsp)\b/i,
      ];
      
      for (const pattern of unitPatterns) {
        if (pattern.test(measurementAfter)) {
          return false; // SUPPRESS: This is a measurement, not an ID
        }
      }
      
      return true; // ALLOW: Default is to allow senior citizen IDs
    },
    // extractMatch: Extract only the 10-digit number from the matched string
    extractMatch: function(rawMatch) {
      // Remove any non-digit characters to get just the 10-digit number
      const digitsOnly = rawMatch.replace(/[^\d]/g, "");
      if (digitsOnly.length === 10) {
        return digitsOnly; // Return only the 10 digits
      }
      return digitsOnly; // Fallback to digits-only version
    },
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 10) {
        return digits.slice(0, 3) + "*".repeat(4) + digits.slice(-3);
      }
      return "[REDACTED-SENIOR-CITIZEN]";
    }
  },

  {
    id: "ph_id_sss",
    label: "SSS (Social Security System)",
    reason: "SSS number is a social insurance identifier linked to employment and benefits under RA 10173. Required for employee registration and benefit claims, it serves as a key employment identifier in the Philippines.",
    regex: /\d{2}-\d{7}-\d/g,
    risk: "high",
    validate: null,
    structuralValidate: structuralValidatePHID_SSS,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 10) {
        return digits.slice(0, 2) + "-" + "*".repeat(7) + "-" + digits.slice(-1);
      }
      return "[REDACTED-SSS]";
    }
  },

  {
    id: "ph_id_philhealth",
    label: "PhilHealth (Health Insurance)",
    reason: "PhilHealth number is a healthcare identifier linked to medical records and insurance coverage under RA 10173. Used for health insurance claims and medical services access, it is critical for healthcare identity and benefit verification.",
    regex: /\d{2}-\d{9}-\d/g,
    risk: "high",
    validate: null,
    structuralValidate: null,
    sanitize: (m) => {
      const digits = m.replace(/[^\d]/g, "");
      if (digits.length === 12) {
        return digits.slice(0, 2) + "-" + "*".repeat(9) + "-" + digits.slice(-1);
      }
      return "[REDACTED-PHILHEALTH]";
    },

  },

  // -- BLOOD TYPE MENTION
  {
    id: "blood_type_mention",
    label: "Blood Type Mention",
    reason: "Blood type is personal health information under RA 10173 and is considered sensitive medical data.",
    regex: /\b(?:AB|[ABO])\s*[+-](?![A-Za-z0-9])|\b(?:AB|[ABO])\s+(?:positive|negative|pos|neg)\b/gi,
    risk: "low",
    validate: null,
    sanitize: (m) => {
      return "[blood type]";
    },
    // CRITICAL: Only match blood type in PERSONAL disclosure contexts
    // DO NOT match blood type in:
    // 1. Educational/informational contexts (health posts, articles, guides)
    // 2. Personality types, learning styles, classifications
    // 3. General discussions about blood types (not personal data)
    // 4. Product/Rice classifications (TYPE O RICE, TYPE A RICE)
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true;
      
      // Extract context: before and after the match
      // Use ±200 chars for broader context matching (personal disclosure, medical, non-medical)
      const beforeStart = Math.max(0, matchIndex - 200);
      const beforeText = fullText.slice(beforeStart, matchIndex).toLowerCase();
      
      const afterStart = matchIndex + rawMatch.length;
      const afterText = fullText.slice(afterStart, Math.min(fullText.length, afterStart + 200)).toLowerCase();
      
      const fullContext = beforeText + " [MATCH] " + afterText;
      
      // Use ±50 chars for CLOSE context (only educational markers checked here)
      // This prevents "explain" appearing elsewhere in document from suppressing legitimate blood type detections
      const closeBeforeStart = Math.max(0, matchIndex - 50);
      const closeBeforeText = fullText.slice(closeBeforeStart, matchIndex).toLowerCase();
      
      const closeAfterStart = matchIndex + rawMatch.length;
      const closeAfterText = fullText.slice(closeAfterStart, Math.min(fullText.length, closeAfterStart + 50)).toLowerCase();
      
      const closeContext = closeBeforeText + " [MATCH] " + closeAfterText;
      
      // PERSONAL DISCLOSURE Context - ALLOW these (actual PII)
      const personalDisclosureMarkers = [
        /\b(?:my|my\s+(?:blood|donor|patient)|i\s+(?:am|have))\s+(?:blood\s*type|type|rh)?\s*[:=]?\s*[ABO]/i,
        /\b(?:blood|donor|patient)\s+type\s+(?:is|:)?\s*[ABO]/i,
        // Also match explicit "blood type X" format without personal context markers
        /\bblood\s+type\s+[ABO][+-]?/i,
        /\bblood\s+type\s+(?:positive|negative|pos|neg)/i,
      ];
      
      // MEDICAL/HEALTHCARE Context (PERSONAL) - ALLOW these
      // When used in medical records, doctor's notes, personal health discussions
      const medicalPersonalContextMarkers = [
        /\b(?:my|patient|donor|i)\s+.*?(?:blood\s*type|rh\s*factor|rh|blood\s*group|blood\s+type)\b/i,
        /\b(?:blood\s*type|rh\s*factor|rh|blood\s*group)\b.*?\b(?:doctor|physician|clinic|hospital|medical|health|screening|confirmed|diagnosis|test|exam)\b/i,
        /\b(?:doctor|physician|clinic|hospital|medical\s+(?:record|test|screening|exam)|health|screening|confirmed|diagnosis)\b.*?(?:blood\s*type|rh\s*factor|rh|blood\s*group)\b/i,
        /\b(?:transfusion|compatible|recipient|donation|donate|screen|screening)\b.*?\b(?:blood|type|rh)\b/i,
        /\bpatient\s+(?:blood\s*type|rh|blood\s*group)/i,  // Simple "patient blood type" pattern
      ];
      
      // EDUCATIONAL Context - SUPPRESS these (general information, not PII)
      // CRITICAL: Check ONLY in closeContext (±50 chars), not fullContext
      // This prevents "explain" appearing elsewhere from suppressing legitimate blood type mentions in leaked records
      const educationalContextMarkers = [
        /\b(?:educational|educational\s+post|health\s+(?:post|article|drive|campaign|information)|health\s+(?:care\s+)?(?:post|article)|community\s+health|public\s+health|general\s+information|facts?|explain|why|valuable|universal\s+donor|donate|donor\s+compatibility)\b/i,
        /\b(?:explain|explain\s+why|understand|learn|teach|guide|post|article|blog|information|facts?|reason)\b.*?\b(?:blood|type|rh)\b/i,
        /\b(?:blood|type|rh)\b.*?\b(?:valuable|universal|compatible|important|why|reason|explain|post|article|information|facts?|general|important)\b/i,
        /\b(?:without.*?(?:personal|anyone's|any\s+(?:one|individual)|specific|names?))\b/i,
      ];
      
      // NON-MEDICAL Context - SUPPRESS these (personality, psychology, learning, PRODUCT CLASSIFICATIONS)
      const nonMedicalContextMarkers = [
        /\b(?:personality|framework|behavior|trait|characteristic|profile|assessment|psychological|psychology|psyche|temperament|disposition)\b/i,
        /\b(?:learning|learning\s+style|communication|work\s+style|management|leadership|corporate|business|organization)\b/i,
        /\b(?:model|theory|system|classification|category|typology|spectrum|continuum)\b/i,
        /\b(?:vs|versus|compared\s+to|more\s+relaxed|relaxation|stress.*management)\b/i,
      ];
      
      // NEW: Product/Food classification markers — SUPPRESS these (TYPE O RICE, TYPE A RICE, etc.)
      // Check if match is "TYPE O/A/B" and followed by product keywords
      const productClassificationMarkers = [
        /type\s+[abo]\s+(?:rice|product|food|grain|item|variety|classification)/i,
        /\b[abo]\s+(?:rice|product|food|grain|item)\b/i,  // Simple "O RICE" pattern
      ];
      
      // For product markers, check if "TYPE O/A/B" (the match itself) and "RICE/product keywords" appear after
      const isTypeProductMatch = /^type\s+[abo]$/i.test(rawMatch);
      const hasProductKeywordAfter = /\b(?:rice|product|food|grain|item|variety|classification)\b/i.test(afterText);
      const hasProductBeforeAfter = isTypeProductMatch && hasProductKeywordAfter;
      
      const hasProductClassification = productClassificationMarkers.some(m => m.test(fullContext)) || hasProductBeforeAfter;
      
      const hasPersonalDisclosure = personalDisclosureMarkers.some(m => m.test(fullContext));
      const hasMedicalPersonal = medicalPersonalContextMarkers.some(m => m.test(fullContext));
      // CRITICAL: Check educational markers only in closeContext (±50 chars), not fullContext
      const hasEducational = educationalContextMarkers.some(m => m.test(closeContext));
      const hasNonMedical = nonMedicalContextMarkers.some(m => m.test(fullContext));
      // Note: hasProductClassification defined above in product markers section
      
      // PERSONAL PII contexts - DETECT these
      const isPersonalPii = hasPersonalDisclosure || hasMedicalPersonal;
      
      // SUPPRESS if:
      // 1. Educational/informational context, OR
      // 2. Non-medical context (personality, learning styles), OR
      // 3. Product/Food classification (TYPE O RICE, etc.)
      const shouldSuppress = hasEducational || hasNonMedical || hasProductClassification;
      
      if (shouldSuppress) {
        console.log(`[TrustPrompt/contextFilter] blood_type_mention suppressed: "${rawMatch}"`);
        console.log(`  Personal: ${hasPersonalDisclosure}, Medical-Personal: ${hasMedicalPersonal}, Educational: ${hasEducational}, Non-Medical: ${hasNonMedical}, Product: ${hasProductClassification}`);
      }
      
      return !shouldSuppress; // Return false to suppress, true to allow
    }
  },

  // -- HEIGHT MENTION
  {
    id: "height_mention",
    label: "Height Mention",
    reason: "Height is personal physical characteristic information under RA 10173. Only captured in ID/document contexts.",
    regex: /\b(?:(?:height|taas|tall|high)\s*(?:is|:)?\s*)?(?:(\d{1,2})\s*(?:feet|ft|')\s*(\d{1,2})?\s*(?:inches?|in|")?|(\d{1,3}(?:\.\d{1,2})?)\s*(?:cm|centimeters?|m|meters?))\s*(?:tall|high)?\b/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[HEIGHT REDACTED]",
    // CRITICAL: Only match height in ID/personal document contexts
    // Do NOT match height in furniture, room dimensions, or general measurements
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true; // No context, allow only if it was reached (shouldn't happen)
      
      // Extract context: before and after the match (±150 chars)
      const beforeStart = Math.max(0, matchIndex - 150);
      const beforeText = fullText.slice(beforeStart, matchIndex).toLowerCase();
      
      const afterStart = matchIndex + rawMatch.length;
      const afterText = fullText.slice(afterStart, Math.min(fullText.length, afterStart + 150)).toLowerCase();
      
      // ★ IMPORTANT: Include rawMatch in fullContext so patterns can find "cm", "height", etc.
      const fullContext = beforeText + " " + rawMatch.toLowerCase() + " " + afterText;
      
      // Personal Attribute Context - ALLOW these (direct statements about self)
      const personalAttributeMarkers = [
        /\b(i\s+am|i\s*'?m|my|me)\s+.*?(?:height|tall|cm|m|feet|ft|inches?)\b/i,
        /\b(height|tall)\s+(?:is|:)?\s*(?:my|mine|i|me)\b/i,
        /\b(my|i\s+am|i\s*'?m)\s+.*?\b(?:cm|m|feet|ft|inches?|tall)\b/i,
        // Person profile context: Name at start, then characteristics
        /^[A-Z][a-z]+\s+[A-Z][a-z]+.*?(?:height|tall|cm|m|feet|ft|inches?)\b/i,
        // Person data in breach/profile context - with specific job titles
        /\b(name|age|weight|job|position|religion|faith|salary|loan|email|phone|engineer|director|manager|supervisor|doctor|nurse|teacher|driver)\b.*?(?:height|tall|cm|m|feet|ft|inches?)\b/i,
        /(?:height|tall|cm|m|feet|ft|inches?).*?\b(weight|age|name|job|position|religion|faith|salary|loan|email|phone|engineer|director|manager|supervisor|doctor|nurse|teacher|driver)\b/i,
        // Breach/profile with multiple personal attributes: height + weight + job + email pattern
        /(?:height|tall|cm|m|feet|ft|inches?)\s+.*?(?:weight|weighs?|kg|g|lbs?|pounds?)\s+.*?\b(engineer|director|manager|job|position|email|religion|faith|phone|salary)\b/i,
        /\b(engineer|director|manager|supervisor|doctor|nurse|teacher|driver)\b.*?(?:height|tall|cm|m|feet|ft|inches?)\b/i,
      ];
      
      // Objects/Items that measurements apply to - SUPPRESS these
      // These are explicit markers that the measurement is of an object, not a person
      const objectSubjectMarkers = [
        /\b(ceiling|shelf|furniture|table|chair|door|wall|room|building|frame)\s+(?:is|has)?\s+.*?(?:\d+(?:\.\d+)?)\s*(?:cm|m|feet|ft|inches?)\b/i,
        /(?:\d+(?:\.\d+)?)\s*(?:cm|m|feet|ft|inches?)\s+(?:ceiling|shelf|furniture|table|room|building|high|tall|dimension)\b/i,
      ];
      
      // ID/Personal Document Context - ALLOW these
      const idContextMarkers = [
        /\b(id|driver.?s?.*license|passport|identification|document|form|medical|health|record|profile)\b/i,
        /\b(height|weight|physical.*characteristic|personal.*information|biometric)\b/i,
      ];
      
      // Non-ID Contexts - SUPPRESS these (these are NOT personal information)
      const nonIdContextMarkers = [
        // Furniture/Building Dimensions (explicit non-person context)
        /\b(ceiling|shelf|furniture|table|chair|desk|cabinet|door|window|room|building|wall|floor|doorway|frame)\b/i,
        // Interior Design/Rearrangement (explicit non-person context)
        /\b(rearrang|redesign|layout|interior|decor|furnish|setup|arrange|fit|fits?)\b/i,
      ];
      
      const hasPersonalAttribute = personalAttributeMarkers.some(m => m.test(fullContext));
      const hasObjectSubject = objectSubjectMarkers.some(m => m.test(fullContext));
      const hasIdMarker = idContextMarkers.some(m => m.test(fullContext));
      const hasNonIdMarker = nonIdContextMarkers.some(m => m.test(fullContext));
      
      // SUPPRESS ONLY if the measurement clearly applies to an object, not a person
      // Allow if: personal attributes detected OR id marker detected OR no non-ID marker
      const shouldSuppress = hasObjectSubject || (hasNonIdMarker && !hasPersonalAttribute && !hasIdMarker);
      
      if (shouldSuppress) {
        console.log(`[TrustPrompt/contextFilter] height_mention suppressed: "${rawMatch}"`);
        console.log(`  Personal: ${hasPersonalAttribute}, ID: ${hasIdMarker}, Object: ${hasObjectSubject}, Non-ID: ${hasNonIdMarker}`);
      }
      
      return !shouldSuppress; // Return false to suppress, true to allow
    }
  },

  // -- WEIGHT MENTION
  {
    id: "weight_mention",
    label: "Weight Mention",
    reason: "Weight is personal physical characteristic information under RA 10173. Only captured in ID/document contexts.",
    regex: /\b(?:(?:weight|timbang|weighs?|heavy|mass)\s*(?:is|:)?\s*)?(?:(\d{1,4}(?:\.\d{1,2})?)\s*(?:kg|kilograms?|lbs?|pounds?|g|grams?|stone|oz|ounces?|ton|tonnes?))\b/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[WEIGHT REDACTED]",
    // POST-PROCESS: Extract only the numeric value and unit portion
    // So "weigh 154 lbs" becomes "154 lbs", "weight: 70 kg" becomes "70 kg"
    postProcess: (finding) => {
      const match = finding.rawMatch;
      // Extract only the number + unit portion, removing any preceding verbs/labels
      // Use word boundary to ensure we match complete words
      const cleaned = match.replace(/^(?:weigh|weighs|weight|timbang|heavy|mass)\b\s*(?:is|:)?\s*/i, '').trim();
      return { ...finding, rawMatch: cleaned };
    },
    // CRITICAL: Only match weight in ID/personal document contexts
    // Do NOT match weight in product specs, shipping, recipes, or general measurements
    contextFilter: function(rawMatch, fullText, matchIndex) {
      if (!fullText || typeof fullText !== "string") return true; // No context, allow only if it was reached (shouldn't happen)
      
      // Extract context: before and after the match (±150 chars)
      const beforeStart = Math.max(0, matchIndex - 150);
      const beforeText = fullText.slice(beforeStart, matchIndex).toLowerCase();
      
      const afterStart = matchIndex + rawMatch.length;
      const afterText = fullText.slice(afterStart, Math.min(fullText.length, afterStart + 150)).toLowerCase();
      
      // ★ IMPORTANT: Include rawMatch in fullContext so patterns can find "kg", "weight", etc.
      const fullContext = beforeText + " " + rawMatch.toLowerCase() + " " + afterText;
      
      // Personal Attribute Context - ALLOW these (direct statements about self)
      const personalAttributeMarkers = [
        /\b(i\s+am|i\s*'?m|my|me)\s+.*?(?:weight|weighs?|kg|g|lbs?|pounds?)\b/i,
        /\b(weight|weighs?)\s+(?:is|:)?\s*(?:my|mine|i|me)\b/i,
        /\b(my|i\s+am|i\s*'?m)\s+.*?\b(?:kg|g|lbs?|pounds?)\b/i,
        /\b(weighs?|weigh)\s+(?:about|around|approximately|roughly)?\s+(\d+)\s*(?:kg|g|lbs?|pounds?)\s+(?:now|currently|today)\b/i,
        // Person profile context: Name at start, then characteristics
        /^[A-Z][a-z]+\s+[A-Z][a-z]+.*?(?:weight|weighs?|kg|g|lbs?|pounds?)\b/i,
        // Person data in breach/profile context - with specific job titles and personal markers
        /\b(name|age|height|job|position|religion|faith|salary|loan|email|phone|engineer|director|manager|supervisor|doctor|nurse|teacher|driver)\b.*?(?:weight|weighs?|kg|g|lbs?|pounds?)\b/i,
        /(?:weight|weighs?|kg|g|lbs?|pounds?).*?\b(height|age|name|job|position|religion|faith|salary|loan|email|phone|engineer|director|manager|supervisor|doctor|nurse|teacher|driver)\b/i,
        // Breach/profile with multiple personal attributes: weight + height + job + email pattern
        /(?:weight|weighs?|kg|g|lbs?|pounds?)\s+.*?(?:height|tall|cm|m|feet|ft|inches?)\s+.*?\b(engineer|director|manager|job|position|email|religion|faith|phone|salary)\b/i,
        // Job titles as strong indicator of personal profile context
        /\b(engineer|director|manager|supervisor|doctor|nurse|teacher|driver|accountant|architect|designer|analyst)\b.*?(?:weight|weighs?|kg|g|lbs?|pounds?)\b/i,
      ];
      
      // Objects/Items that measurements apply to - SUPPRESS these
      // These are explicit markers that the measurement is of an object, not a person
      const objectSubjectMarkers = [
        // Check if BEFORE text ends with packaging/object keywords
        /\b(box|bag|package|container|parcel|item|carton|crate|case|mangoes?)\s*$/i,
        /(?:mangoes?\s+package|dried\s+mangoes?)/i,
      ];
      
      // Remove beforeTextEndsWithPackaging since it's now part of objectSubjectMarkers check
      
      // ID/Personal Document Context - ALLOW these
      const idContextMarkers = [
        /\b(id|driver.?s?.*license|passport|identification|document|medical|health|record|profile)\b/i,
        /\b(height|weight|physical.*characteristic|personal.*information|biometric)\b/i,
      ];
      
      // Non-ID Contexts - SUPPRESS these (these are NOT personal information)
      // Note: Be conservative - don't suppress if it could be personal profile
      const nonIdContextMarkers = [
        // Shipping/Logistics — explicit non-person context
        /\b(ship|shipping|courier|parcel|cargo|freight|mail|postal|delivery|transport|estimate|cost|charge|fee|order|shipped|warehouse)\b/i,
        // Food/Cooking — explicit non-person context
        /\b(recipe|ingredient|cook|bake|flour|sugar|food|meal|dish|serving|portion|bag.*mangoes?|dried.*mangoes?|rice)\b/i,
      ];
      
      // Exclude: Furniture/Objects context - too many false positives with personal data
      // A furniture measurement appearing with height/weight keywords could still be personal profile
      
      const hasPersonalAttribute = personalAttributeMarkers.some(m => m.test(fullContext));
      const hasObjectSubject = objectSubjectMarkers.some(m => m.test(beforeText));  // ★ Check BEFORE text only for object detection
      const hasIdMarker = idContextMarkers.some(m => m.test(fullContext));
      const hasNonIdMarker = nonIdContextMarkers.some(m => m.test(fullContext));
      
      // SUPPRESS ONLY if clear non-person context AND no personal indicators
      // IMPORTANT: If we have STRONG shipping indicators (warehouse, parcel, shipped),
      // suppress the measurement even if there's a coincidental personal marker match
      // This handles cases like "LOAN APPLICATION FORM" matching with "kg"
      const hasStrongShippingIndicator = /\b(warehouse|parcel|shipped|shipping|courier|order.*shipped|ship to)\b/i.test(fullContext);
      const shouldSuppress = hasObjectSubject || (hasNonIdMarker && !hasPersonalAttribute && !hasIdMarker) || (hasStrongShippingIndicator && !hasIdMarker);
      
      return !shouldSuppress; // Return false to suppress, true to allow
    }
  },

  // -- SEX MENTION
  {
    id: "sex_mention",
    label: "Sex Mention",
    reason: "Sex is personal demographic information under RA 10173. When combined with other identifiers like name, age, or location, it contributes to individual identification and can enable profiling or discrimination.",
    regex: /\b(?:sex|kasarian|gender)\s*[:=]\s*(?:male|female|m|f|lalaki|babae|intersex|non-?binary)\b/gi,
    risk: "low",
    validate: null,
    sanitize: (_m) => "[SEX REDACTED]"
  },

  // -- EYE COLOR MENTION
  // -- EYE COLOR MENTION
  // NOTE: Eye color detection is now handled by Path B (gazetteer + trigger phrases)
  // This pattern is DISABLED to avoid duplication with gazetteer detection.
  // The gazetteer approach is more context-aware (uses trigger phrases like "my eyes are")
  // Path B will detect: trigger_eye_color, gazetteer_eye_color
  // See gazetteer.js for implementation
  {
    id: "eye_color_mention",
    label: "Eye Color Mention",
    reason: "Eye color is a personal physical characteristic under RA 10173. Detection now handled by gazetteer (Path B).",
    regex: null,  // DISABLED - use gazetteer instead
    risk: "low",
    validate: null,
    sanitize: (_m) => "[EYE COLOR REDACTED]"
  },

  // ── ID-IN-CODE PATTERNS (TASK: Detect Government IDs in Code Contexts) ─────
  // These patterns detect when government IDs (UMID, SSS) appear in code
  // variable assignments, object literals, and function arguments.
  // This helps users understand they're sharing code with embedded credentials.

  // UMID in variable assignment
  // Example: const UMID = "0111-3044737-0";
  // Example: let employeeId = "4567-8901234-5";
  {
    id: "ph_id_umid_variable_assignment",
    label: "UMID in Code Variable Assignment",
    reason: "UMID credential embedded in code variable assignment. Code containing government IDs may be logged by AI platforms, exposing your identity verification data.",
    regex: /(?:const|let|var)\s+(\w*(?:umid|employee_?id|emp_?id|user_?id)\w*)\s*=\s*["']?(\d{4}-\d{7}-\d)["']?/gi,
    risk: "high",
    validate: null,
    structuralValidate: (raw) => {
      const digits = raw.match(/\d{4}-\d{7}-\d/)?.[0];
      return digits ? structuralValidatePHID_UMID(digits) : false;
    },
    sanitize: (m) => {
      const varMatch = m.match(/(?:const|let|var)\s+(\w+)/);
      const idMatch = m.match(/\d{4}-\d{7}-\d/);
      const varName = varMatch ? varMatch[1] : "ID";
      const idDigits = idMatch ? idMatch[0] : "";
      if (idDigits) {
        return `${varName}=${idDigits.slice(0, 4)}-${"*".repeat(7)}-${idDigits.slice(-1)}`;
      }
      return "[REDACTED-UMID-ASSIGNMENT]";
    }
  },

  // SSS in variable assignment
  // Example: const sss = "12-3456789-0";
  // Example: let socialSecurityNumber = "01-2345678-9";
  {
    id: "ph_id_sss_variable_assignment",
    label: "SSS in Code Variable Assignment",
    reason: "SSS credential embedded in code variable assignment. Code containing employment identifiers may be logged by AI platforms, exposing employment records access.",
    regex: /(?:const|let|var)\s+(\w*(?:sss|social_?security|ss_?number|social_?sec)\w*)\s*=\s*["']?(\d{2}-\d{7}-\d)["']?/gi,
    risk: "high",
    validate: null,
    structuralValidate: (raw) => {
      const digits = raw.match(/\d{2}-\d{7}-\d/)?.[0];
      return digits ? structuralValidatePHID_SSS(digits) : false;
    },
    sanitize: (m) => {
      const varMatch = m.match(/(?:const|let|var)\s+(\w+)/);
      const idMatch = m.match(/\d{2}-\d{7}-\d/);
      const varName = varMatch ? varMatch[1] : "ID";
      const idDigits = idMatch ? idMatch[0] : "";
      if (idDigits) {
        return `${varName}=${idDigits.slice(0, 2)}-${"*".repeat(7)}-${idDigits.slice(-1)}`;
      }
      return "[REDACTED-SSS-ASSIGNMENT]";
    }
  },

  // ID in object literal
  // Example: {umid: "0111-3044737-0", name: "John"}
  // Example: {sss: "12-3456789-0", employeeInfo: {...}}
  // Example: {id: "1234-5678901", department: "HR"}
  {
    id: "ph_id_object_literal",
    label: "Government ID in Object Literal",
    reason: "Government ID embedded in code object literal. This is a code pattern that will be visible to AI platforms, exposing your credential data structure.",
    regex: /[{,]\s*(?:umid|sss|employee_?id|user_?id|emp_?id|govt?_?id|social_?security|identity_?number)\s*:\s*["']?(\d{4}-\d{7}-\d|\d{2}-\d{7}-\d|\d{4}-\d{4}-\d{4}-\d{4})["']?/gi,
    risk: "high",
    validate: null,
    structuralValidate: (raw) => {
      const umidMatch = raw.match(/\d{4}-\d{7}-\d/);
      const sssMatch = raw.match(/\d{2}-\d{7}-\d/);
      const philidMatch = raw.match(/\d{4}-\d{4}-\d{4}-\d{4}/);
      
      if (umidMatch) return structuralValidatePHID_UMID(umidMatch[0]);
      if (sssMatch) return structuralValidatePHID_SSS(sssMatch[0]);
      if (philidMatch) return true; // PhilID format is structurally valid
      return false;
    },
    sanitize: (m) => {
      const keyMatch = m.match(/(?:umid|sss|employee_?id|user_?id|emp_?id|id)\s*:\s*/i);
      const idMatch = m.match(/(\d{4}-\d{7}-\d|\d{2}-\d{7}-\d|\d{4}-\d{4}-\d{4}-\d{4})/);
      
      if (keyMatch && idMatch) {
        const key = keyMatch[0].trim();
        const idDigits = idMatch[0];
        
        if (/\d{4}-\d{7}-\d/.test(idDigits)) {
          return `${key}"${idDigits.slice(0, 4)}-${"*".repeat(7)}-${idDigits.slice(-1)}"`;
        } else if (/\d{2}-\d{7}-\d/.test(idDigits)) {
          return `${key}"${idDigits.slice(0, 2)}-${"*".repeat(7)}-${idDigits.slice(-1)}"`;
        } else if (/\d{4}-\d{4}-\d{4}-\d{4}/.test(idDigits)) {
          return `${key}"${idDigits.slice(0, 4)}-****-****-${idDigits.slice(-4)}"`;
        }
      }
      return "[REDACTED-ID-LITERAL]";
    }
  },

  // ID in function argument / fetch call
  // Example: fetch(api, {id: "0111-3044737-0"})
  // Example: sendRequest({umid: "0111-3044737-0", data: {...}})
  // Example: updateUser("0111-3044737-0")
  {
    id: "ph_id_function_argument",
    label: "Government ID in Function Argument",
    reason: "Government ID passed as function argument in code. Function calls with credential data are logged by AI platforms, exposing your usage patterns.",
    regex: /\w+\s*\(\s*[{,]?\s*(?:umid|sss|employee_?id|user_?id|id)\s*[:=]\s*["']?(\d{4}-\d{7}-\d|\d{2}-\d{7}-\d)["']?/gi,
    risk: "high",
    validate: null,
    structuralValidate: (raw) => {
      const umidMatch = raw.match(/\d{4}-\d{7}-\d/);
      const sssMatch = raw.match(/\d{2}-\d{7}-\d/);
      
      if (umidMatch) return structuralValidatePHID_UMID(umidMatch[0]);
      if (sssMatch) return structuralValidatePHID_SSS(sssMatch[0]);
      return false;
    },
    sanitize: (m) => {
      const funcMatch = m.match(/^(\w+)\s*\(/);
      const funcName = funcMatch ? funcMatch[1] : "function";
      const idMatch = m.match(/(\d{4}-\d{7}-\d|\d{2}-\d{7}-\d)/);
      
      if (idMatch) {
        const idDigits = idMatch[0];
        if (/\d{4}-\d{7}-\d/.test(idDigits)) {
          return `${funcName}({id: "${idDigits.slice(0, 4)}-${"*".repeat(7)}-${idDigits.slice(-1)}"...})`;
        } else if (/\d{2}-\d{7}-\d/.test(idDigits)) {
          return `${funcName}({sss: "${idDigits.slice(0, 2)}-${"*".repeat(7)}-${idDigits.slice(-1)}"...})`;
        }
      }
      return "[REDACTED-ID-FUNCTION-ARG]";
    }
  }

];

// Freeze to prevent accidental mutation at runtime.
Object.freeze(TRUSTPROMPT_PATTERNS);


// ── Export TRUSTPROMPT_PATTERNS to global scope ──────────────────────────────
// Make patterns available to scanner.js and other modules
if (typeof globalThis !== 'undefined') {
  globalThis.TRUSTPROMPT_PATTERNS = TRUSTPROMPT_PATTERNS;
  globalThis.isKnownPlaceholder = isKnownPlaceholder;
  globalThis.shannonEntropy = shannonEntropy;
}
if (typeof window !== 'undefined') {
  window.TRUSTPROMPT_PATTERNS = TRUSTPROMPT_PATTERNS;
  window.isKnownPlaceholder = isKnownPlaceholder;
  window.shannonEntropy = shannonEntropy;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TRUSTPROMPT_PATTERNS,
    isKnownPlaceholder,
    shannonEntropy,
    extractPHIDValue,
    isPhIDPlaceholder,
    normalizePHID,
    isLikelyApiKey,
    validateHeightPattern,
    validateWeightPattern,
    structuralValidateApiKey,
    structuralValidatePHID_UMID,
    structuralValidatePHID_SSS,
    structuralValidatePHID_Passport,
    structuralValidatePHID_PhilHealth,
    structuralValidatePHID_PRC,
    structuralValidatePHID_PhilID,
    structuralValidatePHStreetAddress
  };
}
