// validator-wrapper-worker.js
// Worker-safe validator adapter for TrustPrompt.
//
// validator.js (full mathematical validation — Luhn, RFC5322, JWT structure,
// IP format, MAC format) cannot run in a Web Worker due to its size and
// ESM import constraints. This adapter provides a tiered substitute:
//
//   TIER 1 — Full structural check available in worker:
//     isPHAddress  → runs PH_ADDRESS_DB gazetteer lookup (same as main thread)
//
//   TIER 2 — Lightweight structural heuristic (worker-only substitute):
//     isJWT        → TASK-4.3: verifies three base64url segments starting with
//                    eyJ AND decodes header+payload to confirm valid JSON objects.
//                    This elevates JWT from Tier 3 to Tier 2, so validated:true
//                    is set in trust-worker.js, enabling governance Rule 1 (→ HIGH).
//     isIP         → verifies four octets each 0–255 (IPv4)
//     isIPv6       → verifies colon-hex structure
//     isMACAddress → verifies six colon/hyphen-separated hex pairs
//     isMobilePhone_PH → verifies PH mobile prefix 900–999 + length
//     isMobilePhone    → verifies digit count after stripping formatting
//
//   TIER 3 — Regex-confirmed only (no math available in worker):
//     isCreditCard → regex shape only; Luhn check requires main thread
//     isEmail      → regex shape only; RFC5322 requires main thread
//     null         → no validator specified; regex is sufficient
//
// validator implementation:
//   validate() returns { passed: boolean, tier: string } so that trust-worker.js
//   can set validated: true only for Tier 1 and Tier 2 results, and
//   validated: false for Tier 3 (regex-only) results.

/* global TrustValidatorWorker, PH_ADDRESS_DB */

const TrustValidatorWorker = (() => {

  // ── Base64url decode helper ───────────────────────────────────────────────
  // Decodes a base64url-encoded string to a UTF-8 string.
  // base64url uses - and _ instead of + and /; no padding required.

  function _base64urlDecode(str) {
    try {
      // Pad to multiple of 4
      const padded = str.replace(/-/g, "+").replace(/_/g, "/");
      const pad = padded.length % 4;
      const b64 = pad ? padded + "=".repeat(4 - pad) : padded;
      return atob(b64);
    } catch (_) {
      return null;
    }
  }

  // ── Tier 2 heuristics ─────────────────────────────────────────────────────

  /**
   * TASK-4.3: Structural JWT check for the web worker path.
   *
   * Validation steps:
   *   1. Must have exactly three dot-separated segments
   *   2. All three segments must be non-empty base64url strings
   *   3. Segment 1 (header)  must start with "eyJ" (base64url of `{"`)
   *   4. Segment 2 (payload) must start with "eyJ"
   *   5. Segment 1 decodes to a string that, when parsed, is a JSON object
   *   6. Segment 2 decodes to a string that, when parsed, is a JSON object
   *   7. Segment 3 (signature) must be ≥ 20 characters (rejects truncated tokens)
   *
   * Steps 5–6 replace the old "starts with eyJ" check with an actual JSON parse,
   * preventing false positives from arbitrary base64url strings that happen to
   * start with eyJ.
   *
   * This check is Tier 2 (heuristic) — not full cryptographic verification.
   * It confirms structural validity, not signature authenticity.
   */
  function _isJWT(raw) {
    const parts = raw.trim().split(".");
    if (parts.length !== 3) return false;

    const [header, payload, signature] = parts;
    const b64url = /^[A-Za-z0-9\-_]+$/;

    // All segments must be non-empty base64url characters
    if (!b64url.test(header) || !b64url.test(payload) || !b64url.test(signature)) {
      return false;
    }

    // Header and payload must start with eyJ (base64url encoding of `{"`)
    if (!header.startsWith("eyJ") || !payload.startsWith("eyJ")) return false;

    // Signature segment must be ≥ 20 chars (TASK-4.3.1)
    if (signature.length < 20) return false;

    // Decode and JSON-parse header and payload to confirm they are JSON objects
    try {
      const headerDecoded  = _base64urlDecode(header);
      const payloadDecoded = _base64urlDecode(payload);
      if (!headerDecoded || !payloadDecoded) return false;

      const headerObj  = JSON.parse(headerDecoded);
      const payloadObj = JSON.parse(payloadDecoded);

      // Both must be plain objects (not arrays, not primitives)
      if (typeof headerObj  !== "object" || Array.isArray(headerObj)  || headerObj  === null) return false;
      if (typeof payloadObj !== "object" || Array.isArray(payloadObj) || payloadObj === null) return false;

      // Header must have at least an "alg" field (standard JWT requirement)
      if (!headerObj.alg) return false;

      return true;
    } catch (_) {
      return false;
    }
  }

  function _isIPv4(raw) {
    const clean  = raw.trim();
    const octets = clean.split(".");
    if (octets.length !== 4) return false;
    return octets.every(o => {
      const n = Number(o);
      return /^\d{1,3}$/.test(o) && n >= 0 && n <= 255;
    });
  }

  function _isIPv6(raw) {
    // Accepts full (8 groups) and compressed (::) forms
    const clean = raw.trim();
    // Simple structural check — colon-separated hex groups
    return /^([0-9A-Fa-f]{0,4}:){2,7}[0-9A-Fa-f]{0,4}$/.test(clean) ||
           /^::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4}$/.test(clean) ||
           /^([0-9A-Fa-f]{1,4}:){1,7}:$/.test(clean);
  }

  function _isMACAddress(raw) {
    const clean = raw.trim();
    return /^([0-9A-Fa-f]{2}[:\-]){5}[0-9A-Fa-f]{2}$/.test(clean);
  }

  function _isMobilePhone_PH(raw) {
    const digits = raw.replace(/\D/g, "");
    // Normalise to 11 digits (09XXXXXXXXX)
    const normalised = digits.startsWith("63") ? "0" + digits.slice(2) : digits;
    if (normalised.length !== 11) return false;
    if (!normalised.startsWith("09")) return false;
    const prefix = parseInt(normalised.slice(1, 4), 10);
    return prefix >= 900 && prefix <= 999;
  }

  function _isMobilePhone(raw) {
    // Loose check: 7–15 digits after stripping formatting characters
    const digits = raw.replace(/[\s\(\)\+\-\.]/g, "");
    return /^\d{7,15}$/.test(digits);
  }

  // ── Public API ────────────────────────────────────────────────────────────
  //
  // Returns { passed: boolean, tier: string }
  //   passed — whether the match is accepted
  //   tier   — "1_gazetteer" | "2_heuristic" | "3_regex_only"
  //
  // trust-worker.js sets finding.validated = (tier !== "3_regex_only")
  // so that only Tier 1 and Tier 2 results qualify for governance escalation.
  //
  // TASK-4.3: isJWT is now Tier 2 (was effectively Tier 3 before — the old
  // check only verified base64url structure without JSON decode, so a random
  // base64url string starting with eyJ would pass). The new check decodes and
  // parses both header and payload as JSON objects with an alg field.

  function validate(validatorName, rawMatch) {

    // ── Tier 1: full gazetteer check ─────────────────────────────────────
    if (validatorName === "isPHAddress") {
      return { passed: PH_ADDRESS_DB.matchesAny(rawMatch), tier: "1_gazetteer" };
    }

    // ── Tier 2: lightweight structural heuristic ─────────────────────────
    if (validatorName === "isJWT") {
      return { passed: _isJWT(rawMatch), tier: "2_heuristic" };
    }
    if (validatorName === "isIP") {
      return { passed: _isIPv4(rawMatch), tier: "2_heuristic" };
    }
    if (validatorName === "isIPv6") {
      return { passed: _isIPv6(rawMatch), tier: "2_heuristic" };
    }
    if (validatorName === "isMACAddress") {
      return { passed: _isMACAddress(rawMatch), tier: "2_heuristic" };
    }
    if (validatorName === "isMobilePhone_PH") {
      return { passed: _isMobilePhone_PH(rawMatch), tier: "2_heuristic" };
    }
    if (validatorName === "isMobilePhone") {
      return { passed: _isMobilePhone(rawMatch), tier: "2_heuristic" };
    }

    // ── Tier 3: regex shape only (no math available in worker) ───────────
    // isCreditCard — Luhn check requires main thread
    // isEmail      — RFC5322 requires main thread
    // null         — pattern has no validator; regex is sufficient
    return { passed: true, tier: "3_regex_only" };
  }

  return { validate };

})();
