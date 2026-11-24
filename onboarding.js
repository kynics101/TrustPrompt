// onboarding.js
// Three-step disclosure page, opened once on first install (see background.js).
// Saves the participant's choice through consent-state.js.

(function () {
  const TOTAL_STEPS = 3;
  let current = 1;

  const steps     = Array.from(document.querySelectorAll(".step"));
  const indicator = document.getElementById("step-indicator");
  const btnBack   = document.getElementById("btn-back");
  const btnNext   = document.getElementById("btn-next");
  const btnAllow  = document.getElementById("btn-allow");
  const btnDecline = document.getElementById("btn-decline");
  const btnClose  = document.getElementById("btn-close");
  const result    = document.getElementById("choice-result");
  const version   = document.getElementById("version");

  function showStep(n) {
    current = Math.min(Math.max(n, 1), TOTAL_STEPS);
    steps.forEach((s) => { s.hidden = Number(s.dataset.step) !== current; });
    indicator.textContent = `Step ${current} of ${TOTAL_STEPS}`;
    btnBack.hidden = current === 1;
    btnNext.hidden = current === TOTAL_STEPS;
    window.scrollTo(0, 0);
  }

  const toast = document.getElementById("toast");
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
  }

  async function saveChoice(status) {
    await TrustPromptConsent.setConsent(status);
    if (status === "allowed") showToast("TrustPrompt is now on. You may close this page.");
    result.textContent = status === "allowed"
      ? "TrustPrompt is on. Open ChatGPT or Claude to see it working. You may now close this page."
      : "TrustPrompt is off. You can turn it on later from the TrustPrompt icon in your browser toolbar.";
  }

  btnNext.addEventListener("click", () => showStep(current + 1));
  btnBack.addEventListener("click", () => showStep(current - 1));
  btnAllow.addEventListener("click", () => saveChoice("allowed"));
  btnDecline.addEventListener("click", () => saveChoice("declined"));
  // Closing without choosing leaves consent as "pending", which keeps TrustPrompt inactive.
  btnClose.addEventListener("click", () => window.close());

  version.textContent = chrome.runtime.getManifest().version;

  // Deep link from the popup: #uninstall opens page 3 at the uninstall section.
  if (window.location.hash === "#uninstall") {
    showStep(3);
    const target = document.getElementById("uninstall");
    if (target && target.scrollIntoView) target.scrollIntoView({ block: "start" });
  } else {
    showStep(1);
  }
})();
