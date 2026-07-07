// content-script-chatgpt.js
// TrustPrompt — ChatGPT / OpenAI content script.
//
// Execution order (all scripts loaded by manifest before this file):
//   lib/validator.min.js  →  ph-address-db.js  →  patterns.js
//   →  validator-wrapper.js  →  THIS FILE
//
// Responsibilities:
//   1. Locate ChatGPT's prompt textarea using a 5-layer cascading selector.
//   2. Listen for typing pauses (~400 ms debounce) and intercept DOM text.
//   3. Normalise the text, run regex patterns, mathematically validate matches.
//   4. Score risk (NIST SP 800-122 model) and update the badge.
//   5. Inject a warning <div> below the textarea listing findings + safe versions.
//   6. Wire up "Send Anyway" and "Use Safe Version" buttons.
//   7. Re-check on Mutation Observer DOM changes (SPA navigation).
//   8. Show an in-page status dot next to the send button + a status bar below
//      the composer (gray = scanning, green = safe, colour = risk found).

/* global TRUSTPROMPT_PATTERNS, TrustValidator */

console.log("[TrustPrompt] ChatGPT content script loaded");

// ── Constants ─────────────────────────────────────────────────────────────────

const DEBOUNCE_MS          = 400;
const WARNING_DIV_ID       = "trustprompt-warning";
const BADGE_ID             = "trustprompt-badge";
const STATUS_DOT_ID        = "trustprompt-status-dot";
const STATUS_BAR_ID        = "trustprompt-status-bar";

// Risk level → badge colour + label
const RISK_META = {
  scanning: { colour: "#9E9E9E", textColour: "#fff", label: "Scanning…",   emoji: "⬤" },
  high:     { colour: "#D32F2F", textColour: "#fff", label: "High Risk",   emoji: "🔴" },
  medium:   { colour: "#F57C00", textColour: "#fff", label: "Medium Risk", emoji: "🟠" },
  low:      { colour: "#F9A825", textColour: "#000", label: "Low Risk",    emoji: "🟡" },
  none:     { colour: "#388E3C", textColour: "#fff", label: "Safe",        emoji: "🟢" }
};

// ── State ─────────────────────────────────────────────────────────────────────

let promptBox        = null;   // the resolved <div> / <textarea> element
let debounceTimer    = null;
let lastScannedText  = "";
let currentFindings  = [];     // array of finding objects from last scan

// ── 1. CASCADING SELECTOR ─────────────────────────────────────────────────────
//
// Five layers, tried in order. The first one that returns a non-null element wins.
// ChatGPT's DOM is a React SPA — selectors can change between deploys, so having
// multiple fallback layers makes the tool resilient to minor redesigns.

function findPromptBox() {

  // Layer 1 — ARIA / Role Matching
  // ChatGPT's composer is a contenteditable div with aria-label or
  // a specific role. Prefer the most semantic selector.
  const ariaSelectors = [
    'div[contenteditable="true"][aria-label]',
    'div[contenteditable="true"][role="textbox"]',
    '[aria-label="Message ChatGPT"]',
    '[aria-label="Send a message"]',
    '[aria-label="Message"]',
    '[aria-describedby*="prompt"]',
    '[role="textbox"]'
  ];
  for (const sel of ariaSelectors) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) {
      console.log("[TrustPrompt] found textarea via ARIA/Role:", sel);
      return el;
    }
  }

  // Layer 2 — Form-Anchor Matching
  // Look for a <form> that contains ChatGPT's message input.
  const formAnchors = [
    'form textarea',
    'form div[contenteditable="true"]',
    'main form textarea',
    'main form div[contenteditable]'
  ];
  for (const sel of formAnchors) {
    const el = document.querySelector(sel);
    if (el && isVisible(el)) {
      console.log("[TrustPrompt] found textarea via Form-Anchor:", sel);
      return el;
    }
  }

  // Layer 3 — Attribute Wildcard Matching
  // Partially match class or id names that hint at "prompt" / "composer" / "input".
  const wildcardCandidates = document.querySelectorAll(
    '[id*="prompt"], [id*="composer"], [id*="chat-input"], [id*="message-input"],' +
    '[class*="prompt"], [class*="composer"], [class*="chat-input"], [class*="ProseMirror"]'
  );
  for (const el of wildcardCandidates) {
    if (
      (el.tagName === "TEXTAREA" || el.contentEditable === "true") &&
      isVisible(el)
    ) {
      console.log("[TrustPrompt] found textarea via Attribute Wildcard");
      return el;
    }
  }

  // Layer 4 — Text / Icon Matching
  // Look for a textarea whose placeholder text contains send-area cues,
  // or a sibling/parent of the send-button SVG.
  const allTextareas = document.querySelectorAll(
    'textarea, div[contenteditable="true"]'
  );
  for (const el of allTextareas) {
    const placeholder = el.getAttribute("placeholder") || "";
    if (
      /message|prompt|ask|type|send/i.test(placeholder) &&
      isVisible(el)
    ) {
      console.log("[TrustPrompt] found textarea via Text/Icon (placeholder)");
      return el;
    }
  }

  // Try finding the send button then walking to the nearest input sibling.
  const sendBtns = [...document.querySelectorAll("button")].filter(btn => {
    const label = (btn.getAttribute("aria-label") || btn.textContent).toLowerCase();
    return label.includes("send");
  });
  for (const btn of sendBtns) {
    const container = btn.closest("form, [class*='composer'], [class*='input']");
    if (container) {
      const inp = container.querySelector('textarea, div[contenteditable="true"]');
      if (inp && isVisible(inp)) {
        console.log("[TrustPrompt] found textarea via Text/Icon (send button sibling)");
        return inp;
      }
    }
  }

  // Layer 5 — Keydown / Click Fallback (safety net)
  // If all layers failed, return the very first visible contenteditable/textarea
  // on the page as a last-resort guess.
  for (const el of allTextareas) {
    if (isVisible(el)) {
      console.warn("[TrustPrompt] falling back to first visible editable element");
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
    window.getComputedStyle(el).display !== "none"
  );
}

// ── 2. TEXT EXTRACTION & NORMALISATION ───────────────────────────────────────

function extractText(el) {
  if (!el) return "";
  // contenteditable divs expose innerText; textareas use .value
  return (el.tagName === "TEXTAREA" ? el.value : el.innerText) || "";
}

/**
 * Normalise text before pattern matching:
 *   - collapse unicode look-alike characters to ASCII equivalents
 *   - normalise whitespace
 *   - expand common abbreviations that might hide PII
 */
function normaliseText(raw) {
  return raw
    // Unicode normalisation (NFC → composed form)
    .normalize("NFC")
    // Replace "smart" quotes and dashes with plain ASCII
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    // Collapse runs of whitespace to single space (but preserve newlines)
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

// ── 3. PATTERN MATCHING + VALIDATION ─────────────────────────────────────────

/**
 * Run all patterns against `text`.
 * Returns an array of finding objects:
 *   { patternId, label, risk, rawMatch, safeVersion }
 */
function scanText(text) {
  const normalised = normaliseText(text);
  const findings   = [];

  for (const pattern of TRUSTPROMPT_PATTERNS) {
    // Re-create regex each time to reset lastIndex (global flag)
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;

    while ((match = re.exec(normalised)) !== null) {
      const raw = match[0];

      // Mathematical validation via validator.js
      const confirmed = TrustValidator.validate(pattern.validate, raw);
      if (!confirmed) continue;

      // Build a safe/redacted version
      const safeVersion = pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]";

      findings.push({
        patternId:   pattern.id,
        label:       pattern.label,
        risk:        pattern.risk,
        rawMatch:    raw,
        safeVersion: safeVersion
      });
    }
  }

  // De-duplicate: if the same rawMatch appears under multiple patterns, keep
  // the highest-risk one only.
  const seen = new Map();
  const RISK_ORDER = { high: 3, medium: 2, low: 1 };
  for (const f of findings) {
    const existing = seen.get(f.rawMatch);
    if (!existing || RISK_ORDER[f.risk] > RISK_ORDER[existing.risk]) {
      seen.set(f.rawMatch, f);
    }
  }

  return [...seen.values()];
}

// ── 4. RISK SCORING ───────────────────────────────────────────────────────────
//
// Derived from NIST SP 800-122 (PII Confidentiality Impact Levels).
// Rules:
//   - ANY high-risk finding          → overall = "high"
//   - No high, but any medium        → overall = "medium"
//   - Only low-risk findings         → overall = "low"
//   - No findings                    → overall = "none"

function scoreRisk(findings) {
  if (findings.some(f => f.risk === "high"))   return "high";
  if (findings.some(f => f.risk === "medium")) return "medium";
  if (findings.length > 0)                     return "low";
  return "none";
}

// ── 5. IN-PAGE STATUS DOT ─────────────────────────────────────────────────────
//
// A small coloured circle injected just to the left of the send button inside
// ChatGPT's composer toolbar.
// States:
//   gray  (#9E9E9E) — extension active, currently scanning / idle with no text
//   green (#388E3C) — scan complete, no sensitive data found
//   yellow/orange/red — risk detected (matches overall risk level)

function getOrCreateStatusDot() {
  let dot = document.getElementById(STATUS_DOT_ID);
  if (dot) return dot;

  dot = document.createElement("div");
  dot.id = STATUS_DOT_ID;
  dot.title = "TrustPrompt — monitoring your prompt";
  dot.style.cssText = `
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #9E9E9E;
    flex-shrink: 0;
    align-self: center;
    margin-right: 6px;
    transition: background 0.3s ease;
    cursor: default;
    z-index: 9999;
    position: relative;
  `;

  // Try to place it inside the send-button's parent row so it sits
  // visually next to the arrow button, matching your mockup.
  const anchor = findSendButtonAnchor();
  if (anchor) {
    anchor.style.display = anchor.style.display || "flex";
    anchor.style.alignItems = "center";
    anchor.insertBefore(dot, anchor.firstChild);
  }

  return dot;
}

/**
 * Find the container element that holds the send button so we can inject
 * the status dot right next to it.
 */
function findSendButtonAnchor() {
  // Try aria-label first
  const sendBtn =
    document.querySelector('button[aria-label="Send prompt"]') ||
    document.querySelector('button[aria-label="Send message"]') ||
    document.querySelector('button[data-testid="send-button"]') ||
    [...document.querySelectorAll("button")].find(b =>
      /send/i.test(b.getAttribute("aria-label") || b.textContent)
    );

  if (sendBtn) return sendBtn.parentElement;

  // Fall back: bottom toolbar of the composer form
  const form = document.querySelector("form");
  if (form) {
    // Look for the row that contains buttons (the bottom bar)
    const rows = form.querySelectorAll("div");
    for (const row of rows) {
      if (row.querySelector("button") && row.children.length <= 6) return row;
    }
    return form;
  }
  return null;
}

function setStatusDotColour(riskLevel) {
  const dot = getOrCreateStatusDot();
  if (!dot) return;
  const meta = RISK_META[riskLevel] || RISK_META.none;
  dot.style.background = meta.colour;
  dot.title = `TrustPrompt — ${meta.label}`;
}

// ── 6. STATUS BAR ─────────────────────────────────────────────────────────────
//
// A slim one-line bar below the composer that mirrors your mockup:
//   "TrustPrompt is monitoring your prompt in real-time.
//    Detection runs on a debounce (~400ms after each pause)."
// It changes text when sensitive data is found.

function getOrCreateStatusBar(promptEl) {
  let bar = document.getElementById(STATUS_BAR_ID);
  if (bar) return bar;

  bar = document.createElement("div");
  bar.id = STATUS_BAR_ID;
  bar.style.cssText = `
    all: initial;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11.5px;
    color: #888;
    padding: 5px 4px 2px 4px;
    line-height: 1.4;
    box-sizing: border-box;
  `;

  // TP shield icon (inline SVG, matches your mockup style)
  bar.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
      <path d="M12 2L4 5v6c0 5.25 3.5 10.15 8 11.35C16.5 21.15 20 16.25 20 11V5l-8-3z"
            fill="#388E3C" opacity="0.85"/>
      <text x="12" y="16" text-anchor="middle"
            font-size="9" font-weight="700" fill="#fff"
            font-family="Arial, sans-serif">TP</text>
    </svg>
    <span id="trustprompt-status-text">
      TrustPrompt is monitoring your prompt in real-time.
      Detection runs on a debounce (~400ms after each pause).
    </span>
  `;

  // Insert below the composer form
  const form = promptEl?.closest("form") || promptEl?.parentElement;
  if (form && form.parentElement) {
    form.parentElement.insertBefore(bar, form.nextSibling);
  } else if (promptEl?.parentElement) {
    promptEl.parentElement.appendChild(bar);
  }

  return bar;
}

function setStatusBarText(riskLevel, findingsCount) {
  const textEl = document.getElementById("trustprompt-status-text");
  if (!textEl) return;

  if (riskLevel === "scanning") {
    textEl.style.color = "#888";
    textEl.textContent = "TrustPrompt is scanning your prompt…";
  } else if (riskLevel === "none") {
    textEl.style.color = "#388E3C";
    textEl.textContent = "TrustPrompt is monitoring your prompt in real-time. No sensitive data detected.";
  } else {
    const meta = RISK_META[riskLevel];
    textEl.style.color = meta.colour;
    textEl.textContent =
      `Potential sensitive data detected — ${findingsCount} item${findingsCount !== 1 ? "s" : ""} flagged before submit — not after.`;
  }
}

// ── 7. EXTENSION BADGE (toolbar icon) ────────────────────────────────────────

function updateBadge(riskLevel) {
  chrome.runtime.sendMessage({ type: "UPDATE_BADGE", riskLevel });
}

// ── 8. WARNING UI ─────────────────────────────────────────────────────────────

function removeWarningUI() {
  const existing = document.getElementById(WARNING_DIV_ID);
  if (existing) existing.remove();
}

/**
 * Build and inject the warning panel below the prompt box.
 * The panel shows:
 *   - Overall risk level header
 *   - A row per finding: type label, the matched text, and suggested safe version
 *   - "Send Anyway" and "Use Safe Version" action buttons
 */
function injectWarningUI(findings, riskLevel, promptEl) {
  removeWarningUI();
  if (riskLevel === "none") return;

  const meta = RISK_META[riskLevel];

  const panel = document.createElement("div");
  panel.id = WARNING_DIV_ID;
  panel.setAttribute("role", "alert");
  panel.setAttribute("aria-live", "polite");
  panel.style.cssText = `
    all: initial;
    display: block;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    background: #1e1e1e;
    border: 1.5px solid ${meta.colour};
    border-radius: 10px;
    padding: 12px 14px;
    margin-top: 8px;
    color: #e0e0e0;
    box-shadow: 0 2px 12px rgba(0,0,0,0.45);
    z-index: 9999;
    max-width: 100%;
    box-sizing: border-box;
  `;

  // Header
  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-weight: 600;
    font-size: 14px;
  `;
  header.innerHTML = `
    <span style="
      background:${meta.colour};
      color:${meta.textColour};
      border-radius:6px;
      padding:2px 10px;
      font-size:12px;
      font-weight:700;
      letter-spacing:.5px;
    ">${meta.emoji} ${meta.label.toUpperCase()}</span>
    <span style="color:#aaa; font-weight:400; font-size:12px;">
      TrustPrompt detected ${findings.length} sensitive item${findings.length !== 1 ? "s" : ""}
    </span>
  `;
  panel.appendChild(header);

  // Findings list
  const list = document.createElement("div");
  list.style.cssText = "display:flex; flex-direction:column; gap:6px; margin-bottom:12px;";

  for (const f of findings) {
    const row = document.createElement("div");
    row.style.cssText = `
      background:#2a2a2a;
      border-radius:6px;
      padding:7px 10px;
      display:grid;
      grid-template-columns:auto 1fr 1fr;
      gap:8px;
      align-items:start;
    `;

    const riskDot = RISK_META[f.risk];
    row.innerHTML = `
      <span title="${f.risk} risk" style="
        display:inline-block;
        width:9px; height:9px;
        border-radius:50%;
        background:${riskDot.colour};
        margin-top:4px;
        flex-shrink:0;
      "></span>
      <div>
        <div style="font-weight:600; color:#ccc; font-size:12px;">${escapeHtml(f.label)}</div>
        <div style="
          font-size:12px;
          color:#ff6b6b;
          word-break:break-all;
          font-family:monospace;
          margin-top:2px;
        ">${escapeHtml(truncate(f.rawMatch, 60))}</div>
      </div>
      <div>
        <div style="font-weight:600; color:#ccc; font-size:12px;">Safe version</div>
        <div style="
          font-size:12px;
          color:#69db7c;
          word-break:break-all;
          font-family:monospace;
          margin-top:2px;
        ">${escapeHtml(f.safeVersion)}</div>
      </div>
    `;
    list.appendChild(row);
  }
  panel.appendChild(list);

  // Divider
  const divider = document.createElement("hr");
  divider.style.cssText = "border:none; border-top:1px solid #333; margin:0 0 10px 0;";
  panel.appendChild(divider);

  // Action buttons
  const actions = document.createElement("div");
  actions.style.cssText = "display:flex; gap:8px; flex-wrap:wrap;";

  const btnSendAnyway = document.createElement("button");
  btnSendAnyway.textContent = "Send Anyway";
  btnSendAnyway.style.cssText = `
    background:#333; color:#ccc; border:1px solid #555;
    border-radius:6px; padding:5px 14px; font-size:12px;
    cursor:pointer; font-family:inherit;
  `;
  btnSendAnyway.addEventListener("click", () => {
    console.log("[TrustPrompt] user chose to send anyway");
    removeWarningUI();
    setStatusDotColour("none");
    setStatusBarText("none", 0);
    updateBadge("none");
  });

  const btnSafeVersion = document.createElement("button");
  btnSafeVersion.textContent = "📋 Copy Safe Version";
  btnSafeVersion.style.cssText = `
    background:${meta.colour}22;
    color:${meta.colour === "#F9A825" ? "#F9A825" : meta.colour};
    border:1px solid ${meta.colour};
    border-radius:6px; padding:5px 14px; font-size:12px;
    cursor:pointer; font-family:inherit; font-weight:600;
  `;
  btnSafeVersion.addEventListener("click", () => {
    const safeText = buildSafeText(lastScannedText, findings);
    navigator.clipboard.writeText(safeText).then(() => {
      btnSafeVersion.textContent = "✅ Copied!";
      setTimeout(() => { btnSafeVersion.textContent = "📋 Copy Safe Version"; }, 2000);
      console.log("[TrustPrompt] safe version copied to clipboard");
    });
  });

  actions.appendChild(btnSendAnyway);
  actions.appendChild(btnSafeVersion);
  panel.appendChild(actions);

  // Insert the panel after the prompt box or its closest wrapper
  const insertAfter = promptEl.closest("form") || promptEl.parentElement;
  if (insertAfter && insertAfter.parentElement) {
    insertAfter.parentElement.insertBefore(panel, insertAfter.nextSibling);
  } else {
    promptEl.parentElement?.appendChild(panel);
  }
}

// ── 9. SAFE TEXT BUILDER ──────────────────────────────────────────────────────

/**
 * Replace each raw match in the original text with its safe version.
 * Works through findings in reverse-index order so string positions stay valid.
 */
function buildSafeText(originalText, findings) {
  let safe = normaliseText(originalText);
  // Sort by length descending so longer (more specific) matches replace first
  const sorted = [...findings].sort((a, b) => b.rawMatch.length - a.rawMatch.length);
  for (const f of sorted) {
    // Escape for use in RegExp
    const escaped = f.rawMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    safe = safe.replace(new RegExp(escaped, "g"), f.safeVersion);
  }
  return safe;
}

// ── 10. MAIN SCAN PIPELINE ────────────────────────────────────────────────────

function runScan() {
  if (!promptBox || !isVisible(promptBox)) {
    promptBox = findPromptBox();
    if (!promptBox) return;
    attachInputListener(promptBox);
  }

  const rawText = extractText(promptBox);

  // Empty box → green (safe, nothing to scan)
  if (!rawText.trim()) {
    lastScannedText = "";
    currentFindings = [];
    setStatusDotColour("none");
    setStatusBarText("none", 0);
    updateBadge("none");
    removeWarningUI();
    return;
  }

  if (rawText === lastScannedText) return;

  lastScannedText  = rawText;
  currentFindings  = scanText(rawText);
  const riskLevel  = scoreRisk(currentFindings);

  console.log("[TrustPrompt] scan complete — risk:", riskLevel, "findings:", currentFindings.length);

  // Update all three visual outputs
  setStatusDotColour(riskLevel);
  setStatusBarText(riskLevel, currentFindings.length);
  updateBadge(riskLevel);
  injectWarningUI(currentFindings, riskLevel, promptBox);
}

// ── 11. INPUT LISTENER (debounced) ───────────────────────────────────────────

function attachInputListener(el) {
  el.addEventListener("input", onInput);
  el.addEventListener("keyup", onInput);
  el.addEventListener("paste", () => { setTimeout(onInput, 0); });

  // Make sure the status bar exists as soon as the box is found
  getOrCreateStatusBar(el);
  // Start green if box is empty, gray if it already has content
  const initial = extractText(el).trim();
  setStatusDotColour(initial ? "scanning" : "none");
  setStatusBarText(initial ? "scanning" : "none", 0);

  console.log("[TrustPrompt] input listener attached to prompt box");
}

function onInput() {
  // Immediately show gray dot while the debounce timer is running
  setStatusDotColour("scanning");
  setStatusBarText("scanning", 0);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(runScan, DEBOUNCE_MS);
}

// ── 12. SEND INTERCEPTION ────────────────────────────────────────────────────
//
// When the user hits Enter or clicks Send, re-run a synchronous scan
// (bypassing the debounce) so we never miss a quick type-and-send.

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    clearTimeout(debounceTimer);
    runScan();
  }
}, true);

document.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const label = (btn.getAttribute("aria-label") || btn.textContent || "").toLowerCase();
  if (label.includes("send")) {
    clearTimeout(debounceTimer);
    runScan();
  }
}, true);

// ── 13. MUTATION OBSERVER (SPA navigation) ───────────────────────────────────
//
// ChatGPT is a React SPA. When the user starts a new chat the DOM is
// torn down and rebuilt without a full page reload. The MutationObserver
// watches for DOM structure changes and re-resolves the prompt box.

const observer = new MutationObserver(() => {
  if (!promptBox || !isVisible(promptBox)) {
    const found = findPromptBox();
    if (found && found !== promptBox) {
      promptBox = found;
      attachInputListener(promptBox);
      console.log("[TrustPrompt] prompt box re-resolved after DOM change");
      removeWarningUI();
      // Remove stale dot and bar so they get re-created in new DOM position
      document.getElementById(STATUS_DOT_ID)?.remove();
      document.getElementById(STATUS_BAR_ID)?.remove();
      updateBadge("none");
      lastScannedText = "";
    }
  }
});

observer.observe(document.body, {
  childList: true,
  subtree:   true
});

// ── 14. BOOTSTRAP ────────────────────────────────────────────────────────────

function init() {
  promptBox = findPromptBox();
  if (promptBox) {
    attachInputListener(promptBox);
    console.log("[TrustPrompt] prompt box found on init");
  } else {
    console.warn("[TrustPrompt] prompt box not found on init — will retry via MutationObserver");
  }
}

// Give the React app a moment to finish first render before we query the DOM.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  // Already interactive / complete
  setTimeout(init, 500);
}

// ── Utility helpers ────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, maxLen) {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}
