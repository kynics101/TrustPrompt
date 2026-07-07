// STEP 2 (v2): capture the prompt text right before it's submitted to Claude.
//
// v1 walked up the DOM from wherever the click/keypress happened, assuming
// the prompt box would be somewhere in that chain. It wasn't — Claude's
// send button and prompt box are separate branches of the page's DOM tree,
// so clicking the button never led back to the editable text.
//
// Fix: query Claude's chat input directly using its data-testid attribute,
// which is a stable developer-added hook rather than a CSS class Anthropic
// might rename on the next redesign. This is intentionally hardcoded to
// Claude's current markup — when you add ChatGPT/Gemini later, each will
// need its own selector here, because every site's DOM is different.
// (This selector fragility is worth noting as a stated limitation in your
// methodology write-up — it's a real, honest constraint of this approach.)

console.log("[TrustPrompt] content script loaded on:", window.location.hostname);

const PROMPT_SELECTOR = '[data-testid="chat-input"]';

function getPromptText() {
  const box = document.querySelector(PROMPT_SELECTOR);
  if (box) {
    return box.innerText.trim();
  }
  // Fallback for other platforms/future changes: a plain <textarea>.
  const textarea = document.querySelector("textarea");
  if (textarea && textarea.value.trim()) {
    return textarea.value.trim();
  }
  return null;
}

function handleSubmitAttempt(source) {
  const text = getPromptText();
  if (!text) {
    console.log("[TrustPrompt] submit detected via:", source, "but no prompt text found");
    return;
  }
  console.log("[TrustPrompt] submit detected via:", source);
  console.log("[TrustPrompt] captured prompt text:", text);

  // Send the text to the background worker. The content script can read
  // the page, but it should not run detection logic itself — that lives
  // in background.js (step 4), reachable only through this message.
  chrome.runtime.sendMessage(
    { type: "PROMPT_SUBMITTED", text: text },
    (response) => {
      console.log("[TrustPrompt] background acknowledged:", response);
    }
  );
}

// Trigger 1: Enter key (without Shift) pressed anywhere on the page.
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    handleSubmitAttempt("Enter key");
  }
}, true);

// Trigger 2: clicking the send button specifically (or any button whose
// label mentions "send", as a loose fallback).
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  const label = (button.getAttribute("aria-label") || button.textContent || "").toLowerCase();
  if (label.includes("send")) {
    handleSubmitAttempt("send button click");
  }
}, true);

console.log("[TrustPrompt] listening for prompt submission (Enter key / send button)");
