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
    console.log("[TP/chatgpt] triggerScan called with:", rawText.substring(0, 50));
    scanState          = STATE.SCANNING;
    lastScannedText    = rawText;
    
    console.log("[TP/chatgpt] typeof TrustWorkerBridge:", typeof TrustWorkerBridge);
    
    if (typeof TrustWorkerBridge === 'undefined') {
      console.error("[TP/chatgpt] TrustWorkerBridge is not defined!");
      const fallback = { findings: [], riskLevel: "none", score: 0 };
      applyResult(fallback, rawText);
      return Promise.resolve(fallback);
    }
    
    try {
      console.log("[TP/chatgpt] Calling TrustWorkerBridge.scan()");
      pendingScanPromise = TrustWorkerBridge.scan(rawText)
        .then(result => {
          console.log("[TP/chatgpt] Scan promise resolved");
          scanState  = STATE.DONE;
          lastResult = result;
          applyResult(result, rawText);
          return result;
        })
        .catch(err => {
          console.error("[TP/chatgpt] scan promise rejected:", err);
          const fallback = { findings: [], riskLevel: "none", score: 0 };
          scanState  = STATE.DONE;
          lastResult = fallback;
          applyResult(fallback, rawText);
          return fallback;
        });
    } catch (syncError) {
      console.error("[TP/chatgpt] sync error calling TrustWorkerBridge.scan():", syncError);
      const fallback = { findings: [], riskLevel: "none", score: 0 };
      scanState  = STATE.DONE;
      lastResult = fallback;
      applyResult(fallback, rawText);
      return Promise.resolve(fallback);
    }
    
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
  // Simple approach: only block when scan is PENDING (hasn't started yet).
  // If scan is SCANNING or DONE, let it through.
  // When user presses Enter during PENDING, cancel debounce and trigger scan NOW.

  function showToast(message) {
    // Remove any existing toast
    const existing = document.getElementById("tp-submit-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "tp-submit-toast";
    toast.setAttribute("style", 
      "position:fixed !important;" +
      "bottom:20px !important;" +
      "left:50% !important;" +
      "transform:translateX(-50%) !important;" +
      "background:#f97316 !important;" +
      "color:#fff !important;" +
      "padding:12px 20px !important;" +
      "border-radius:8px !important;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif !important;" +
      "font-size:13px !important;" +
      "font-weight:500 !important;" +
      "z-index:99999 !important;" +
      "box-shadow:0 4px 12px rgba(0,0,0,0.3) !important;" +
      "pointer-events:auto !important;"
    );

    // Add animation style if not present
    if (!document.getElementById("tp-toast-styles")) {
      const style = document.createElement("style");
      style.id = "tp-toast-styles";
      style.textContent = `
        @keyframes tp-slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
        #tp-submit-toast {
          animation: tp-slideUp 0.3s ease-out !important;
        }
      `;
      document.head.appendChild(style);
    }

    toast.textContent = message;
    document.body.appendChild(toast);
    console.log("[TP/chatgpt] Toast shown:", message);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 3000);
  }

  function handleSubmitAttempt(e) {
    if (!promptBox) return;
    const raw = extractText(promptBox);
    if (!raw.trim()) return; // empty box — let it through

    // ALWAYS prevent Enter from going through initially
    if (e && e.key === "Enter") {
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    // Only block further if we're in PENDING state (debounce running, scan hasn't started yet)
    if (scanState !== STATE.PENDING) {
      console.log("[TP/chatgpt] handleSubmitAttempt — state is", scanState, "allowing through");
      // State is DONE or SCANNING — let the original event continue by manually clicking send
      if (e && e.key === "Enter") {
        const btn = findSendButton();
        if (btn) {
          console.log("[TP/chatgpt] Clicking send button since scan is complete");
          btn.click();
        }
      }
      return;
    }

    // We're in PENDING — block and trigger scan immediately
    console.log("[TP/chatgpt] handleSubmitAttempt — state is PENDING, blocking and triggering scan");
    showToast("🔍 Starting scan…");

    // Cancel debounce and scan immediately
    clearTimeout(debounceTimer);
    TrustUI.setScanning(promptBox);
    triggerScan(raw).then(() => {
      console.log("[TP/chatgpt] Scan complete, user should now retry submission");
      showToast("✓ Scan complete — ready to send");
    });
  }

  // ── 5. INPUT LISTENER ────────────────────────────────────────────────────

  function onInput() {
    console.log("[TP/chatgpt] onInput triggered");
    TrustUI.setScanning(promptBox);
    clearTimeout(debounceTimer);
    scanState  = STATE.PENDING;
    lastResult = null;

    debounceTimer = setTimeout(() => {
      if (!promptBox) return;
      const rawText = extractText(promptBox);
      console.log("[TP/chatgpt] Debounce fired, text:", rawText.substring(0, 50));
      if (!rawText.trim()) {
        scanState = STATE.IDLE;
        TrustUI.reset(promptBox);
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
        lastScannedText = ""; return;
      }
      if (rawText === lastScannedText) {
        console.log("[TP/chatgpt] Text unchanged, skipping scan");
        scanState = STATE.DONE;
        return;
      }
      console.log("[TP/chatgpt] Triggering scan");
      triggerScan(rawText);
    }, DEBOUNCE_MS);
  }

  function attachListeners(el) {
    if (listenedElements.has(el)) {
      console.log("[TP/chatgpt] Listeners already attached to this element");
      return; // idempotent guard
    }
    listenedElements.add(el);
    console.log("[TP/chatgpt] Attaching input/keyup/paste listeners to element:", el.tagName, el.className.slice(0, 50));
    el.addEventListener("input",  onInput);
    el.addEventListener("keyup",  onInput);
    el.addEventListener("paste", () => setTimeout(onInput, 0));
    console.log("[TP/chatgpt] Listeners attached successfully");
  }

  // Central helper: switch to a new prompt box, tear down old UI, re-attach
  function adoptPromptBox(el) {
    if (el === promptBox) return;
    promptBox = el;
    scanState  = STATE.IDLE;
    lastResult = null; lastScannedText = "";
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
