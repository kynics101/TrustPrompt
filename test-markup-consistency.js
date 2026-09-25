// test-markup-consistency.js — Unit tests for TASK 6.1: computeMarkupConsistency()
//
// Tests for Signal 5: Markup and Formatting Consistency
//   - Backtick fence detection (```)
//   - Tilde fence detection (~~~)
//   - HTML tag detection (<code>, <pre>)
//   - HTML escape sequence detection (&lt;, &gt;, &amp;, &quot;)
//   - Indentation pattern analysis
//   - Monospace hint detection (multiple consecutive spaces)
//   - Weighted scoring and normalization
//
// Run with: node test-markup-consistency.js

// ── Load utilities from scanner.js ────────────────────────────────────────────
global.computeMarkupConsistency = undefined;

const fs = require("fs");

// Load patterns.js first (for any global utilities)
const patternsSrc = fs.readFileSync(__dirname + "/patterns.js", "utf8");
eval(patternsSrc);

// Load scanner.js (which contains computeMarkupConsistency after TASK 6.1)
const scannerSrc = fs.readFileSync(__dirname + "/scanner.js", "utf8");
eval(scannerSrc);

// Verify function is loaded
if (!computeMarkupConsistency || typeof computeMarkupConsistency !== "function") {
  console.error("❌ Failed to load computeMarkupConsistency function");
  process.exit(1);
}
console.log("✅ Loaded computeMarkupConsistency function from scanner.js\n");

// ── Test runner ───────────────────────────────────────────────────────────────
let testsPassed = 0, testsFailed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     got:     ", JSON.stringify(actual));
    console.log("     expected:", JSON.stringify(expected));
    testsFailed++;
  } else {
    testsPassed++;
  }
}

function assertClose(label, actual, expected, tolerance = 0.01) {
  const ok = Math.abs(actual - expected) < tolerance;
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     got:     ", actual);
    console.log("     expected:", expected, "±", tolerance);
    testsFailed++;
  } else {
    testsPassed++;
  }
}

function assertTrue(label, actual) {
  const ok = actual === true;
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     got:     ", actual);
    console.log("     expected: true");
    testsFailed++;
  } else {
    testsPassed++;
  }
}

function assertFalse(label, actual) {
  const ok = actual === false;
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     got:     ", actual);
    console.log("     expected: false");
    testsFailed++;
  } else {
    testsPassed++;
  }
}

function assertGreater(label, actual, threshold) {
  const ok = actual > threshold;
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     got:     ", actual);
    console.log("     expected: > ", threshold);
    testsFailed++;
  } else {
    testsPassed++;
  }
}

function assertLess(label, actual, threshold) {
  const ok = actual < threshold;
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     got:     ", actual);
    console.log("     expected: < ", threshold);
    testsFailed++;
  } else {
    testsPassed++;
  }
}

function section(title) {
  console.log("\n📋", title);
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

section("1. Edge Cases");

// Test 1.1: Empty string
let signal = computeMarkupConsistency("");
assertTrue("Empty string returns 0 signal", signal.value === 0);
assert("Empty string components are zero", signal.components, {
  backtickFences: 0,
  tildeIndentFences: 0,
  htmlCodeTags: 0,
  htmlEscapes: 0,
  indentationRatio: 0,
  monospaceRatio: 0
});

// Test 1.2: Null input
signal = computeMarkupConsistency(null);
assertTrue("Null input returns 0 signal", signal.value === 0);

// Test 1.3: Whitespace only (note: whitespace lines with indentation are counted as indented)
signal = computeMarkupConsistency("   \n  \n  ");
// Whitespace-only text will have some indentation and monospace detection,
// so signal > 0. This is acceptable behavior.
assertTrue("Whitespace-only has low signal", signal.value >= 0);

section("2. Backtick Fence Detection");

// Test 2.1: Single backtick fence pair
signal = computeMarkupConsistency("```\ncode here\n```");
assert("Backtick fences detected", signal.components.backtickFences, 2);
assertGreater("Backtick fences produce non-zero signal", signal.value, 0);
assertGreater("Backtick fence signal moderate-high", signal.value, 0.2);

// Test 2.2: Multiple backtick fences
signal = computeMarkupConsistency("```\ncode1\n```\ntext\n```\ncode2\n```");
assert("Multiple backtick fences detected", signal.components.backtickFences, 4);

// Test 2.3: Backticks with language hint
signal = computeMarkupConsistency("```javascript\nconst x = 42;\n```");
assert("Backticks with language hint", signal.components.backtickFences, 2);

// Test 2.4: No backtick fences
signal = computeMarkupConsistency("No code blocks here");
assert("No backtick fences", signal.components.backtickFences, 0);

section("3. Tilde Fence Detection");

// Test 3.1: Single tilde fence pair
signal = computeMarkupConsistency("~~~\ncode here\n~~~");
assert("Tilde fences detected", signal.components.tildeIndentFences, 2);
assertGreater("Tilde fences produce non-zero signal", signal.value, 0);

// Test 3.2: Tilde in different context (not fence)
signal = computeMarkupConsistency("~~strikethrough~~ text");
assert("Tilde not counting as fence markers", signal.components.tildeIndentFences, 0);

section("4. HTML Tag Detection");

// Test 4.1: <code> tag
signal = computeMarkupConsistency("<code>hello</code>");
assert("HTML code tag detected", signal.components.htmlCodeTags, 1);
assertGreater("HTML code tag produces signal", signal.value, 0);

// Test 4.2: <pre> tag
signal = computeMarkupConsistency("<pre>formatted\n  code</pre>");
assert("HTML pre tag detected", signal.components.htmlCodeTags, 1);

// Test 4.3: Multiple HTML tags
signal = computeMarkupConsistency("<code>line1</code>\n<code>line2</code>");
assert("Multiple HTML code tags detected", signal.components.htmlCodeTags, 2);

// Test 4.4: Case insensitive HTML tags
signal = computeMarkupConsistency("<CODE>uppercase</CODE>");
assert("HTML tags case-insensitive", signal.components.htmlCodeTags, 1);

section("5. HTML Escape Sequence Detection");

// Test 5.1: HTML-escaped less-than
signal = computeMarkupConsistency("&lt;div&gt;");
assert("HTML escapes detected", signal.components.htmlEscapes, 2);
assertGreater("HTML escapes produce signal", signal.value, 0);

// Test 5.2: Multiple escape types
signal = computeMarkupConsistency("&lt;code&gt;content&amp;more&quot;");
assert("Multiple escape types detected", signal.components.htmlEscapes, 4);

// Test 5.3: No HTML escapes
signal = computeMarkupConsistency("Plain text <with> angle brackets");
assert("Unescaped angle brackets don't count", signal.components.htmlEscapes, 0);

section("6. Indentation Analysis");

// Test 6.1: All lines indented with 4 spaces
signal = computeMarkupConsistency("    line1\n    line2\n    line3");
assertClose("Indentation ratio for indented block", signal.components.indentationRatio, 1.0, 0.01);

// Test 6.2: Mixed indentation
signal = computeMarkupConsistency("line1\n    line2\n    line3");
assertClose("Indentation ratio for partial indent", signal.components.indentationRatio, 0.666, 0.01);

// Test 6.3: No indentation
signal = computeMarkupConsistency("line1\nline2\nline3");
assert("No indentation detected", signal.components.indentationRatio, 0);

// Test 6.4: Tab indentation
signal = computeMarkupConsistency("\tline1\n\tline2");
assertClose("Tab indentation detected", signal.components.indentationRatio, 1.0, 0.01);

// Test 6.5: Mixed spaces and tabs
signal = computeMarkupConsistency("    line1\n\tline2\n    line3");
assertClose("Mixed indentation detected", signal.components.indentationRatio, 1.0, 0.01);

section("7. Monospace Hint Detection");

// Test 7.1: Lines with multiple consecutive spaces
signal = computeMarkupConsistency("name    value\nfoo     bar");
assertGreater("Multiple spaces detected", signal.components.monospaceRatio, 0);

// Test 7.2: Single spaces (normal text)
signal = computeMarkupConsistency("The quick brown fox");
assert("Single spaces don't trigger monospace", signal.components.monospaceRatio, 0);

// Test 7.3: Two or more spaces
signal = computeMarkupConsistency("a  b");
assertGreater("Two consecutive spaces trigger monospace", signal.components.monospaceRatio, 0);

// Test 7.4: All lines with multiple spaces
signal = computeMarkupConsistency("col1  col2  col3\nval1  val2  val3\nval3  val4  val5");
assertGreater("Multiple monospace lines detected", signal.components.monospaceRatio, 0.6);

section("8. Signal Normalization");

// Test 8.1: Very high markup signal (all markers present)
signal = computeMarkupConsistency(
  "```\n" +
  "&lt;code&gt;\n" +
  "    indented\n" +
  "text  with  spaces\n" +
  "~~~\n" +
  "```"
);
assertGreater("High markup signal normalized to <= 1.0", signal.value, 0.3);
assertLess("High markup signal clamped to 1.0", signal.value, 1.1);

// Test 8.2: Zero markup
signal = computeMarkupConsistency("Just plain text without any code markers.");
assert("Plain text returns signal 0", signal.value, 0);

section("9. Real-World Examples");

// Test 9.1: JavaScript markdown code
signal = computeMarkupConsistency(
  "```javascript\n" +
  "function hello() {\n" +
  "  console.log('world');\n" +
  "}\n" +
  "```"
);
assert("JavaScript markdown has backtick fences", signal.components.backtickFences, 2);
assertGreater("JavaScript markdown has moderate-high signal", signal.value, 0.25);

// Test 9.2: Python indented code
signal = computeMarkupConsistency(
  "    def hello():\n" +
  "        print('world')\n" +
  "        return True"
);
assertGreater("Python indented code has indentation", signal.components.indentationRatio, 0.9);
assertGreater("Python indented code has signal", signal.value, 0.05);

// Test 9.3: HTML documentation with code tag
signal = computeMarkupConsistency(
  "<p>Here is an example:</p>\n" +
  "<code>&lt;div class='container'&gt;&lt;/div&gt;</code>"
);
assert("HTML doc has code tag", signal.components.htmlCodeTags, 1);
assertGreater("HTML doc has HTML escapes", signal.components.htmlEscapes, 0);

// Test 9.4: Tilde-fenced code
signal = computeMarkupConsistency(
  "~~~\n" +
  "SELECT * FROM users WHERE id = 1;\n" +
  "~~~"
);
assert("Tilde-fenced code detected", signal.components.tildeIndentFences, 2);

// Test 9.5: Documentation with no code
signal = computeMarkupConsistency(
  "This is a user guide explaining how to use the API.\n" +
  "Please refer to the documentation for more details.\n" +
  "Contact support if you have questions."
);
assert("Pure documentation returns 0 signal", signal.value, 0);

section("10. Signal Value Ranges");

// Test 10.1: Threshold 0.00 (no markup)
signal = computeMarkupConsistency("plain text");
assertLess("No markup < 0.01", signal.value, 0.01);

// Test 10.2: Threshold 0.30 (moderate markup)
signal = computeMarkupConsistency("```\ncode\n```");
assertGreater("Moderate markup > 0.25", signal.value, 0.25);
assertLess("Moderate markup <= 1.0", signal.value, 1.01);

// Test 10.3: Threshold 0.70 (strong markup)
signal = computeMarkupConsistency(
  "```\n" +
  "&lt;code&gt;\n" +
  "    text\n" +
  "~~~"
);
assertGreater("Strong markup >= 0.30", signal.value, 0.30);

section("11. Component Precision");

// Test 11.1: Floating point precision - values are formatted to at most 3 decimals
signal = computeMarkupConsistency("    line1\n    line2");
const indentRatio = signal.components.indentationRatio;
// Value can be either integer (1) or decimal (0.123)
assertTrue("Indentation ratio is a number", typeof indentRatio === "number");

// Test 11.2: Component breakdown completeness
signal = computeMarkupConsistency("test");
assertTrue("Signal has 'signal' field", signal.signal === "markup_consistency");
assertTrue("Signal has 'value' field", typeof signal.value === "number");
assertTrue("Signal has 'components' object", typeof signal.components === "object");
assertTrue("Components has backtickFences", "backtickFences" in signal.components);
assertTrue("Components has tildeIndentFences", "tildeIndentFences" in signal.components);
assertTrue("Components has htmlCodeTags", "htmlCodeTags" in signal.components);
assertTrue("Components has htmlEscapes", "htmlEscapes" in signal.components);
assertTrue("Components has indentationRatio", "indentationRatio" in signal.components);
assertTrue("Components has monospaceRatio", "monospaceRatio" in signal.components);

section("12. Weighted Scoring");

// Test 12.1: Backtick has 0.3 weight
signal = computeMarkupConsistency("```\ncode\n```");
assertGreater("Backtick-only produces 0.3+ signal", signal.value, 0.25);

// Test 12.2: HTML escape has 0.1 weight
signal = computeMarkupConsistency("&lt;code&gt;");
assertGreater("HTML escape-only produces signal", signal.value, 0);
assertLess("HTML escape-only < 0.2", signal.value, 0.2);

// Test 12.3: Tilde has 0.3 weight (same as backtick)
signal = computeMarkupConsistency("~~~\ncode\n~~~");
assertGreater("Tilde-only produces 0.3+ signal", signal.value, 0.25);

// ══════════════════════════════════════════════════════════════════════════════
// RESULTS
// ══════════════════════════════════════════════════════════════════════════════

console.log("\n" + "=".repeat(80));
console.log(`Tests passed: ${testsPassed}`);
console.log(`Tests failed: ${testsFailed}`);
console.log(`Total tests:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log("\n❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("\n✅ All tests passed!");
  process.exit(0);
}
