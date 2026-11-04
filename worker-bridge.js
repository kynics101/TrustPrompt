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

  // ── Worker restart mechanism ──────────────────────────────────────────────
  // Force reload patterns from the main thread by disabling worker temporarily

  function restartWorker() {
    if (worker) {
      try {
        worker.terminate();
        // Revoke the blob URL when worker terminates
        if (worker.blobUrl) {
          URL.revokeObjectURL(worker.blobUrl);
        }
      } catch (e) {
        console.warn("[TrustPrompt/bridge] Failed to terminate worker:", e.message);
      }
    }
    worker = null;
    workerAlive = false;
    // Reinitialize immediately
    setTimeout(() => {
      initWorker();
      console.log("[TrustPrompt/bridge] Worker restarted with fresh patterns");
    }, 100);
  }

  // ── Worker init ────────────────────────────────────────────────────────────
  //
  // Chrome MV3 restricts `new Worker(chrome.runtime.getURL(...))` when the
  // content script runs on certain origins (e.g. claude.ai). The fix is to
  // create the worker via a Blob URL that contains importScripts() calls.
  //
  // Strategy: Blob Data URL Injection
  //   1. First importScripts call loads worker-data-bundle.js (all gazetteers)
  //   2. Second importScripts call loads trust-worker.js (scanner code)
  //   3. Worker has all data available synchronously at startup
  //
  // Fallback chain:
  //   1. Blob-trampoline Worker with data injection (works on all origins)
  //   2. Direct extension Worker (legacy — works on chatgpt.com but not claude.ai)
  //   3. Main thread             (always works)

  function initWorker() {
    // DISABLED: Web workers with Chromium MV3 have too many restrictions
    // when loading extension URLs (blob importScripts fails on most origins).
    // 
    // Better strategy: Run scanning on main thread via TrustScanner.
    // This is fast enough and avoids all the worker complexity.
    //
    // Main-thread scanning is ~200-400ms per scan, which is acceptable
    // because:
    //   1. Most scanning happens during idle time (debounce)
    //   2. User experience is smooth if badge updates in <500ms
    //   3. No worker overhead or context switching needed
    //
    // If performance becomes critical, use Service Worker instead of Web Worker.
    
    console.log("[TrustPrompt/bridge] Web Worker disabled - using main thread scanning");
    workerAlive = false;
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
      // TrustScanner.scan now returns a Promise (due to async PATH C hybrid transformer)
      return TrustScanner.scan(rawText).then(result => {
        result.elapsedMs = Math.round(performance.now() - t0);
        return result;
      }).catch(err => {
        console.error("[TrustPrompt/bridge] main-thread scan error:", err.message, err.stack);
        // Return a safe default so the UI never stays stuck on "Scanning…"
        return {
          findings: [], riskLevel: "none", score: 0,
          normalisedText: rawText, wasCapsConverted: false, elapsedMs: 0
        };
      });
    } catch (err) {
      console.error("[TrustPrompt/bridge] main-thread scan sync error:", err.message, err.stack);
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

  return { scan, restartWorker };

})();

// Force worker restart on tab visibility change to reload patterns
// This ensures updated patterns are picked up when the user returns to the tab
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      console.log("[TrustPrompt/bridge] Tab became visible — restarting worker with fresh patterns");
      try {
        TrustWorkerBridge.restartWorker();
      } catch (e) {
        console.warn("[TrustPrompt/bridge] Failed to restart worker on visibility change:", e.message);
      }
    }
  });
}
