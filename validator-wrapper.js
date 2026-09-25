// validator-wrapper.js
// Thin adapter between TrustPrompt's pattern engine and validator.js.
//
// validator.js works on exact strings. Our regex matches may include
// surrounding whitespace or punctuation, so we normalize each match
// before handing it to a validator.
//
// Each exported function returns true (confirmed PII) or false (likely
// a false positive — discard the match).
//
// Depends on: lib/validator.min.js (loaded before this file via manifest),
//             ph-address-db.js

/* global validator, PH_ADDRESS_DB */

const TrustValidator = (() => {

  // ── Normalize helpers ──────────────────────────────────────────────────────

  /**
   * Strip surrounding quotes, whitespace, and common label prefixes so
   * validator.js receives a clean value.
   */
  function clean(str) {
    return str.trim().replace(/^["'`]|["'`]$/g, "").trim();
  }

  /**
   * Remove all non-digit characters — used before card / phone checks.
   */
  function digitsOnly(str) {
    return str.replace(/\D/g, "");
  }

  // ── Per-type validators ────────────────────────────────────────────────────

  /**
   * Luhn algorithm + validator.js isCreditCard.
   */
  function isCreditCard(raw) {
    const digits = digitsOnly(raw);
    if (digits.length < 13 || digits.length > 19) return false;
    return validator.isCreditCard(digits);
  }

  /**
   * Standard RFC 5322 email check.
   */
  function isEmail(raw) {
    return validator.isEmail(clean(raw));
  }

  /**
   * JWT: three base64url segments. validator.js isJWT does this check.
   */
  function isJWT(raw) {
    return validator.isJWT(clean(raw));
  }

  /**
   * Philippine mobile numbers.
   * Accepted formats: 09XXXXXXXXX, +639XXXXXXXXX, 639XXXXXXXXX
   * Network prefixes: 0900–0999 (Globe), 0900–0919 (Smart), etc.
   * We normalise to 09XXXXXXXXX and check length + prefix range.
   */
  function isMobilePhone_PH(raw) {
    const digits = digitsOnly(raw);
    let local;
    if (digits.startsWith("639") && digits.length === 12) {
      local = "0" + digits.slice(2);
    } else if (digits.startsWith("63") && digits.length === 11) {
      local = "0" + digits.slice(2);
    } else {
      local = digits;
    }
    if (local.length !== 11 || !local.startsWith("09")) return false;
    // Valid PH mobile prefixes (as of 2024)
    const prefix = parseInt(local.slice(1, 4), 10); // e.g. 917
    return prefix >= 900 && prefix <= 999;
  }

  /**
   * International phone — delegate to validator.js with 'any' locale.
   */
  function isMobilePhone(raw) {
    const stripped = clean(raw).replace(/[\s\-().]/g, "");
    return validator.isMobilePhone(stripped, "any", { strictMode: false });
  }

  /**
   * International phone with strict validation to exclude passport patterns and Philippine government IDs.
   * Rejects patterns like:
   * - "P7432795C" (Philippine passport: letter + 7-8 digits + letter)
   * - "C51-23-016208" (Driver's license: letter-digits-digits-digits with hyphens)
   * - "A00-00-000000" (Generic ID format)
   * - "1234-5678901-2" (UMID: 4digits-7digits-1digit)
   * - "1232658742" (Senior Citizen ID: 10 digits)
   * - "12-3276589" (SSS: 10 digits with hyphens)
   * - "12327658921" (GSIS: 11 digits)
   */
  function isMobilePhone_InternationalStrict(raw) {
    const trimmed = raw.trim();
    
    // Reject if it matches the Philippine passport pattern (letter-digits-letter)
    if (/^[A-Za-z]\d{7,8}[A-Za-z]$/.test(trimmed)) {
      return false;
    }
    
    // Reject if it looks like a driver's license (letter-digits-digits-digits with hyphens)
    if (/^[A-Z]\d{2}-\d{2}-\d{6}$/.test(trimmed)) {
      return false;
    }
    
    // Reject if it looks like a voter's ID (4digits-2digits-8digits-letter)
    if (/^\d{4}-\d{2}-\d{8}-[A-Z]$/.test(trimmed)) {
      return false;
    }
    
    // Reject if it matches the UMID pattern (4digits-7digits-1digit)
    if (/^\d{4}-\d{7}-\d$/.test(trimmed)) {
      return false;
    }
    
    // Remove formatting first to check stripped length
    const stripped = trimmed.replace(/[\s\-().]/g, "");
    
    // Reject if it matches Philippine ID digit lengths
    // Senior Citizen: exactly 10 digits
    // SSS: exactly 10 digits (without hyphens) OR matches pattern XX-XXXXXXX-X
    // GSIS: exactly 11 digits
    // PhilID: exactly 12 digits
    if (/^\d{10}$/.test(stripped)) return false; // Senior Citizen or SSS
    if (/^\d{2}-\d{7}-\d$/.test(trimmed)) return false; // SSS with hyphens
    if (/^\d{11}$/.test(stripped)) return false; // GSIS
    if (/^\d{12}$/.test(stripped)) return false; // PhilID or UMID
    
    // Must start with + or be a valid digit sequence (no leading letters except +)
    // Valid patterns: +639123456789, 639123456789, +1-234-567-8900
    if (!/^(\+?[0-9]|[0-9])/.test(trimmed)) {
      return false;
    }

    // Must contain only digits after +
    if (!/^(\+)?[0-9]{7,15}$/.test(stripped)) {
      return false;
    }
    
    // Use validator.js for final validation
    return validator.isMobilePhone(stripped, "any", { strictMode: false });
  }

  /**
   * IPv4 address.
   */
  function isIP(raw) {
    return validator.isIP(clean(raw), 4);
  }

  /**
   * IPv6 address.
   */
  function isIPv6(raw) {
    return validator.isIP(clean(raw), 6);
  }

  /**
   * MAC address — colon or hyphen separated.
   */
  function isMACAddress(raw) {
    return validator.isMACAddress(clean(raw));
  }

  /**
   * Philippine physical address.
   * The regex in patterns.js catches street-level keywords; this validator
   * confirms the surrounding snippet contains a known PH place name so we
   * don't flag "Street Fighter" or "Avenue Q" as addresses.
   */
  function isPHAddress(raw) {
    return PH_ADDRESS_DB.matchesAny(raw);
  }

  // ── Dispatch table ─────────────────────────────────────────────────────────
  // Keys match the `validate` field in patterns.js entries.

  const HANDLERS = {
    isCreditCard,
    isEmail,
    isJWT,
    isMobilePhone_PH,
    isMobilePhone,
    isMobilePhone_InternationalStrict,
    isMobilePhone_InternationalStrict_ExcludePhilippineIDs: isMobilePhone_InternationalStrict,
    isIP,
    isIPv6,
    isMACAddress,
    isPHAddress
  };

  /**
   * Run the mathematical validator for a pattern entry.
   * @param {string} validatorName - key from HANDLERS (or null to skip)
   * @param {string} rawMatch      - the raw string captured by regex
   * @returns {boolean} true = keep the match, false = discard as false positive
   */
  function validate(validatorName, rawMatch) {
    if (!validatorName) return true; // no validator defined → keep all matches
    const fn = HANDLERS[validatorName];
    if (!fn) {
      console.warn("[TrustPrompt] unknown validator:", validatorName);
      return true; // fail-open: keep the match
    }
    try {
      return fn(rawMatch);
    } catch (e) {
      console.warn("[TrustPrompt] validator error for", validatorName, e);
      return true; // fail-open
    }
  }

  return { validate };

})();

// Ensure TrustValidator is available globally in all execution contexts
if (typeof window !== 'undefined') {
  window.TrustValidator = TrustValidator;
}
if (typeof globalThis !== 'undefined') {
  globalThis.TrustValidator = TrustValidator;
}
