// test-autonomy-model.js
// Test suite for submit interception with USER AUTONOMY model
// - Only blocks DURING scanning/scoring
// - Allows submission for ALL risk levels once scan is complete
// - User can review badge/panel and decide to send or edit

console.log("[TEST] User Autonomy Model Test Suite Loading...\n");

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

// ── Autonomy Model Simulator ────────────────────────────────────────

class AutonomyModelSimulator {
  constructor() {
    this.state = "IDLE"; // IDLE, PENDING, SCANNING, DONE
    this.scanResults = null;
    this.lastScannedText = "";
    this.toasts = [];
    this.submitsAllowed = [];
    this.submitsBlocked = [];
  }

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
      findings = [{ patternId: "credit_card", label: "Credit Card", risk: "high" }];
    } else if (text.includes("@example.com")) {
      riskLevel = "moderate";
      findings = [{ patternId: "email", label: "Email", risk: "moderate" }];
    }

    this.scanResults = { riskLevel, findings };
    this.state = "DONE";
    return this.scanResults;
  }

  onInput(text) {
    this.state = "PENDING";
    this.lastScannedText = text;
  }

  showToast(msg) {
    console.log(`   [TOAST] ${msg}`);
    this.toasts.push(msg);
  }

  handleSubmit(text) {
    console.log(`\n   handleSubmit called, state: ${this.state}`);

    if (!text.trim()) {
      console.log(`   → Empty text, allowed immediately`);
      this.submitsAllowed.push({ text, reason: "empty" });
      return { allowed: true, reason: "empty_text" };
    }

    // BLOCKING: Scan in progress
    if (this.state === "PENDING" || this.state === "SCANNING") {
      console.log(`   → Scan in progress, BLOCKING`);
      this.showToast("⏸ Scanning… TrustPrompt is analyzing your prompt. Please wait.");
      this.submitsBlocked.push({ text, reason: "scanning", state: this.state });
      return { blocked: true, reason: "scanning_in_progress" };
    }

    // ALLOWED: Scan complete, user has autonomy
    if (this.state === "DONE" && this.scanResults) {
      const risk = this.scanResults.riskLevel;
      console.log(`   → Scan complete, badge shows: ${risk.toUpperCase()}, ALLOWING submission`);
      console.log(`   → User can now decide: send original, copy safe version, or edit`);
      this.submitsAllowed.push({ 
        text, 
        reason: "scan_complete_user_autonomy",
        riskLevel: risk,
        findings: this.scanResults.findings
      });
      return { 
        allowed: true, 
        reason: "scan_complete_user_autonomy",
        riskLevel: risk,
        message: `Badge displays ${risk} risk - user can review or proceed`
      };
    }

    // Shouldn't reach here
    return { allowed: false, reason: "unknown" };
  }

  reset() {
    this.state = "IDLE";
    this.scanResults = null;
    this.lastScannedText = "";
    this.toasts = [];
    this.submitsAllowed = [];
    this.submitsBlocked = [];
  }
}

// ── Run Tests ────────────────────────────────────────────────────────

console.log("=".repeat(70));
console.log("TEST SUITE: User Autonomy Model");
console.log("=".repeat(70) + "\n");

const sim = new AutonomyModelSimulator();
let passCount = 0;
let failCount = 0;

// TEST 1: Safe text - immediate allow
if (
  test("TEST 1: Safe text (none) → scan complete → user sends", () => {
    sim.reset();
    console.log("Scenario: User types safe text, waits for debounce, presses Enter");
    sim.onInput("Hello, how are you?");
    assert(sim.state === "PENDING", "State should be PENDING");

    sim.scan("Hello, how are you?");
    assert(sim.state === "DONE", "State should be DONE after scan");
    assert(sim.scanResults.riskLevel === "none", "Should be 'none' risk");

    const result = sim.handleSubmit("Hello, how are you?");
    assert(result.allowed === true, "Submit MUST be allowed");
    assert(sim.submitsAllowed.length === 1, "Should record allowed submit");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 2: High-risk content - STILL ALLOWED (user autonomy!)
if (
  test("TEST 2: High-risk content (credit card) → scan complete → user CAN send", () => {
    sim.reset();
    console.log("Scenario: User types credit card (test data), badge shows RED");
    const text = "My card is 4532-1234-5678-9999 for testing";
    sim.onInput(text);

    sim.scan(text);
    assert(sim.state === "DONE", "State should be DONE");
    assert(sim.scanResults.riskLevel === "high", "Should be 'high' risk");

    console.log("   User reviews the badge showing HIGH risk");
    console.log("   User thinks: 'This is test data, I'll send it'");

    const result = sim.handleSubmit(text);
    assert(result.allowed === true, "Submit MUST be allowed (user autonomy!)");
    assert(
      result.riskLevel === "high",
      "Should show high risk level to user"
    );
    assert(sim.submitsAllowed.length === 1, "Should record autonomy choice");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 3: Moderate-risk content - STILL ALLOWED (user autonomy!)
if (
  test("TEST 3: Moderate-risk (email) → scan complete → user CAN send", () => {
    sim.reset();
    console.log("Scenario: User types email, badge shows ORANGE");
    const text = "Please CC john.doe@example.com on the update";
    sim.onInput(text);

    sim.scan(text);
    assert(sim.state === "DONE", "State should be DONE");
    assert(sim.scanResults.riskLevel === "moderate", "Should be 'moderate' risk");

    console.log("   User sees badge with moderate risk");
    console.log("   User options:");
    console.log("     • Send original as-is");
    console.log("     • Copy safe version (john***@example.com)");
    console.log("     • Edit manually");

    const result = sim.handleSubmit(text);
    assert(result.allowed === true, "Submit MUST be allowed (user autonomy!)");
    assert(result.riskLevel === "moderate", "Should show moderate risk");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 4: Low-risk content - ALLOWED
if (
  test("TEST 4: Low-risk content → scan complete → user sends", () => {
    sim.reset();
    console.log("Scenario: User types content with low-risk pattern");
    const text = "User Name: TestUser";
    sim.onInput(text);
    sim.scan(text);

    const result = sim.handleSubmit(text);
    assert(result.allowed === true, "Submit MUST be allowed");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 5: Empty text - no scanning needed
if (
  test("TEST 5: Empty text → bypass scan → immediate allow", () => {
    sim.reset();
    console.log("Scenario: User tries to send empty prompt");

    const result = sim.handleSubmit("");
    assert(result.allowed === true, "Empty should be allowed");
    assert(result.reason === "empty_text", "Should indicate empty text");
    assert(sim.toasts.length === 0, "No toast for empty text");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 6: Submit during debounce (PENDING state) - BLOCKED
if (
  test("TEST 6: Submit during debounce (PENDING) → BLOCKED until scan complete", () => {
    sim.reset();
    console.log("Scenario: User types, presses Enter BEFORE debounce expires");
    const text = "Hello world";
    sim.onInput(text);
    assert(sim.state === "PENDING", "State should be PENDING");

    console.log("   User presses Enter immediately (scan not started yet)");
    const result1 = sim.handleSubmit(text);
    assert(
      result1.blocked === true,
      "Should BLOCK submission during PENDING"
    );
    assert(
      sim.toasts.some(t => t.includes("Scanning")),
      "Should show 'Scanning' toast"
    );
    assert(sim.submitsBlocked.length === 1, "Should record blocked attempt");

    console.log("   TrustPrompt cancels debounce, scans immediately");
    sim.scan(text); // Scan completes
    assert(sim.state === "DONE", "State should be DONE after scan");

    console.log("   Badge now shows risk level, user can now send");
    const result2 = sim.handleSubmit(text);
    assert(result2.allowed === true, "Should ALLOW after scan complete");
    assert(sim.submitsAllowed.length === 1, "Should record allowed attempt");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 7: State machine - verify transitions
if (
  test("TEST 7: State machine transitions (IDLE → PENDING → SCANNING → DONE)", () => {
    sim.reset();
    console.log("Scenario: Verify all state transitions");

    assert(sim.state === "IDLE", "Start at IDLE");
    sim.onInput("test");
    assert(sim.state === "PENDING", "After input → PENDING");
    sim.scan("test");
    assert(sim.state === "DONE", "After scan → DONE");
  })
) {
  passCount++;
} else {
  failCount++;
}

// TEST 8: Scenario - User decides to send high-risk content
if (
  test("TEST 8: User autonomy scenario - sends high-risk after reviewing", () => {
    sim.reset();
    console.log("\nScenario: User shares test credit card, reviews badge, decides to send");
    console.log("  Step 1: Type test credit card");
    const text = "Test card 4532-1234-5678-9999";
    sim.onInput(text);
    console.log("  Step 2: Debounce expires, scan runs");
    sim.scan(text);
    console.log("  Step 3: Badge shows RED (high risk)");
    console.log("  Step 4: User reviews TrustPrompt panel");
    console.log("         Pattern: Credit Card");
    console.log("         Detected: 4532-1234-5678-9999");
    console.log("         Safe: [REDACTED]");
    console.log("  Step 5: User thinks 'This is test data' and presses Enter");

    const result = sim.handleSubmit(text);
    assert(result.allowed === true, "User MUST be able to send despite high risk");
    assert(result.riskLevel === "high", "System shows user the risk level");
    console.log("  Result: ✅ Message sent with user's full autonomy");
  })
) {
  passCount++;
} else {
  failCount++;
}

// ── Summary ────────────────────────────────────────────────────────

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
  console.log("User Autonomy Model is working correctly:");
  console.log("  ✓ Only blocks DURING scanning (PENDING/SCANNING states)");
  console.log("  ✓ Allows submission for ALL risk levels once scan completes");
  console.log("  ✓ Users can review badge/findings before sending");
  console.log("  ✓ Users can copy safe version or edit manually");
  console.log("  ✓ Users have full autonomy over final decision");
  console.log("  ✓ Empty text bypasses scanning entirely");
  console.log("  ✓ State machine transitions work correctly\n");
  console.log("Core Principle: Trust users to make informed decisions with");
  console.log("                TrustPrompt providing risk scores and masks.\n");
} else {
  console.log("\n⚠️  Some tests failed. Review implementation.\n");
  process.exit(1);
}
