// worker-bridge.js
// TrustPrompt — Worker Bridge (Main Thread).
//
// Abstracts whether scanning runs in a Web Worker or falls back to the
// main thread (TrustScanner). Callers always call TrustWorkerBridge.scan()
// and receive a Promise regardless of which path is taken.
//
// Fallback triggers:
//   - Worker failed to instantiate
//   - Worker did not respond within WORKER_TIMEOUT_MS
//
// Threshold: 200ms for ≤150 words (from system flow spec).
// For longer prompts the timeout scales linearly.

/* global TrustScanner, TrustWorkerBridge */

const TrustWorkerBridge = (() => {

  // ── Config ─────────────────────────────────────────────────────────────────
  const BASE_TIMEOUT_MS  = 1500;  // 1.5s budget — generous enough for the Worker
  const WORDS_BASELINE   = 150;
  const MS_PER_EXTRA_100 = 200;   // +200ms per 100 words beyond baseline

  let worker         = null;
  let workerAlive    = false;
  let scanIdCounter  = 0;
  const pending      = new Map(); // scanId → { resolve, reject, timer }

  // ── Worker init ────────────────────────────────────────────────────────────

  function initWorker() {
    try {
      worker = new Worker(chrome.runtime.getURL("trust-worker.js"));
      worker.onmessage = onWorkerMessage;
      worker.onerror   = onWorkerError;
      workerAlive      = true;
      console.log("[TrustPrompt/bridge] Web Worker started");
    } catch (err) {
      console.warn("[TrustPrompt/bridge] Worker failed to start — using main thread:", err.message);
      workerAlive = false;
    }
  }

  function onWorkerMessage(e) {
    const { type, scanId, findings, riskLevel, score,
            normalisedText, wasCapsConverted, elapsedMs } = e.data;
    if (type !== "RESULT") return;

    const entry = pending.get(scanId);
    if (!entry) return;

    clearTimeout(entry.timer);
    pending.delete(scanId);
    entry.resolve({ findings, riskLevel, score, normalisedText, wasCapsConverted, elapsedMs });
  }

  function onWorkerError(err) {
    console.error("[TrustPrompt/bridge] Worker error:", err.message);
    // Reject all pending scans so they fall through to main-thread fallback
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    pending.clear();
    workerAlive = false;
  }

  // ── Timeout budget ─────────────────────────────────────────────────────────

  function timeoutFor(text) {
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount <= WORDS_BASELINE) return BASE_TIMEOUT_MS;
    const extra = Math.ceil((wordCount - WORDS_BASELINE) / 100) * MS_PER_EXTRA_100;
    return BASE_TIMEOUT_MS + extra;
  }

  // ── Main-thread fallback ───────────────────────────────────────────────────

  function scanOnMainThread(rawText) {
    console.log("[TrustPrompt/bridge] running scan on main thread");
    try {
      const t0     = performance.now();
      const result = TrustScanner.scan(rawText);
      result.elapsedMs = Math.round(performance.now() - t0);
      return Promise.resolve(result);
    } catch (err) {
      console.error("[TrustPrompt/bridge] main-thread scan error:", err);
      // Return a safe default so the UI never stays stuck on "Scanning…"
      return Promise.resolve({
        findings: [], riskLevel: "none", score: 0,
        normalisedText: rawText, wasCapsConverted: false, elapsedMs: 0
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Scan rawText. Returns a Promise that resolves with the result object.
   * If the Worker exceeds its time budget, falls back to main-thread scan.
   *
   * @param {string} rawText
   * @returns {Promise<{ findings, riskLevel, score, normalisedText, wasCapsConverted, elapsedMs }>}
   */
  function scan(rawText) {
    if (!rawText || !rawText.trim()) {
      return Promise.resolve({
        findings: [], riskLevel: "none", score: 0,
        normalisedText: "", wasCapsConverted: false, elapsedMs: 0
      });
    }

    if (!workerAlive) {
      return scanOnMainThread(rawText);
    }

    const scanId  = ++scanIdCounter;
    const timeout = timeoutFor(rawText);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Worker timed out — fall back to main thread
        if (pending.has(scanId)) {
          pending.delete(scanId);
          console.warn(`[TrustPrompt/bridge] Worker timed out after ${timeout}ms — falling back`);
          scanOnMainThread(rawText).then(resolve).catch(reject);
        }
      }, timeout);

      pending.set(scanId, { resolve, reject, timer });
      worker.postMessage({ type: "SCAN", rawText, scanId });
    });
  }

  // Initialise on load
  initWorker();

  return { scan };

})();
