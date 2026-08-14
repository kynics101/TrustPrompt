// dom-chatgpt.js — TrustPrompt ChatGPT DOM driver v0.0.6
/* global TrustWorkerBridge, TrustUI, chrome */

console.log("[TrustPrompt] ChatGPT driver loaded");

const TP_CHATGPT = (() => {

  const DEBOUNCE_MS          = 400;
  const OBSERVER_DEBOUNCE_MS = 120;

  // ── Scan state machine ────────────────────────────────────────────────────
  // IDLE     → box empty / freshly loaded, no pending scan
  // PENDING  → user typed, debounce timer is running
  // SCANNING → debounce fired, worker is running
  // DONE     → scan completed, lastResult is valid
  const STATE = { IDLE: "IDLE", PENDING: "PENDING", SCANNING: "SCANNING", DONE: "DONE" };
  let scanState      = STATE.IDLE;

  let promptBox          = null;
  let debounceTimer      = null;
  let observerDebounce   = null;
  let lastScannedText    = "";
  let pendingScanPromise = null;
  let lastResult         = null;

  // Track which elements already have listeners so we never double-attach
  const listenedElements = new WeakSet();

  // ── 1. CASCADING SELECTOR ─────────────────────────────────────────────────

  function findPromptBox() {
    // Layer 1 — ARIA / Role
    for (const sel of [
      '[aria-label="Message ChatGPT"]', '[aria-label="Send a message"]',
      '[aria-label="Message"]', 'div[contenteditable="true"][aria-label]',
      'div[contenteditable="true"][role="textbox"]',
      '[aria-describedby*="prompt"]', '[role="textbox"]'
    ]) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) { console.log("[TP/chatgpt] ARIA:", sel); return el; }
    }
    // Layer 2 — Form anchor
    for (const sel of [
      'main form div[contenteditable="true"]', 'main form textarea',
      'form div[contenteditable="true"]', 'form textarea'
    ]) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) { console.log("[TP/chatgpt] Form:", sel); return el; }
    }
    // Layer 3 — Attribute wildcard
    const wc = document.querySelectorAll(
      '[id*="prompt"],[id*="composer"],[id*="chat-input"],[id*="message-input"],' +
      '[class*="ProseMirror"],[class*="composer"],[class*="chat-input"]'
    );
    for (const el of wc) {
      if ((el.tagName === "TEXTAREA" || el.contentEditable === "true") && isVisible(el)) {
        console.log("[TP/chatgpt] Wildcard"); return el;
      }
    }
    // Layer 4 — Visible text / placeholder proximity + send-button sibling
    const edits = document.querySelectorAll('textarea,div[contenteditable="true"]');
    for (const el of edits) {
      if (/message|prompt|ask|type|send/i.test(el.getAttribute("placeholder") || "") && isVisible(el)) {
        console.log("[TP/chatgpt] Placeholder"); return el;
      }
    }
    const sb = findSendButton();
    if (sb) {
      const c = sb.closest('form,[class*="composer"],[class*="input"]');
      if (c) { const i = c.querySelector('textarea,div[contenteditable="true"]');
               if (i && isVisible(i)) { console.log("[TP/chatgpt] SendSibling"); return i; } }
    }
    // Layer 5 — Last resort: first visible editable
    for (const el of edits) {
      if (isVisible(el)) { console.warn("[TP/chatgpt] Fallback"); return el; }
    }
    return null;
  }

  // ── 1b. EVENT-PROXIMITY DETECTION ─────────────────────────────────────────
  // If findPromptBox() returned null (UI changed), we piggyback on focus and
  // keydown events: the first editable element the user interacts with is
  // adopted as the prompt box. This is our "keyboard / mouse event" fallback.

  function onProximityEvent(e) {
    if (promptBox && isVisible(promptBox)) return; // already have a valid box
    const t = e.target;
    if (!t || !(t.tagName === "TEXTAREA" || t.contentEditable === "true")) return;
    if (!isVisible(t)) return;
    console.log("[TP/chatgpt] ProximityEvent — adopting element via", e.type);
    adoptPromptBox(t);
  }

  document.addEventListener("focusin", onProximityEvent, true);
  document.addEventListener("keydown", (e) => {
    // Only fire when no box yet and a printable key is pressed
    if (promptBox && isVisible(promptBox)) return;
    if (e.key.length !== 1 && e.key !== "Backspace") return;
    onProximityEvent(e);
  }, true);

  function findSendButton() {
    return (
      document.querySelector('button[aria-label="Send prompt"]')  ||
      document.querySelector('button[aria-label="Send message"]') ||
      document.querySelector('button[data-testid="send-button"]') ||
      [...document.querySelectorAll("button")].find(b =>
        /^send$/i.test((b.getAttribute("aria-label") || b.textContent).trim()))
    );
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect(), s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  }

  // ── 2. TEXT HELPERS ───────────────────────────────────────────────────────

  function extractText(el) {
    return (!el ? "" : (el.tagName === "TEXTAREA" ? el.value : el.innerText)) || "";
  }

  function buildSafeText(orig, findings) {
    let safe = orig;
    for (const f of [...findings].sort((a,b) => b.rawMatch.length - a.rawMatch.length)) {
      const e = f.rawMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      safe = safe.replace(new RegExp(e, "g"), f.safeVersion);
    }
    return safe;
  }

  // ── 3. SCAN ───────────────────────────────────────────────────────────────

  function triggerScan(rawText) {
    scanState          = STATE.SCANNING;
    lastScannedText    = rawText;
    pendingScanPromise = TrustWorkerBridge.scan(rawText)
      .then(result => {
        scanState  = STATE.DONE;
        lastResult = result;
        applyResult(result, rawText);
        if (pendingSubmitResolver) {
          const resolve = pendingSubmitResolver;
          pendingSubmitResolver = null;
          resolve(result);
        }
        return result;
      })
      .catch(err => {
        console.error("[TP/chatgpt] scan failed, defaulting to safe:", err);
        const fallback = { findings: [], riskLevel: "none", score: 0 };
        scanState  = STATE.DONE;
        lastResult = fallback;
        applyResult(fallback, rawText);
        if (pendingSubmitResolver) {
          const resolve = pendingSubmitResolver;
          pendingSubmitResolver = null;
          resolve(fallback);
        }
      });
    return pendingScanPromise;
  }

  function applyResult(result, rawText) {
    const { findings, riskLevel } = result;
    const safeText   = buildSafeText(rawText, findings);
    const composerEl = getComposerCard();
    TrustUI.update(riskLevel, findings, safeText, promptBox, composerEl,
      () => { TrustUI.reset(promptBox); chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" }); }
    );
    chrome.runtime.sendMessage({ type: "SCAN_RESULT", riskLevel, findings, rawText });
  }

  // Walk up from the textarea to find the outermost card/form wrapper
  function getComposerCard() {
    if (!promptBox) return promptBox;
    let el = promptBox.parentElement, best = el;
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.width > 400) { best = el; break; }
      best = el;
      el = el.parentElement;
    }
    return best;
  }

  // Legacy alias used in init/observer
  function getComposerWrapper() { return getComposerCard(); }

  // ── 4. SUBMIT BLOCKING ────────────────────────────────────────────────────
  //
  // One resolver slot: when submit is intercepted while PENDING or SCANNING,
  // we store a resolver here. triggerScan() calls it when the result arrives,
  // and the intercept handler acts on the result (allow or show panel).
  let pendingSubmitResolver = null;

  // Returns a Promise that resolves with the scan result.
  // - If already DONE:    resolves immediately with lastResult.
  // - If SCANNING:        waits for the running scan to finish.
  // - If PENDING/IDLE:    fast-tracks the scan right now (skips debounce).
  function awaitScan() {
    if (scanState === STATE.DONE && lastResult) {
      return Promise.resolve(lastResult);
    }
    if (scanState === STATE.SCANNING && pendingScanPromise) {
      return new Promise(resolve => { pendingSubmitResolver = resolve; });
    }
    // PENDING or IDLE — cancel debounce and scan immediately
    clearTimeout(debounceTimer);
    const raw = extractText(promptBox);
    if (!raw.trim()) {
      return Promise.resolve({ findings: [], riskLevel: "none", score: 0 });
    }
    return new Promise(resolve => {
      pendingSubmitResolver = resolve;
      TrustUI.setScanning(promptBox);
      triggerScan(raw);
    });
  }

  // The single entry point for all submit attempts (Enter key + send button).
  function handleSubmitAttempt(e) {
    if (!promptBox) return;
    const raw = extractText(promptBox);
    if (!raw.trim()) return; // empty box — let it through

    if (e) e.preventDefault();

    console.log("[TP/chatgpt] submit intercepted — state:", scanState);

    awaitScan().then(result => {
      if (result.riskLevel === "none") {
        console.log("[TP/chatgpt] scan clear — releasing submit");
        releaseSubmit(e);
      } else {
        console.log("[TP/chatgpt] submit blocked — risk level:", result.riskLevel);
      }
    });
  }

  // Re-fire the submit that was blocked.
  function releaseSubmit(originalEvent) {
    if (originalEvent && originalEvent.type === "keydown") {
      const synth = new KeyboardEvent("keydown", {
        key: "Enter", code: "Enter", keyCode: 13,
        bubbles: true, cancelable: true, composed: true
      });
      synth._tpRelease = true;
      promptBox.dispatchEvent(synth);
    } else {
      findSendButton()?.click();
    }
  }

  // ── Legacy helpers (kept for applyResult compat) ─────────────────────────

  // ── 5. INPUT LISTENER ────────────────────────────────────────────────────

  function onInput() {
    TrustUI.setScanning(promptBox);
    clearTimeout(debounceTimer);
    scanState  = STATE.PENDING;
    lastResult = null;

    debounceTimer = setTimeout(() => {
      if (!promptBox) return;
      const rawText = extractText(promptBox);
      if (!rawText.trim()) {
        scanState = STATE.IDLE;
        TrustUI.reset(promptBox);
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
        lastScannedText = ""; return;
      }
      if (rawText === lastScannedText) {
        scanState = STATE.DONE;
        return;
      }
      triggerScan(rawText);
    }, DEBOUNCE_MS);
  }

  function attachListeners(el) {
    if (listenedElements.has(el)) return; // idempotent guard
    listenedElements.add(el);
    el.addEventListener("input",  onInput);
    el.addEventListener("keyup",  onInput);
    el.addEventListener("paste", () => setTimeout(onInput, 0));
  }

  // Central helper: switch to a new prompt box, tear down old UI, re-attach
  function adoptPromptBox(el) {
    if (el === promptBox) return;
    promptBox = el;
    scanState  = STATE.IDLE;
    lastResult = null; lastScannedText = "";
    pendingSubmitResolver = null;
    TrustUI.teardown();
    TrustUI.setScanning(promptBox);
    attachListeners(promptBox);
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
    console.log("[TP/chatgpt] prompt box adopted:", el.tagName,
      el.getAttribute("aria-label") || el.className.slice(0, 40));
  }

  // ── Submit intercept — Enter key ──────────────────────────────────────────
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e._tpRelease) return; // synthetic release event — let it through
    if (!promptBox || !isVisible(promptBox)) return;
    handleSubmitAttempt(e);
  }, true);

  // ── Submit intercept — send button click ──────────────────────────────────
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const lbl = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
    if (!lbl.includes("send")) return;
    if (!promptBox || !isVisible(promptBox)) return;
    handleSubmitAttempt(e);
  }, true);

  // ── 6. MUTATION OBSERVER + INIT ──────────────────────────────────────────

  const observer = new MutationObserver(() => {
    // Debounce the re-resolution check — React can fire hundreds of mutations
    // per interaction; we only need to act once the storm settles.
    clearTimeout(observerDebounce);
    observerDebounce = setTimeout(() => {
      if (!promptBox || !isVisible(promptBox)) {
        const found = findPromptBox();
        if (found && found !== promptBox) {
          adoptPromptBox(found);
          console.log("[TP/chatgpt] prompt box re-resolved via MutationObserver");
        }
      }
    }, OBSERVER_DEBOUNCE_MS);
  });

  // childList covers node insertions/removals (SPA navigation, lazy-loaded UI)
  // attributes covers aria-label / contenteditable swaps on existing nodes
  // subtree ensures we watch the entire document tree
  observer.observe(document.body, { childList: true, subtree: true, attributes: true });

  function init() {
    promptBox = findPromptBox();
    if (promptBox) {
      scanState = STATE.IDLE;
      TrustUI.setScanning(promptBox);
      attachListeners(promptBox);
      listenedElements.add(promptBox);
      console.log("[TP/chatgpt] init complete");
    } else {
      console.warn("[TP/chatgpt] not found — waiting via MutationObserver + ProximityEvents");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 600);

})();
