// dom-claude.js — TrustPrompt Claude DOM driver v0.0.4
/* global TrustWorkerBridge, TrustUI, chrome */

console.log("[TrustPrompt] Claude driver loaded");

const TP_CLAUDE = (() => {

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
    // Layer 4 — Placeholder / send-button sibling
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
    // Layer 5 — Last resort
    for (const el of edits) {
      if (isVisible(el)) { console.warn("[TP/claude] Fallback"); return el; }
    }
    return null;
  }

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

  function getComposerWrapper() {
    if (!promptBox) return null;
    let el = promptBox.parentElement;
    while (el && el !== document.body) {
      if (el.getBoundingClientRect().width > 200) return el;
      el = el.parentElement;
    }
    return promptBox.parentElement;
  }

  // ── 3. SCAN ───────────────────────────────────────────────────────────────

  function triggerScan(rawText) {
    scanInProgress     = true;
    pendingScanPromise = TrustWorkerBridge.scan(rawText)
      .then(result => {
        scanInProgress = false;
        lastResult     = result;
        applyResult(result, rawText);
        if (submitBlocked) {
          submitBlocked = false;
          if (result.riskLevel === "none") findSendButton()?.click();
        }
        return result;
      })
      .catch(err => {
        scanInProgress = false;
        submitBlocked  = false;
        console.error("[TP/claude] scan failed, defaulting to safe:", err);
        const fallback = { findings: [], riskLevel: "none", score: 0 };
        lastResult = fallback;
        applyResult(fallback, rawText);
      });
    return pendingScanPromise;
  }

  function applyResult(result, rawText) {
    const { findings, riskLevel } = result;
    const composerEl = getComposerCard();
    const safeText   = buildSafeText(rawText, findings);
    TrustUI.update(riskLevel, findings, safeText, promptBox, composerEl,
      () => { TrustUI.reset(promptBox); chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" }); },
      null
    );
    chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel });
  }

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

  function getComposerWrapper() { return getComposerCard(); }

  // ── 4. SUBMIT BLOCKING ────────────────────────────────────────────────────

  function handleSubmitAttempt(e) {
    if (!scanInProgress && lastResult) {
      if (lastResult.riskLevel === "none") return;
      if (e) e.preventDefault();
      return;
    }
    if (scanInProgress && pendingScanPromise) {
      if (e) e.preventDefault();
      submitBlocked = true;
      console.log("[TP/claude] submit blocked — waiting for scan");
    }
  }

  // ── 5. INPUT LISTENER ────────────────────────────────────────────────────

  function onInput() {
    TrustUI.setScanning(getComposerWrapper());
    clearTimeout(debounceTimer);
    lastResult = null; submitBlocked = false;

    debounceTimer = setTimeout(() => {
      if (!promptBox) return;
      const rawText = extractText(promptBox);
      if (!rawText.trim()) {
        TrustUI.reset(getComposerWrapper());
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
        TrustUI.setScanning(getComposerWrapper());
        attachListeners(promptBox);
        chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel: "none" });
        console.log("[TP/claude] prompt box re-resolved");
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  function init() {
    promptBox = findPromptBox();
    if (promptBox) {
      TrustUI.setScanning(getComposerWrapper());
      attachListeners(promptBox);
      console.log("[TP/claude] init complete");
    } else {
      console.warn("[TP/claude] not found — waiting via MutationObserver");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init, 600);

})();
