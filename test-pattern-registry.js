/**
 * test-pattern-registry.js
 * TASK 6.3: Integration tests for Philippine ID pattern registry
 * 
 * Tests verify:
 * - All 14 Philippine ID patterns are in TRUSTPROMPT_PATTERNS
 * - Pattern IDs are unique
 * - Regex matching works with and without separators
 * - Sanitize functions produce consistent redaction
 * 
 * Requirements: 15, 19, 20
 * 
 * Run with: node test-pattern-registry.js
 */

// ── Browser shim: load patterns.js ───────────────────────────────────────────
global.TRUSTPROMPT_PATTERNS = undefined;
const fs = require("fs");

// Load patterns.js with necessary globals
const patternsCode = fs.readFileSync(__dirname + "/patterns.js", "utf8")
  .replace(/\/\*.*?\*\//gs, "");  // Remove comments

// eval patterns.js to populate globals
eval("var TRUSTPROMPT_PATTERNS; " + patternsCode.replace(/^const TRUSTPROMPT_PATTERNS/, "TRUSTPROMPT_PATTERNS"));

if (!TRUSTPROMPT_PATTERNS || !Array.isArray(TRUSTPROMPT_PATTERNS)) {
  console.error("❌ Failed to load TRUSTPROMPT_PATTERNS from patterns.js");
  process.exit(1);
}
console.log("✅ Loaded TRUSTPROMPT_PATTERNS\n");

// ── Verify all 14 patterns are registered ────────────────────────────────

console.log("\n=== TASK 6.3: Pattern Registry Integration Tests ===\n");

// List of all 14 Philippine ID pattern IDs (in kebab-case)
const EXPECTED_PATTERNS = [
  "ph_id_philid",
  "ph_id_drivers_license",
  "ph_id_passport",
  "ph_id_umid",
  "ph_id_sss",
  "ph_id_gsis",
  "ph_id_prc",
  "ph_id_tin",
  "ph_id_philhealth",
  "ph_id_nbi_clearance",
  "ph_id_police_clearance",
  "ph_id_psa_certificate",
  "ph_id_barangay_clearance",
  "ph_id_comelec_voter_id"
];

let passCount = 0;
let failCount = 0;

function test(name, condition, details = "") {
  if (condition) {
    console.log(`✓ ${name}`);
    passCount++;
  } else {
    console.log(`✗ ${name}`);
    if (details) console.log(`  ${details}`);
    failCount++;
  }
}

// ── Test 1: All patterns registered ──────────────────────────────────────

console.log("Test 1: Pattern registration");
const registeredIds = TRUSTPROMPT_PATTERNS.map(p => p.id);
for (const expectedId of EXPECTED_PATTERNS) {
  test(
    `Pattern ${expectedId} is registered`,
    registeredIds.includes(expectedId),
    `Not found in TRUSTPROMPT_PATTERNS`
  );
}

// ── Test 2: Pattern IDs are unique ──────────────────────────────────────

console.log("\nTest 2: Pattern ID uniqueness");
const idCounts = {};
for (const pattern of TRUSTPROMPT_PATTERNS) {
  idCounts[pattern.id] = (idCounts[pattern.id] || 0) + 1;
}

const duplicates = Object.entries(idCounts).filter(([_, count]) => count > 1);
test(
  "No duplicate pattern IDs",
  duplicates.length === 0,
  duplicates.length > 0 ? `Found duplicates: ${duplicates.map(([id]) => id).join(", ")}` : ""
);

// ── Test 3: Regex matching with and without separators ──────────────────

console.log("\nTest 3: Regex pattern matching");

const testCases = {
  ph_id_philid: [
    { value: "920315123456", description: "without separators" },
    { value: "92-03-15-123-45-6", description: "with hyphens" },
    { value: "92 03 15 123 45 6", description: "with spaces" }
  ],
  ph_id_sss: [
    { value: "0412345678", description: "without separators" },
    { value: "04-123456-78", description: "with hyphens" },
    { value: "04 123456 78", description: "with spaces" }
  ],
  ph_id_drivers_license: [
    { value: "12345678901", description: "without separators" },
    { value: "12-3456-ABCD-567", description: "with hyphens and alphanumeric" }
  ],
  ph_id_passport: [
    { value: "123456789", description: "without prefix" },
    { value: "P123456789", description: "with P prefix" },
    { value: "PH12345678", description: "with PH prefix" }
  ],
  ph_id_tin: [
    { value: "123456789", description: "without separators" },
    { value: "123-45-678-9", description: "with hyphens" },
    { value: "123 45 678 9", description: "with spaces" }
  ]
};

for (const [patternId, cases] of Object.entries(testCases)) {
  const pattern = TRUSTPROMPT_PATTERNS.find(p => p.id === patternId);
  if (!pattern || !pattern.regex) continue;

  for (const testCase of cases) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = regex.test(testCase.value);
    test(
      `${patternId} regex matches ${testCase.description}`,
      matches,
      `Value: ${testCase.value}`
    );
  }
}

// ── Test 4: Sanitize functions produce consistent output ──────────────────

console.log("\nTest 4: Sanitize function consistency");

const sanitizeTestCases = {
  ph_id_philid: {
    input: "920315123456",
    expectedPattern: /^\d{2}-\*+-\*+-\*+\d{2}$/,
    description: "redacts middle, preserves first 2 and last 2"
  },
  ph_id_sss: {
    input: "0412345678",
    expectedPattern: /^\d{2}-[X\*]+-\d{2}$/i,
    description: "redacts middle sequence"
  },
  ph_id_tin: {
    input: "123456789",
    expectedPattern: /^\d{3}-\*+-\d{2}$/,
    description: "redacts middle, preserves area and check"
  }
};

for (const [patternId, testCase] of Object.entries(sanitizeTestCases)) {
  const pattern = TRUSTPROMPT_PATTERNS.find(p => p.id === patternId);
  if (!pattern || !pattern.sanitize) continue;

  const sanitized = pattern.sanitize(testCase.input);
  test(
    `${patternId} sanitize output matches pattern`,
    testCase.expectedPattern.test(sanitized),
    `Got: ${sanitized}`
  );

  test(
    `${patternId} sanitize preserves some digits`,
    /\d/.test(sanitized),
    `Expected at least one digit in: ${sanitized}`
  );

  test(
    `${patternId} sanitize removes original digits from middle`,
    !sanitized.includes(testCase.input.slice(2, -2)),
    `Middle portion should be redacted: ${sanitized}`
  );
}

// ── Test 5: All patterns have required fields ──────────────────────────

console.log("\nTest 5: Pattern structure validation");

for (const patternId of EXPECTED_PATTERNS) {
  const pattern = TRUSTPROMPT_PATTERNS.find(p => p.id === patternId);
  test(
    `${patternId} has id field`,
    pattern && typeof pattern.id === "string"
  );
  test(
    `${patternId} has label field`,
    pattern && typeof pattern.label === "string"
  );
  test(
    `${patternId} has regex field`,
    pattern && pattern.regex instanceof RegExp
  );
  test(
    `${patternId} has risk field`,
    pattern && (pattern.risk === "high" || pattern.risk === "moderate")
  );
  test(
    `${patternId} has sanitize function`,
    pattern && typeof pattern.sanitize === "function"
  );
  test(
    `${patternId} has structuralValidate function`,
    pattern && typeof pattern.structuralValidate === "function"
  );
}

// ── Test 6: Risk levels are correct ──────────────────────────────────────

console.log("\nTest 6: Risk level classification");

test(
  "13 patterns have risk='high'",
  EXPECTED_PATTERNS.filter(id => {
    const p = TRUSTPROMPT_PATTERNS.find(pat => pat.id === id);
    return p && p.risk === "high";
  }).length === 13
);

test(
  "ph_id_barangay_clearance has risk='moderate'",
  TRUSTPROMPT_PATTERNS.find(p => p.id === "ph_id_barangay_clearance").risk === "moderate"
);

// ── Test 7: Regex patterns are distinct ──────────────────────────────────

console.log("\nTest 7: Regex distinctness");

const regexSources = new Set();
for (const patternId of EXPECTED_PATTERNS) {
  const pattern = TRUSTPROMPT_PATTERNS.find(p => p.id === patternId);
  if (pattern && pattern.regex) {
    const source = pattern.regex.source;
    test(
      `${patternId} regex is unique`,
      !regexSources.has(source),
      `Regex source is duplicated`
    );
    regexSources.add(source);
  }
}

// ── Summary ──────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(50));
console.log(`RESULTS: ${passCount} passed, ${failCount} failed`);
console.log("=".repeat(50));

if (failCount === 0) {
  console.log("✓ All tests PASSED");
} else {
  console.log(`✗ ${failCount} test(s) FAILED`);
}
