// test-ph-id-helpers.js
// Unit tests for Philippine ID helper functions: extractPHIDValue, isPhIDPlaceholder, normalizePHID
// Tests edge cases, formatting variations, and placeholder detection
// Task 1.1: Create helper functions for ID value extraction and normalization

// Mock the helper functions for testing (in real usage, they come from patterns.js)
function extractPHIDValue(raw) {
  if (!raw || typeof raw !== "string") return "";
  
  let value = raw.replace(/^["']|["']$/g, "").trim();
  
  const labelPatterns = [
    /^driver.{0,2}s.{0,2}\s+licen[cs]e\s*\.?\s*[:=\s]*/i,
    /^passport\s+no\s*\.?\s*[:=\s]*/i,
    /^id\s+no\s*\.?\s*[:=\s]*/i,
    /^license\s+no\s*\.?\s*[:=\s]*/i,
    /^student\s+id\s*\.?\s*[:=\s]*/i,
    /^employee\s+id\s*\.?\s*[:=\s]*/i,
    /^mother.{0,2}s.{0,2}\s+maiden\s*\.?\s*[:=\s]*/i,
    /^sss\s+no\s*\.?\s*[:=\s]*/i,
    /^gsis\s+no\s*\.?\s*[:=\s]*/i,
    /^pag.?ibig\s*\.?\s*[:=\s]*/i,
    /^barangay\s*\.?\s*[:=\s]*/i,
    /^comelec\s*\.?\s*[:=\s]*/i,
    /^philhealth\s*\.?\s*[:=\s]*/i,
    /^philid\s*\.?\s*[:=\s]*/i,
    /^police\s*\.?\s*[:=\s]*/i,
    /^umid\s*\.?\s*[:=\s]*/i,
    /^prc\s*\.?\s*[:=\s]*/i,
    /^tin\s*\.?\s*[:=\s]*/i,
    /^number\s*\.?\s*[:=\s]*/i,
    /^nbi\s*\.?\s*[:=\s]*/i,
    /^id\s*\.?\s*[:=\s]*/i,
    /^no\s*\.?\s*[:=\s]*/i,
  ];
  
  for (const pattern of labelPatterns) {
    if (pattern.test(value)) {
      value = value.replace(pattern, "");
      break;
    }
  }
  
  value = value.trim();
  return value;
}

function isPhIDPlaceholder(patternId, value) {
  if (!value || typeof value !== "string") return true;
  
  const normalized = value.toLowerCase().trim();
  
  if (/^<[^>]*>$/.test(normalized)) return true;
  if (/^(placeholder|example|test|demo|fake|dummy|sample|insert|changeme|xxx|your_\w+|sample_\w+)$/i.test(normalized)) return true;
  
  if (/^([0-9x\-\s])\1*$|^(0+[\-\s]*)*0+$|^(1+[\-\s]*)*1+$|^(x+[\-\s]*)*x+$/i.test(normalized)) return true;
  
  const knownTestValues = {
    ph_id_philid: new Set([]),
    ph_id_sss: new Set([]),
    ph_id_gsis: new Set([]),
    ph_id_tin: new Set([]),
  };
  
  if (knownTestValues[patternId]) {
    const stripped = normalized.replace(/[\-\s]/g, "");
    if (knownTestValues[patternId].has(stripped)) return true;
  }
  
  return false;
}

function normalizePHID(value, stripChars) {
  if (!value || typeof value !== "string") return "";
  
  // Remove additional specified characters first (before removing standard separators)
  let normalized = value;
  if (stripChars && typeof stripChars === "string") {
    // Build a character class from stripChars, escaping regex special chars
    const chars = stripChars.split("").map(ch => ch === "-" ? "\\-" : ch).join("");
    const regex = new RegExp(`^[${chars}]+`, "i");
    normalized = normalized.replace(regex, "");
  }
  
  // Remove standard separators: hyphens, spaces, dots
  normalized = normalized.replace(/[\-\s\.]/g, "");
  
  return normalized;
}

// ────────────────────────────────────────────────────────────────────────────────
// TEST SUITE
// ────────────────────────────────────────────────────────────────────────────────

let testsPassed = 0;
let testsFailed = 0;

function assertEquals(actual, expected, testName) {
  if (actual === expected) {
    testsPassed++;
    console.log(`✓ ${testName}`);
  } else {
    testsFailed++;
    console.log(`✗ ${testName}`);
    console.log(`  Expected: ${expected}`);
    console.log(`  Actual:   ${actual}`);
  }
}

function assertTrue(condition, testName) {
  if (condition) {
    testsPassed++;
    console.log(`✓ ${testName}`);
  } else {
    testsFailed++;
    console.log(`✗ ${testName}`);
  }
}

function assertFalse(condition, testName) {
  if (!condition) {
    testsPassed++;
    console.log(`✓ ${testName}`);
  } else {
    testsFailed++;
    console.log(`✗ ${testName}`);
  }
}

console.log("═══════════════════════════════════════════════════════════════");
console.log("Test Suite: extractPHIDValue()");
console.log("═══════════════════════════════════════════════════════════════");

// Basic label stripping
assertEquals(extractPHIDValue("PhilID: 123456789012"), "123456789012", "Strip PhilID label");
assertEquals(extractPHIDValue("SSS No: 12-3456789-0"), "12-3456789-0", "Strip SSS No label");
assertEquals(extractPHIDValue("ID: 987654321098"), "987654321098", "Strip generic ID label");
assertEquals(extractPHIDValue("No: 555666777888"), "555666777888", "Strip No label");

// Quote and apostrophe handling
assertEquals(extractPHIDValue('"123456789012"'), "123456789012", "Remove double quotes");
assertEquals(extractPHIDValue("'123456789012'"), "123456789012", "Remove single quotes");
assertEquals(extractPHIDValue(`"PhilID: 123456789012"`), "123456789012", "Remove quotes with label");

// Case-insensitive label matching
assertEquals(extractPHIDValue("philid: 123456789012"), "123456789012", "Lowercase philid label");
assertEquals(extractPHIDValue("PHILID: 123456789012"), "123456789012", "Uppercase PHILID label");
assertEquals(extractPHIDValue("PhIlId: 123456789012"), "123456789012", "Mixed case PhIlId label");

// Various ID type labels
assertEquals(extractPHIDValue("Passport No: P123456789"), "P123456789", "Strip Passport No label");
assertEquals(extractPHIDValue("Driver's License No: 12-ABC-456-789"), "12-ABC-456-789", "Strip Driver's License No label");
assertEquals(extractPHIDValue("TIN: 123-456-789"), "123-456-789", "Strip TIN label");
assertEquals(extractPHIDValue("PRC: 2021-1234567"), "2021-1234567", "Strip PRC label");

// Period and colon variations
assertEquals(extractPHIDValue("ID No.: 123456789012"), "123456789012", "Strip ID No. label");
assertEquals(extractPHIDValue("License No. 12ABC456789"), "12ABC456789", "Strip License No. label");

// Whitespace handling
assertEquals(extractPHIDValue("   123456789012   "), "123456789012", "Trim surrounding whitespace");
assertEquals(extractPHIDValue("ID:   123456789012"), "123456789012", "Trim whitespace after colon");

// Equal sign as separator
assertEquals(extractPHIDValue("ID=123456789012"), "123456789012", "Strip ID= separator");
assertEquals(extractPHIDValue("SSS No=12-3456789-0"), "12-3456789-0", "Strip SSS No= separator");

// Complex labels with spaces
assertEquals(extractPHIDValue("GSIS No: 1234-56789-0"), "1234-56789-0", "Strip GSIS No label");
assertEquals(extractPHIDValue("Pag-IBIG: 123456789012"), "123456789012", "Strip Pag-IBIG label");

// Edge cases
assertEquals(extractPHIDValue(""), "", "Empty string returns empty");
assertEquals(extractPHIDValue(null), "", "Null returns empty");
assertEquals(extractPHIDValue(undefined), "", "Undefined returns empty");
assertEquals(extractPHIDValue("123456789012"), "123456789012", "Plain number without label");

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Test Suite: isPhIDPlaceholder()");
console.log("═══════════════════════════════════════════════════════════════");

// Valid-looking values (should return false)
assertFalse(isPhIDPlaceholder("ph_id_sss", "12-3456789-0"), "Valid SSS-like value returns false");
assertFalse(isPhIDPlaceholder("ph_id_philid", "123456789012"), "Valid PhilID-like value returns false");
assertFalse(isPhIDPlaceholder("ph_id_tin", "234-567-890"), "Valid TIN-like value returns false");
assertFalse(isPhIDPlaceholder("ph_id_drivers_license", "12-ABC-456-789"), "Valid Driver's License-like value returns false");

// Placeholder marker patterns
assertTrue(isPhIDPlaceholder("ph_id_sss", "<SSS_NUMBER>"), "Angle bracket placeholder <SSS_NUMBER>");
assertTrue(isPhIDPlaceholder("ph_id_sss", "<YOUR_SSS>"), "Angle bracket placeholder <YOUR_SSS>");
assertTrue(isPhIDPlaceholder("ph_id_tin", "<TIN>"), "Single bracket placeholder <TIN>");

// Common placeholder words
assertTrue(isPhIDPlaceholder("ph_id_sss", "placeholder"), "Word: placeholder");
assertTrue(isPhIDPlaceholder("ph_id_sss", "example"), "Word: example");
assertTrue(isPhIDPlaceholder("ph_id_sss", "test"), "Word: test");
assertTrue(isPhIDPlaceholder("ph_id_sss", "demo"), "Word: demo");
assertTrue(isPhIDPlaceholder("ph_id_sss", "fake"), "Word: fake");
assertTrue(isPhIDPlaceholder("ph_id_sss", "dummy"), "Word: dummy");
assertTrue(isPhIDPlaceholder("ph_id_sss", "sample"), "Word: sample");

// Your_* and sample_* patterns
assertTrue(isPhIDPlaceholder("ph_id_sss", "your_sss"), "Pattern: your_sss");
assertTrue(isPhIDPlaceholder("ph_id_sss", "sample_number"), "Pattern: sample_number");

// All-same-character patterns
assertTrue(isPhIDPlaceholder("ph_id_sss", "00-000000-00"), "All zeros with separators");
assertTrue(isPhIDPlaceholder("ph_id_sss", "0000000000"), "All zeros no separators");
assertTrue(isPhIDPlaceholder("ph_id_sss", "11-111111-11"), "All ones with separators");
assertTrue(isPhIDPlaceholder("ph_id_sss", "1111111111"), "All ones no separators");
assertTrue(isPhIDPlaceholder("ph_id_sss", "xx-xxxxxx-xx"), "All x's with separators");
assertTrue(isPhIDPlaceholder("ph_id_sss", "xxxxxxxxxx"), "All x's no separators");
assertFalse(isPhIDPlaceholder("ph_id_sss", "99-999999-99"), "All nines with separators (not a placeholder pattern)");

// Case insensitivity for placeholder words
assertTrue(isPhIDPlaceholder("ph_id_sss", "PLACEHOLDER"), "Uppercase PLACEHOLDER");
assertTrue(isPhIDPlaceholder("ph_id_sss", "Example"), "Mixed case Example");
assertTrue(isPhIDPlaceholder("ph_id_sss", "TEST"), "Uppercase TEST");

// Edge cases
assertTrue(isPhIDPlaceholder("ph_id_sss", ""), "Empty string returns true");
assertTrue(isPhIDPlaceholder("ph_id_sss", null), "Null returns true");
assertTrue(isPhIDPlaceholder("ph_id_sss", undefined), "Undefined returns true");

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Test Suite: normalizePHID()");
console.log("═══════════════════════════════════════════════════════════════");

// Basic separator removal (hyphens)
assertEquals(normalizePHID("123-456-789-012"), "123456789012", "Remove hyphens");
assertEquals(normalizePHID("12-3456789-0"), "1234567890", "Remove hyphens (SSS format)");

// Space removal
assertEquals(normalizePHID("123 456 789 012"), "123456789012", "Remove spaces");
assertEquals(normalizePHID("12 345 678 9 0 1 2"), "123456789012", "Remove multiple spaces");

// Dot removal
assertEquals(normalizePHID("123.456.789.012"), "123456789012", "Remove dots");

// Mixed separators
assertEquals(normalizePHID("12-345 678.9-0"), "1234567890", "Remove mixed separators");

// Alphanumeric strings with separators
assertEquals(normalizePHID("12-ABC-456-789"), "12ABC456789", "Remove separators from alphanumeric");
assertEquals(normalizePHID("P-123-456-789"), "P123456789", "Remove separators with letter prefix");

// No separators (unchanged)
assertEquals(normalizePHID("123456789012"), "123456789012", "No separators returns same");
assertEquals(normalizePHID("P123456789"), "P123456789", "Alphanumeric no separators unchanged");

// With stripChars parameter
assertEquals(normalizePHID("P123456789", "P"), "123456789", "Strip P prefix");
assertEquals(normalizePHID("P-123456789", "P-"), "123456789", "Strip P- prefix");
assertEquals(normalizePHID("NBI-1234567", "NBI-"), "1234567", "Strip NBI- prefix");
assertEquals(normalizePHID("P-123-456-789", "P-"), "123456789", "Strip P- and separators");

// stripChars with multiple characters
assertEquals(normalizePHID("NBI1234567", "NBI"), "1234567", "Strip NBI prefix (multiple chars)");
assertEquals(normalizePHID("PH-123456", "PH-"), "123456", "Strip PH- prefix");

// Edge cases
assertEquals(normalizePHID(""), "", "Empty string returns empty");
assertEquals(normalizePHID(null), "", "Null returns empty");
assertEquals(normalizePHID(undefined), "", "Undefined returns empty");
assertEquals(normalizePHID(""), "", "Empty string with stripChars");
assertEquals(normalizePHID("123456", ""), "123456", "Empty stripChars parameter");

// Complex real-world examples
assertEquals(normalizePHID("123-456-789-012-345"), "123456789012345", "PhilHealth format with hyphens");
assertEquals(normalizePHID("12-345-678-90-123"), "1234567890123", "COMELEC format with hyphens");
assertEquals(normalizePHID("1234-5678-90-12"), "123456789012", "UMID format removes all separators");

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Test Suite: Integration Tests");
console.log("═══════════════════════════════════════════════════════════════");

// Extract, normalize, check placeholder (typical pipeline)
const rawInput1 = 'SSS No: 12-3456789-0';
const extracted1 = extractPHIDValue(rawInput1);
const normalized1 = normalizePHID(extracted1);
const isPlaceholder1 = isPhIDPlaceholder("ph_id_sss", normalized1);
assertEquals(extracted1, "12-3456789-0", "Extract SSS No from label");
assertEquals(normalized1, "1234567890", "Normalize SSS to plain digits");
assertFalse(isPlaceholder1, "Normalized SSS is not a placeholder");

// Extract, normalize, check placeholder (test value pipeline)
const rawInput2 = 'GSIS No: 00-00000-0';
const extracted2 = extractPHIDValue(rawInput2);
const normalized2 = normalizePHID(extracted2);
const isPlaceholder2 = isPhIDPlaceholder("ph_id_gsis", normalized2);
assertEquals(extracted2, "00-00000-0", "Extract GSIS No from label");
assertEquals(normalized2, "00000000", "Normalize GSIS to plain digits (8 digits)");
assertTrue(isPlaceholder2, "All-zero GSIS is a placeholder");

// Extract passport with prefix, normalize with stripChars
const rawInput3 = 'Passport No: P-123456789';
const extracted3 = extractPHIDValue(rawInput3);
const normalized3 = normalizePHID(extracted3, "P-");
assertEquals(extracted3, "P-123456789", "Extract Passport from label");
assertEquals(normalized3, "123456789", "Normalize Passport removing P- prefix");

// Complex placeholder test
const rawInput4 = '"<YOUR_ID>"';
const extracted4 = extractPHIDValue(rawInput4);
const isPlaceholder4 = isPhIDPlaceholder("ph_id_philid", extracted4);
assertEquals(extracted4, "<YOUR_ID>", "Extract placeholder marker with quotes");
assertTrue(isPlaceholder4, "Angle bracket placeholder detected");

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("Test Results");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`Total Tests: ${testsPassed + testsFailed}`);
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);
console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log("\n✓ All tests passed!");
  process.exit(0);
} else {
  console.log(`\n✗ ${testsFailed} test(s) failed.`);
  process.exit(1);
}
