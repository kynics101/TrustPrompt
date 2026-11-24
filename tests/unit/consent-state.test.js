/**
 * Unit tests for consent-state.js (Task 1).
 * chrome.storage.local is mocked with an in-memory object.
 */
"use strict";

const path = require("path");
const Consent = require(path.resolve(__dirname, "..", "..", "consent-state.js"));

function installChromeMock(initial) {
  const store = initial ? { ...initial } : {};
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(async (key) => ({ [key]: store[key] })),
        set: jest.fn(async (obj) => { Object.assign(store, obj); }),
      },
    },
  };
  return store;
}

beforeEach(() => {
  delete global.chrome;
});

describe("default state", () => {
  test("returns pending and not paused when nothing is stored", async () => {
    installChromeMock();
    const state = await Consent.getState();
    expect(state).toEqual({ consent: "pending", paused: false });
  });

  test("falls back to pending for a corrupted stored value", async () => {
    installChromeMock({ [Consent.STORAGE_KEY]: { consent: "yes please", paused: "maybe" } });
    const state = await Consent.getState();
    expect(state).toEqual({ consent: "pending", paused: false });
  });
});

describe("transitions", () => {
  test("pending -> allowed via setConsent", async () => {
    const store = installChromeMock();
    await Consent.setConsent("allowed");
    expect(store[Consent.STORAGE_KEY]).toEqual({ consent: "allowed", paused: false });
  });

  test("pending -> declined via setConsent", async () => {
    const store = installChromeMock();
    await Consent.setConsent("declined");
    expect(store[Consent.STORAGE_KEY]).toEqual({ consent: "declined", paused: false });
  });

  test("declined -> allowed (popup reopen)", async () => {
    const store = installChromeMock({ [Consent.STORAGE_KEY]: { consent: "declined", paused: false } });
    await Consent.setConsent("allowed");
    expect(store[Consent.STORAGE_KEY].consent).toBe("allowed");
  });

  test("allowed -> declined (turn off)", async () => {
    const store = installChromeMock({ [Consent.STORAGE_KEY]: { consent: "allowed", paused: false } });
    await Consent.setConsent("declined");
    expect(store[Consent.STORAGE_KEY].consent).toBe("declined");
  });

  test("allowed -> paused and paused -> allowed via setPaused", async () => {
    const store = installChromeMock({ [Consent.STORAGE_KEY]: { consent: "allowed", paused: false } });
    await Consent.setPaused(true);
    expect(store[Consent.STORAGE_KEY]).toEqual({ consent: "allowed", paused: true });
    await Consent.setPaused(false);
    expect(store[Consent.STORAGE_KEY]).toEqual({ consent: "allowed", paused: false });
  });

  test("setConsent clears a previous pause", async () => {
    const store = installChromeMock({ [Consent.STORAGE_KEY]: { consent: "allowed", paused: true } });
    await Consent.setConsent("allowed");
    expect(store[Consent.STORAGE_KEY]).toEqual({ consent: "allowed", paused: false });
  });

  test("rejects an invalid consent value without writing", async () => {
    const store = installChromeMock();
    await expect(Consent.setConsent("maybe")).rejects.toThrow("Invalid consent status");
    expect(store[Consent.STORAGE_KEY]).toBeUndefined();
  });
});

describe("isActive", () => {
  test("false for pending", () => {
    expect(Consent.isActive({ consent: "pending", paused: false })).toBe(false);
  });

  test("false for declined", () => {
    expect(Consent.isActive({ consent: "declined", paused: false })).toBe(false);
  });

  test("false for allowed but paused", () => {
    expect(Consent.isActive({ consent: "allowed", paused: true })).toBe(false);
  });

  test("true only for allowed and not paused", () => {
    expect(Consent.isActive({ consent: "allowed", paused: false })).toBe(true);
  });

  test("false for missing state", () => {
    expect(Consent.isActive(undefined)).toBe(false);
  });
});
