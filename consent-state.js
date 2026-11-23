// consent-state.js
// TrustPrompt consent and pause state, stored in chrome.storage.local.
//
// Shared by the service worker, content scripts, the popup, and the
// onboarding page. Loads as a classic script (sets globalThis.TrustPromptConsent)
// and as a CommonJS module for Jest.
//
// Stored shape: { consent: "pending" | "allowed" | "declined", paused: boolean }
//   pending   first install, user has not answered the disclosure
//   allowed   user clicked "I allow"; TrustPrompt may run unless paused
//   declined  user clicked "I don't allow"; TrustPrompt stays off
//   paused    separate flag, only meaningful while consent is "allowed"

(function (root) {
  const STORAGE_KEY = "trustpromptConsent";
  const CONSENT_VALUES = ["pending", "allowed", "declined"];

  const DEFAULT_STATE = Object.freeze({ consent: "pending", paused: false });

  function storage() {
    return root.chrome.storage.local;
  }

  // Coerce whatever is stored into a valid state. Unknown values fall back to defaults,
  // so a corrupted entry leaves TrustPrompt inactive rather than active.
  function normalize(raw) {
    const consent = CONSENT_VALUES.includes(raw && raw.consent)
      ? raw.consent
      : DEFAULT_STATE.consent;
    return { consent, paused: !!raw && raw.paused === true };
  }

  async function getState() {
    const data = await storage().get(STORAGE_KEY);
    return normalize(data[STORAGE_KEY]);
  }

  async function save(state) {
    await storage().set({ [STORAGE_KEY]: state });
    return state;
  }

  // Setting a consent answer always clears pause, so a new choice starts from a known state.
  async function setConsent(status) {
    if (!CONSENT_VALUES.includes(status)) {
      throw new Error(`Invalid consent status: ${status}`);
    }
    return save({ consent: status, paused: false });
  }

  async function setPaused(paused) {
    const state = await getState();
    return save({ consent: state.consent, paused: paused === true });
  }

  // TrustPrompt runs only when the user has allowed it and has not paused it.
  function isActive(state) {
    return !!state && state.consent === "allowed" && state.paused !== true;
  }

  const api = {
    STORAGE_KEY,
    CONSENT_VALUES,
    DEFAULT_STATE,
    getState,
    setConsent,
    setPaused,
    isActive,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.TrustPromptConsent = api;
  }
})(typeof self !== "undefined" ? self : globalThis);
