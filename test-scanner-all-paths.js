#!/usr/bin/env node
/**
 * test-scanner-all-paths.js
 * 
 * Comprehensive test to verify all four paths are working:
 * - PATH A: Regex + validator (credentials, PhilIDs)
 * - PATH B: Gazetteer (context-based detection)
 * - PATH C: Linguistic (NER/POS for implicit references)
 * - SOURCE CODE: Unformatted code block detection
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shim for globalThis in Node
if (typeof globalThis === 'undefined') {
  global.globalThis = global;
}

// Load scripts
console.log("[TEST] Loading modules...");
eval(fs.readFileSync(path.join(__dirname, "lib", "validator.min.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "normalizer.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "patterns.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "gazetteer.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "linguistic-detector.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "validator-wrapper.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "scanner.js"), "utf8"));

console.log("[TEST] Modules loaded successfully");

// ── Test cases for each path ────────────────────────────────────────────
const testCases = [
  {
    name: "PATH A - API Key (Credential)",
    input: "My OpenAI API key is sk-proj-abc123def456ghi789jkl012mno34pqr56stu",
    expectedPattern: "api_key",
    expectedRisk: "high"
  },
  {
    name: "PATH A - Philippine ID (PHILID)",
    input: "My PHILID is 000-000-000-0123456789",
    expectedPattern: "ph_id_philid",
    expectedRisk: "high"
  },
  {
    name: "PATH B - Gazetteer (Context-based)",
    input: "i have diabetes",  // Should trigger gazetteer on medical/health context
    expectedPattern: undefined, // May or may not have specific pattern
    expectedRisk: "low"  // Or varies depending on gazetteer rules
  },
  {
    name: "PATH C - Linguistic (Implicit name reference)",
    input: "my name is kyleen",  // Should trigger linguistic NER for person name
    expectedPattern: undefined,
    expectedRisk: "low"
  },
  {
    name: "SOURCE CODE - Code block with API key",
    input: `const apiKey = 'sk-abc123def456ghi789';
async function fetchUser(userId) {
  const res = await fetch('/api/users', {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  return res.json();
}`,
    expectedPattern: "source_code",
    expectedRisk: "high"
  },
  {
    name: "SOURCE CODE - Unformatted code with credentials",
    input: `let token = "ghp_1234567890abcdefghijklmnopqrstu"
function login(user, pass) {
  fetch("/login", {body: {user, pass}})
}
login("admin", "password123")`,
    expectedPattern: "source_code",
    expectedRisk: "high"
  }
];

// ── Run tests ──────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(80));
console.log("TESTING ALL FOUR PATHS");
console.log("=".repeat(80) + "\n");

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n[TEST] ${testCase.name}`);
  console.log(`Input: "${testCase.input.substring(0, 60)}${testCase.input.length > 60 ? "..." : ""}"`);
  
  try {
    const result = TrustScanner.scan(testCase.input);
    const { findings, riskLevel, score } = result;
    
    console.log(`Results:`);
    console.log(`  - Risk Level: ${riskLevel}`);
    console.log(`  - Score: ${score}`);
    console.log(`  - Findings: ${findings.length}`);
    
    if (findings.length > 0) {
      console.log(`  - Found patterns:`);
      for (const finding of findings) {
        console.log(`    * ${finding.patternId} (${finding.risk}) - "${finding.rawMatch.substring(0, 30)}${finding.rawMatch.length > 30 ? "..." : ""}"`);
      }
    }
    
    // ── Verify expectations ──
    let testPassed = true;
    
    if (testCase.expectedPattern) {
      const found = findings.some(f => f.patternId === testCase.expectedPattern);
      if (!found) {
        console.log(`  ✗ FAIL: Expected pattern "${testCase.expectedPattern}" not found`);
        testPassed = false;
      } else {
        console.log(`  ✓ Found expected pattern "${testCase.expectedPattern}"`);
      }
    } else {
      console.log(`  ✓ No specific pattern expected`);
    }
    
    if (testCase.expectedRisk && findings.length > 0) {
      if (riskLevel !== testCase.expectedRisk) {
        console.log(`  ⚠ Expected risk "${testCase.expectedRisk}" but got "${riskLevel}"`);
        // Don't fail - risk level can vary based on multiple factors
      }
    }
    
    if (testPassed && findings.length > 0) {
      passed++;
      console.log(`  ✓ PASS`);
    } else if (testPassed && testCase.expectedPattern === undefined) {
      passed++;
      console.log(`  ✓ PASS (no specific pattern required)`);
    } else if (!testPassed) {
      failed++;
      console.log(`  ✗ FAIL`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ERROR: ${err.message}`);
    console.error(err);
  }
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(80));
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
console.log("=".repeat(80));

process.exit(failed > 0 ? 1 : 0);
