// dom-claude.js — TrustPrompt Claude DOM driver v0.0.7
/* global TrustWorkerBridge, TrustUI, chrome */

console.log("[TrustPrompt] Claude driver loaded");

const TP_CLAUDE = (() => {

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
  let pendingSubmitResolver = null;

  // Track which elements already have listeners so we never double-attach
  const listenedElements = new WeakSet();

  // ── 1. CASCADING SELECTOR ─────────────────────────────────────────────────

  function findPromptBox() {
    // Layer 1 — ARIA / Role (Claude's stable data-testid first)
    for (const sel of [
      '[data-testid="chat-input"]',
      '[aria-label="Write your prompt to Claude"]',
      '[aria-label="Chat input"]',
      'div[contenteditable="true"][aria-label]',
      'div[contenteditable="true"][role="textbox"]',
      '[role="textbox"]'
    ]) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) { console.log("[TP/claude] ARIA:", sel); return el; }
    }
    // Layer 2 — Form anchor
    for (const sel of [
      'form div[contenteditable="true"]', 'form textarea',
      'main div[contenteditable="true"]'
    ]) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) { console.log("[TP/claude] Form:", sel); return el; }
    }
    // Layer 3 — Attribute wildcard
    const wc = document.querySelectorAll(
      '[class*="ProseMirror"],[class*="chat-input"],[class*="composer"],' +
      '[id*="chat-input"],[id*="prompt"],[id*="composer"]'
    );
    for (const el of wc) {
      if ((el.tagName === "TEXTAREA" || el.contentEditable === "true") && isVisible(el)) {
        console.log("[TP/claude] Wildcard"); return el;
      }
    }
    // Layer 4 — Visible text / placeholder proximity + send-button sibling
    const edits = document.querySelectorAll('textarea,div[contenteditable="true"]');
    for (const el of edits) {
      if (/message|prompt|ask|reply|write/i.test(el.getAttribute("placeholder") || "") && isVisible(el)) {
        console.log("[TP/claude] Placeholder"); return el;
      }
    }
    const sb = findSendButton();
    if (sb) {
      const c = sb.closest('form,[class*="composer"],[class*="input-area"]');
      if (c) { const i = c.querySelector('div[contenteditable="true"],textarea');
               if (i && isVisible(i)) { console.log("[TP/claude] SendSibling"); return i; } }
    }
    // Layer 5 — Last resort: first visible editable
    for (const el of edits) {
      if (isVisible(el)) { console.warn("[TP/claude] Fallback"); return el; }
    }
    return null;
  }

  // ── 1b. EVENT-PROXIMITY DETECTION ─────────────────────────────────────────
  // If findPromptBox() returned null (UI changed), we piggyback on focus and
  // keydown events: the first editable element the user interacts with is
  // adopted as the prompt box. This is our "keyboard / mouse event" fallback.

  function onProximityEvent(e) {
    if (promptBox && isVisible(promptBox)) return;
    const t = e.target;
    if (!t || !(t.tagName === "TEXTAREA" || t.contentEditable === "true")) return;
    if (!isVisible(t)) return;
    console.log("[TP/claude] ProximityEvent — adopting element via", e.type);
    adoptPromptBox(t);
  }

  document.addEventListener("focusin", onProximityEvent, true);
  document.addEventListener("keydown", (e) => {
    if (promptBox && isVisible(promptBox)) return;
    if (e.key.length !== 1 && e.key !== "Backspace") return;
    onProximityEvent(e);
  }, true);

  function findSendButton() {
    return (
      document.querySelector('button[aria-label="Send message"]')  ||
      document.querySelector('button[aria-label="Send Message"]')  ||
      document.querySelector('button[data-testid="send-button"]')  ||
      [...document.querySelectorAll("button")].find(b =>
        /^send$/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()))
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

  // Single definition — walks up to the widest composer card
  function getComposerWrapper() {
    if (!promptBox) return null;
    let el = promptBox.parentElement, best = el;
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (r.width > 400) { best = el; break; }
      best = el;
      el = el.parentElement;
    }
    return best;
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
        console.error("[TP/claude] scan failed, defaulting to safe:", err);
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
    TrustUI.update(riskLevel, findings, safeText, promptBox, getComposerWrapper(),
      () => { TrustUI.reset(promptBox); chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" }); },
      null
    );
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel });
  }

  // ── 4. SUBMIT BLOCKING ────────────────────────────────────────────────────
  //
  // Claude uses ProseMirror which handles Enter internally. Two interception
  // points are needed:
  //   a) document capture (catches most cases)
  //   b) promptBox capture (catches ProseMirror's inner keydown before React)
  //
  // releaseSubmit always clicks the send button — synthetic KeyboardEvents
  // dispatched from outside React's tree are ignored by ProseMirror.

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
      TrustUI.setScanning(getComposerWrapper());
      triggerScan(raw);
    });
  }

  function handleSubmitAttempt(e) {
    if (!promptBox) return;
    const raw = extractText(promptBox);
    if (!raw.trim()) return; // empty box — let it through

    e.preventDefault();
    e.stopImmediatePropagation(); // stop ProseMirror's own handlers from firing

    console.log("[TP/claude] submit intercepted — state:", scanState);

    awaitScan().then(result => {
      if (result.riskLevel === "none") {
        console.log("[TP/claude] scan clear — releasing submit");
        releaseSubmit();
      } else {
        console.log("[TP/claude] submit blocked — risk level:", result.riskLevel);
      }
    });
  }

  // Claude's ProseMirror ignores synthetic KeyboardEvents from outside React.
  // The only reliable way to release is to click the actual send button.
  function releaseSubmit() {
    const btn = findSendButton();
    if (btn) {
      btn._tpRelease = true;
      btn.click();
    }
  }

  // ── 5. INPUT LISTENER ────────────────────────────────────────────────────

  function onInput() {
    TrustUI.setScanning(getComposerWrapper());
    clearTimeout(debounceTimer);
    scanState  = STATE.PENDING;
    lastResult = null;

    debounceTimer = setTimeout(() => {
      if (!promptBox) return;
      const rawText = extractText(promptBox);
      if (!rawText.trim()) {
        scanState = STATE.IDLE;
        TrustUI.reset(getComposerWrapper());
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

  // ── Enter key intercept on the promptBox element itself ───────────────────
  // Attached here so it captures before ProseMirror's own keydown handlers.
  function onPromptBoxKeydown(e) {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e._tpRelease) return;
    handleSubmitAttempt(e);
  }

  function attachListeners(el) {
    if (listenedElements.has(el)) return;
    listenedElements.add(el);
    el.addEventListener("input",   onInput);
    el.addEventListener("keyup",   onInput);
    el.addEventListener("paste",   () => setTimeout(onInput, 0));
    // Capture on the element itself — fires before ProseMirror's handlers
    el.addEventListener("keydown", onPromptBoxKeydown, true);
  }

  // Central helper: switch to a new prompt box, tear down old UI, re-attach
  function adoptPromptBox(el) {
    if (el === promptBox) return;
    promptBox = el;
    scanState  = STATE.IDLE;
    lastResult = null; lastScannedText = "";
    pendingSubmitResolver = null;
    TrustUI.teardown();
    TrustUI.setScanning(getComposerWrapper());
    attachListeners(promptBox);
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
    console.log("[TP/claude] prompt box adopted:", el.tagName,
      el.getAttribute("aria-label") || el.className.slice(0, 40));
  }

  // ── Submit intercept — document-level capture (send button + Enter fallback)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e._tpRelease) return;
    if (!promptBox || !isVisible(promptBox)) return;
    // The promptBox listener handles this if it fires first; this is a fallback
    // for cases where the event target is outside the promptBox subtree.
    if (promptBox.contains(e.target)) return; // already handled above
    handleSubmitAttempt(e);
  }, true);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn._tpRelease) { btn._tpRelease = false; return; } // our own release click
    const lbl = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
    if (!lbl.includes("send")) return;
    if (!promptBox || !isVisible(promptBox)) return;
    handleSubmitAttempt(e);
  }, true);

  // ── 6. MUTATION OBSERVER + INIT ──────────────────────────────────────────

  const observer = new MutationObserver(() => {
    clearTimeout(observerDebounce);
    observerDebounce = setTimeout(() => {
      if (!promptBox || !isVisible(promptBox)) {
        const found = findPromptBox();
        if (found && found !== promptBox) {
          adoptPromptBox(found);
          console.log("[TP/claude] prompt box re-resolved via MutationObserver");
        }
      }
    }, OBSERVER_DEBOUNCE_MS);
  });

  observer.observe(document.body, { childList: true, subtree: true, attributes: true });

  function init() {
    promptBox = findPromptBox();
    if (promptBox) {
      scanState = STATE.IDLE;
      TrustUI.setScanning(getComposerWrapper());
      attachListeners(promptBox);
      listenedElements.add(promptBox);
      console.log("[TP/claude] init complete");
    } else {
      console.warn("[TP/claude] not found — waiting via MutationObserver + ProximityEvents");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 600);

})();
