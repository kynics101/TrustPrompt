/**
 * tests/accuracy/detection-accuracy.test.js
 *
 * Detection accuracy measurement against the curated labeled dataset.
 *
 * Metrics computed per-test and in aggregate:
 *
 *   True Positive  (TP) – expected patternId found in findings
 *   False Negative (FN) – expected patternId NOT found in findings
 *   False Positive (FP) – forbidden patternId found in findings
 *   True Negative  (TN) – forbidden patternId correctly absent
 *
 *   Precision = TP / (TP + FP)     — of what we flagged, how much was correct
 *   Recall    = TP / (TP + FN)     — of what existed, how much did we catch
 *   F1        = 2 × P × R / (P+R)  — harmonic mean
 *
 * Thresholds (fail the suite if the aggregate drops below):
 *   Precision ≥ 0.80  (≤ 20% false positives among flagged entity types)
 *   Recall    ≥ 0.75  (≤ 25% missed entity types)
 *   Risk-level accuracy ≥ 0.85  (correct final risk level on ≥ 85% of cases)
 *
 * Each dataset entry is also run as an individual Jest test so failures are
 * pinpointed to a specific case ID rather than just lowering the aggregate.
 *
 * Adjust thresholds in THRESHOLDS below as the engine matures.
 */

"use strict";

const { DATASET } = require("../fixtures/dataset");
const { scan }    = global.TP;

// ─── Configurable pass/fail thresholds ───────────────────────────────────────

const THRESHOLDS = {
  precision:         0.80,
  recall:            0.75,
  riskLevelAccuracy: 0.85,
};

// ─── Aggregate counters ───────────────────────────────────────────────────────

let totalTP = 0;
let totalFN = 0;
let totalFP = 0;
let totalTN = 0;
let riskCorrect   = 0;
let riskIncorrect = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Per-case tests — one Jest test per dataset entry
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection accuracy — per-case", () => {
  for (const entry of DATASET) {
    const { id, description, prompt, expect: ex } = entry;

    test(`[${id}] ${description}`, () => {
      const result = scan(prompt);
      const foundIds = new Set(result.findings.map(f => f.patternId));

      // ── Risk level check ────────────────────────────────────────────────────
      if (ex.riskLevel !== undefined) {
        if (result.riskLevel === ex.riskLevel) {
          riskCorrect++;
        } else {
          riskIncorrect++;
        }
        expect(result.riskLevel).toBe(ex.riskLevel);
      }

      // ── Governance rule check ───────────────────────────────────────────────
      if (ex.governanceRule !== undefined && ex.governanceRule !== "none") {
        expect(result.governance).toBe(ex.governanceRule);
      }

      // ── Required patternIds (TP / FN) ───────────────────────────────────────
      for (const pid of (ex.patternIds ?? [])) {
        if (foundIds.has(pid)) {
          totalTP++;
        } else {
          totalFN++;
        }
        expect(foundIds.has(pid)).toBe(true);
      }

      // ── Forbidden patternIds (FP / TN) ──────────────────────────────────────
      for (const pid of (ex.notPatternIds ?? [])) {
        if (foundIds.has(pid)) {
          totalFP++;
        } else {
          totalTN++;
        }
        expect(foundIds.has(pid)).toBe(false);
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate metric assertions — run after all per-case tests complete
// ─────────────────────────────────────────────────────────────────────────────

describe("Detection accuracy — aggregate metrics", () => {
  test(`Precision ≥ ${THRESHOLDS.precision}`, () => {
    const denom = totalTP + totalFP;
    if (denom === 0) {
      // No positive predictions at all — warn but don't fail outright
      console.warn("[accuracy] No positive predictions recorded; precision is undefined.");
      return;
    }
    const precision = totalTP / denom;
    console.info(
      `[accuracy] Precision: ${(precision * 100).toFixed(1)}%  ` +
      `(TP=${totalTP}, FP=${totalFP})`
    );
    expect(precision).toBeGreaterThanOrEqual(THRESHOLDS.precision);
  });

  test(`Recall ≥ ${THRESHOLDS.recall}`, () => {
    const denom = totalTP + totalFN;
    if (denom === 0) {
      console.warn("[accuracy] No expected entities recorded; recall is undefined.");
      return;
    }
    const recall = totalTP / denom;
    console.info(
      `[accuracy] Recall: ${(recall * 100).toFixed(1)}%  ` +
      `(TP=${totalTP}, FN=${totalFN})`
    );
    expect(recall).toBeGreaterThanOrEqual(THRESHOLDS.recall);
  });

  test("F1 score (informational — no threshold)", () => {
    const denom = totalTP + totalFP;
    const denomR = totalTP + totalFN;
    if (denom === 0 || denomR === 0) return;

    const precision = totalTP / denom;
    const recall    = totalTP / denomR;
    const f1 = (precision + recall) > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

    console.info(
      `[accuracy] F1: ${(f1 * 100).toFixed(1)}%  ` +
      `P=${(precision * 100).toFixed(1)}%  R=${(recall * 100).toFixed(1)}%`
    );
    // Informational — just verify it is a sane number
    expect(f1).toBeGreaterThanOrEqual(0);
    expect(f1).toBeLessThanOrEqual(1);
  });

  test(`Risk-level accuracy ≥ ${THRESHOLDS.riskLevelAccuracy}`, () => {
    const total = riskCorrect + riskIncorrect;
    if (total === 0) {
      console.warn("[accuracy] No risk-level assertions recorded.");
      return;
    }
    const accuracy = riskCorrect / total;
    console.info(
      `[accuracy] Risk-level accuracy: ${(accuracy * 100).toFixed(1)}%  ` +
      `(correct=${riskCorrect}, incorrect=${riskIncorrect})`
    );
    expect(accuracy).toBeGreaterThanOrEqual(THRESHOLDS.riskLevelAccuracy);
  });

  test("Confusion matrix summary (informational)", () => {
    console.info(
      `[accuracy] Confusion matrix —  TP:${totalTP}  FP:${totalFP}  ` +
      `FN:${totalFN}  TN:${totalTN}`
    );
    // Just verify counters are non-negative
    expect(totalTP).toBeGreaterThanOrEqual(0);
    expect(totalFP).toBeGreaterThanOrEqual(0);
  });
});
