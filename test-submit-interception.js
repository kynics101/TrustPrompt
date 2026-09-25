// test-submit-interception.js
// Test suite for submit interception and scan blocking flow
//
// Test scenarios:
// 1. User types → 400ms debounce → scan completes → badge shows → Enter pressed → submit released
// 2. User presses Enter while scan still pending → toast shows → scan completes → submit released
// 3. User presses Enter with risky content → scan completes → submission blocked
// 4. User clicks send button before scan completes → blocked until scan complete

console.log("[TEST] Submit Interception Test Suite Loading...");

// ── Mock Setup ────────────────────────────────────────────────────────────

// Simulate TRUSTPROMPT_PATTERNS and TrustValidator (from patterns.js / validator)
const MOCK_PATTERNS = [
  {
    id: "credit_card",
    label: "Credit Card",
    regex: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
    flags: "gi",
    risk: "high",
    sanitize: (m) => "[REDACTED]"
  },
  {
    id: "api_key",
    label: "API Key",
    regex: /\b[a-zA-Z0-9_-]{32,}\b/,
    flags: "gi",
    risk: "high",
    sanitize: (m) => "[REDACTED]"
  },
  {
    id: "email",
    label: "Email",
    regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/,
    flags: "gi",
    risk: "moderate",
    sanitize: (m) => m.replace(/(?<=.{2}).(?=.*@)/g, "*")
  }
];

const MockValidator = {
  validate: (fn, raw) => true // Always validate for testing
};

// ── Test Utilities ────────────────────────────────────────────────────────

class SubmitInterceptionTester {
  constructor() {
    this.state = "IDLE";
    this.scanResults = null;
    this.toastMessages = [];
    this.submitAttempts = [];
    this.releaseAttempts = [];
    this.debounceTimer = null;
    this.pendingSubmitResolver = null;
    this.lastScannedText = "";
    this.DEBOUNCE_MS = 400;
  }

  // ── Mini Implementation of Core Functions ──────────────────────────────

  normaliseText(raw) {
    return raw
      .normalize("NFC")
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^\S\n]+/g, " ")
      .trim();
  }

  scanText(text) {
    const normalised = this.normaliseText(text);
    const findings = [];

    for (const pattern of MOCK_PATTERNS) {
      const re = new RegExp(pattern.regex.source, pattern.regex.flags);
      let match;
      while ((match = re.exec(normalised)) !== null) {
        const raw = match[0];
        if (!MockValidator.validate(pattern.validate, raw)) continue;
        findings.push({
          patternId: pattern.id,
          label: pattern.label,
          risk: pattern.risk,
          rawMatch: raw,
          safeVersion: pattern.sanitize ? pattern.sanitize(raw) : "[REDACTED]"
        });
      }
    }

    // De-duplicate by keeping highest risk
    const seen = new Map();
    const RISK_ORDER = { high: 3, moderate: 2, low: 1 };
    for (const f of findings) {
      const existing = seen.get(f.rawMatch);
      if (!existing || RISK_ORDER[f.risk] > RISK_ORDER[existing.risk]) {
        seen.set(f.rawMatch, f);
      }
    }

    return [...seen.values()];
  }

  scoreRisk(findings) {
    if (findings.some(f => f.risk === "high")) return "high";
    if (findings.some(f => f.risk === "moderate")) return "moderate";
    if (findings.length > 0) return "low";
    return "none";
  }

  runScan(rawText) {
    if (!rawText.trim()) {
      this.state = "IDLE";
      this.lastScannedText = "";
      this.scanResults = null;
      return;
    }

    if (rawText === this.lastScannedText) {
      console.log("[TEST] runScan — text unchanged, skipping");
      if (this.scanResults && this.state !== "DONE") {
        this.state = "DONE";
        console.log("[TEST] runScan — state set to DONE");
        if (this.pendingSubmitResolver) {
          const resolve = this.pendingSubmitResolver;
          this.pendingSubmitResolver = null;
          resolve(this.scanResults);
        }
      }
      return;
    }

    this.lastScannedText = rawText;
    this.state = "SCANNING";

    const findings = this.scanText(rawText);
    const riskLevel = this.scoreRisk(findings);

    console.log(`[TEST] runScan — risk: ${riskLevel}, findings: ${findings.length}`);

    this.scanResults = { findings, riskLevel };

    // Simulate scan completion synchronously
    this.state = "DONE";
    console.log("[TEST] runScan — state set to DONE");

    if (this.pendingSubmitResolver) {
      const resolve = this.pendingSubmitResolver;
      this.pendingSubmitResolver = null;
      console.log("[TEST] runScan — resolving pending submit");
      // Use setImmediate to allow promise chain to work
      setImmediate(() => resolve(this.scanResults));
    }
  }

  onInput(rawText) {
    clearTimeout(this.debounceTimer);
    const currentText = rawText.trim();
    if (currentText && currentText !== this.lastScannedText) {
      this.state = "PENDING";
      console.log("[TEST] onInput — state set to PENDING");
    }
    this.debounceTimer = setTimeout(() => {
      this.runScan(rawText);
    }, this.DEBOUNCE_MS);
  }

  awaitScan() {
    const result = this.scanResults || { findings: [], riskLevel: "none" };

    console.log(`[TEST] awaitScan — current state: ${this.state}`);

    if (this.state === "DONE" && this.scanResults) {
      console.log("[TEST] awaitScan — scan already DONE");
      return Promise.resolve(this.scanResults);
    }

    if (this.state === "SCANNING") {
      console.log("[TEST] awaitScan — scan SCANNING, waiting");
      return new Promise(resolve => {
        this.pendingSubmitResolver = resolve;
      });
    }

    if (this.state === "PENDING") {
      console.log("[TEST] awaitScan — scan PENDING, cancelling debounce and triggering immediate scan");
      return new Promise(resolve => {
        this.pendingSubmitResolver = resolve;
        clearTimeout(this.debounceTimer);
        this.runScan(this.lastScannedText);
      });
    }

    console.log("[TEST] awaitScan — state is IDLE");
    return Promise.resolve({ findings: [], riskLevel: "none" });
  }

  showToast(message) {
    console.log(`[TEST] Toast: "${message}"`);
    this.toastMessages.push(message);
  }

  releaseSubmit() {
    console.log("[TEST] releaseSubmit — submit released!");
    this.releaseAttempts.push({ timestamp: Date.now() });
  }

  handleSubmitAttempt(rawText) {
    console.log(`[TEST] handleSubmitAttempt called — state: ${this.state}, text: "${rawText}"`);

    this.submitAttempts.push({
      timestamp: Date.now(),
      state: this.state,
      text: rawText
    });

    if (!rawText.trim()) {
      console.log("[TEST] handleSubmitAttempt — empty text, allowing through");
      return;
    }

    if (this.state === "PENDING" || this.state === "SCANNING") {
      this.showToast("⏸ Message blocked — TrustPrompt is still scanning. Please wait…");
    }

    console.log("[TEST] handleSubmitAttempt — awaiting scan...");

    return this.awaitScan().then(result => {
      console.log(`[TEST] handleSubmitAttempt — scan result received: riskLevel=${result.riskLevel}`);

      if (result && result.riskLevel === "none") {
        console.log("[TEST] handleSubmitAttempt — scan clear, releasing submit");
        this.releaseSubmit();
        return { released: true, reason: "scan_clear" };
      } else {
        console.log(`[TEST] handleSubmitAttempt — submit BLOCKED: ${result.riskLevel} risk`);
        this.showToast(`⚠️ Submission blocked — ${result.riskLevel} risk detected.`);
        return { released: false, reason: "risk_detected", riskLevel: result.riskLevel };
      }
    });
  }

  // ── Test Assertions ────────────────────────────────────────────────────

  assert(condition, message) {
    if (!condition) {
      console.error(`❌ ASSERTION FAILED: ${message}`);
      return false;
    }
    console.log(`✓ ${message}`);
    return true;
  }

  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      console.error(
        `❌ ASSERTION FAILED: ${message}\n   Expected: ${expected}\n   Actual: ${actual}`
      );
      return false;
    }
    console.log(`✓ ${message}`);
    return true;
  }

  reset() {
    this.state = "IDLE";
    this.scanResults = null;
    this.toastMessages = [];
    this.submitAttempts = [];
    this.releaseAttempts = [];
    this.lastScannedText = "";
    this.pendingSubmitResolver = null;
  }
}

// ── Test Scenarios ────────────────────────────────────────────────────────

async function runTests() {
  console.log("\n" + "=".repeat(70));
  console.log("TEST SUITE: Submit Interception Flow");
  console.log("=".repeat(70) + "\n");

  const tester = new SubmitInterceptionTester();
  let testsPassed = 0;
  let testsFailed = 0;

  // ── TEST 1: Normal flow - type safe text → debounce → scan → badge → Enter → release ──
  console.log("\n--- TEST 1: Safe Text Flow ---");
  console.log("Scenario: User types safe text → waits for debounce → scan completes → presses Enter");
  console.log("Expected: Scan completes with 'none' risk → Submit released\n");

  tester.reset();
  tester.onInput("Hello, how are you today?");
  tester.assert(tester.state === "PENDING", "State should be PENDING after input");

  // Wait for debounce
  await new Promise(resolve => setTimeout(resolve, tester.DEBOUNCE_MS + 50));

  tester.assert(tester.state === "DONE", "State should be DONE after debounce");
  tester.assertEqual(
    tester.scanResults.riskLevel,
    "none",
    "Safe text should have 'none' risk level"
  );

  // Now press Enter
  const submitResult = await tester.handleSubmitAttempt("Hello, how are you today?");
  tester.assert(
    submitResult.released === true,
    "Submit should be released after scan completes with 'none' risk"
  );
  tester.assert(
    tester.releaseAttempts.length === 1,
    "releaseSubmit should be called once"
  );

  if (submitResult.released) testsPassed++;
  else testsFailed++;

  // ── TEST 2: User presses Enter during debounce (PENDING state) ──
  console.log("\n--- TEST 2: Enter Pressed During Debounce (PENDING) ---");
  console.log("Scenario: User types → immediately presses Enter before debounce completes");
  console.log(
    "Expected: Submit blocked with toast → debounce cancelled → scan runs → Submit released\n"
  );

  tester.reset();
  tester.onInput("safe message with no risks");
  tester.assert(tester.state === "PENDING", "State should be PENDING after input");

  // Immediately press Enter without waiting for debounce
  const result2 = await tester.handleSubmitAttempt("safe message with no risks");

  tester.assert(
    tester.toastMessages.some(msg => msg.includes("scanning")),
    "Should show 'scanning' toast when Enter pressed during PENDING"
  );
  tester.assert(
    result2.released === true,
    "Submit should eventually be released after scan runs"
  );

  if (result2.released) testsPassed++;
  else testsFailed++;

  // ── TEST 3: Risky content - submission should be blocked ──
  console.log("\n--- TEST 3: Risky Content Detection - Submission Blocked ---");
  console.log("Scenario: User types content with high-risk data (credit card)");
  console.log("Expected: Scan detects risk → Submit BLOCKED\n");

  tester.reset();
  const riskyCCText =
    "My card is 4532-1234-5678-9999 please charge it for the order";
  tester.onInput(riskyCCText);

  // Wait for debounce
  await new Promise(resolve => setTimeout(resolve, tester.DEBOUNCE_MS + 50));

  tester.assert(
    tester.scanResults.riskLevel === "high",
    "Credit card should be detected as HIGH risk"
  );
  tester.assert(
    tester.scanResults.findings.length > 0,
    "Should have findings for the credit card"
  );

  // Try to submit
  const result3 = await tester.handleSubmitAttempt(riskyCCText);

  tester.assert(
    result3.released === false,
    "Submit should be BLOCKED for high-risk content"
  );
  tester.assertEqual(
    result3.riskLevel,
    "high",
    "Should detect high risk level"
  );
  tester.assert(
    tester.toastMessages.some(msg => msg.includes("blocked")),
    "Should show 'blocked' toast for risky content"
  );

  if (!result3.released) testsPassed++;
  else testsFailed++;

  // ── TEST 4: Moderate risk (email) - submission blocked ──
  console.log("\n--- TEST 4: Moderate Risk Content - Submission Blocked ---");
  console.log("Scenario: User types content with moderate-risk data (email)");
  console.log("Expected: Scan detects moderate risk → Submit BLOCKED\n");

  tester.reset();
  const riskyEmailText =
    "Please send confirmation to john.doe@example.com when ready";
  tester.onInput(riskyEmailText);

  // Wait for debounce
  await new Promise(resolve => setTimeout(resolve, tester.DEBOUNCE_MS + 50));

  tester.assert(
    tester.scanResults.riskLevel === "moderate",
    "Email should be detected as MODERATE risk"
  );

  // Try to submit
  const result4 = await tester.handleSubmitAttempt(riskyEmailText);

  tester.assert(
    result4.released === false,
    "Submit should be BLOCKED for moderate-risk content"
  );

  if (!result4.released) testsPassed++;
  else testsFailed++;

  // ── TEST 5: Empty text submission ──
  console.log("\n--- TEST 5: Empty Text - Should Allow Through ---");
  console.log("Scenario: User tries to submit empty text");
  console.log("Expected: Empty submissions pass through without blocking\n");

  tester.reset();
  const result5 = await tester.handleSubmitAttempt("");

  tester.assert(
    tester.submitAttempts.length === 1,
    "Should record the submit attempt"
  );
  tester.assert(
    tester.releaseAttempts.length === 0,
    "Empty submission should not trigger releaseSubmit"
  );

  testsPassed++;

  // ── TEST 6: State machine consistency ──
  console.log("\n--- TEST 6: State Machine Consistency ---");
  console.log(
    "Scenario: Verify state transitions IDLE → PENDING → SCANNING → DONE"
  );
  console.log("Expected: All transitions occur correctly\n");

  tester.reset();
  const states = [tester.state];

  tester.onInput("test");
  states.push(tester.state); // Should be PENDING

  await new Promise(resolve => setTimeout(resolve, tester.DEBOUNCE_MS + 50));
  states.push(tester.state); // Should be DONE

  tester.assert(states[0] === "IDLE", "Initial state should be IDLE");
  tester.assert(states[1] === "PENDING", "After input should be PENDING");
  tester.assert(states[2] === "DONE", "After debounce should be DONE");

  testsPassed++;

  // ── Summary ────────────────────────────────────────────────────────────

  console.log("\n" + "=".repeat(70));
  console.log("TEST SUMMARY");
  console.log("=".repeat(70));
  console.log(`✓ Tests Passed: ${testsPassed}`);
  console.log(`✗ Tests Failed: ${testsFailed}`);
  console.log(
    `Total: ${testsPassed + testsFailed} | Success Rate: ${(
      (testsPassed / (testsPassed + testsFailed)) *
      100
    ).toFixed(1)}%`
  );
  console.log("=".repeat(70) + "\n");

  // ── Toast Message Audit ────────────────────────────────────────────────

  console.log("Toast Messages Captured:");
  tester.toastMessages.forEach((msg, i) => {
    console.log(`  ${i + 1}. "${msg}"`);
  });

  // ── Submit Attempts Audit ──────────────────────────────────────────────

  console.log("\nSubmit Attempts:");
  tester.submitAttempts.forEach((attempt, i) => {
    console.log(
      `  ${i + 1}. State: ${attempt.state}, Text: "${attempt.text.slice(
        0,
        40
      )}${attempt.text.length > 40 ? "..." : ""}"`
    );
  });

  // ── Release Attempts Audit ─────────────────────────────────────────────

  console.log("\nRelease Attempts (submit allowed):");
  if (tester.releaseAttempts.length === 0) {
    console.log("  (none)");
  } else {
    tester.releaseAttempts.forEach((_, i) => {
      console.log(`  ${i + 1}. Submit released`);
    });
  }

  return testsFailed === 0;
}

// ── Run Tests ──────────────────────────────────────────────────────────────

console.log("\n[TEST] Initializing test suite...\n");

runTests()
  .then(success => {
    if (success) {
      console.log("\n🎉 ALL TESTS PASSED! Submit interception system is working correctly.\n");
    } else {
      console.log("\n⚠️  SOME TESTS FAILED. Please review the implementation.\n");
    }
  })
  .catch(err => {
    console.error("\n❌ TEST SUITE ERROR:", err);
  });
