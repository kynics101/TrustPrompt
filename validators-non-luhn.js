/**
 * validators-non-luhn.js
 * 
 * Structural validators for PII items detectable by regex that don't use Luhn algorithm:
 *   - Philippine-issued identification numbers (covered by patterns.js)
 *   - API keys and tokens
 *   - JSON Web Tokens (JWT)
 *   - Email addresses
 *   - Mobile phone numbers (Philippine)
 *   - Physical addresses (Philippine)
 *   - IP addresses (IPv4 and IPv6)
 *   - MAC addresses
 */

// ─────────────────────────────────────────────────────────────────────────────
// API KEY AND TOKEN VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates OpenAI API key format
 * Format: sk-xxxx... (sk- or sk-proj- prefix, followed by base64url characters)
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid OpenAI API key structure
 */
function validateOpenAIApiKey(raw) {
  if (!raw || typeof raw !== "string") return false;
  return /^sk-[A-Za-z0-9\-_]{20,}/.test(raw.trim());
}

/**
 * Validates GitHub token format
 * Formats: ghp_xxx (personal access), gho_xxx (OAuth), github_pat_xxx (fine-grained)
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid GitHub token structure
 */
function validateGitHubToken(raw) {
  if (!raw || typeof raw !== "string") return false;
  const trimmed = raw.trim();
  return /^(ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{82})/.test(trimmed);
}

/**
 * Validates Slack token format
 * Formats: xoxb-xxxx (bot token), xoxp-xxxx (user token)
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid Slack token structure
 */
function validateSlackToken(raw) {
  if (!raw || typeof raw !== "string") return false;
  return /^xox[bp]-\d+-[A-Za-z0-9\-]+/.test(raw.trim());
}

/**
 * Validates AWS Access Key ID format
 * Format: AKIA followed by 16 uppercase alphanumeric characters
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid AWS access key structure
 */
function validateAWSAccessKey(raw) {
  if (!raw || typeof raw !== "string") return false;
  return /^AKIA[A-Z0-9]{16}/.test(raw.trim());
}

/**
 * Validates Google API key format
 * Format: AIza followed by 35 base64url characters
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid Google API key structure
 */
function validateGoogleAPIKey(raw) {
  if (!raw || typeof raw !== "string") return false;
  return /^AIza[A-Za-z0-9\-_]{35}/.test(raw.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT (JSON Web TOKEN) VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates JWT format
 * Format: three base64url-encoded parts separated by dots: header.payload.signature
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid JWT structure
 */
function validateJWT(raw) {
  if (!raw || typeof raw !== "string") return false;
  
  const trimmed = raw.trim();
  const parts = trimmed.split('.');
  
  // JWT must have exactly 3 parts
  if (parts.length !== 3) return false;
  
  // Each part should be non-empty and base64url-encoded (alphanumeric, -, _)
  const base64urlRegex = /^[A-Za-z0-9\-_]+$/;
  for (const part of parts) {
    if (!part || !base64urlRegex.test(part)) return false;
  }
  
  // Verify length constraints (approximate):
  // header: typically 20-50 chars
  // payload: typically 20-500 chars  
  // signature: typically 40-100 chars
  if (parts[0].length < 10 || parts[1].length < 10 || parts[2].length < 10) return false;
  
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL ADDRESS VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates email address format (RFC 5322 simplified)
 * Requires: local-part @ domain . TLD
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid email structure
 */
function validateEmail(raw) {
  if (!raw || typeof raw !== "string") return false;
  
  const trimmed = raw.trim();
  
  // Simplified RFC 5322 validation
  const emailRegex = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
  if (!emailRegex.test(trimmed)) return false;
  
  // Additional checks
  // Local part cannot start/end with dot
  const [localPart, domain] = trimmed.split('@');
  if (!localPart || !domain) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;
  
  // Domain must have at least one dot
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;
  
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHILIPPINE MOBILE PHONE NUMBER VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates Philippine mobile phone number format
 * Formats:
 *   - +63 9XX XXXX XXXX (international)
 *   - 09XX XXXX XXXX (local)
 *   - 9XX XXXX XXXX (no leading 0)
 * Valid carriers: Globe (0915-0918, 0927-0928), Smart (0910-0914, 0921-0923), Sun (0922-0924)
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid Philippine mobile number structure
 */
function validatePhilippineMobileNumber(raw) {
  if (!raw || typeof raw !== "string") return false;
  
  const trimmed = raw.replace(/[\s\-()]/g, '').trim();
  
  // Handle international format: +63 9XX XXXX XXXX → 09XX XXXX XXXX
  let normalized = trimmed;
  if (trimmed.startsWith('+63')) {
    normalized = '0' + trimmed.slice(3);
  }
  
  // Must be 11 digits total
  if (!/^\d{11}$/.test(normalized)) return false;
  
  // Must start with 09 (Philippines mobile indicator)
  if (!normalized.startsWith('09')) return false;
  
  // Check valid carrier prefixes
  // Globe: 0915-0918, 0927-0928
  // Smart: 0910-0914, 0921-0923
  // Sun: 0922-0924
  // TNT, Talk N Text, ABS-CBN: 0910-0914
  // Dito: 0991-0996
  const prefix = normalized.slice(0, 4);
  const validPrefixes = [
    '0915', '0916', '0917', '0918', // Globe
    '0927', '0928', // Globe
    '0910', '0911', '0912', '0913', '0914', // Smart, TNT
    '0921', '0922', '0923', // Smart, Sun
    '0924', // Sun
    '0991', '0992', '0993', '0994', '0995', '0996' // Dito
  ];
  
  return validPrefixes.includes(prefix);
}

// ─────────────────────────────────────────────────────────────────────────────
// PHILIPPINE PHYSICAL ADDRESS VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates Philippine physical address structure
 * Checks for presence of address components:
 *   - Street/barangay name
 *   - City/municipality
 *   - Province
 *   - Optional postal code
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if likely a valid Philippine address
 */
function validatePhilippineAddress(raw) {
  if (!raw || typeof raw !== "string") return false;
  
  const trimmed = raw.trim().toLowerCase();
  
  // Must be reasonably long (minimum 20 chars for valid address)
  if (trimmed.length < 20) return false;
  
  // Check for common Philippine address components
  const hasStreetComponent = /\b(street|st\.|avenue|ave\.|road|rd\.|boulevard|blvd\.|drive|dr\.|barangay|brgy\.|sitio|purok|phase)\b/.test(trimmed);
  
  // Check for city indicators or common Philippine cities
  const philippineCities = /\b(manila|cebu|davao|quezon city|makati|caloocan|taguig|pasig|mandaluyong|marikina|las piñas|parañaque|cavite|laguna|batangas|iloilo|cagayan de oro|davao city)\b/i;
  const hasCityComponent = philippineCities.test(trimmed) || /\b(city|municipality|mun\.|municipality)\b/.test(trimmed);
  
  // Check for province indicators
  const philippineProvinces = /\b(benguet|ilocos norte|ilocos sur|la union|pangasinan|batangas|cavite|laguna|quezon|rizal|bulacan|nueva ecija|nueva vizcaya|ifugao|kalinga|mountain province|apayao|cagayan|isabela|quirino|aurora|tarlac|zambales|palawan|mindoro|marinduque|catanduanes|albay|camarines norte|camarines sur|sorsogon|masbate|aklan|antique|capiz|guimaras|iloilo|negros occidental|negros oriental|cebu|bohol|siquijor|eastern samar|guiuan|samar|northern samar|sultan kudarat|davao del norte|davao del sur|davao oriental|davao city|gensan|cotabato|south cotabato|bukidnon|camiguin|lanao del norte|lanao del sur|maguindanao|misamis occidental|misamis oriental)\b/i;
  const hasProvinceComponent = philippineProvinces.test(trimmed);
  
  // At least two of three components should be present
  const componentCount = [hasStreetComponent, hasCityComponent, hasProvinceComponent].filter(Boolean).length;
  
  return componentCount >= 2;
}

// ─────────────────────────────────────────────────────────────────────────────
// IP ADDRESS VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates IPv4 address format
 * Format: XXX.XXX.XXX.XXX where each octet is 0-255
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid IPv4 address
 */
function validateIPv4(raw) {
  if (!raw || typeof raw !== "string") return false;
  
  const trimmed = raw.trim();
  const octets = trimmed.split('.');
  
  // Must have exactly 4 octets
  if (octets.length !== 4) return false;
  
  // Each octet must be 0-255
  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet)) return false;
    const num = parseInt(octet, 10);
    if (num < 0 || num > 255) return false;
  }
  
  return true;
}

/**
 * Validates IPv6 address format
 * Format: XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX:XXXX (hexadecimal with colons)
 * Supports compressed format (::), full format, and mixed IPv4
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid IPv6 address structure
 */
function validateIPv6(raw) {
  if (!raw || typeof raw !== "string") return false;
  
  const trimmed = raw.trim();
  
  // Basic IPv6 validation: should contain hex characters and colons
  if (!/^[0-9a-fA-F:]+$/.test(trimmed)) return false;
  
  // Check for valid IPv6 patterns
  // Full format: 8 groups of 4 hex digits separated by colons
  // Compressed format: can contain :: but only once
  // Mixed IPv4: ends with IPv4 address
  
  if (trimmed.includes('::')) {
    // Compressed format: only one :: allowed
    if ((trimmed.match(/::/g) || []).length !== 1) return false;
  }
  
  // Split by colons (avoiding :: which creates empty segments)
  const parts = trimmed.split(':').filter(p => p !== '');
  
  // IPv6 should have between 2 and 8 groups (more if compressed, less if compressed)
  if (parts.length > 8) return false;
  
  // Each part should be 1-4 hex characters
  for (const part of parts) {
    if (part.length > 4) return false;
  }
  
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAC ADDRESS VALIDATOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates MAC address format
 * Formats:
 *   - XX:XX:XX:XX:XX:XX (colon-separated)
 *   - XX-XX-XX-XX-XX-XX (hyphen-separated)
 *   - XXXXXXXXXXXX (no separator)
 * @param {string} raw - the raw matched value
 * @returns {boolean} true if valid MAC address structure
 */
function validateMACAddress(raw) {
  if (!raw || typeof raw !== "string") return false;
  
  const trimmed = raw.trim().toUpperCase();
  
  // Pattern 1: XX:XX:XX:XX:XX:XX (colon-separated)
  if (/^([0-9A-F]{2}:){5}([0-9A-F]{2})$/.test(trimmed)) return true;
  
  // Pattern 2: XX-XX-XX-XX-XX-XX (hyphen-separated)
  if (/^([0-9A-F]{2}-){5}([0-9A-F]{2})$/.test(trimmed)) return true;
  
  // Pattern 3: XXXXXXXXXXXX (no separator, 12 hex chars)
  if (/^[0-9A-F]{12}$/.test(trimmed)) return true;
  
  // Pattern 4: XX.XX.XX.XX.XX.XX (dot-separated, Cisco format)
  if (/^([0-9A-F]{2}\.){5}([0-9A-F]{2})$/.test(trimmed)) return true;
  
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT VALIDATORS
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  // API Keys and Tokens
  validateOpenAIApiKey,
  validateGitHubToken,
  validateSlackToken,
  validateAWSAccessKey,
  validateGoogleAPIKey,
  
  // JWT
  validateJWT,
  
  // Email
  validateEmail,
  
  // Phone
  validatePhilippineMobileNumber,
  
  // Address
  validatePhilippineAddress,
  
  // IP Addresses
  validateIPv4,
  validateIPv6,
  
  // MAC Address
  validateMACAddress
};
