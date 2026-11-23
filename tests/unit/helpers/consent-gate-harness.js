/**
 * Shared harness for consent-gate tests (Task 2).
 *
 * Mocks chrome.storage.local with onChanged notifications, so the real
 * consent-state.js drives the content-script gate exactly as it does in a browser.
 * Loads a content-script driver file into the current jsdom document.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function installHarness() {
  // jsdom does not implement the User Timing API that the drivers use for timing logs.
  if (typeof performance.mark !== "function") performance.mark = () => {};

  const store = {};
  const listeners = [];

  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (key) => ({ [key]: store[key] })),
        set: jest.fn(async (obj) => {
          const changes = {};
          for (const key of Object.keys(obj)) {
            changes[key] = { newValue: obj[key] };
            store[key] = obj[key];
          }
          listeners.forEach((fn) => fn(changes, "local"));
        }),
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    runtime: {
      sendMessage: jest.fn(() => Promise.resolve()),
      onMessage: { addListener: () => {} },
      getManifest: () => ({ version: "0.0.4" }),
      getURL: (p) => `chrome-extension://test/${p}`,
    },
  };

  global.TrustUI = {
    update: jest.fn(),
    teardown: jest.fn(),
    reset: jest.fn(),
    setScanning: jest.fn(),
  };

  global.TrustWorkerBridge = {
    scan: jest.fn(async () => ({ findings: [], riskLevel: "none", score: 0 })),
  };

  global.TrustPromptConsent = require(path.join(ROOT, "consent-state.js"));

  return { store };
}

function loadDriver(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  // Indirect eval runs the driver in the global (jsdom) scope, like a content script.
  (0, eval)(src);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function typeInto(el, text) {
  el.value = text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressEnter(el) {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
}

function mockVisibleTextarea() {
  document.body.innerHTML = '<textarea id="tp-test-input"></textarea>';
  const ta = document.getElementById("tp-test-input");
  ta.getBoundingClientRect = () => ({ width: 300, height: 40, top: 0, left: 0, bottom: 40, right: 300 });
  ta.focus();
  return ta;
}

module.exports = { installHarness, loadDriver, wait, typeInto, pressEnter, mockVisibleTextarea };
