// dom-chatgpt.js — TrustPrompt ChatGPT DOM driver v0.0.4
/* global TrustWorkerBridge, TrustUI, chrome */

console.log("[TrustPrompt] ChatGPT driver loaded");

const TP_CHATGPT = (() => {

  const DEBOUNCE_MS = 400;

  let promptBox          = null;
  let debounceTimer      = null;
  let lastScannedText    = "";
  let scanInProgress     = false;
  let pendingScanPromise = null;
  let lastResult         = null;
  let submitBlocked      = false;

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
    // Layer 4 — Placeholder / send-button sibling
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
    // Layer 5 — Last resort
    for (const el of edits) {
      if (isVisible(el)) { console.warn("[TP/chatgpt] Fallback"); return el; }
    }
    return null;
  }

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
    scanInProgress     = true;
    pendingScanPromise = TrustWorkerBridge.scan(rawText)
      .then(result => {
        scanInProgress = false;
        lastResult     = result;
        applyResult(result, rawText);
        if (submitBlocked) { submitBlocked = false; handleUnblock(result, rawText); }
        return result;
      })
      .catch(err => {
        scanInProgress = false;
        submitBlocked  = false;
        console.error("[TP/chatgpt] scan failed, defaulting to safe:", err);
        // Treat as safe so the UI doesn't stay stuck on "Scanning…"
        const fallback = { findings: [], riskLevel: "none", score: 0 };
        lastResult = fallback;
        applyResult(fallback, rawText);
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
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel });
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

  function handleSubmitAttempt(e) {
    if (!scanInProgress && lastResult) {
      if (lastResult.riskLevel === "none") return; // safe, allow through
      if (e) e.preventDefault();
      return;
    }
    if (scanInProgress && pendingScanPromise) {
      if (e) e.preventDefault();
      submitBlocked = true;
      console.log("[TP/chatgpt] submit blocked — waiting for scan");
    }
  }

  function handleUnblock(result, rawText) {
    if (result.riskLevel === "none") {
      console.log("[TP/chatgpt] safe — releasing submit");
      findSendButton()?.click();
    } else {
      applyResult(result, rawText);
    }
  }

  // ── 5. INPUT LISTENER ────────────────────────────────────────────────────

  function onInput() {
    TrustUI.setScanning(promptBox);
    clearTimeout(debounceTimer);
    lastResult = null; submitBlocked = false;

    debounceTimer = setTimeout(() => {
      if (!promptBox) return;
      const rawText = extractText(promptBox);
      if (!rawText.trim()) {
        TrustUI.reset(promptBox);
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
        lastScannedText = ""; return;
      }
      if (rawText === lastScannedText) return;
      lastScannedText = rawText;
      triggerScan(rawText);
    }, DEBOUNCE_MS);
  }

  function attachListeners(el) {
    el.addEventListener("input",  onInput);
    el.addEventListener("keyup",  onInput);
    el.addEventListener("paste", () => setTimeout(onInput, 0));
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    clearTimeout(debounceTimer);
    handleSubmitAttempt(e);
    if (!scanInProgress && promptBox) {
      const raw = extractText(promptBox);
      if (raw.trim() && raw !== lastScannedText) {
        lastScannedText = raw; submitBlocked = true;
        e.preventDefault(); triggerScan(raw);
      }
    }
  }, true);

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const lbl = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
    if (!lbl.includes("send")) return;
    clearTimeout(debounceTimer);
    handleSubmitAttempt(e);
    if (!scanInProgress && promptBox) {
      const raw = extractText(promptBox);
      if (raw.trim() && raw !== lastScannedText) {
        lastScannedText = raw; submitBlocked = true;
        e.preventDefault(); triggerScan(raw);
      }
    }
  }, true);

  // ── 6. MUTATION OBSERVER + INIT ──────────────────────────────────────────

  const observer = new MutationObserver(() => {
    if (!promptBox || !isVisible(promptBox)) {
      const found = findPromptBox();
      if (found && found !== promptBox) {
        promptBox = found; lastResult = null; lastScannedText = ""; submitBlocked = false;
        TrustUI.teardown();
        // Show scanning badge immediately
        TrustUI.setScanning(promptBox);
        attachListeners(promptBox);
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
        console.log("[TP/chatgpt] prompt box re-resolved");
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function init() {
    promptBox = findPromptBox();
    if (promptBox) {
      TrustUI.setScanning(promptBox);
      attachListeners(promptBox);
      console.log("[TP/chatgpt] init complete");
    } else {
      console.warn("[TP/chatgpt] not found — waiting via MutationObserver");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 600);

})();
