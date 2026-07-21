// validator-wrapper-worker.js
// Worker-safe validator adapter.
//
// validator.js can't run in a Worker (160KB gzipped, ESM import issues,
// depends on Node APIs). Instead, the worker skips mathematical validation
// and relies purely on the structural regex shape — which is already
// reasonably tight for credit cards, emails, IPs, etc.
//
// This means the worker may have a slightly higher false-positive rate
// than the main-thread path, but it's a trade-off for off-thread performance.
//
// The main-thread fallback (scanner.js) DOES use the full validator.js.

/* global TrustValidatorWorker, PH_ADDRESS_DB */

const TrustValidatorWorker = (() => {

  /**
   * Stub validator — always returns true (pass-through).
   * The regex in patterns.js is already tight enough for structural match.
   */
  function validate(validatorName, rawMatch) {
    // Special case: PH address needs the gazetteer DB check even in worker
    if (validatorName === "isPHAddress") {
      return PH_ADDRESS_DB.matchesAny(rawMatch);
    }
    // All other validators are skipped in the worker — regex is good enough
    return true;
  }

  return { validate };

})();
