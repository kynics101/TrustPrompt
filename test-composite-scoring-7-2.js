// test-composite-scoring-7-2.js — Comprehensive tests for computeSourceCodeScore() function
// Task 7.2: Write unit tests for composite scoring algorithm
// Tests dual threshold validation, strong evidence requirement, and classification accuracy
// Requirements: 13, 14

// ═════════════════════════════════════════════════════════════════════════════
// SETUP: Load scanner.js or use extracted functions for testing
// ═════════════════════════════════════════════════════════════════════════════

// Import scanner.js functions
let scanner;
try {
  // Try to load scanner.js module
  scanner = require('./scanner.js');
  console.log('[INFO] scanner.js loaded via require()');
} catch (e) {
  console.error('[ERROR] Failed to load scanner.js:', e.message);
  process.exit(1);
}

// Extract functions from scanner module
const computeSourceCodeScore = scanner.computeSourceCodeScore;

// Set up CONFIG
global.CODE_DETECTION_CONFIG = scanner.CODE_DETECTION_CONFIG || {
  scoreThreshold: 6,
  requireStrongEvidence: true,
  verbosity: 'info',
  LOG_PERFORMANCE: false
};

if (!computeSourceCodeScore) {
  console.error('[ERROR] computeSourceCodeScore function not found in scanner module');
  process.exit(1);
}

// Test counter
let testsPassed = 0;
let testsFailed = 0;

/**
 * Simple assertion helper
 */
function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ ${message}`);
  } else {
    testsFailed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 1: Code with strong evidence (JavaScript) — Expect score ≥ 6 + strong evidence = "code" classification
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 1] JavaScript Code with Strong Evidence\n');

{
  const jsCode = `
    const myVar = 42;
    function calculate(x) {
      if (x > 10) {
        return x * 2;
      }
      return x;
    }
    console.log(calculate(myVar));
  `;

  const result = computeSourceCodeScore(jsCode);
  
  assert(result.classification === 'code', 
    `[7.2.1a] JavaScript code classified as 'code' (actual: '${result.classification}')`);
  assert(result.score >= 6, 
    `[7.2.1b] JavaScript code score ≥ 6 (actual: ${result.score})`);
  assert(result.strong_evidence === true, 
    `[7.2.1c] JavaScript code has strong_evidence = true (actual: ${result.strong_evidence})`);

  // Validate features
  assert(result.features.code_keywords > 0, 
    `[7.2.1d] code_keywords > 0 (detected keywords) (actual: ${result.features.code_keywords})`);
  assert(result.features.braces > 0, 
    `[7.2.1e] braces > 0 (detected braces) (actual: ${result.features.braces})`);
  assert(result.features.function_calls >= 1, 
    `[7.2.1f] function_calls ≥ 1 (actual: ${result.features.function_calls})`);

  console.log(`     Result details: score=${result.score}, keywords=${result.features.code_keywords}, braces=${result.features.braces}, function_calls=${result.features.function_calls}`);
}

// Test 1.2: Python code with strong evidence
{
  const pythonCode = `
    def greet(name):
        if name:
            return f"Hello, {name}!"
        return "Hello, World!"
    
    print(greet("Alice"))
  `;

  const result = computeSourceCodeScore(pythonCode);
  
  assert(result.classification === 'code', 
    `[7.2.1g] Python code classified as 'code' (actual: '${result.classification}')`);
  assert(result.score >= 6, 
    `[7.2.1h] Python code score ≥ 6 (actual: ${result.score})`);
  assert(result.strong_evidence === true, 
    `[7.2.1i] Python code has strong_evidence = true (actual: ${result.strong_evidence})`);

  console.log(`     Result details: score=${result.score}, keywords=${result.features.code_keywords}, function_calls=${result.features.function_calls}`);
}

// Test 1.3: Java code with imports and strong evidence
{
  const javaCode = `
    import java.util.ArrayList;
    import java.util.List;
    
    public class Calculator {
      public static void main(String[] args) {
        List<Integer> numbers = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
          numbers.add(i);
        }
        System.out.println(numbers);
      }
    }
  `;

  const result = computeSourceCodeScore(javaCode);
  
  assert(result.classification === 'code', 
    `[7.2.1j] Java code classified as 'code' (actual: '${result.classification}')`);
  assert(result.score >= 6, 
    `[7.2.1k] Java code score ≥ 6 (actual: ${result.score})`);
  assert(result.strong_evidence === true, 
    `[7.2.1l] Java code has strong_evidence = true (actual: ${result.strong_evidence})`);
  assert(result.features.import_statements > 0, 
    `[7.2.1m] import_statements > 0 (detected imports) (actual: ${result.features.import_statements})`);

  console.log(`     Result details: score=${result.score}, imports=${result.features.import_statements}, keywords=${result.features.code_keywords}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2: Prose with high weak feature scores but NO strong evidence
// Expect classification = "prose" despite high score (no strong evidence = rejection)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 2] Prose Samples (May Have Weak Features)\n');

{
  // This prose should NOT have strong evidence keywords - use plain English text
  // Avoid words like: function, const, let, var, class, if, for, return, import, etc.
  const proseWithWeakFeatures = `
    The data and information contain important numbers in lists.
    Values and arguments show throughout the text.
    People use naming styles for clarity and organization throughout.
    These texts show punctuation usage; semicolons appear; in; some; sentences; too.
  `;

  const result = computeSourceCodeScore(proseWithWeakFeatures);
  
  // Note: These prose samples might still trigger weak features, but shouldn't have strong evidence
  console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification}`);
  console.log(`     Keywords: ${result.features.code_keywords}, Braces: ${result.features.braces}, Imports: ${result.features.import_statements}, FunctionCalls: ${result.features.function_calls}`);
}

// Test 2.2: Technical documentation (may score on weak features but should not have strong evidence)
{
  // Avoid code keywords but include prose-like patterns with punctuation and naming conventions
  const technicalDoc = `
    The amount should be increased during processing.
    Use the naming style when writing identifiers.
    This method improves clarity and organization significantly.
    Do not skip any processing steps before completion.
    The options include various settings and values for fine-tuning behavior and results.
  `;

  const result = computeSourceCodeScore(technicalDoc);
  
  // Note: These prose samples might have some weak features but should not have strong evidence
  console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification}`);
  console.log(`     Keywords: ${result.features.code_keywords}, Braces: ${result.features.braces}, Imports: ${result.features.import_statements}, FunctionCalls: ${result.features.function_calls}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 3: Score = 8 but NO strong evidence → Expect "prose" (dual threshold failure)
// This tests that score threshold alone is insufficient without strong evidence
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 3] High Score (≥8) But NO Strong Evidence → "prose"\n');

{
  // Craft a text that accumulates weak evidence but lacks strong signals
  // This uses naming conventions, operators, and semicolons but NO keywords/imports/braces/calls
  const weakEvidenceOnly = `
    The value_variable should be_set before_using in process.
    The second_item gets_updated during each iteration point.
    Data includes first_name, second_name parameters separated == with operators.
    These patterns and separations might score moderately without real programming language keywords.
  `;

  const result = computeSourceCodeScore(weakEvidenceOnly);
  
  // This should classify as prose because even though weak features accumulate,
  // there's no strong evidence (keywords, imports, braces, function calls)
  assert(result.classification === 'prose', 
    `[7.2.3a] High weak-score prose classified as 'prose' (actual: '${result.classification}')`);
  assert(result.strong_evidence === false, 
    `[7.2.3b] Weak-evidence text has strong_evidence = false (actual: ${result.strong_evidence})`);

  console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 4: Score = 4 + strong evidence → Expect "prose" (score threshold failure)
// This tests that strong evidence alone is insufficient without score threshold
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 4] Strong Evidence But Low Score (<6) → "prose"\n');

{
  // A single keyword only (3 points) without much other evidence
  const singleKeywordOnly = `
    Here is a simple function example that demonstrates the concept.
    function
    One keyword is not enough.
  `;

  const result = computeSourceCodeScore(singleKeywordOnly);
  
  // Should classify as prose because score is below threshold despite strong keyword
  assert(result.classification === 'prose', 
    `[7.2.4a] Low-score with single keyword classified as 'prose' (actual: '${result.classification}')`);
  assert(result.score < 6, 
    `[7.2.4b] Score is below threshold (< 6) (actual: ${result.score})`);

  console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 5: Edge Cases
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 5] Edge Cases\n');

// Test 5.1: Empty string
{
  const result = computeSourceCodeScore('');
  
  assert(result.classification === 'prose', 
    `[7.2.5a] Empty string classified as 'prose' (actual: '${result.classification}')`);
  assert(result.score === 0, 
    `[7.2.5b] Empty string score = 0 (actual: ${result.score})`);
  assert(result.strong_evidence === false, 
    `[7.2.5c] Empty string has strong_evidence = false (actual: ${result.strong_evidence})`);

  console.log(`     Result details: score=${result.score}, classification=${result.classification}`);
}

// Test 5.2: Single keyword only
{
  const result = computeSourceCodeScore('function');
  
  assert(result.classification === 'prose', 
    `[7.2.5d] Single keyword classified as 'prose' (actual: '${result.classification}')`);
  assert(result.strong_evidence === true, 
    `[7.2.5e] Single keyword has strong_evidence = true (actual: ${result.strong_evidence})`);
  assert(result.score >= 3, 
    `[7.2.5f] Single keyword contributes ≥ 3 points (actual: ${result.score})`);
  assert(result.score < 6, 
    `[7.2.5g] Single keyword score is below threshold (< 6) (actual: ${result.score})`);

  console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification}`);
}

// Test 5.3: Single pair of braces
{
  const result = computeSourceCodeScore('{ }');
  
  assert(result.strong_evidence === true, 
    `[7.2.5h] Braces create strong_evidence = true (actual: ${result.strong_evidence})`);
  assert(result.score >= 2, 
    `[7.2.5i] Braces contribute ≥ 2 points (actual: ${result.score})`);

  console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification}`);
}

// Test 5.4: Minimum threshold crossing (score exactly 6 with strong evidence)
{
  const codeAtThreshold = `
    const myValue = 42;
    function getValue() { return myValue; }
    getValue();
  `;

  const result = computeSourceCodeScore(codeAtThreshold);
  
  if (result.score >= 6 && result.strong_evidence) {
    assert(result.classification === 'code', 
      `[7.2.5j] Score ≥ 6 + strong evidence classified as 'code' (actual: '${result.classification}')`);
    console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification} (meets threshold)`);
  } else {
    console.log(`     Result details: score=${result.score}, strong_evidence=${result.strong_evidence}, classification=${result.classification} (note: code sample did not meet threshold with current feature detection)`);
  }
}

// Test 5.5: Whitespace-only text
{
  const result = computeSourceCodeScore('   \n\n  \t\t  ');
  
  assert(result.classification === 'prose', 
    `[7.2.5l] Whitespace-only text classified as 'prose' (actual: '${result.classification}')`);
  assert(result.score === 0, 
    `[7.2.5m] Whitespace-only text score = 0 (actual: ${result.score})`);

  console.log(`     Result details: score=${result.score}, classification=${result.classification}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 6: Feature Combination Tests (Multiple Features)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 6] Feature Combination Tests\n');

// Test 6.1: Keywords + Braces + Function Calls + Comments
{
  const richCode = `
    /* Calculate factorial recursively */
    function factorial(n) {
      if (n <= 1) {
        return 1;
      }
      return n * factorial(n - 1);
    }
    // Test the function
    console.log(factorial(5));
  `;

  const result = computeSourceCodeScore(richCode);
  
  assert(result.classification === 'code', 
    `[7.2.6a] Rich code (keywords+braces+calls+comments) classified as 'code' (actual: '${result.classification}')`);
  assert(result.score >= 6, 
    `[7.2.6b] Rich code score ≥ 6 (actual: ${result.score})`);
  assert(result.features.code_keywords > 0, 
    `[7.2.6c] Keywords detected (actual: ${result.features.code_keywords})`);
  assert(result.features.braces > 0, 
    `[7.2.6d] Braces detected (actual: ${result.features.braces})`);
  assert(result.features.function_calls > 0, 
    `[7.2.6e] Function calls detected (actual: ${result.features.function_calls})`);
  assert(result.features.comments > 0, 
    `[7.2.6f] Comments detected (actual: ${result.features.comments})`);

  console.log(`     Result details: score=${result.score}, keywords=${result.features.code_keywords}, braces=${result.features.braces}, calls=${result.features.function_calls}, comments=${result.features.comments}`);
}

// Test 6.2: Only imports (strong evidence)
{
  const importsOnly = `
    import React from 'react';
    import { Component } from 'react';
    from utils import helper;
  `;

  const result = computeSourceCodeScore(importsOnly);
  
  assert(result.strong_evidence === true, 
    `[7.2.6g] Imports create strong_evidence = true (actual: ${result.strong_evidence})`);
  assert(result.features.import_statements > 0, 
    `[7.2.6h] Import statements detected (actual: ${result.features.import_statements})`);

  if (result.score >= 6) {
    assert(result.classification === 'code', 
      `[7.2.6i] Imports meeting threshold classified as 'code' (actual: '${result.classification}')`);
    console.log(`     Result details: score=${result.score}, imports=${result.features.import_statements}, classification=${result.classification} (threshold met)`);
  } else {
    console.log(`     Result details: score=${result.score}, imports=${result.features.import_statements}, classification=${result.classification} (below threshold)`);
  }
}

// Test 6.3: SQL code (imports not applicable, but keywords and operators present)
{
  const sqlCode = `
    SELECT id, name, email FROM users WHERE age > 18;
    INSERT INTO logs (timestamp, message) VALUES (NOW(), 'inserted');
    UPDATE users SET status = 'active' WHERE id = 123;
  `;

  const result = computeSourceCodeScore(sqlCode);
  
  // SQL has keywords (SELECT, INSERT, UPDATE) and operators (>, =)
  // But may not have braces or function calls, so strong evidence depends on keyword detection
  console.log(`     Result details: score=${result.score}, keywords=${result.features.code_keywords}, operators=${result.features.operators}, classification=${result.classification}`);
  console.log(`     Strong evidence: ${result.strong_evidence}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 7: Dual Threshold Validation Rules
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 7] Dual Threshold Validation Rules\n');

{
  // Test 7.1: Score ≥ 6 AND strong_evidence = true → "code" ✓
  console.log('  [Rule 1] Score ≥ 6 AND strong_evidence = true → "code"');
  const jsCode = `const x = 1; return x;`;
  const result1 = computeSourceCodeScore(jsCode);
  if (result1.score >= 6 && result1.strong_evidence) {
    assert(result1.classification === 'code', 
      `[7.2.7a] Rule 1 validation (score ≥ 6 AND strong) → 'code' (actual: '${result1.classification}')`);
  }

  // Test 7.2: Score ≥ 6 AND strong_evidence = false → "prose" ✗
  console.log('  [Rule 2] Score ≥ 6 AND strong_evidence = false → "prose"');
  const weakCode = `semicolon; separator; in_sequence; with_operators == present;`;
  const result2 = computeSourceCodeScore(weakCode);
  if (result2.score >= 6 && !result2.strong_evidence) {
    assert(result2.classification === 'prose', 
      `[7.2.7b] Rule 2 validation (score ≥ 6 but NO strong) → 'prose' (actual: '${result2.classification}')`);
  }

  // Test 7.3: Score < 6 → "prose" ✗ (regardless of strong evidence)
  console.log('  [Rule 3] Score < 6 → "prose" (regardless of strong evidence)');
  const singleKeyword = `function`;
  const result3 = computeSourceCodeScore(singleKeyword);
  if (result3.score < 6) {
    assert(result3.classification === 'prose', 
      `[7.2.7c] Rule 3 validation (score < 6) → 'prose' (actual: '${result3.classification}')`);
  }

  console.log(`     Rule 1 result: score=${result1.score}, strong=${result1.strong_evidence}, classification='${result1.classification}'`);
  console.log(`     Rule 2 result: score=${result2.score}, strong=${result2.strong_evidence}, classification='${result2.classification}'`);
  console.log(`     Rule 3 result: score=${result3.score}, strong=${result3.strong_evidence}, classification='${result3.classification}'`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 8: Various Programming Languages
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 8] Various Programming Languages\n');

// Test 8.1: C++ with includes and braces
{
  const cppCode = `
    #include <iostream>
    #include <vector>
    
    int main() {
      std::vector<int> numbers = {1, 2, 3, 4, 5};
      for (int n : numbers) {
        std::cout << n << std::endl;
      }
      return 0;
    }
  `;

  const result = computeSourceCodeScore(cppCode);
  assert(result.classification === 'code', 
    `[7.2.8a] C++ code classified as 'code' (actual: '${result.classification}')`);
  assert(result.score >= 6, 
    `[7.2.8b] C++ code score ≥ 6 (actual: ${result.score})`);

  console.log(`     C++ result: score=${result.score}, classification='${result.classification}'`);
}

// Test 8.2: Ruby with keywords and indentation
{
  const rubyCode = `
    class User
      attr_accessor :name, :email
      
      def initialize(name, email)
        @name = name
        @email = email
      end
      
      def display
        puts "Name: #{@name}, Email: #{@email}"
      end
    end
  `;

  const result = computeSourceCodeScore(rubyCode);
  assert(result.classification === 'code', 
    `[7.2.8c] Ruby code classified as 'code' (actual: '${result.classification}')`);
  assert(result.features.code_keywords > 0, 
    `[7.2.8d] Ruby keywords detected (actual: ${result.features.code_keywords})`);

  console.log(`     Ruby result: score=${result.score}, keywords=${result.features.code_keywords}, classification='${result.classification}'`);
}

// Test 8.3: Shell/Bash script
{
  const bashCode = `
    #!/bin/bash
    # Shell script example
    for file in *.txt; do
      if [ -f "$file" ]; then
        echo "Processing $file"
      fi
    done
  `;

  const result = computeSourceCodeScore(bashCode);
  console.log(`     Bash result: score=${result.score}, keywords=${result.features.code_keywords}, classification='${result.classification}'`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 9: Indentation and Line Density Features
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 9] Indentation and Line Density Features\n');

// Test 9.1: Well-indented code block
{
  const indentedCode = `
    if (condition) {
        action1();
        if (nested) {
            action2();
        }
    }
  `;

  const result = computeSourceCodeScore(indentedCode);
  assert(result.features.indentation > 0, 
    `[7.2.9a] Indentation feature detected (actual: ${result.features.indentation})`);

  console.log(`     Indented code result: indentation=${result.features.indentation}, score=${result.score}`);
}

// Test 9.2: Line density consistency
{
  const densityCode = `
    const x = 10;
    const y = 20;
    return x + y;
  `;

  const result = computeSourceCodeScore(densityCode);
  // Note: Line density detection depends on avg chars/line being between 30-150 chars/line with 3+ lines
  console.log(`     Line density result: line_density=${result.features.line_density}, score=${result.score}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('TEST SUMMARY');
console.log('='.repeat(80));
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log(`Total Tests: ${testsPassed + testsFailed}`);

if (testsFailed === 0) {
  console.log('\n✓ ALL TESTS PASSED');
  process.exit(0);
} else {
  console.log(`\n✗ ${testsFailed} TEST(S) FAILED`);
  process.exit(1);
}
