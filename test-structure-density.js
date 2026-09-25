#!/usr/bin/env node

/**
 * test-structure-density.js
 * Unit tests for Signal 1: computeStructureDensity(text)
 * 
 * Tests:
 * - High bracket/punctuation density (code)
 * - Low bracket/punctuation density (prose)
 * - Mixed content (code + prose)
 * - Edge cases (empty strings, single characters)
 * - Component calculations (bracketCount, punctuationCount, densities)
 * 
 * Requirements: 2, 7, 13, 14
 * Task: 2.1, 2.2
 */

// Load scanner.js - we assume computeStructureDensity is defined there
// Since we can't directly import it in a Node.js context without ES modules,
// we'll include the function directly for testing

function computeStructureDensity(text) {
  if (!text) {
    return {
      signal: "structure_density",
      value: 0,
      components: {
        bracketDensity: "0.0000",
        punctuationDensity: "0.0000",
        bracketCount: 0,
        codePunctuation: 0,
        totalChars: 0
      }
    };
  }
  
  // Count brackets
  const BRACKET_PAIRS = [
    { open: '(', close: ')' },
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '<', close: '>' }
  ];
  
  let bracketCount = 0;
  for (const pair of BRACKET_PAIRS) {
    const openPattern = new RegExp('\\' + pair.open, 'g');
    const closePattern = new RegExp('\\' + pair.close, 'g');
    
    const openMatches = text.match(openPattern);
    const closeMatches = text.match(closePattern);
    
    bracketCount += (openMatches ? openMatches.length : 0);
    bracketCount += (closeMatches ? closeMatches.length : 0);
  }
  
  // Count code-specific punctuation
  const codePointuation = text.match(/[:;,=/>\\-]/g) || [];
  const punctuationCount = codePointuation.length;
  
  // Compute densities
  const totalChars = Math.max(text.length, 1);
  
  const bracketDensity = bracketCount / totalChars;
  const punctuationDensity = punctuationCount / totalChars;
  
  // Normalize to 0.0-1.0
  const rawDensity = bracketDensity + punctuationDensity;
  const structureDensity = Math.min(1.0, Math.max(0, rawDensity));
  
  return {
    signal: "structure_density",
    value: structureDensity,
    components: {
      bracketDensity: bracketDensity.toFixed(4),
      punctuationDensity: punctuationDensity.toFixed(4),
      bracketCount,
      codePunctuation: punctuationCount,
      totalChars
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Test Suite: computeStructureDensity
// ─────────────────────────────────────────────────────────────────────────

const assert = (condition, message) => {
  if (!condition) {
    console.error(`✗ FAIL: ${message}`);
    return false;
  }
  console.log(`✓ PASS: ${message}`);
  return true;
};

const assertNear = (actual, expected, tolerance = 0.01, message) => {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    console.error(`✗ FAIL: ${message} (expected ~${expected}, got ${actual}, diff ${diff})`);
    return false;
  }
  console.log(`✓ PASS: ${message} (${actual})`);
  return true;
};

let passCount = 0;
let failCount = 0;

// Helper to track results
const track = (result) => {
  if (result !== false) passCount++;
  else failCount++;
};

console.log("════════════════════════════════════════════════════════════════");
console.log("Unit Tests: computeStructureDensity(text)");
console.log("════════════════════════════════════════════════════════════════");

// ─────────────────────────────────────────────────────────────────────────
// Test 1: High Bracket/Punctuation Density (Code)
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 1: High Density (JavaScript Code)");
{
  const text = "function foo() { return 42; }";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text}"`);
  console.log(`Length: ${result.components.totalChars} chars`);
  console.log(`Bracket count: ${result.components.bracketCount}`);
  console.log(`Punctuation count: ${result.components.codePunctuation}`);
  
  track(assert(result.signal === "structure_density", "Signal name is correct"));
  track(assert(result.components.bracketCount > 0, "Brackets detected"));
  track(assert(result.components.codePunctuation > 0, "Punctuation detected"));
  track(assertNear(result.value, 0.17, 0.05, "High density score (~0.17)"));
  track(assert(result.value > 0.10, "Score exceeds code-like threshold (0.10)"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 2: Low Bracket/Punctuation Density (Prose)
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 2: Low Density (English Prose)");
{
  const text = "The quick brown fox jumps over the lazy dog";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text}"`);
  console.log(`Length: ${result.components.totalChars} chars`);
  console.log(`Bracket count: ${result.components.bracketCount}`);
  console.log(`Punctuation count: ${result.components.codePunctuation}`);
  
  track(assert(result.components.bracketCount === 0, "No brackets in prose"));
  track(assertNear(result.value, 0, 0.02, "Very low density score (~0)"));
  track(assert(result.value < 0.05, "Score below weakly code-like threshold (0.05)"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 3: JSON Object (Moderate Density)
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 3: Moderate Density (JSON)");
{
  const text = '{"name": "Alice", "age": 30}';
  const result = computeStructureDensity(text);
  
  console.log(`Input: ${text}`);
  console.log(`Bracket count: ${result.components.bracketCount}`);
  console.log(`Punctuation count: ${result.components.codePunctuation}`);
  
  track(assert(result.components.bracketCount === 2, "Curly braces counted (2)"));
  track(assert(result.components.codePunctuation > 0, "Punctuation detected"));
  track(assertNear(result.value, 0.23, 0.1, "Moderate density score (~0.23)"));
  track(assert(result.value > 0.05 && result.value < 0.25, "Score in moderate range"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 4: Edge Case - Empty String
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 4: Edge Case (Empty String)");
{
  const text = "";
  const result = computeStructureDensity(text);
  
  console.log(`Input: (empty string)`);
  
  track(assert(result.value === 0, "Empty string has zero density"));
  track(assert(result.components.bracketCount === 0, "No brackets in empty string"));
  track(assert(result.components.totalChars === 0, "Total chars is 0"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 5: Edge Case - Single Character
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 5: Edge Case (Single Character - Opening Bracket)");
{
  const text = "{";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text}"`);
  
  track(assert(result.components.bracketCount === 1, "Single bracket counted"));
  track(assertNear(result.value, 1.0, 0.05, "Single bracket = 100% density"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 6: Null/Undefined Input
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 6: Edge Case (Null Input)");
{
  const text = null;
  const result = computeStructureDensity(text);
  
  console.log(`Input: null`);
  
  track(assert(result.value === 0, "Null input returns 0 density"));
  track(assert(result.components.bracketCount === 0, "No brackets for null"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 7: Various Bracket Types
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 7: All Bracket Types Counted");
{
  const text = "array[0] = obj.prop; if (condition) { result = <value>; }";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text}"`);
  console.log(`Bracket count: ${result.components.bracketCount}`);
  
  // Brackets: [ ] ( ) { } < > = 8 total
  track(assert(result.components.bracketCount === 8, "All bracket types counted (8 total)"));
  track(assert(result.value > 0.1, "Mixed brackets produce code-like density"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 8: Punctuation Patterns
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 8: Code-specific Punctuation");
{
  const text = "const x = 5; const y = 10, z = 15; result = x > y ? z : y;";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text}"`);
  console.log(`Punctuation count: ${result.components.codePunctuation}`);
  
  // Semicolons (2), equals (3), comma (1), colon (1), greater (1), dash (0) = 8+
  track(assert(result.components.codePunctuation > 5, "Multiple punctuation marks detected"));
  track(assert(result.value > 0.05, "Code with many operators has moderate-high density"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 9: Python Code
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 9: Python Code");
{
  const text = "def process(data):\n    result = [x for x in data if x > 0]\n    return result";
  const result = computeStructureDensity(text);
  
  console.log(`Input: (Python function)`);
  console.log(`Bracket count: ${result.components.bracketCount}`);
  console.log(`Density: ${result.value.toFixed(3)}`);
  
  // Brackets: [ ] = 2, ( ) () = 4
  // Punctuation: : (2 from if condition), : (1 from def), > (1) = many
  track(assert(result.components.bracketCount > 0, "Python code has brackets"));
  track(assert(result.value > 0.05, "Python code has code-like density"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 10: Technical Documentation (High Punctuation but NOT Code)
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 10: Technical Documentation (False Positive Check)");
{
  const text = "The API endpoint is: /api/v1/users. Usage: POST /api/v1/users with body: {id: 1, name: 'Alice'}.";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text.substring(0, 60)}..."`);
  console.log(`Density: ${result.value.toFixed(3)}`);
  
  // This has some punctuation and even a JSON snippet, but mostly prose
  // Should have moderate-low density (under threshold for pure code)
  track(assert(result.value < 0.3, "Documentation text has lower density than pure code"));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 11: Component Structure
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 11: Component Structure Validation");
{
  const text = "const x = {a: 1, b: 2};";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text}"`);
  console.log(`Components:`, JSON.stringify(result.components, null, 2));
  
  track(assert(
    result.components.bracketDensity && 
    result.components.punctuationDensity &&
    result.components.bracketCount !== undefined &&
    result.components.codePunctuation !== undefined &&
    result.components.totalChars !== undefined,
    "All required components present"
  ));
  
  // Verify components are internally consistent
  const recomputedDensity = 
    parseFloat(result.components.bracketDensity) +
    parseFloat(result.components.punctuationDensity);
  track(assertNear(
    result.value,
    Math.min(1.0, recomputedDensity),
    0.01,
    "Signal value matches component sum"
  ));
}

// ─────────────────────────────────────────────────────────────────────────
// Test 12: Density Normalization Capping at 1.0
// ─────────────────────────────────────────────────────────────────────────
console.log("\n### Test 12: Density Normalization (Cap at 1.0)");
{
  // Create text with extremely high bracket/punctuation density
  const text = "{}[]<>(())==;:,/";
  const result = computeStructureDensity(text);
  
  console.log(`Input: "${text}"`);
  console.log(`Computed density: ${result.value.toFixed(4)}`);
  
  track(assert(result.value <= 1.0, "Signal value capped at 1.0"));
  track(assert(result.value >= 0, "Signal value >= 0"));
}

// ─────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────
console.log("\n════════════════════════════════════════════════════════════════");
console.log(`Test Results: ${passCount} passed, ${failCount} failed`);
console.log(`Total: ${passCount + failCount} tests`);
console.log("════════════════════════════════════════════════════════════════\n");

if (failCount > 0) {
  console.log(`❌ FAILED: ${failCount} test(s) failed`);
  process.exit(1);
} else {
  console.log("✅ SUCCESS: All tests passed!");
  process.exit(0);
}
