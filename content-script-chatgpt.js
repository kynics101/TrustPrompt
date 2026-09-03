// content-script-chatgpt.js
// TrustPrompt — ChatGPT / OpenAI content script.
//
// Execution order (all scripts loaded by manifest before this file):
//   lib/validator.min.js  →  ph-address-db.js  →  patterns.js
//   →  validator-wrapper.js  →  THIS FILE
//
// Responsibilities:
//   1. Locate ChatGPT's prompt textarea using a cascading selector strategy.
//   2. Listen for typing pauses (~400 ms debounce) and read the prompt text.
//   3. Normalise the text, run regex patterns, mathematically validate matches.
//   4. Score risk (NIST SP 800-122 model).
//   5. Send results to background.js, which relays them to the side panel.
//   6. Re-attach on SPA navigation via MutationObserver.
//
// NOTE: This script does NOT inject any UI into ChatGPT's DOM.
//       All visual output lives in the side panel (sidepanel.html/js).

/* global TRUSTPROMPT_PATTERNS, TrustValidator */

console.log("[TrustPrompt] ChatGPT content script loaded");

// Signal background immediately so the badge shows "ON"
chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }).catch(() => {});

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 400;

// ── CSS Animations ─────────────────────────────────────────────────────────────

const TOAST_STYLES = document.createElement("style");
TOAST_STYLES.textContent = `
  @keyframes slideUp {
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
document.head.appendChild(TOAST_STYLES);

// ── State ─────────────────────────────────────────────────────────────────────

let promptBox       = null;
let debounceTimer   = null;
let lastScannedText = "";
let scanState       = "IDLE"; // IDLE, PENDING, SCANNING, DONE
let lastScanResult  = null;
let pendingSubmitResolver = null;

// ── 1. FIND PROMPT BOX ────────────────────────────────────────────────────────

function findPromptBox() {

  // Layer 1 — Claude's stable data-testid
  const testIds = [
    '[data-testid="chat-input"]',
    '[data-testid="composer-input"]',
    '[data-testid="prompt-input"]',
  ];
  for (const sel of testIds) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) {
      console.log("[TrustPrompt/Claude] found via data-testid:", sel);
      return el;
    }
  }

  // Layer 2 — ARIA / role
  const ariaSelectors = [
    'div[contenteditable="true"][aria-label]',
    'div[contenteditable="true"][role="textbox"]',
    '[aria-label="Write your prompt to Claude"]',
    '[aria-label="Message Claude…"]',
    '[aria-label="Chat with Claude"]',
    '[aria-placeholder]',
    '[role="textbox"]',
  ];
  for (const sel of ariaSelectors) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) {
      console.log("[TrustPrompt/Claude] found via ARIA:", sel);
      return el;
    }
  }

  // Layer 3 — ProseMirror (Claude uses a ProseMirror rich-text editor)
  const proseMirror = document.querySelector('.ProseMirror[contenteditable="true"]');
  if (proseMirror && isVisible(proseMirror)) {
    console.log("[TrustPrompt/Claude] found via ProseMirror class");
    return proseMirror;
  }

  // Layer 4 — form / main anchor
  const formAnchors = [
    'form div[contenteditable="true"]',
    'main div[contenteditable="true"]',
    'form textarea',
    'main textarea',
  ];
  for (const sel of formAnchors) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) {
      console.log("[TrustPrompt/Claude] found via form anchor:", sel);
      return el;
    }
  }

  // Layer 5 — any visible contenteditable with a nearby send button
  const allEditable = document.querySelectorAll('div[contenteditable="true"], textarea');
  for (const el of allEditable) {
    if (!isVisible(el)) continue;
    const parent = el.closest("form, [class*='composer'], [class*='input'], div");
    if (parent && parent.querySelector("button")) {
      console.log("[TrustPrompt/Claude] found via editable+button heuristic");
      return el;
    }
  }

  // Last resort
  for (const el of allEditable) {
    if (isVisible(el)) {
      console.warn("[TrustPrompt/Claude] falling back to first visible editable");
      return el;
    }
  }

  return null;
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    window.getComputedStyle(el).visibility !== "hidden" &&
    window.getComputedStyle(el).display    !== "none"
  );
}

// ── 2. TEXT EXTRACTION & NORMALISATION ───────────────────────────────────────

function extractText(el) {
  if (!el) return "";
  return (el.tagName === "TEXTAREA" ? el.value : el.innerText) || "";
}

function normaliseText(raw) {
  return raw
    .normalize("NFC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

// ── 3. PATTERN MATCHING + VALIDATION ─────────────────────────────────────────

function scanText(text) {
  const normalised = normaliseText(text);
  const findings   = [];

  for (const pattern of TRUSTPROMPT_PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = re.exec(normalised)) !== null) {
      const raw = match[0];
      if (!TrustValidator.validate(pattern.validate, raw)) continue;
      const safeVersion = pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]";
      findings.push({
        patternId:   pattern.id,
        label:       pattern.label,
        risk:        pattern.risk,
        reason:      pattern.reason || "",
        rawMatch:    raw,
        safeVersion: safeVersion
      });
    }
  }

  // De-duplicate — keep highest risk per unique raw match
  const seen       = new Map();
  const RISK_ORDER = { high: 3, moderate: 2, low: 1 };
  for (const f of findings) {
    const existing = seen.get(f.rawMatch);
    if (!existing || RISK_ORDER[f.risk] > RISK_ORDER[existing.risk]) {
      seen.set(f.rawMatch, f);
    }
  }

  return [...seen.values()];
}

// ── 4. RISK SCORING ───────────────────────────────────────────────────────────

function scoreRisk(findings) {
  if (findings.some(f => f.risk === "high"))   return "high";
  if (findings.some(f => f.risk === "moderate")) return "moderate";
  if (findings.length > 0)                     return "low";
  return "none";
}

// ── 5. FLOATING BADGE + INLINE ALERT ─────────────────────────────────────────

const BADGE_ID        = "trustprompt-floating-badge";
const ALERT_BANNER_ID = "trustprompt-inline-alert";
const TOAST_ID        = "trustprompt-toast-notification";

const RISK_META_UI = {
  idle:     { colour: "#9E9E9E", bg: "#f5f5f5", label: "TrustPrompt active",     dot: "#9E9E9E" },
  scanning: { colour: "#9E9E9E", bg: "#f5f5f5", label: "Scanning…",              dot: "#9E9E9E" },
  none:     { colour: "#388E3C", bg: "#e8f5e9", label: "Safe — no issues found", dot: "#388E3C" },
  low:      { colour: "#F9A825", bg: "#fffde7", label: "Low risk detected",       dot: "#F9A825" },
  moderate:   { colour: "#F57C00", bg: "#fff3e0", label: "Moderate risk detected",    dot: "#F57C00" },
  high:     { colour: "#D32F2F", bg: "#ffebee", label: "High risk detected",      dot: "#D32F2F" },
};

// Tracks the badge position above the textarea
let badgePositionObserver = null;

function positionBadgeAboveBox() {
  const badge = document.getElementById(BADGE_ID);
  if (!badge || !promptBox) return;

  const rect        = promptBox.getBoundingClientRect();
  const badgeWidth  = badge.offsetWidth  || 160;
  const badgeHeight = badge.offsetHeight || 28;
  const GAP         = 6;

  // Center horizontally over the textarea
  badge.style.top  = `${rect.top - badgeHeight - GAP}px`;
  badge.style.left = `${rect.left + (rect.width / 2) - (badgeWidth / 2)}px`;
}

function getOrCreateFloatingBadge() {
  let badge = document.getElementById(BADGE_ID);
  if (badge) return badge;

  badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.title = "TrustPrompt — click to open panel";
  badge.style.cssText = `
    all: initial;
    position: fixed;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 7px;
    background: #f5f5f5;
    border: 1.5px solid #9E9E9E;
    border-radius: 20px;
    padding: 5px 11px 5px 8px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    font-weight: 600;
    color: #555;
    transition: border-color 0.3s ease, background 0.3s ease, box-shadow 0.2s ease;
    user-select: none;
    pointer-events: auto;
  `;

  badge.innerHTML = `
    <span id="tp-badge-dot" style="
      width: 9px; height: 9px;
      border-radius: 50%;
      background: #9E9E9E;
      flex-shrink: 0;
      transition: background 0.3s ease;
    "></span>
    <span id="tp-badge-label" style="
      white-space: nowrap;
      transition: color 0.3s ease;
    ">TrustPrompt active</span>
  `;

  badge.addEventListener("mouseenter", () => {
    badge.style.boxShadow = "0 4px 14px rgba(0,0,0,0.22)";
  });
  badge.addEventListener("mouseleave", () => {
    badge.style.boxShadow = "0 2px 8px rgba(0,0,0,0.15)";
  });
  badge.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  });

  document.body.appendChild(badge);

  positionBadgeAboveBox();
  window.addEventListener("resize", positionBadgeAboveBox);
  window.addEventListener("scroll", positionBadgeAboveBox, true);

  if (promptBox) {
    badgePositionObserver = new ResizeObserver(positionBadgeAboveBox);
    badgePositionObserver.observe(promptBox);
  }

  return badge;
}

function updateFloatingBadge(state) {
  const badge = getOrCreateFloatingBadge();
  const meta  = RISK_META_UI[state] || RISK_META_UI.idle;

  badge.style.background  = meta.bg;
  badge.style.borderColor = meta.colour;

  const dot   = badge.querySelector("#tp-badge-dot");
  const label = badge.querySelector("#tp-badge-label");
  if (dot)   dot.style.background = meta.dot;
  if (label) { label.style.color = meta.colour; label.textContent = meta.label; }

  positionBadgeAboveBox();
}

function removeInlineAlert() {
  document.getElementById(ALERT_BANNER_ID)?.remove();
}

function showInlineAlert(riskLevel, findingsCount) {
  removeInlineAlert();
  if (riskLevel === "none") return;

  const meta   = RISK_META_UI[riskLevel];
  const colour = meta.colour;

  const banner = document.createElement("div");
  banner.id = ALERT_BANNER_ID;
  banner.style.cssText = `
    all: initial;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    color: #fff;
    background: ${colour};
    padding: 6px 12px;
    margin-top: 6px;
    border-radius: 6px;
    cursor: pointer;
    box-sizing: border-box;
    z-index: 9998;
  `;

  banner.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
      <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"
            fill="#fff" opacity="0.9"/>
      <text x="12" y="15.5" text-anchor="middle" font-size="8" font-weight="800"
            fill="${colour}" font-family="Arial,sans-serif">!</text>
    </svg>
    <span style="flex:1; font-weight:600; color:#fff;">
      ${meta.label} — ${findingsCount} sensitive item${findingsCount !== 1 ? "s" : ""} detected
    </span>
    <span style="font-size:11px; color:rgba(255,255,255,0.8); font-weight:400;">
      Click to open TrustPrompt →
    </span>
  `;

  banner.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" });
  });

  const form = promptBox?.closest("form");
  if (form && form.parentElement) {
    form.parentElement.insertBefore(banner, form.nextSibling);
  } else if (promptBox?.parentElement) {
    promptBox.parentElement.appendChild(banner);
  }
}

// ── Toast notification for early submit during scan ──────────────────────────

function removeToast() {
  document.getElementById(TOAST_ID)?.remove();
}

function showToast(message, duration = 3000) {
  removeToast();
  
  const toast = document.createElement("div");
  toast.id = TOAST_ID;
  toast.style.cssText = `
    all: initial;
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: #fff;
    padding: 12px 16px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    z-index: 999999 !important;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    border-left: 3px solid #f97316 !important;
    opacity: 1 !important;
    visibility: visible !important;
  `;
  
  toast.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink: 0; display: block;">
      <circle cx="12" cy="12" r="10" stroke="#f97316" stroke-width="2"/>
      <path d="M12 6v6" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
      <circle cx="12" cy="15" r="0.5" fill="#f97316"/>
    </svg>
    <span style="display: block;">${message}</span>
  `;
  
  document.body.appendChild(toast);
  console.log("[TrustPrompt] Toast shown:", message);
  
  if (duration > 0) {
    setTimeout(removeToast, duration);
  }
}

// ── 6. MESSAGING ─────────────────────────────────────────────────────────────

function sendToBackground(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

// ── 7. MAIN SCAN PIPELINE ────────────────────────────────────────────────────

function runScan() {
  if (!promptBox || !isVisible(promptBox)) {
    promptBox = findPromptBox();
    if (!promptBox) return;
    attachInputListener(promptBox);
  }

  const rawText = extractText(promptBox);

  if (!rawText.trim()) {
    lastScannedText = "";
    removeInlineAlert();
    updateFloatingBadge("none");
    sendToBackground({ type: "SCAN_CLEARED" });
    scanState = "IDLE";
    return;
  }

  if (rawText === lastScannedText) return;
  lastScannedText = rawText;
  
  scanState = "SCANNING";

  const findings  = scanText(rawText);
  const riskLevel = scoreRisk(findings);

  console.log("[TrustPrompt/Claude] scan — risk:", riskLevel, "| findings:", findings.length);

  lastScanResult = { findings, riskLevel };
  
  updateFloatingBadge(riskLevel);
  showInlineAlert(riskLevel, findings.length);

  sendToBackground({
    type:      "SCAN_RESULT",
    riskLevel: riskLevel,
    findings:  findings,
    rawText:   rawText
  });
  
  scanState = "DONE";
  
  // If submit was blocked waiting for scan, notify it
  if (pendingSubmitResolver) {
    const resolve = pendingSubmitResolver;
    pendingSubmitResolver = null;
    resolve({ findings, riskLevel });
  }
}

// ── 8. INPUT LISTENER ────────────────────────────────────────────────────────

function attachInputListener(el) {
  el.addEventListener("input", onInput);
  el.addEventListener("paste", () => setTimeout(onInput, 0));
  // Attach keydown on the element itself (captures before ProseMirror's handlers)
  el.addEventListener("keydown", onPromptBoxKeydown, true);
  console.log("[TrustPrompt/Claude] input listener attached");
}

function onInput() {
  clearTimeout(debounceTimer);
  const currentText = extractText(promptBox).trim();
  if (currentText && currentText !== lastScannedText) {
    updateFloatingBadge("scanning");
    sendToBackground({ type: "SCAN_SCANNING" });
    scanState = "PENDING";
  }
  debounceTimer = setTimeout(runScan, DEBOUNCE_MS);
}

// ── 9. SEND INTERCEPTION ─────────────────────────────────────────────────────

// Extract safe version of text by sanitizing all sensitive patterns found
function extractSafeVersion(rawText) {
  const normalised = normaliseText(rawText);
  let safeText = normalised;

  for (const pattern of TRUSTPROMPT_PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = re.exec(normalised)) !== null) {
      const raw = match[0];
      if (!TrustValidator.validate(pattern.validate, raw)) continue;
      const safeVersion = pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]";
      safeText = safeText.replace(raw, safeVersion);
    }
  }

  return safeText;
}

// Returns a Promise that resolves with the scan result
function awaitScan() {
  const rawText = extractText(promptBox);
  if (!rawText.trim()) {
    return Promise.resolve({ findings: [], riskLevel: "none" });
  }

  // Already done
  if (scanState === "DONE" && lastScanResult) {
    return Promise.resolve(lastScanResult);
  }

  // Currently scanning — wait for it
  if (scanState === "SCANNING") {
    return new Promise(resolve => {
      pendingSubmitResolver = resolve;
    });
  }

  // Pending — wait for debounce to complete and scan to run
  if (scanState === "PENDING") {
    return new Promise(resolve => {
      pendingSubmitResolver = resolve;
      // Don't clear the debounce timer — let it fire naturally
      // This will trigger runScan() which will call the resolver
    });
  }

  // Idle — run scan immediately (skip debounce)
  clearTimeout(debounceTimer);
  return new Promise(resolve => {
    pendingSubmitResolver = resolve;
    scanState = "SCANNING";
    updateFloatingBadge("scanning");
    runScan();
  });
}

// Find send button to click for release
function findSendButton() {
  return (
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[aria-label="Send"]') ||
    [...document.querySelectorAll("button")].find(b =>
      /^send$/i.test((b.getAttribute("aria-label") || b.textContent || "").trim()))
  );
}

// Release the submit by clicking the send button
function releaseSubmit() {
  const btn = findSendButton();
  if (btn) {
    btn._tpRelease = true;
    btn.click();
  }
}

function handleSubmitAttempt(e) {
  if (!promptBox || !isVisible(promptBox)) {
    console.log("[TrustPrompt] handleSubmitAttempt called but no promptBox");
    return;
  }
  const rawText = extractText(promptBox);
  if (!rawText.trim()) {
    console.log("[TrustPrompt] handleSubmitAttempt called but text is empty");
    return; // allow empty submissions
  }

  e.preventDefault();
  e.stopImmediatePropagation();

  const safeVersion = extractSafeVersion(rawText);
  console.log("[TrustPrompt] submit intercepted — state:", scanState);
  console.log("[TrustPrompt] safe version:", safeVersion);
  
  if (scanState === "PENDING" || scanState === "SCANNING") {
    console.log("[TrustPrompt] showing toast - state is", scanState);
    showToast("⏸ Message blocked — TrustPrompt is still scanning. Please wait…");
  }

  console.log("[TrustPrompt] awaiting scan...");
  awaitScan().then(result => {
    console.log("[TrustPrompt] scan result received:", result);
    if (result && result.riskLevel === "none") {
      console.log("[TrustPrompt] scan clear — releasing submit");
      releaseSubmit();
    } else {
      console.log("[TrustPrompt] submit blocked — risk level:", result?.riskLevel);
    }
  });
}

// Submit interception: Enter key on the prompt box (fires before ProseMirror)
function onPromptBoxKeydown(e) {
  console.log("[TrustPrompt] onPromptBoxKeydown fired - key:", e.key, "shiftKey:", e.shiftKey);
  if (e.key !== "Enter" || e.shiftKey) return;
  if (e._tpRelease) {
    console.log("[TrustPrompt] onPromptBoxKeydown - release flag set, allowing through");
    return;
  }
  console.log("[TrustPrompt] onPromptBoxKeydown - calling handleSubmitAttempt");
  handleSubmitAttempt(e);
}

// Attach keydown listener to promptBox in attachInputListener
// (See updated attachInputListener below)

// Submit interception: send button click
document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn._tpRelease) { btn._tpRelease = false; return; } // our own release click
  const label = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
  if (!label.includes("send")) return;
  if (!promptBox || !isVisible(promptBox)) return;
  handleSubmitAttempt(e);
}, true);

// Document-level Enter key intercept (fallback for events outside promptBox)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.shiftKey) return;
  if (e._tpRelease) return;
  if (!promptBox || !isVisible(promptBox)) return;
  // If the event came from inside promptBox, skip (will be handled by onPromptBoxKeydown)
  if (promptBox.contains(e.target)) {
    console.log("[TrustPrompt] document keydown - event from inside promptBox, skipping");
    return;
  }
  console.log("[TrustPrompt] document keydown - calling handleSubmitAttempt");
  handleSubmitAttempt(e);
}, true);

// ── 10. SEND_ANYWAY from side panel ───────────────────────────────────────────

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SEND_ANYWAY") {
    lastScannedText = "";
    removeInlineAlert();
    updateFloatingBadge("none");
    sendToBackground({ type: "SCAN_CLEARED" });
  }
});

// ── 11. MUTATION OBSERVER (SPA navigation) ───────────────────────────────────

const observer = new MutationObserver(() => {
  if (!promptBox || !isVisible(promptBox)) {
    const found = findPromptBox();
    if (found && found !== promptBox) {
      promptBox = found;
      attachInputListener(promptBox);
      lastScannedText = "";
      removeInlineAlert();
      updateFloatingBadge("idle");
      sendToBackground({ type: "SCAN_CLEARED" });
      console.log("[TrustPrompt/Claude] prompt box re-resolved after DOM change");
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// ── 12. BOOTSTRAP ─────────────────────────────────────────────────────────────

function init() {
  promptBox = findPromptBox();
  if (promptBox) {
    attachInputListener(promptBox);
    updateFloatingBadge("idle");
    console.log("[TrustPrompt/Claude] prompt box found on init");
  } else {
    console.warn("[TrustPrompt/Claude] prompt box not found on init — will retry via MutationObserver");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  setTimeout(init, 500);
}
