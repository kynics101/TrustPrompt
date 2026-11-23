/**
 * @jest-environment jsdom
 *
 * Consent gate lifecycle for the ChatGPT driver (Task 2, plus pause and decline).
 * Tests run in order and share one loaded driver.
 */
"use strict";

const { installHarness, loadDriver, wait, typeInto, pressEnter, mockVisibleTextarea } =
  require("./helpers/consent-gate-harness");

// ChatGPT's driver waits 1200 ms before its first init, so allow for that.
const INIT_WAIT_MS = 1400;

describe("ChatGPT driver consent gate", () => {
  let ta;

  beforeAll(() => {
    installHarness();
    ta = mockVisibleTextarea();
    loadDriver("dom-chatgpt.js");
  });

  test("stays inactive while consent is pending", async () => {
    await wait(INIT_WAIT_MS);
    typeInto(ta, "card 4111 1111 1111 1111");
    await wait(600);

    expect(TrustWorkerBridge.scan).not.toHaveBeenCalled();
    expect(TrustUI.setScanning).not.toHaveBeenCalled();
    expect(pressEnter(ta).defaultPrevented).toBe(false);
  });

  test("starts scanning after the user allows", async () => {
    ta.value = ""; // clear text typed while inactive so init takes the empty-box path
    await TrustPromptConsent.setConsent("allowed");
    await wait(INIT_WAIT_MS);
    expect(TrustUI.setScanning).toHaveBeenCalled();

    typeInto(ta, "card 4111 1111 1111 1111");
    await wait(600);
    expect(TrustWorkerBridge.scan).toHaveBeenCalledTimes(1);
  });

  test("pausing removes the UI and stops scanning", async () => {
    await TrustPromptConsent.setPaused(true);
    await wait(50);
    expect(TrustUI.teardown).toHaveBeenCalled();

    const callsBefore = TrustWorkerBridge.scan.mock.calls.length;
    typeInto(ta, "another 4111 1111 1111 1111");
    await wait(600);
    expect(TrustWorkerBridge.scan.mock.calls.length).toBe(callsBefore);
  });

  test("resuming restarts scanning", async () => {
    await TrustPromptConsent.setPaused(false);
    await wait(INIT_WAIT_MS);

    const callsBefore = TrustWorkerBridge.scan.mock.calls.length;
    typeInto(ta, "yet another 4111 1111 1111 1111");
    await wait(600);
    expect(TrustWorkerBridge.scan.mock.calls.length).toBe(callsBefore + 1);
  });

  test("declining turns it off and lets Enter through", async () => {
    await TrustPromptConsent.setConsent("declined");
    await wait(50);
    expect(TrustUI.teardown).toHaveBeenCalled();
    expect(pressEnter(ta).defaultPrevented).toBe(false);
  });
});
