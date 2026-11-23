// trust-worker.js
// TrustPrompt — Web Worker host for the scanner.
//
// This worker runs the same engine as the content script: scanner.js
// (TrustScanner.scan). It loads the same detection and scoring scripts, in the
// same order as the content-script entry in manifest.json, so the worker and the
// main-thread fallback always produce identical results. Do not copy scoring or
// detection logic into this file. Change scanner.js (or the scripts it loads)
// and both paths pick up the change.
//
// Scripts that need the DOM or the extension runtime (ui.js, consent-state.js,
// dom-claude.js, dom-chatgpt.js, worker-bridge.js) are not loaded here.
//
// Message in:
//   { type: "SCAN", rawText: string, scanId: number }
// Message out:
//   { type: "RESULT", scanId, findings, riskLevel, score, governance,
//     normalisedText, wasCapsConverted, elapsedMs }
//   { type: "ERROR", scanId, message }

// The scanner scripts read the global object as `window` (for example
// window.nlp, the Compromise NLP library). In a worker the global object is
// `self`, so alias it. This matches the content-script scope, where window is
// the global object. Without it the POS checks are skipped and results differ.
if (typeof window === "undefined") self.window = self;

const _base = (typeof self !== "undefined" && self.EXTENSION_BASE) ? self.EXTENSION_BASE : "";
const _url  = (f) => _base + f;

// Same order as the content-script list in manifest.json (minus DOM/UI files).
importScripts(
  _url("lib/validator.min.js"),
  _url("lib/compromise.min.js"),
  _url("ph-address-db.js"),
  _url("terms-identity.js"),
  _url("normalizer.js"),
  _url("patterns.js"),
  _url("terms-medical.js"),
  _url("terms-financial.js"),
  _url("terms-organizations.js"),
  _url("terms-occupations.js"),
  _url("terms-names.js"),
  _url("terms-names-extra.js"),
  _url("context-attribution.js"),
  _url("gazetteer.js"),
  _url("organization-loader.js"),
  _url("organization-detector-enhanced.js"),
  _url("linguistic-detector.js"),
  _url("validator-wrapper.js"),
  _url("scanner.js")
);

self.onmessage = async function (e) {
  const { type, rawText, scanId } = e.data || {};
  if (type !== "SCAN") return;

  try {
    const r = await TrustScanner.scan(rawText);
    self.postMessage({
      type:             "RESULT",
      scanId,
      findings:         r.findings,
      riskLevel:        r.riskLevel,
      score:            r.score,
      governance:       r.governance,
      normalisedText:   r.normalisedText,
      wasCapsConverted: r.wasCapsConverted,
      elapsedMs:        r.elapsedMs,
    });
  } catch (err) {
    self.postMessage({ type: "ERROR", scanId, message: String((err && err.message) || err) });
  }
};
