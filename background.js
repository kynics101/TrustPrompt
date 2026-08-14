// background.js
// TrustPrompt — service worker.
//
// Responsibilities:
//   1. Open the side panel when the user clicks the toolbar icon.
//   2. Relay SCAN_RESULT / SCAN_SCANNING / SCAN_CLEARED messages from the
//      content script to the side panel.
//   3. Update the browser action badge colour based on risk level.
//   4. Fetch detection rules from Firebase Hosting (cached, read-only).

console.log("[TrustPrompt/bg] service worker started");

// ── 1. OPEN SIDE PANEL ON ICON CLICK ─────────────────────────────────────────

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(err => console.warn("[TrustPrompt/bg] setPanelBehavior failed:", err));

// ── 2. FIREBASE RULES FETCH ───────────────────────────────────────────────────

const FIREBASE_RULES_URL = "https://YOUR_PROJECT.web.app/trustprompt-rules.json";
const RULES_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedRules    = null;
let rulesFetchedAt = 0;

async function fetchRules() {
  const now = Date.now();
  if (cachedRules && (now - rulesFetchedAt) < RULES_CACHE_TTL_MS) return cachedRules;
  try {
    const resp = await fetch(FIREBASE_RULES_URL, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    cachedRules    = json;
    rulesFetchedAt = now;
    await chrome.storage.session.set({ trustpromptRules: json });
    console.log("[TrustPrompt/bg] rules fetched from Firebase:", json);
    return json;
  } catch (err) {
    console.warn("[TrustPrompt/bg] failed to fetch rules (using bundled defaults):", err.message);
    return null;
  }
}

fetchRules();

// ── 3. PER-TAB HIGH-RISK AUTO-OPEN GATE ──────────────────────────────────────
// Prevents the Chrome side panel from re-opening on every scan tick while the
// user is still editing a high-risk prompt. Resets when risk drops to none
// (sensitive data removed) or when the tab navigates to a new page.

const highRiskAutoOpened = new Set(); // Set<tabId>

// ── 4. BADGE HELPERS ──────────────────────────────────────────────────────────
//
// Badge states:
//   "ON"  grey    — extension active, idle (no text typed yet)
//   "…"   grey    — scanning (user is typing, debounce running)
//   ""    green   — safe, no sensitive data found
//   "!"   yellow  — low risk
//   "!"   orange  — medium risk
//   "!"   red     — high risk

const BADGE_CONFIG = {
  active:   { text: "ON", colour: "#9E9E9E" },  // idle but running
  scanning: { text: "…",  colour: "#9E9E9E" },  // debounce in progress
  none:     { text: "",   colour: "#388E3C" },  // safe
  low:      { text: "!",  colour: "#F9A825" },  // low risk
  medium:   { text: "!",  colour: "#F57C00" },  // medium risk
  high:     { text: "!",  colour: "#D32F2F" },  // high risk
};

function setBadge(tabId, riskLevel) {
  const cfg = BADGE_CONFIG[riskLevel] ?? BADGE_CONFIG.none;
  chrome.action.setBadgeText({ text: cfg.text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: cfg.colour, tabId });
  // Keep badge text legible at small size
  chrome.action.setBadgeTextColor({ color: "#ffffff", tabId });
}

// ── 4. MESSAGE ROUTER ─────────────────────────────────────────────────────────
//
// Content script sends:
//   SCAN_RESULT   { riskLevel, findings, rawText }
//   SCAN_SCANNING {}
//   SCAN_CLEARED  {}
//   UPDATE_BADGE  { riskLevel }          (legacy, still supported)
//   REFRESH_RULES {}                     (from side panel refresh button)
//
// We relay scan messages to the side panel via chrome.runtime.sendMessage
// so the panel always has up-to-date results regardless of which tab is active.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // ── Content script just loaded → show active badge
  if (message.type === "CONTENT_SCRIPT_READY") {
    if (tabId) setBadge(tabId, "active");
    sendResponse({ ok: true });
    return true;
  }

  // ── Scan result from content script → badge + relay to side panel
  if (message.type === "SCAN_RESULT") {
    if (tabId) setBadge(tabId, message.riskLevel);

    // Auto-open side panel on high risk — once per escalation per tab.
    // Without this gate, the side panel re-opens on every scan tick (every
    // 400ms typing pause) while the prompt contains high-risk content.
    if (message.riskLevel === "high" && tabId && !highRiskAutoOpened.has(tabId)) {
      highRiskAutoOpened.add(tabId);
      chrome.sidePanel.open({ tabId }).catch(err => {
        console.warn("[TrustPrompt/bg] failed to auto-open side panel on high risk:", err);
      });
    }

    // Reset the gate when risk drops back to none (sensitive data removed)
    if (message.riskLevel === "none" && tabId) {
      highRiskAutoOpened.delete(tabId);
    }

    // Forward to side panel (it listens on chrome.runtime.onMessage)
    chrome.runtime.sendMessage({ ...message, fromTab: tabId }).catch(() => {
      // Side panel may not be open — that's fine
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SCAN_SCANNING") {
    if (tabId) setBadge(tabId, "scanning");
    chrome.runtime.sendMessage({ type: "SCAN_SCANNING" }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "SCAN_CLEARED") {
    if (tabId) setBadge(tabId, "none");
    chrome.runtime.sendMessage({ type: "SCAN_CLEARED" }).catch(() => {});
    sendResponse({ ok: true });
    return true;
  }

  // ── Legacy badge-only update
  if (message.type === "UPDATE_BADGE") {
    if (tabId) setBadge(tabId, message.riskLevel);
    sendResponse({ ok: true });
    return true;
  }

  // ── Rules refresh (from side panel button)
  if (message.type === "REFRESH_RULES") {
    cachedRules    = null;
    rulesFetchedAt = 0;
    fetchRules().then(rules => sendResponse({ ok: true, rules }));
    return true;
  }

  // ── Open side panel (from inline alert click)
  if (message.type === "OPEN_SIDE_PANEL") {
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        console.warn("[TrustPrompt/bg] failed to open side panel:", err);
      });
    }
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// ── 5. BADGE ON NAVIGATION ───────────────────────────────────────────────────
// Reset to "active" state on navigation — extension is still running,
// just hasn't scanned anything on the new page yet.

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    // Reset the high-risk gate on navigation — new page, clean slate
    highRiskAutoOpened.delete(tabId);
    const url = tab.url || "";
    if (/chatgpt\.com|chat\.openai\.com|claude\.ai/.test(url)) {
      setBadge(tabId, "active");
    } else {
      chrome.action.setBadgeText({ text: "", tabId });
    }
  }
});
