/**
 * Service worker consent behavior (Tasks 3 and 4).
 *
 * Runs the real background.js. The shipped FIREBASE_RULES_URL is null, which
 * would make any "no fetch" test pass trivially, so this test swaps in a valid
 * URL in the loaded source text and checks that the consent gate still blocks it.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { installHarness } = require("./helpers/consent-gate-harness");

const ROOT = path.resolve(__dirname, "..", "..");
const RULES_URL = "https://trustprompt-test.web.app/trustprompt-rules.json";

function loadBackground() {
  let src = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  src = src.replace("const FIREBASE_RULES_URL = null;", `const FIREBASE_RULES_URL = "${RULES_URL}";`);
  expect(src).toContain(RULES_URL);

  const tabsCreate = jest.fn();
  const installListeners = [];
  const chromeMock = global.chrome;
  Object.assign(chromeMock.storage, { session: { set: jest.fn(async () => {}) } });
  Object.assign(chromeMock.runtime, {
    getURL: (p) => `chrome-extension://test/${p}`,
    onInstalled: { addListener: (fn) => installListeners.push(fn) },
  });
  chromeMock.tabs = {
    create: tabsCreate,
    query: jest.fn(async () => []),
    onUpdated: { addListener: () => {} },
  };
  chromeMock.action = {
    setBadgeText: jest.fn(),
    setBadgeBackgroundColor: jest.fn(),
    setBadgeTextColor: jest.fn(),
  };
  chromeMock.sidePanel = { setPanelBehavior: () => Promise.resolve(), open: jest.fn() };

  const fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
  const importScripts = () => {}; // consent-state.js is already loaded via global below

  // eslint-disable-next-line no-new-func
  new Function("chrome", "fetch", "importScripts", src)(chromeMock, fetchMock, importScripts);

  return { fetchMock, tabsCreate, installListeners };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("background consent gating", () => {
  let harness;

  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    harness = installHarness();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("makes no rules fetch while consent is pending", async () => {
    const { fetchMock } = loadBackground();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("makes no rules fetch while consent is declined", async () => {
    await TrustPromptConsent.setConsent("declined");
    const { fetchMock } = loadBackground();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("fetches rules once the user allows TrustPrompt", async () => {
    const { fetchMock } = loadBackground();
    await TrustPromptConsent.setConsent("allowed");
    await flush();
    expect(fetchMock).toHaveBeenCalledWith(RULES_URL, expect.anything());
  });

  test("stops fetching after the user declines", async () => {
    const { fetchMock } = loadBackground();
    await TrustPromptConsent.setConsent("allowed");
    await flush();
    fetchMock.mockClear();

    await TrustPromptConsent.setConsent("declined");
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("opens the disclosure page on a fresh install only", () => {
    const { tabsCreate, installListeners } = loadBackground();
    expect(installListeners).toHaveLength(1);

    installListeners[0]({ reason: "install" });
    expect(tabsCreate).toHaveBeenCalledWith({ url: "chrome-extension://test/onboarding.html" });

    tabsCreate.mockClear();
    installListeners[0]({ reason: "update" });
    expect(tabsCreate).not.toHaveBeenCalled();
  });
});
