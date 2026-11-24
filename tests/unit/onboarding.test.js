/**
 * @jest-environment jsdom
 *
 * Onboarding page (Task 3): step navigation and consent saving.
 * Loads the real onboarding.html body and runs the real onboarding.js.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { installHarness, loadDriver } = require("./helpers/consent-gate-harness");

const ROOT = path.resolve(__dirname, "..", "..");

function loadOnboardingPage() {
  const html = fs.readFileSync(path.join(ROOT, "onboarding.html"), "utf8");
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
    .replace(/<script[\s\S]*?<\/script>/g, ""); // scripts are loaded explicitly below
  document.body.innerHTML = body;
  loadDriver("onboarding.js");
}

const $ = (id) => document.getElementById(id);
const visibleStep = () => {
  const visible = Array.from(document.querySelectorAll(".step")).filter((s) => !s.hidden);
  return visible.length === 1 ? Number(visible[0].dataset.step) : null;
};

describe("onboarding page", () => {
  let store;

  beforeEach(() => {
    window.scrollTo = () => {}; // jsdom does not implement scrolling
    ({ store } = installHarness());
    loadOnboardingPage();
  });

  test("starts on step 1 with Next and no Back", () => {
    expect(visibleStep()).toBe(1);
    expect($("step-indicator").textContent).toBe("Step 1 of 3");
    expect($("btn-back").hidden).toBe(true);
    expect($("btn-next").hidden).toBe(false);
  });

  test("Next and Back move through the three steps", () => {
    $("btn-next").click();
    expect(visibleStep()).toBe(2);
    expect($("btn-back").hidden).toBe(false);

    $("btn-next").click();
    expect(visibleStep()).toBe(3);
    expect($("btn-next").hidden).toBe(true);
    expect($("step-indicator").textContent).toBe("Step 3 of 3");

    $("btn-back").click();
    expect(visibleStep()).toBe(2);
  });

  test("I allow saves allowed consent", async () => {
    $("btn-next").click();
    $("btn-next").click();
    $("btn-allow").click();
    await new Promise((r) => setTimeout(r, 0));

    expect(store.trustpromptConsent).toEqual({ consent: "allowed", paused: false });
    expect($("choice-result").textContent).toMatch(/TrustPrompt is on/);
  });

  test("I don't allow saves declined consent and shows the off message", async () => {
    $("btn-next").click();
    $("btn-next").click();
    $("btn-decline").click();
    await new Promise((r) => setTimeout(r, 0));

    expect(store.trustpromptConsent).toEqual({ consent: "declined", paused: false });
    expect($("choice-result").textContent).toMatch(/TrustPrompt is off/);
  });

  test("#uninstall deep link opens page 3", () => {
    window.location.hash = "#uninstall";
    loadOnboardingPage();
    expect(visibleStep()).toBe(3);
    window.location.hash = "";
  });

  test("shows the version from the manifest in the footer", () => {
    expect($("version").textContent).toBe("0.0.4");
  });
});
