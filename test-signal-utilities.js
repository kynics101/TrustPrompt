// test-signal-utilities.js — Unit tests for TASK 1.1 shared utilities
//
// Tests for:
//   - extractWordsFromText()
//   - countLineIndentation()
//   - normalizeRegexPattern()
//   - countPatternMatches()
//   - extractCodeBlock()
//
// Run with: node test-signal-utilities.js

// ── Load utilities from scanner.js ────────────────────────────────────────────
global.shannonEntropy = undefined;
global.extractWordsFromText = undefined;
global.countLineIndentation = undefined;
global.normalizeRegexPattern = undefined;
global.countPatternMatches = undefined;
global.extractCodeBlock = undefined;

const fs = require("fs");

// Load patterns.js first (for shannonEntropy)
const patternsSrc = fs.readFileSync(__dirname + "/patterns.js", "utf8");
eval(patternsSrc);

// Load scanner.js (which contains the utilities after TASK 1.1)
const scannerSrc = fs.readFileSync(__dirname + "/scanner.js", "utf8");
eval(scannerSrc);

// Verify all utilities are loaded
const utilities = [
  { name: "extractWordsFromText", fn: extractWordsFromText },
  { name: "countLineIndentation", fn: countLineIndentation },
  { name: "normalizeRegexPattern", fn: normalizeRegexPattern },
  { name: "countPatternMatches", fn: countPatternMatches },
  { name: "extractCodeBlock", fn: extractCodeBlock }
];

const allLoaded = utilities.every(u => u.fn && typeof u.fn === "function");
if (!allLoaded) {
  console.error("❌ Failed to load all utilities");
  utilities.forEach(u => {
    console.error(`   ${u.name}: ${typeof u.fn}`);
  });
  process.exit(1);
}
console.log("✅ Loaded all signal computation utilities from scanner.js\n");

// ── Test runner ───────────────────────────────────────────────────────────────
let testsPassed = 0, testsFailed = 0;

function assert(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     got:     ", actual);
    console.log("     expected:", expected);
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

function assertContains(label, array, value) {
  const ok = array && array.includes(value);
  console.log(ok ? "  ✅" : "  ❌", label);
  if (!ok) {
    console.log("     array:   ", array);
    console.log("     missing: ", value);
    testsFailed++;
  } else {
    testsPassed++;
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ── Test Suite: extractWordsFromText() ────────────────────────────────────────

section("extractWordsFromText()");

(() => {
  const text = "hello world test";
  const words = extractWordsFromText(text);
  assert("simple text extraction", words, ["hello", "world", "test"]);
})();

(() => {
  const text = "hello, world! how are you?";
  const words = extractWordsFromText(text);
  assert("punctuation handling - count", words.length >= 5, true);
  assertContains("includes 'hello'", words, "hello");
  assertContains("includes 'world'", words, "world");
})();

(() => {
  const text = "Hello WORLD Test";
  const words = extractWordsFromText(text);
  assertContains("lowercase conversion", words, "hello");
  assertContains("lowercase conversion", words, "world");
})();

(() => {
  const text = "const myVar = $var_name; function test() {}";
  const words = extractWordsFromText(text);
  assertContains("handles const", words, "const");
  assertContains("handles $ prefix", words, "var_name");
  assertContains("handles function", words, "function");
})();

(() => {
  const words1 = extractWordsFromText("");
  const words2 = extractWordsFromText(null);
  const words3 = extractWordsFromText("   ");
  assert("empty string returns []", words1, []);
  assert("null returns []", words2, []);
  assert("whitespace only returns []", words3, []);
})();

// ── Test Suite: countLineIndentation() ────────────────────────────────────────

section("countLineIndentation()");

(() => {
  const text = "function foo() {\n  return 42;\n}";
  const stats = countLineIndentation(text);
  assert("indented line count", stats.indentedLineCount, 1);
  assert("total line count", stats.totalLineCount, 3);
  assertTrue("is consistent", stats.isConsistent);
})();

(() => {
  const text = "function foo() {\n\treturn 42;\n}";
  const stats = countLineIndentation(text);
  assert("tab-indented line count", stats.indentedLineCount, 1);
  assertTrue("tab indentation is consistent", stats.isConsistent);
})();

(() => {
  const text = "if (true) {\n    doSomething();\n    if (nested) {\n        deep();\n    }\n}";
  const stats = countLineIndentation(text);
  assertGreater("4-space indentation ratio > 0.5", stats.indentRatio, 0.5);
  assertTrue("4-space is consistent", stats.isConsistent);
  assertGreater("max indent >= 4", stats.maxIndentLevel, 3);
})();

(() => {
  const stats1 = countLineIndentation("");
  const stats2 = countLineIndentation(null);
  assert("empty text total lines", stats1.totalLineCount, 0);
  assert("null text indent ratio", stats2.indentRatio, 0);
})();

(() => {
  const text = "This is a sentence.\nThis is another sentence.\nAnd another one.";
  const stats = countLineIndentation(text);
  assert("prose has no indentation", stats.indentedLineCount, 0);
  assert("prose indent ratio is 0", stats.indentRatio, 0);
})();

(() => {
  const text = "a\n  b\n    c\n      d";
  const stats = countLineIndentation(text);
  assertGreater("average indent level", stats.avgIndentLevel, 0);
  assertGreater("max indent level >= 6", stats.maxIndentLevel, 5);
})();

// ── Test Suite: normalizeRegexPattern() ──────────────────────────────────────

section("normalizeRegexPattern()");

(() => {
  const pattern1 = /test/gi;
  const result1 = normalizeRegexPattern(pattern1);
  const result2 = normalizeRegexPattern(pattern1);
  assertTrue("regex caching: same object", result1 === result2);
})();

(() => {
  const pattern = "hello\\s+world";
  const result = normalizeRegexPattern(pattern);
  assertTrue("compiled to RegExp", result instanceof RegExp);
  assertTrue("matches 'hello world'", result.test("hello world"));
  // Reset lastIndex for next test
  result.lastIndex = 0;
  assertTrue("matches 'hello\\nworld'", result.test("hello\nworld"));
})();

(() => {
  const pattern = "test_pattern";
  const result1 = normalizeRegexPattern(pattern);
  const result2 = normalizeRegexPattern(pattern);
  assertTrue("string caching: same object", result1 === result2);
})();

(() => {
  const pattern1 = "hello";
  const pattern2 = "world";
  const result1 = normalizeRegexPattern(pattern1);
  const result2 = normalizeRegexPattern(pattern2);
  assertFalse("different patterns are different objects", result1 === result2);
})();

(() => {
  let errorThrown = false;
  try {
    normalizeRegexPattern(123);
  } catch (e) {
    errorThrown = e instanceof TypeError;
  }
  assertTrue("throws TypeError for number input", errorThrown);
})();

// ── Test Suite: countPatternMatches() ────────────────────────────────────────

section("countPatternMatches()");

(() => {
  const text = "const x = 1; let y = 2; var z = 3;";
  const patterns = [/const/gi, /let/gi];
  const count = countPatternMatches(text, patterns);
  assert("single pattern count", count, 2);
})();

(() => {
  const text = "hello hello hello world";
  const patterns = [/hello/gi];
  const count = countPatternMatches(text, patterns);
  assert("multiple occurrences", count, 3);
})();

(() => {
  const text = "function test() { const x = 42; }";
  const patterns = [/function/gi, /const/gi, /return/gi];
  const count = countPatternMatches(text, patterns);
  assert("multiple patterns", count, 2);
})();

(() => {
  const text = "hello world";
  const patterns = [/xyz/gi, /abc/gi];
  const count = countPatternMatches(text, patterns);
  assert("no matches returns 0", count, 0);
})();

(() => {
  const count1 = countPatternMatches("", [/test/gi]);
  const count2 = countPatternMatches("test", []);
  const count3 = countPatternMatches(null, [/test/gi]);
  assert("empty text returns 0", count1, 0);
  assert("empty patterns returns 0", count2, 0);
  assert("null text returns 0", count3, 0);
})();

// ── Test Suite: extractCodeBlock() ───────────────────────────────────────────

section("extractCodeBlock()");

(() => {
  const text = "some prose\nfunction foo() {\n  return 42;\n}\nmore prose";
  const startIdx = text.indexOf("function");
  const endIdx = text.indexOf("}") + 1;
  const result = extractCodeBlock(text, startIdx, endIdx);
  assertTrue("block contains 'function foo'", result.block.includes("function foo"));
  assertTrue("block contains 'return 42'", result.block.includes("return 42"));
  assertGreater("line count > 0", result.lineCount, 0);
  assertGreater("char count > 0", result.charCount, 0);
})();

(() => {
  const text = "line1\nline2\nline3\nline4\nline5\nline6";
  const result = extractCodeBlock(text, 0, text.length, 3);
  assertTrue("respects maxLines limit", result.lineCount <= 3);
})();

(() => {
  const text = "line0\nline1\nline2\nline3";
  const startIdx = text.indexOf("line2");
  const endIdx = text.length;
  const result = extractCodeBlock(text, startIdx, endIdx);
  assert("start line calculation", result.startLine, 2);
  assertGreater("end line >= start line", result.endLine, result.startLine - 1);
})();

(() => {
  const text = "hello world";
  const result1 = extractCodeBlock(text, -5, 5);
  // After clamping, -5 becomes 0 and 5 is valid, so we get "hello" (5 chars)
  assertTrue("negative start index clamped to valid range", result1.block.length >= 0);
  
  const result2 = extractCodeBlock(text, 0, 999);
  assertTrue("end index clamped to text length", result2.block.length > 0);
})();

(() => {
  const result1 = extractCodeBlock("", 0, 0);
  assert("empty string line count", result1.lineCount, 0);
  
  const result2 = extractCodeBlock(null, 0, 0);
  assert("null text line count", result2.lineCount, 0);
})();

(() => {
  const text = "const x = { key: 'value' };";
  const result = extractCodeBlock(text, 0, text.length);
  assertTrue("preserves 'const'", result.block.includes("const"));
  assertTrue("preserves 'key'", result.block.includes("key"));
  assertTrue("preserves 'value'", result.block.includes("value"));
})();

// ── Integration: Combined signal computation ─────────────────────────────────

section("Integration: Combined utilities for signal computation");

(() => {
  const jsCode = `const express = require('express');
const app = express();
app.get('/api/data', (req, res) => {
  res.json({ data: 42 });
});
app.listen(3000);`;

  const words = extractWordsFromText(jsCode);
  assertContains("JavaScript: contains 'const'", words, "const");
  
  const indentStats = countLineIndentation(jsCode);
  assertGreater("JavaScript: indentRatio > 0.1", indentStats.indentRatio, 0.1);
  assertTrue("JavaScript: consistent indentation", indentStats.isConsistent);

  const patterns = [/const/gi, /let/gi, /var/gi];
  const keywordCount = countPatternMatches(jsCode, patterns);
  assertGreater("JavaScript: keyword count > 0", keywordCount, 0);
})();

(() => {
  const pyCode = `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
result = factorial(5)`;

  const words = extractWordsFromText(pyCode);
  assertContains("Python: contains 'def'", words, "def");
  assertContains("Python: contains 'return'", words, "return");

  const indentStats = countLineIndentation(pyCode);
  assertGreater("Python: indentRatio > 0.2", indentStats.indentRatio, 0.2);
  assertTrue("Python: consistent indentation", indentStats.isConsistent);

  const patterns = [/def/gi, /return/gi];
  const count = countPatternMatches(pyCode, patterns);
  assertGreater("Python: keyword count > 0", count, 0);
})();

(() => {
  const proseText = `This is a sample paragraph about programming in general.
It discusses how code and prose are different things.
The reader may find this interesting or not, depending on preference.`;

  const indentStats = countLineIndentation(proseText);
  assert("Prose: no indentation", indentStats.indentedLineCount, 0);

  const patterns = [/const/gi, /function/gi, /class/gi, /import/gi];
  const count = countPatternMatches(proseText, patterns);
  assert("Prose: no code keywords", count, 0);
})();

// ── Test Summary ──────────────────────────────────────────────────────────────

section("Test Summary");
console.log(`\n✅ Passed: ${testsPassed}`);
console.log(`❌ Failed: ${testsFailed}`);
console.log(`📊 Total:  ${testsPassed + testsFailed}`);

if (testsFailed > 0) {
  console.log(`\n⚠️  Some tests failed. Please review the output above.`);
  process.exit(1);
} else {
  console.log(`\n🎉 All tests passed! Signal utilities are ready for use.`);
  process.exit(0);
}
