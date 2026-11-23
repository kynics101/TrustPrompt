/**
 * @jest-environment jsdom
 *
 * Toolbar popup (Task 5): status line and menu items for each consent state.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { installHarness, loadDriver, wait } = require("./helpers/consent-gate-harness");

const ROOT = path.resolve(__dirname, "..", "..");

function loadPopup(store) {
  const html = fs.readFileSync(path.join(ROOT, "popup.html"), "utf8");
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
    .replace(/<script[\s\S]*?<\/script>/g, "");
  document.body.innerHTML = body;
  loadDriver("popup.js");
  return store;
}

const statusText = () => document.getElementById("status-text").textContent;
const menuTitles = () =>
  Array.from(document.querySelectorAll("#menu .item-title")).map((el) => el.textContent);
const clickItem = (action) =>
  document.querySelector(`#menu .item[data-action="${action}"]`).click();

describe("toolbar popup", () => {
  let store;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    window.close = jest.fn();
    ({ store } = installHarness());
    global.chrome.runtime.id = "test-extension-id";
    global.chrome.tabs = { create: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("pending: shows Off and offers Allow, not Pause", async () => {
    loadPopup(store);
    await wait(10);
    expect(statusText()).toBe("Off");
    expect(menuTitles()).toContain("Allow TrustPrompt");
    expect(menuTitles()).not.toContain("Pause");
  });

  test("declined: shows Off with a note, and Allow writes allowed", async () => {
    store.trustpromptConsent = { consent: "declined", paused: false };
    loadPopup(store);
    await wait(10);
    expect(document.getElementById("status-detail").textContent).toMatch(/chose not to allow/);

    clickItem("allow");
    await wait(10);
    expect(store.trustpromptConsent).toEqual({ consent: "allowed", paused: false });
    expect(statusText()).toBe("Running");
  });

  test("allowed: shows Running with Pause and Turn off", async () => {
    store.trustpromptConsent = { consent: "allowed", paused: false };
    loadPopup(store);
    await wait(10);
    expect(statusText()).toBe("Running");
    expect(menuTitles()).toEqual(expect.arrayContaining(["Pause", "Turn off"]));
    expect(menuTitles()).not.toContain("Allow TrustPrompt");
  });

  test("paused: shows Paused and offers Resume, which clears the pause", async () => {
    store.trustpromptConsent = { consent: "allowed", paused: true };
    loadPopup(store);
    await wait(10);
    expect(statusText()).toBe("Paused");
    expect(menuTitles()).toContain("Resume");

    clickItem("pause");
    await wait(10);
    expect(store.trustpromptConsent).toEqual({ consent: "allowed", paused: false });
    expect(statusText()).toBe("Running");
  });

  test("Turn off writes declined", async () => {
    store.trustpromptConsent = { consent: "allowed", paused: false };
    loadPopup(store);
    await wait(10);

    clickItem("off");
    await wait(10);
    expect(store.trustpromptConsent).toEqual({ consent: "declined", paused: false });
  });

  test("Uninstall steps opens the onboarding page at the uninstall section", async () => {
    loadPopup(store);
    await wait(10);

    clickItem("uninstall");
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "chrome-extension://test/onboarding.html#uninstall",
    });
  });

  test("the status line updates while the popup is open", async () => {
    loadPopup(store);
    await wait(10);
    expect(statusText()).toBe("Off");

    await TrustPromptConsent.setConsent("allowed");
    await wait(10);
    expect(statusText()).toBe("Running");
  });
});
