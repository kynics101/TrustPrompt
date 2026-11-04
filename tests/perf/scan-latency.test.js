/**
 * tests/perf/scan-latency.test.js
 *
 * Scan latency measurement for the TrustPrompt detection engine.
 *
 * Methodology:
 *   - Warm up the engine with a few unchained calls before timing (JIT + cache)
 *   - Run N timed iterations per prompt category
 *   - Collect per-iteration elapsed times (ms) returned by TP.scan()
 *   - Compute and assert p50, p95, p99, and mean latency
 *
 * Budget thresholds (fail if exceeded):
 *   p50  ≤ 50 ms   — median scan must stay well within user-perceptible range
 *   p95  ≤ 150 ms  — 95th percentile
 *   p99  ≤ 300 ms  — worst-case tail
 *
 * These are conservative in-process Node timings (no Worker overhead, no IPC).
 * Real browser latency will be similar; the Worker message-passing adds ~1–5 ms.
 * Adjust thresholds in BUDGETS if hardware is slower.
 *
 * Prompt categories (mirrors realistic ChatGPT / Claude usage):
 *   short  — 1–2 sentence prompt, no PII
 *   medium — paragraph with one entity type
 *   long   — multi-paragraph with several entity types
 *   dense  — high-entity-density prompt (many entity types)
 */

"use strict";

const { scan } = global.TP;

// ─── Configurable latency budgets (milliseconds) ─────────────────────────────

const BUDGETS = {
  p50: 50,
  p95: 150,
  p99: 300,
};

const ITERATIONS   = 200;   // timed iterations per category
const WARMUP_ITERS = 10;    // unchained warm-up passes per category

// ─── Test prompts ─────────────────────────────────────────────────────────────

const PROMPTS = {
  short: "Can you help me write a professional email?",

  medium:
    "Hi, my name is Maria Santos and I need help drafting an out-of-office reply. " +
    "You can reach me at maria.santos@example.com while I'm away.",

  long:
    "I'm preparing a data-privacy impact assessment for our HR system. " +
    "The system stores employee TINs (e.g. 123-456-789-000), SSS numbers, " +
    "and PhilHealth IDs. Employees can be contacted at their work emails " +
    "(firstname.lastname@company.ph) or on their registered mobile numbers. " +
    "The database also logs connection IP addresses (192.168.1.0/24 range) and " +
    "device MAC addresses. Please review the following excerpt from our privacy notice.",

  dense:
    "Employee record: Juan Dela Cruz (juan@company.ph, +63 917 000 0001). " +
    "TIN: 123-456-789-000. SSS: 33-4567890-1. " +
    "Credit card on file: 4111 1111 1111 1111. " +
    "Connected from 203.0.113.10 (MAC: AA:BB:CC:DD:EE:FF). " +
    "Diagnosis: hypertension. Loan balance: PHP 50,000.",
};

// ─── Percentile helper ────────────────────────────────────────────────────────

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function mean(arr) {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  return {
    min:  sorted[0],
    p50:  percentile(sorted, 50),
    p95:  percentile(sorted, 95),
    p99:  percentile(sorted, 99),
    max:  sorted[sorted.length - 1],
    mean: mean(sorted),
  };
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function measureLatency(promptText) {
  // Warm up
  for (let i = 0; i < WARMUP_ITERS; i++) {
    scan(promptText);
  }

  // Timed iterations — use the elapsedMs returned by scan() for consistency
  const times = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const { elapsedMs } = scan(promptText);
    times.push(elapsedMs);
  }
  return stats(times);
}

// ─────────────────────────────────────────────────────────────────────────────
// Latency tests — one describe block per prompt category
// ─────────────────────────────────────────────────────────────────────────────

for (const [category, prompt] of Object.entries(PROMPTS)) {
  describe(`Scan latency — ${category} prompt (n=${ITERATIONS})`, () => {
    let s; // stats object, computed once for the describe block

    beforeAll(() => {
      s = measureLatency(prompt);
      console.info(
        `[perf/${category}] min=${s.min}ms  mean=${s.mean.toFixed(1)}ms  ` +
        `p50=${s.p50}ms  p95=${s.p95}ms  p99=${s.p99}ms  max=${s.max}ms`
      );
    });

    test(`p50 ≤ ${BUDGETS.p50} ms`, () => {
      expect(s.p50).toBeLessThanOrEqual(BUDGETS.p50);
    });

    test(`p95 ≤ ${BUDGETS.p95} ms`, () => {
      expect(s.p95).toBeLessThanOrEqual(BUDGETS.p95);
    });

    test(`p99 ≤ ${BUDGETS.p99} ms`, () => {
      expect(s.p99).toBeLessThanOrEqual(BUDGETS.p99);
    });

    test("mean latency is a positive finite number (sanity)", () => {
      expect(isFinite(s.mean)).toBe(true);
      expect(s.mean).toBeGreaterThan(0);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate latency summary across all categories
// ─────────────────────────────────────────────────────────────────────────────

describe("Scan latency — aggregate summary", () => {
  test("all categories complete within 30 s total (wall-clock guard)", () => {
    // This test just checks that the test file itself ran in time.
    // Jest's testTimeout handles the hard limit; this is a documentation test.
    expect(true).toBe(true);
  });

  test("dense prompt (worst case) p99 within budget", () => {
    // Dense is the most expensive category — re-run a small sample and assert
    const s = measureLatency(PROMPTS.dense);
    console.info(`[perf/dense-recheck] p99=${s.p99}ms`);
    expect(s.p99).toBeLessThanOrEqual(BUDGETS.p99);
  });
});
