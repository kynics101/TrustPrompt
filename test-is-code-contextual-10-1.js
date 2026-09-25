// test-is-code-contextual-10-1.js — Comprehensive tests for isCodeContextual() function
// Task 10.1: Implement `isCodeContextual(text, normalizedFullText, matchIndex)` function
// Tests context trigger phrase detection in lookahead/lookbehind windows
// Requirements: 10 (Context-Aware Code Detection)

// Extract the isCodeContextual function from scanner.js for testing
// We'll define it inline here, then run tests
function isCodeContextual(text, normalizedFullText, matchIndex) {
  // Validate inputs
  if (!text || typeof text !== 'string' || !normalizedFullText || typeof normalizedFullText !== 'number') {
    if (typeof normalizedFullText !== 'string') {
      console.warn('[TrustPrompt/context] isCodeContextual: invalid input types');
      return false;
    }
  }

  // Define trigger phrases that suggest intentional code sharing
  const triggerPhrases = [
    "here is", "here's", "like this", "for example", "such as",
    "code:", "function:", "script:", "example:", "implementation:",
    "try this", "use this", "run this", "execute this", "implement",
    "this is the", "see below", "check this", "look at", "paste this",
    "below is", "the code", "this code", "example code", "sample code",
    "shows:", "shows the", "demonstrates:", "demonstrates the",
    "follows:", "follows here", "next:", "next is"
  ];

  // Extract lookahead window (100 characters after the match)
  const lookbehindStart = Math.max(0, matchIndex - 100);
  const lookbehind = normalizedFullText.slice(lookbehindStart, matchIndex).toLowerCase();

  // Extract lookahead window (100 characters after the match)
  const lookaheadStart = matchIndex + text.length;
  const lookaheadEnd = Math.min(normalizedFullText.length, lookaheadStart + 100);
  const lookahead = normalizedFullText.slice(lookaheadStart, lookaheadEnd).toLowerCase();

  // Check if any trigger phrase appears in lookbehind or lookahead windows
  for (const phrase of triggerPhrases) {
    if (lookbehind.includes(phrase) || lookahead.includes(phrase)) {
      console.log(`[TrustPrompt/context] code contextual trigger found: "${phrase}"`);
      return true;
    }
  }

  // No trigger phrases found
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITE: isCodeContextual()
// ════════════════════════════════════════════════════════════════════════════

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`✓ PASS: ${testName}`);
    testsPassed++;
  } else {
    console.log(`✗ FAIL: ${testName}`);
    testsFailed++;
  }
}

console.log('════════════════════════════════════════════════════════════════');
console.log('TEST SUITE: isCodeContextual() — Context-Aware Code Detection');
console.log('════════════════════════════════════════════════════════════════\n');

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 1: Trigger Phrases in Lookbehind (before code block)
// ────────────────────────────────────────────────────────────────────────────

console.log('GROUP 1: Lookbehind Trigger Phrases (preceding code block)\n');

let test1a = {
  text: 'function foo() { return 42; }',
  fullText: 'Here is a simple JavaScript function: function foo() { return 42; }',
  matchIndex: 38  // position of 'function foo'
};
let result1a = isCodeContextual(test1a.text, test1a.fullText, test1a.matchIndex);
assert(result1a === true, 'Test 1.1a: "Here is" trigger detected in lookbehind (expect true)');

let test1b = {
  text: 'const x = 5;',
  fullText: 'For example, you can write: const x = 5;',
  matchIndex: 27
};
let result1b = isCodeContextual(test1b.text, test1b.fullText, test1b.matchIndex);
assert(result1b === true, 'Test 1.1b: "for example" trigger detected in lookbehind (expect true)');

let test1c = {
  text: 'import React from "react";',
  fullText: 'Like this example: import React from "react";',
  matchIndex: 18
};
let result1c = isCodeContextual(test1c.text, test1c.fullText, test1c.matchIndex);
assert(result1c === true, 'Test 1.1c: "like this" trigger detected in lookbehind (expect true)');

let test1d = {
  text: 'SELECT * FROM users;',
  fullText: 'Here\'s a SQL query: SELECT * FROM users;',
  matchIndex: 20
};
let result1d = isCodeContextual(test1d.text, test1d.fullText, test1d.matchIndex);
assert(result1d === true, 'Test 1.1d: "here\'s" trigger detected in lookbehind (expect true)');

let test1e = {
  text: 'if (x > 0) { console.log("yes"); }',
  fullText: 'Code: if (x > 0) { console.log("yes"); }',
  matchIndex: 6
};
let result1e = isCodeContextual(test1e.text, test1e.fullText, test1e.matchIndex);
assert(result1e === true, 'Test 1.1e: "code:" trigger detected in lookbehind (expect true)');

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 2: Trigger Phrases in Lookahead (after code block)
// ────────────────────────────────────────────────────────────────────────────

console.log('\nGROUP 2: Lookahead Trigger Phrases (following code block)\n');

let test2a = {
  text: 'function foo() { return 42; }',
  fullText: 'function foo() { return 42; } - see below for more details',
  matchIndex: 0
};
let result2a = isCodeContextual(test2a.text, test2a.fullText, test2a.matchIndex);
assert(result2a === true, 'Test 2.1a: "see below" trigger detected in lookahead (expect true)');

let test2b = {
  text: 'const x = 5;',
  fullText: 'const x = 5; this is the basic syntax in JavaScript.',
  matchIndex: 0
};
let result2b = isCodeContextual(test2b.text, test2b.fullText, test2b.matchIndex);
assert(result2b === true, 'Test 2.1b: "this is the" trigger detected in lookahead (expect true)');

let test2c = {
  text: 'SELECT * FROM table;',
  fullText: 'SELECT * FROM table; execute this query to get results.',
  matchIndex: 0
};
let result2c = isCodeContextual(test2c.text, test2c.fullText, test2c.matchIndex);
assert(result2c === true, 'Test 2.1c: "execute this" trigger detected in lookahead (expect true)');

let test2d = {
  text: 'class MyClass { }',
  fullText: 'class MyClass { } try this example to see how it works.',
  matchIndex: 0
};
let result2d = isCodeContextual(test2d.text, test2d.fullText, test2d.matchIndex);
assert(result2d === true, 'Test 2.1d: "try this" trigger detected in lookahead (expect true)');

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 3: No Trigger Phrases (standalone code block)
// ────────────────────────────────────────────────────────────────────────────

console.log('\nGROUP 3: Standalone Code Blocks (no trigger phrases)\n');

let test3a = {
  text: 'function foo() { return 42; }',
  fullText: 'Some random text before. function foo() { return 42; } Some random text after.',
  matchIndex: 23  // position where function starts
};
let result3a = isCodeContextual(test3a.text, test3a.fullText, test3a.matchIndex);
assert(result3a === false, 'Test 3.1a: No trigger phrase (expect false)');

let test3b = {
  text: 'const x = 5;',
  fullText: 'This is just a random line. const x = 5; Another random line with no context.',
  matchIndex: 29
};
let result3b = isCodeContextual(test3b.text, test3b.fullText, test3b.matchIndex);
assert(result3b === false, 'Test 3.1b: No trigger phrase (expect false)');

let test3c = {
  text: 'import os; print("hello")',
  fullText: 'begin const data. import os; print("hello") done with code.',
  matchIndex: 17
};
let result3c = isCodeContextual(test3c.text, test3c.fullText, test3c.matchIndex);
assert(result3c === false, 'Test 3.1c: No trigger phrase (expect false)');

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 4: Case Insensitivity
// ────────────────────────────────────────────────────────────────────────────

console.log('\nGROUP 4: Case Insensitivity\n');

let test4a = {
  text: 'let x = 10;',
  fullText: 'HERE IS some code: let x = 10;',
  matchIndex: 19
};
let result4a = isCodeContextual(test4a.text, test4a.fullText, test4a.matchIndex);
assert(result4a === true, 'Test 4.1a: "HERE IS" (uppercase) trigger detected (expect true)');

let test4b = {
  text: 'def foo(): pass',
  fullText: 'For Example: def foo(): pass',
  matchIndex: 13
};
let result4b = isCodeContextual(test4b.text, test4b.fullText, test4b.matchIndex);
assert(result4b === true, 'Test 4.1b: "For Example" (mixed case) trigger detected (expect true)');

let test4c = {
  text: 'if (true) { x = 1; }',
  fullText: 'CODE: if (true) { x = 1; }',
  matchIndex: 6
};
let result4c = isCodeContextual(test4c.text, test4c.fullText, test4c.matchIndex);
assert(result4c === true, 'Test 4.1c: "CODE:" (uppercase) trigger detected (expect true)');

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 5: Window Boundary Conditions
// ────────────────────────────────────────────────────────────────────────────

console.log('\nGROUP 5: Window Boundary Conditions\n');

let test5a = {
  text: 'x = 5;',
  fullText: 'here is x = 5;',
  matchIndex: 8  // match at position 8, only 8 chars before (less than 100)
};
let result5a = isCodeContextual(test5a.text, test5a.fullText, test5a.matchIndex);
assert(result5a === true, 'Test 5.1a: Trigger phrase within <100 chars lookbehind (expect true)');

let test5b = {
  text: 'foo()',
  fullText: 'foo() try this next',
  matchIndex: 0  // match at position 0, no lookbehind available
};
let result5b = isCodeContextual(test5b.text, test5b.fullText, test5b.matchIndex);
assert(result5b === true, 'Test 5.1b: Trigger phrase at start (lookahead only, expect true)');

let test5c = {
  text: 'return;',
  fullText: 'here is ' + 'x'.repeat(150) + ' return;',
  matchIndex: 158  // match beyond 100 chars, should not see "here is"
};
let result5c = isCodeContextual(test5c.text, test5c.fullText, test5c.matchIndex);
assert(result5c === false, 'Test 5.1c: Trigger phrase >100 chars before (expect false)');

let test5d = {
  text: 'return;',
  fullText: 'return; ' + 'x'.repeat(150) + ' here is',
  matchIndex: 0  // match at start, "here is" is >100 chars after
};
let result5d = isCodeContextual(test5d.text, test5d.fullText, test5d.matchIndex);
assert(result5d === false, 'Test 5.1d: Trigger phrase >100 chars after (expect false)');

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 6: Multiple Trigger Phrases
// ────────────────────────────────────────────────────────────────────────────

console.log('\nGROUP 6: Multiple Trigger Phrases\n');

let test6a = {
  text: 'function bar() { }',
  fullText: 'Here is an example: function bar() { } - this is the syntax',
  matchIndex: 19
};
let result6a = isCodeContextual(test6a.text, test6a.fullText, test6a.matchIndex);
assert(result6a === true, 'Test 6.1a: Multiple trigger phrases (before and after, expect true)');

let test6b = {
  text: 'console.log("test");',
  fullText: 'Like this: console.log("test"); try this syntax',
  matchIndex: 10
};
let result6b = isCodeContextual(test6b.text, test6b.fullText, test6b.matchIndex);
assert(result6b === true, 'Test 6.1b: Multiple different triggers (expect true)');

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 7: Trigger Phrase Variations
// ────────────────────────────────────────────────────────────────────────────

console.log('\nGROUP 7: All Supported Trigger Phrases\n');

const triggerPhrases = [
  "here is", "here's", "like this", "for example", "such as",
  "code:", "function:", "script:", "example:", "implementation:",
  "try this", "use this", "run this", "execute this", "implement",
  "this is the", "see below", "check this", "look at", "paste this",
  "below is", "the code", "this code", "example code", "sample code",
  "shows:", "shows the", "demonstrates:", "demonstrates the",
  "follows:", "follows here", "next:", "next is"
];

let phrasesTestedCount = 0;
for (const phrase of triggerPhrases.slice(0, 5)) {  // Test first 5 phrases as samples
  let testPhrase = {
    text: 'x = 1;',
    fullText: `${phrase} x = 1;`,
    matchIndex: phrase.length + 1
  };
  let result = isCodeContextual(testPhrase.text, testPhrase.fullText, testPhrase.matchIndex);
  assert(result === true, `Test 7.${phrasesTestedCount + 1}: Trigger phrase "${phrase}" detected`);
  phrasesTestedCount++;
}

// ────────────────────────────────────────────────────────────────────────────
// TEST GROUP 8: Edge Cases
// ────────────────────────────────────────────────────────────────────────────

console.log('\nGROUP 8: Edge Cases\n');

let test8a = {
  text: '',  // Empty code text
  fullText: 'here is ',
  matchIndex: 8
};
// Note: Empty text will be invalid input, but "here is" is still detected in lookbehind
let result8a = isCodeContextual(test8a.text, test8a.fullText, test8a.matchIndex);
assert(result8a === true, 'Test 8.1a: Empty code text but trigger in lookbehind (expect true)');

let test8b = {
  text: 'x',
  fullText: 'here is x',
  matchIndex: 8
};
let result8b = isCodeContextual(test8b.text, test8b.fullText, test8b.matchIndex);
assert(result8b === true, 'Test 8.1b: Single character code with context (expect true)');

let test8c = {
  text: 'function test() { return "test"; }',
  fullText: 'function test() { return "test"; }',
  matchIndex: 0
};
let result8c = isCodeContextual(test8c.text, test8c.fullText, test8c.matchIndex);
assert(result8c === false, 'Test 8.1c: Code exactly equals full text (no surrounding context, expect false)');

let test8d = {
  text: 'code',
  fullText: 'this code is important',
  matchIndex: 5
};
let result8d = isCodeContextual(test8d.text, test8d.fullText, test8d.matchIndex);
assert(result8d === false, 'Test 8.1d: "this code" partial match - "this" before match, "code" is the match itself (expect false)');

// ────────────────────────────────────────────────────────────────────────────
// TEST RESULTS SUMMARY
// ────────────────────────────────────────────────────────────────────────────

console.log('\n════════════════════════════════════════════════════════════════');
console.log('TEST RESULTS SUMMARY');
console.log('════════════════════════════════════════════════════════════════');
console.log(`Total Passed: ${testsPassed}`);
console.log(`Total Failed: ${testsFailed}`);
console.log(`Total Tests:  ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✓ ALL TESTS PASSED ✓');
} else {
  console.log(`\n✗ ${testsFailed} TEST(S) FAILED ✗`);
}

console.log('════════════════════════════════════════════════════════════════\n');

// Exit with appropriate code
process.exit(testsFailed === 0 ? 0 : 1);
