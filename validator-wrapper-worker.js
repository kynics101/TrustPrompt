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
//     isJWT        → verifies three base64url segments starting with eyJ
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
//
//   This means credit cards and emails that pass the regex but have not been
//   mathematically confirmed are flagged as validated: false — they contribute
//   their base score but do NOT trigger the critical-entity governance escalation
//   in the worker path. The main-thread fallback (scanner.js) applies full
//   Luhn / RFC5322 validation and sets validated: true only on confirmed matches.
//
// NOTE: The worker path will have a slightly higher false-positive rate than
// the main-thread path for credit cards and emails. This is a known and
// documented trade-off for off-thread performance.

/* global TrustValidatorWorker, PH_ADDRESS_DB */

const TrustValidatorWorker = (() => {

  // ── Tier 2 heuristics ─────────────────────────────────────────────────────

  function _isJWT(raw) {
    // Three base64url-safe segments separated by dots, first two start with eyJ
    const parts = raw.split(".");
    if (parts.length !== 3) return false;
    const b64url = /^[A-Za-z0-9\-_]+$/;
    return b64url.test(parts[0]) && b64url.test(parts[1]) && b64url.test(parts[2])
      && parts[0].startsWith("eyJ") && parts[1].startsWith("eyJ");
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
