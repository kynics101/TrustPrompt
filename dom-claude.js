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

  // ── Scan token system (for interruption handling) ──────────────────────────
  let scanToken = 0;
  let activeScanToken = null;

  // Track which elements already have listeners so we never double-attach
  const listenedElements = new WeakSet();

  // ── Performance tracking ──────────────────────────────────────────────────
  let performanceMarkers = {};

  function markStart(label) {
    performance.mark(`${label}-start`);
    performanceMarkers[label] = performance.now();
  }

  function markEnd(label) {
    performance.mark(`${label}-end`);
    const duration = performance.now() - performanceMarkers[label];
    console.log(`[TrustPrompt/Performance] ${label}: ${duration.toFixed(2)}ms`);
    performanceMarkers[`${label}-duration`] = duration;
    return duration;
  }

  function reportScanTiming() {
    const total = performanceMarkers['scan-total-duration'] || 0;
    const workerCall = performanceMarkers['scan-worker-call-duration'] || 0;
    const resultApply = performanceMarkers['scan-result-apply-duration'] || 0;
    
    console.group("[TrustPrompt/Performance] Scan Timeline Summary");
    console.log(`Total scan time: ${total.toFixed(2)}ms`);
    console.log(`  ├─ Worker call (async): ${workerCall.toFixed(2)}ms`);
    console.log(`  └─ Result rendering: ${resultApply.toFixed(2)}ms`);
    console.groupEnd();
  }

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

  let allowSubmit = false; // Flag to control whether submission is allowed

  function triggerScan(rawText) {
    // Performance tracking START
    markStart('scan-total');
    
    // Increment scan token and mark as active
    scanToken++;
    activeScanToken = scanToken;
    const currentToken = scanToken;  // Capture in closure
    
    scanState          = STATE.SCANNING;
    lastScannedText    = rawText;
    allowSubmit        = false;
    console.log("[TP/claude] triggerScan starting — state:", STATE.SCANNING, "token:", currentToken);
    makePromptBoxReadOnly(); // Make promptBox non-editable during scan
    updateSendButtonState();
    
    markStart('scan-worker-call');
    pendingScanPromise = TrustWorkerBridge.scan(rawText)
      .then(result => {
        markEnd('scan-worker-call');
        
        // Only apply result if this scan is still the active one
        if (currentToken !== activeScanToken) {
          console.log("[TP/claude] Scan interrupted, discarding stale results (token mismatch)");
          return result;  // Don't apply
        }
        
        console.log("[TP/claude] triggerScan complete — riskLevel:", result.riskLevel);
        
        markStart('scan-result-apply');
        scanState  = STATE.DONE;
        lastResult = result;
        allowSubmit = true;
        applyResult(result, rawText);
        makePromptBoxEditable(); // Make promptBox editable again
        updateSendButtonState();
        markEnd('scan-result-apply');
        
        markEnd('scan-total');
        reportScanTiming();  // Report the timing summary
        
        return result;
      })
      .catch(err => {
        console.error("[TP/claude] scan failed:", err);
        markEnd('scan-worker-call');
        
        // Don't apply fallback if this scan was interrupted
        if (currentToken !== activeScanToken) {
          console.log("[TP/claude] Scan interrupted before completion, ignoring error");
          return;
        }
        
        const fallback = { findings: [], riskLevel: "none", score: 0 };
        
        markStart('scan-result-apply');
        scanState  = STATE.DONE;
        lastResult = fallback;
        allowSubmit = true;
        applyResult(fallback, rawText);
        makePromptBoxEditable(); // Make promptBox editable again
        updateSendButtonState();
        markEnd('scan-result-apply');
        
        markEnd('scan-total');
        reportScanTiming();  // Report the timing summary
        
        return fallback;
      });
    return pendingScanPromise;
  }

  function updateSendButtonState() {
    const btn = findSendButton();
    if (!btn) return;
    if (scanState === STATE.SCANNING || !allowSubmit) {
      console.log("[TP/claude] Disabling send button — scan in progress");
      btn.disabled = true;
      btn.setAttribute("data-disabled-by-trustprompt", "true");
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
    } else {
      console.log("[TP/claude] Enabling send button");
      btn.disabled = false;
      btn.removeAttribute("data-disabled-by-trustprompt");
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    }
  }

  function applyResult(result, rawText) {
    const { findings, riskLevel } = result;
    const safeText   = buildSafeText(rawText, findings);
    TrustUI.update(riskLevel, findings, safeText, promptBox, getComposerWrapper(), sendAnyway);
    
    // Send message to background script, with error handling for invalidated contexts
    try {
      chrome.runtime.sendMessage({ type: "SCAN_RESULT", riskLevel, findings, rawText });
    } catch (err) {
      // Extension context invalidated (e.g., during reload) — this is non-fatal
      console.warn("[TP/claude] Failed to send SCAN_RESULT (extension reloaded?):", err.message);
    }
  }

  // ── SEND ANYWAY ────────────────────────────────────────────────────────────
  // Submit the user's original prompt immediately, exactly like the native send
  // button. Clears the submission gate, unlocks the prompt box (Claude makes it
  // read-only during the warning state), re-enables the native button, then
  // clicks it — the send primitive used everywhere else in this driver.
  function sendAnyway() {
    allowSubmit = true;
    scanState   = STATE.DONE;
    makePromptBoxEditable();
    updateSendButtonState();

    const btn = findSendButton();
    if (btn) {
      console.log("[TP/claude] Send Anyway — clicking native send button");
      btn.click();
    } else {
      console.warn("[TP/claude] Send Anyway — send button not found");
    }

    // Tear down the TrustPrompt UI completely rather than resetting to a "none"
    // badge. The prompt box is cleared and the composer reflows as the response
    // renders; a persisted badge would be repositioned over the response
    // content. teardown() removes the badge and clears _currentInputEl so the
    // scroll/resize repositioner no-ops. The driver re-establishes the badge on
    // the next input/scan via its listeners.
    TrustUI.teardown();
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
  }

  // ── PROMPT BOX CONTROL ─────────────────────────────────────────────────
  // Strategy: Make promptBox read-only while scanning to prevent any submission
  
  function makePromptBoxReadOnly() {
    if (!promptBox) return;
    console.log("[TP/claude] Making promptBox READ-ONLY");
    
    if (promptBox.tagName === "TEXTAREA") {
      promptBox.readOnly = true;
    } else if (promptBox.contentEditable === "true") {
      promptBox.contentEditable = "false";
      promptBox.setAttribute("data-tp-readonly", "true");
    }
    
    // Also disable pointer events to prevent any interaction
    promptBox.style.pointerEvents = "none";
    promptBox.style.opacity = "0.6";
  }
  
  function makePromptBoxEditable() {
    if (!promptBox) return;
    console.log("[TP/claude] Making promptBox EDITABLE again");
    
    if (promptBox.tagName === "TEXTAREA") {
      promptBox.readOnly = false;
    } else {
      // For contentEditable divs, we need to set it directly
      promptBox.setAttribute("contenteditable", "true");
      promptBox.removeAttribute("data-tp-readonly");
    }
    
    // Re-enable interactions
    promptBox.style.pointerEvents = "auto";
    promptBox.style.opacity = "1";
    
    // Force focus back to promptBox so user can continue typing
    setTimeout(() => {
      if (promptBox) {
        promptBox.focus();
        console.log("[TP/claude] promptBox refocused");
      }
    }, 100);
  }

  // ── SCAN INTERRUPTION ─────────────────────────────────────────────────────
  // Interrupt the current scan when user types (except Enter/Shift+Enter)
  // This allows users to continue typing while analysis is in progress
  
  function interruptScan() {
    if (scanState !== STATE.SCANNING) return;
    
    console.log("[TP/claude] Scan interrupted by keystroke");
    
    // Mark current scan as stale (results will be discarded when they arrive)
    activeScanToken = null;
    
    // Reset state to PENDING (debounce will handle next scan)
    scanState = STATE.PENDING;
    
    // Clear any existing debounce timer
    clearTimeout(debounceTimer);
    
    // Re-enable promptBox for typing immediately
    makePromptBoxEditable();
    updateSendButtonState();
    
    // Show user feedback
    showToast("Keystroke detected — restarting analysis");
    
    // Restart 400ms debounce timer for new scan
    debounceTimer = setTimeout(() => {
      if (!promptBox) return;
      const rawText = extractText(promptBox);
      console.log("[TP/claude] Debounce (after interrupt) fired, text:", rawText.substring(0, 50));
      
      if (!rawText.trim()) {
        scanState = STATE.IDLE;
        TrustUI.reset(getComposerWrapper());
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
        lastScannedText = ""; 
        return;
      }
      
      if (rawText === lastScannedText) {
        console.log("[TP/claude] Text unchanged after interrupt, scan still DONE");
        scanState = STATE.DONE;
        return;
      }
      
      console.log("[TP/claude] Debounce triggered after interrupt - starting new scan");
      scanState = STATE.SCANNING;
      allowSubmit = false;
      makePromptBoxReadOnly();
      triggerScan(rawText);
    }, DEBOUNCE_MS);
  }

  // ── AGGRESSIVE SEND BUTTON CONTROL ─────────────────────────────────────
  // Strategy: Hide/disable the real send button and only show it when scan is done
  
  let fakeSendButton = null; // Placeholder button shown while scanning
  let realSendButton = null; // Original send button
  
  function disableSendButton() {
    const btn = findSendButton();
    if (!btn) return;
    
    console.log("[TP/claude] DISABLING send button — hiding original, showing fake");
    realSendButton = btn;
    
    // Hide the real button
    btn.style.display = "none";
    
    // Create a fake disabled button in its place
    if (!fakeSendButton) {
      fakeSendButton = btn.cloneNode(true);
      fakeSendButton.id = "tp-fake-send-btn";
      fakeSendButton.disabled = true;
      fakeSendButton.style.opacity = "0.5";
      fakeSendButton.style.pointerEvents = "none";
      fakeSendButton.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log("[TP/claude] Fake button clicked — scan not complete");
        return false;
      };
      
      // Insert fake button where real one was
      btn.parentElement.insertBefore(fakeSendButton, btn);
    }
    fakeSendButton.style.display = "block";
  }
  
  function enableSendButton() {
    console.log("[TP/claude] ENABLING send button — showing original, hiding fake");
    
    // Hide fake button
    if (fakeSendButton) {
      fakeSendButton.style.display = "none";
    }
    
    // Show real button
    if (realSendButton) {
      realSendButton.style.display = "block";
    }
  }

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
      "animation:tp-slideUp 0.3s ease-out !important;" +
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
      `;
      document.head.appendChild(style);
    }

    toast.textContent = message;
    document.body.appendChild(toast);
    console.log("[TP/claude] Toast shown:", message);

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

    // If scan is SCANNING or blocked, do NOT allow submission yet
    if (scanState === STATE.SCANNING || !allowSubmit) {
      console.log("[TP/claude] handleSubmitAttempt — blocked. allowSubmit:", allowSubmit, "scanState:", scanState);
      
      // If we're in PENDING state (debounce running), cancel it and trigger scan immediately
      if (scanState === STATE.PENDING) {
        console.log("[TP/claude] Cancelling debounce and triggering immediate scan");
        clearTimeout(debounceTimer);
        scanState = STATE.SCANNING;
        allowSubmit = false;
        TrustUI.setScanning(getComposerWrapper());
        triggerScan(raw);
      }
      return;
    }

    // Allow submit - scan is DONE
    console.log("[TP/claude] handleSubmitAttempt — allowing submission");
    if (e && e.key === "Enter") {
      const btn = findSendButton();
      if (btn) {
        console.log("[TP/claude] Clicking send button");
        btn.click();
      }
    }
  }

  // ── 5. INPUT LISTENER ────────────────────────────────────────────────────

  function onInput() {
    // If scan is done, check if text has changed
    if (scanState === STATE.DONE) {
      const currentText = extractText(promptBox);
      if (currentText === lastScannedText) {
        console.log("[TP/claude] onInput ignored — text unchanged, scan still DONE");
        return;
      }
      // Text has changed, so reset and trigger new scan
      console.log("[TP/claude] Text changed after scan completed, triggering new scan");
      TrustUI.setScanning(getComposerWrapper());
      clearTimeout(debounceTimer);
      scanState = STATE.PENDING;
      lastResult = null;
    } else {
      // Normal path when not in DONE state
      TrustUI.setScanning(getComposerWrapper());
      clearTimeout(debounceTimer);
      scanState = STATE.PENDING;
      lastResult = null;
    }

    // Re-enable debounce timer - scan after 400ms of no typing
    debounceTimer = setTimeout(() => {
      if (!promptBox) return;
      const rawText = extractText(promptBox);
      console.log("[TP/claude] Debounce fired, text:", rawText.substring(0, 50));
      
      if (!rawText.trim()) {
        scanState = STATE.IDLE;
        TrustUI.reset(getComposerWrapper());
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
        lastScannedText = ""; 
        return;
      }
      
      if (rawText === lastScannedText) {
        console.log("[TP/claude] Text unchanged, scan already DONE");
        scanState = STATE.DONE;
        return;
      }
      
      console.log("[TP/claude] Debounce triggered - starting scan");
      scanState = STATE.SCANNING;
      allowSubmit = false;
      makePromptBoxReadOnly(); // Lock box during scan
      triggerScan(rawText);
    }, DEBOUNCE_MS);
  }

  // ── Enter key intercept on the promptBox element itself ───────────────────
  // Attached here so it captures before ProseMirror's own keydown handlers.
  function onPromptBoxKeydown(e) {
    // ── INTERRUPTION: Shift+Enter during SCANNING interrupts scan ──────────
    // Plain Enter during SCANNING still blocks (prevents submission)
    if (scanState === STATE.SCANNING) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Shift+Enter: interrupt scan and insert line break
        if (e.shiftKey) {
          console.log("[TP/claude] Shift+Enter during SCANNING — interrupting for line break");
          interruptScan();
          
          // Manually insert line break
          setTimeout(() => {
            if (promptBox && promptBox.contentEditable === "true") {
              document.execCommand("insertText", false, "\n");
            }
          }, 0);
          return false;
        }
        
        // Plain Enter: block it (prevent submission without scan)
        console.log("[TP/claude] Enter pressed during SCANNING — blocking (no submit without scan)");
        return false;
      }
      
      // Any other key: interrupt the scan
      if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
        console.log("[TP/claude] Interruption key pressed during SCANNING:", e.key);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Interrupt the scan and let the keystroke through
        interruptScan();
        
        // Re-enable the promptBox and allow the character to be typed
        setTimeout(() => {
          if (promptBox && promptBox.contentEditable === "true") {
            // Manually insert the character for contentEditable elements
            // (since we prevented default, the character won't appear automatically)
            if (e.key.length === 1) {
              document.execCommand("insertText", false, e.key);
            } else if (e.key === "Backspace") {
              document.execCommand("delete", false);
            } else if (e.key === "Delete") {
              document.execCommand("forwardDelete", false);
            }
          }
        }, 0);
        
        return false;
      }
    }
    
    // ── NORMAL ENTER KEY HANDLING ─────────────────────────────────────────
    if (e.key !== "Enter" || e.shiftKey) return;
    
    console.log("[TP/claude] Enter pressed — scanState:", scanState, "allowSubmit:", allowSubmit);
    
    // ALWAYS block Enter initially
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // If already DONE and allowed, allow submission
    if (scanState === STATE.DONE && allowSubmit) {
      console.log("[TP/claude] Enter ALLOWED — scan DONE, clicking send button");
      makePromptBoxEditable();
      const btn = findSendButton();
      if (btn) {
        btn.click();
      }
      return false;
    }
    
    // If scanning, just block - scan is in progress
    if (scanState === STATE.SCANNING) {
      console.log("[TP/claude] Enter BLOCKED — scan SCANNING");
      return false;
    }
    
    // If PENDING (debounce running), cancel debounce and scan immediately
    if (scanState === STATE.PENDING) {
      console.log("[TP/claude] Enter pressed during PENDING — cancel debounce and scan immediately");
      clearTimeout(debounceTimer);
      const raw = extractText(promptBox);
      if (raw.trim()) {
        scanState = STATE.SCANNING;
        allowSubmit = false;
        makePromptBoxReadOnly();
        TrustUI.setScanning(getComposerWrapper());
        triggerScan(raw);
      }
      return false;
    }
    
    // If IDLE with text, trigger scan
    if (scanState === STATE.IDLE) {
      console.log("[TP/claude] Enter pressed in IDLE state — triggering scan");
      const raw = extractText(promptBox);
      if (raw.trim()) {
        scanState = STATE.SCANNING;
        allowSubmit = false;
        makePromptBoxReadOnly();
        TrustUI.setScanning(getComposerWrapper());
        triggerScan(raw);
      }
      return false;
    }
    
    return false;
  }

  function attachListeners(el) {
    if (listenedElements.has(el)) return;
    listenedElements.add(el);
    el.addEventListener("input",   onInput);
    el.addEventListener("keyup",   onInput);
    el.addEventListener("paste",   () => {
      // Clear debounce timer and reset scan state when pasting new content
      clearTimeout(debounceTimer);
      scanState = STATE.IDLE;
      lastScannedText = "";
      lastResult = null;
      allowSubmit = false;
      setTimeout(onInput, 0);
    });
    // Capture on the element itself — fires before ProseMirror's handlers
    el.addEventListener("keydown", onPromptBoxKeydown, true);
  }

  // Central helper: switch to a new prompt box, tear down old UI, re-attach
  function adoptPromptBox(el) {
    if (el === promptBox) return;
    promptBox = el;
    scanState  = STATE.IDLE;
    lastResult = null; lastScannedText = "";
    TrustUI.teardown();
    TrustUI.setScanning(getComposerWrapper());
    attachListeners(promptBox);
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
    console.log("[TP/claude] prompt box adopted:", el.tagName,
      el.getAttribute("aria-label") || el.className.slice(0, 40));
  }

  // ── SEND_ANYWAY from side panel ───────────────────────────────────────────
  // The extension side panel also offers a "Send Anyway" button; honor it by
  // performing the same immediate submit as the in-page panel button.
  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "SEND_ANYWAY") {
      console.log("[TP/claude] SEND_ANYWAY received from side panel");
      sendAnyway();
    }
  });

  // ── Submit intercept — document-level capture (send button + Enter fallback)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if (!promptBox || !isVisible(promptBox)) return;
    
    // Block Enter key when scanning
    if (scanState === STATE.SCANNING) {
      console.log("[TP/claude] Enter key blocked — scan still in progress");
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    
    // The promptBox listener handles this if it fires first; this is a fallback
    // for cases where the event target is outside the promptBox subtree.
    if (promptBox.contains(e.target)) return; // already handled above
    handleSubmitAttempt(e);
  }, true);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const lbl = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
    if (!lbl.includes("send")) return;
    if (!promptBox || !isVisible(promptBox)) return;
    
    // Block send button clicks if scan is in progress or not allowed
    if (!allowSubmit || scanState === STATE.SCANNING) {
      console.log("[TP/claude] Send button click blocked — allowSubmit:", allowSubmit, "scanState:", scanState);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    
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
      attachListeners(promptBox);
      listenedElements.add(promptBox);
      
      // Check if textbox already contains text on reload
      const existingText = extractText(promptBox);
      if (existingText.trim()) {
        console.log("[TP/claude] Text found on reload, triggering scan:", existingText.substring(0, 50));
        triggerScan(existingText);
      } else {
        scanState = STATE.IDLE;
        TrustUI.setScanning(getComposerWrapper());
        console.log("[TP/claude] init complete — waiting for user input");
      }
    } else {
      console.warn("[TP/claude] not found — waiting via MutationObserver + ProximityEvents");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 600);

})();
