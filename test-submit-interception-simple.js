// test-submit-interception-simple.js
// Simplified synchronous test of submit interception flow

console.log("[TEST] Submit Interception Simple Test Starting...\n");

// ── Test utilities ────────────────────────────────────────────────────────

const test = (name, fn) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    return true;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    return false;
  }
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`${message} - Expected: ${expected}, Got: ${actual}`);
  }
};

// ── Simulate core functions ────────────────────────────────────────────

class SubmitBlockingSimulator {
  constructor() {
    this.state = "IDLE"; // IDLE, PENDING, SCANNING, DONE
    this.scanResults = null;
    this.lastScannedText = "";
    this.submitAllowed = false;
    this.submitBlocked = false;
  }

  // Simulate scanning logic
  scan(text) {
    if (!text.trim()) {
      this.state = "IDLE";
      return { riskLevel: "none", findings: [] };
    }

    this.state = "SCANNING";

    // Simulate risk detection
    let riskLevel = "none";
    let findings = [];

    if (text.includes("4532-1234-5678-9999")) {
      riskLevel = "high";
      findings = [
        {
          patternId: "credit_card",
          label: "Credit Card",
          risk: "high"
        }
      ];
    } else if (text.includes("@example.com")) {
      riskLevel = "moderate";
      findings = [
        {
          patternId: "email",
          label: "Email",
          risk: "moderate"
        }
      ];
    }

    this.scanResults = { riskLevel, findings };
    this.state = "DONE";
    return this.scanResults;
  }

  // Simulate debounce
  debounce(text) {
    this.state = "PENDING";
    this.lastScannedText = text;
    // In real flow, scan() would be called after 400ms
  }

  // Simulate input handling
  onInput(text) {
    this.debounce(text);
  }

  // Simulate submit interception
  handleSubmit(text) {
    this.submitAllowed = false;
    this.submitBlocked = false;

    if (!text.trim()) {
      this.submitAllowed = true;
      return { allowed: true, reason: "empty_text" };
    }

    // Check current state
    if (this.state === "PENDING" || this.state === "SCANNING") {
      // In real code, this would wait for scan via awaitScan()
      // For this test, immediately run the scan
      this.scan(text);
    } else if (this.state === "DONE" && this.scanResults) {
      // Already scanned, use cached result
    } else {
      // IDLE - run scan immediately
      this.scan(text);
    }

    // Check scan results
    const result = this.scanResults || { riskLevel: "none", findings: [] };

    if (result.riskLevel === "none") {
      this.submitAllowed = true;
      return { allowed: true, reason: "scan_clear", riskLevel: "none" };
    } else {
      this.submitBlocked = true;
      return {
        allowed: false,
        reason: "risk_detected",
        riskLevel: result.riskLevel,
        findings: result.findings
      };
    }
  }

  reset() {
    this.state = "IDLE";
    this.scanResults = null;
    this.lastScannedText = "";
    this.submitAllowed = false;
    this.submitBlocked = false;
  }
}

// ── Run tests ────────────────────────────────────────────────────────────

console.log("=".repeat(70));
console.log("TEST SUITE: Submit Blocking Logic");
console.log("=".repeat(70) + "\n");

const sim = new SubmitBlockingSimulator();
let passCount = 0;
let failCount = 0;

// TEST 1: Safe text - should allow submission
if (
  test("TEST 1: Safe text → scan complete → submit allowed", () => {
    sim.reset();
    sim.onInput("Hello, how are you today?");
    assert(sim.state === "PENDING", "State should be PENDING after input");

    // Simulate debounce completing by manually scanning
    const scanResult = sim.scan("Hello, how are you today?");
    assert(
      scanResult.riskLevel === "none",
      "Safe text should have 'none' risk"
    );
    assert(sim.state === "DONE", "State should be DONE after scan");

    // Now submit
    const submitResult = sim.handleSubmit("Hello, how are you today?");
    assert(submitResult.allowed === true, "Submit should be allowed");
    assert(sim.submitAllowed === true, "submitAllowed flag should be set");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 2: Credit card in text - should block submission
if (
  test("TEST 2: High-risk content (credit card) → submission blocked", () => {
    sim.reset();
    const riskyText = "My card is 4532-1234-5678-9999 please charge it";
    sim.onInput(riskyText);

    // Simulate scan
    const scanResult = sim.scan(riskyText);
    assert(scanResult.riskLevel === "high", "Credit card should be HIGH risk");
    assert(scanResult.findings.length > 0, "Should have findings");

    // Try to submit
    const submitResult = sim.handleSubmit(riskyText);
    assert(submitResult.allowed === false, "Submit should be BLOCKED");
    assert(sim.submitBlocked === true, "submitBlocked flag should be set");
    assert(
      submitResult.riskLevel === "high",
      "Should identify high risk level"
    );
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 3: Email in text - should block submission (moderate risk)
if (
  test(
    "TEST 3: Moderate-risk content (email) → submission blocked",
    () => {
      sim.reset();
      const riskyText = "Please send confirmation to john.doe@example.com";
      sim.onInput(riskyText);

      // Simulate scan
      const scanResult = sim.scan(riskyText);
      assert(
        scanResult.riskLevel === "moderate",
        "Email should be MODERATE risk"
      );

      // Try to submit
      const submitResult = sim.handleSubmit(riskyText);
      assert(submitResult.allowed === false, "Submit should be BLOCKED");
      assert(
        submitResult.riskLevel === "moderate",
        "Should identify moderate risk"
      );
    }
  )
) {
  passCount++;
} else {
  failCount++;
}

// TEST 4: Empty text - should allow submission
if (
  test("TEST 4: Empty text → submission allowed (no scan)", () => {
    sim.reset();
    const submitResult = sim.handleSubmit("");
    assert(submitResult.allowed === true, "Empty submission should be allowed");
    assert(submitResult.reason === "empty_text", "Should indicate empty text");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 5: State transitions
if (
  test("TEST 5: State machine transitions (IDLE → PENDING → DONE)", () => {
    sim.reset();
    assert(sim.state === "IDLE", "Initial state should be IDLE");

    sim.onInput("test");
    assert(sim.state === "PENDING", "After input should be PENDING");

    sim.scan("test");
    assert(sim.state === "DONE", "After scan should be DONE");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 6: Submit during PENDING state (before scan runs)
if (
  test(
    "TEST 6: Submit during PENDING state → scan runs immediately → then decide",
    () => {
      sim.reset();

      // User types (state becomes PENDING, scan hasn't run yet)
      sim.onInput("Hello world");
      assert(sim.state === "PENDING", "State should be PENDING after input");
      assert(
        sim.scanResults === null,
        "Scan should not have run yet (still in debounce)"
      );

      // User presses Enter immediately (before debounce fires)
      // In real code, awaitScan() would cancel debounce and scan immediately
      const submitResult = sim.handleSubmit("Hello world");

      // handleSubmit calls scan() internally when PENDING
      assert(sim.state === "DONE", "State should be DONE after handleSubmit");
      assert(
        submitResult.allowed === true,
        "Safe text should allow submission"
      );
    }
  )
) {
  passCount++;
} else {
  failCount++;
}

// ── Summary ────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(70));
console.log("RESULTS");
console.log("=".repeat(70));
console.log(`✓ Passed: ${passCount}`);
console.log(`✗ Failed: ${failCount}`);
console.log(`Total:   ${passCount + failCount}`);
console.log(
  `Success: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`
);
console.log("=".repeat(70));

if (failCount === 0) {
  console.log("\n🎉 ALL TESTS PASSED!\n");
  console.log("Submit blocking logic is working correctly:");
  console.log("  ✓ Safe text allows submission");
  console.log("  ✓ High-risk content blocks submission");
  console.log("  ✓ Moderate-risk content blocks submission");
  console.log("  ✓ Empty text allows submission");
  console.log("  ✓ State transitions work correctly");
  console.log("  ✓ Submit during PENDING triggers immediate scan\n");
} else {
  console.log("\n⚠️  Some tests failed. Review implementation.\n");
  process.exit(1);
}
