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
