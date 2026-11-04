/**
 * tests/setup/trustprompt-env.js
 *
 * Jest setupFile — runs once per worker process BEFORE any test file is loaded.
 *
 * Problem: every TrustPrompt source module is written as a browser IIFE that
 * assigns itself to `globalThis` / `window`. They use `importScripts()` inside
 * a Web Worker and have no `module.exports`. Jest runs in Node, so we need a
 * thin compatibility layer.
 *
 * Strategy:
 *   1. Build a single vm.Context that looks like a minimal browser environment
 *      (globalThis, window, self, performance, console, atob, btoa).
 *   2. Execute every source file in that context, in dependency order. Each file
 *      assigns its public API to `globalThis.*`, making it available to later files.
 *   3. Copy the finished engine surface onto Jest's real `global` so test files
 *      can call e.g. `global.TP.scan("text")` directly.
 *
 * Modules loaded (dependency order):
 *   normalizer.js           → TrustNormalizer
 *   patterns.js             → TRUSTPROMPT_PATTERNS, shannonEntropy
 *   ph-address-db.js        → PH_ADDRESS_DB
 *   validator-wrapper-worker.js → TrustValidatorWorker  (uses PH_ADDRESS_DB)
 *   gazetteer.js            → TrustGazetteer            (uses TrustNormalizer)
 *   linguistic-detector.js  → TrustLinguisticDetector   (compromise.js stubbed)
 *   trust-worker.js (body only, importScripts stripped)  → scoring engine
 *
 * Exposed on `global.TP`:
 *   TP.scan(rawText)  → { findings, riskLevel, score, governance, elapsedMs }
 *   TP.normalizer     → TrustNormalizer
 *   TP.gazetteer      → TrustGazetteer
 *   TP.linguistic     → TrustLinguisticDetector
 *   TP.patterns       → TRUSTPROMPT_PATTERNS
 *   TP.validators     → validators-non-luhn exports (module.exports, Node-native)
 */

"use strict";

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");

// ─── Helper: read a source file ───────────────────────────────────────────────
function src(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

// ─── Minimal atob / btoa for Node 14 compatibility ───────────────────────────
function nodeAtob(b64) {
  return Buffer.from(b64, "base64").toString("binary");
}
function nodeBtoa(bin) {
  return Buffer.from(bin, "binary").toString("base64");
}

// ─── Build the shared vm context ─────────────────────────────────────────────
//
// We share ONE context across all loaded files.  Each file assigns to
// `globalThis.*`, which is the context object itself in vm's implementation.

// Build the sandbox object first, then make window/self/globalThis all point
// at the same object BEFORE calling vm.createContext.  Node 24 seals the
// sandbox after contextification, so we cannot assign to globalThis from
// inside the vm — everything must be wired up before the call.
const ctx = {
  console,
  performance: { now: () => Number(process.hrtime.bigint() / 1_000_000n) },
  atob:  typeof atob  !== "undefined" ? atob  : nodeAtob,
  btoa:  typeof btoa  !== "undefined" ? btoa  : nodeBtoa,

  // Required by linguistic-detector.js — stub out compromise.js.
  // The detector has a graceful fallback when window.nlp is undefined.
  nlp: undefined,

  // importScripts is used by trust-worker.js; we handle loading ourselves.
  importScripts: () => {},

  // Stubs for the worker message handler — not used in tests.
  onmessage: null,
  postMessage: () => {},
};

// Circular self-references so browser globals resolve to the sandbox.
// Must be set BEFORE vm.createContext.
ctx.window      = ctx;
ctx.self        = ctx;
ctx.globalThis  = ctx;

const vmCtx = vm.createContext(ctx);

// ─── Load modules in dependency order ────────────────────────────────────────

const LOAD_ORDER = [
  "normalizer.js",
  "patterns.js",
  "ph-address-db.js",
  "validator-wrapper-worker.js",
  "gazetteer.js",
  "linguistic-detector.js",
];

for (const file of LOAD_ORDER) {
  try {
    vm.runInContext(src(file), vmCtx, { filename: file });
  } catch (err) {
    // Re-throw with context so failures are easy to diagnose
    throw new Error(`[trustprompt-env] Failed to load ${file}: ${err.message}`);
  }
}

// ─── Load trust-worker.js, stripping the importScripts() call ────────────────
//
// trust-worker.js opens with importScripts(...) which we've already stubbed,
// but we also need to strip the `self.onmessage = ...` handler and instead
// expose the internal functions.  We do this by appending a small export
// block after the source.

// Load trust-worker.js, keeping only the declarations above the onmessage handler.
// The handler contains a bare `return` and `self.postMessage` which are not needed
// in the test environment. We slice to the line before it starts.
const workerLines = src("trust-worker.js").split("\n");
const handlerStart = workerLines.findIndex(l => l.startsWith("self.onmessage"));
const workerSrc = (handlerStart > 0 ? workerLines.slice(0, handlerStart) : workerLines).join("\n");

const workerExportBlock = `
// ── Test export block (injected by trustprompt-env.js) ───────────────────────
globalThis.__TP_ENGINE__ = {
  BASE_SCORES,
  ENTITY_TIER,
  SENSITIVE_CONTEXT_IDS,
  RISK_ORDER,
  getMultiplier,
  preliminaryClass,
  evaluateGovernance,
  finalClass,
  computeRiskScore,
  suppressPlaceholders,
  runPathA,
  mergeAndDedupe,
};
`;

try {
  vm.runInContext(workerSrc + workerExportBlock, vmCtx, { filename: "trust-worker.js" });
} catch (err) {
  throw new Error(`[trustprompt-env] Failed to load trust-worker.js: ${err.message}`);
}

// ─── Grab everything out of the vm context ────────────────────────────────────

const engine    = vmCtx.__TP_ENGINE__;
const normalizer  = vmCtx.TrustNormalizer;
const gazetteer   = vmCtx.TrustGazetteer;
const linguistic  = vmCtx.TrustLinguisticDetector;
const patterns    = vmCtx.TRUSTPROMPT_PATTERNS;

if (!engine)     throw new Error("[trustprompt-env] __TP_ENGINE__ not exported — check trust-worker.js load");
if (!normalizer) throw new Error("[trustprompt-env] TrustNormalizer not found — check normalizer.js load");
if (!gazetteer)  throw new Error("[trustprompt-env] TrustGazetteer not found — check gazetteer.js load");

// ─── High-level scan() helper ─────────────────────────────────────────────────
//
// Mirrors the SCAN message handler in trust-worker.js.
// Returns the same shape as the RESULT message.

function scan(rawText) {
  const t0 = process.hrtime.bigint();

  const { masked, textRegex, textNLP } = normalizer.normalize(rawText);

  const pathA = engine.runPathA(textRegex);
  const pathB = gazetteer.scan(textNLP);
  const pathC = (linguistic && typeof linguistic.scan === "function")
    ? (() => { try { return linguistic.scan(textNLP); } catch { return []; } })()
    : [];

  const merged   = engine.mergeAndDedupe(pathA, pathB, pathC);
  const findings = engine.suppressPlaceholders(merged);

  const { score, riskLevel, governance } = engine.computeRiskScore(findings);

  const elapsedMs = Number((process.hrtime.bigint() - t0) / 1_000_000n);

  return { findings, riskLevel, score, governance, normalisedText: masked, elapsedMs };
}

// ─── Expose on Jest's real global ────────────────────────────────────────────

global.TP = {
  scan,
  engine,
  normalizer,
  gazetteer,
  linguistic,
  patterns,
  // Node-native module — no vm context needed
  validators: require(path.join(ROOT, "validators-non-luhn.js")),
};
