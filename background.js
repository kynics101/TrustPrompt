// background.js
// TrustPrompt — service worker.
//
// Responsibilities:
//   1. Fetch detection rules from Firebase Hosting (read-only, cached).
//   2. Update the browser action badge colour based on risk level reported
//      by the content script.
//   3. Route messages from content scripts.

console.log("[TrustPrompt/bg] service worker started");

// ── 1. FIREBASE RULES FETCH ───────────────────────────────────────────────────
//
// Rules are hosted at a public Firebase Hosting URL as a static JSON file.
// They are fetched once per service worker session and cached in memory.
// The content scripts do NOT call Firebase directly — they use the bundled
// patterns.js, which can be overridden by remote rules fetched here and
// forwarded via chrome.storage.session.
//
// Replace FIREBASE_RULES_URL with your actual Firebase Hosting URL.

const FIREBASE_RULES_URL = "https://YOUR_PROJECT.web.app/trustprompt-rules.json";
const RULES_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

let cachedRules     = null;
let rulesFetchedAt  = 0;

async function fetchRules() {
  const now = Date.now();
  if (cachedRules && (now - rulesFetchedAt) < RULES_CACHE_TTL_MS) {
    return cachedRules;
  }
  try {
    const resp = await fetch(FIREBASE_RULES_URL, { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    cachedRules    = json;
    rulesFetchedAt = now;
    // Persist so content scripts can read via chrome.storage.session
    await chrome.storage.session.set({ trustpromptRules: json });
    console.log("[TrustPrompt/bg] rules fetched from Firebase:", json);
    return json;
  } catch (err) {
    console.warn("[TrustPrompt/bg] failed to fetch rules (using bundled defaults):", err.message);
    return null;
  }
}

// Kick off rules fetch on startup
fetchRules();

// ── 2. BADGE HELPERS ──────────────────────────────────────────────────────────

const BADGE_CONFIG = {
  high:   { text: "!", colour: "#D32F2F" },
  medium: { text: "!", colour: "#F57C00" },
  low:    { text: "!", colour: "#F9A825" },
  none:   { text: "",  colour: "#388E3C" }
};

function setBadge(tabId, riskLevel) {
  const cfg = BADGE_CONFIG[riskLevel] ?? BADGE_CONFIG.none;
  chrome.action.setBadgeText({ text: cfg.text, tabId });
  chrome.action.setBadgeBackgroundColor({ color: cfg.colour, tabId });
}

// ── 3. MESSAGE ROUTER ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  const tabId = sender.tab?.id;

  // Badge update requested by content script
  if (message.type === "UPDATE_BADGE") {
    if (tabId) setBadge(tabId, message.riskLevel);
    sendResponse({ ok: true });
    return true;
  }

  // Legacy / Claude path: raw prompt text sent for background-side detection
  if (message.type === "PROMPT_SUBMITTED") {
    console.log("[TrustPrompt/bg] PROMPT_SUBMITTED from:", sender.tab?.url);
    // For Claude (pre-full implementation) we just acknowledge receipt.
    // ChatGPT runs all detection in the content script itself.
    sendResponse({ received: true });
    return true;
  }

  // Rules refresh requested (e.g. from popup)
  if (message.type === "REFRESH_RULES") {
    cachedRules    = null;
    rulesFetchedAt = 0;
    fetchRules().then(rules => sendResponse({ ok: true, rules }));
    return true; // async response
  }

  return false;
});

// ── 4. CLEAR BADGE ON TAB NAVIGATION ─────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    setBadge(tabId, "none");
  }
});
