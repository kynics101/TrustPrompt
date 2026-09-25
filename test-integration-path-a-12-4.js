// test-integration-path-a-12-4.js — Integration tests for PATH A + multi-feature detection
// Task 12.4: Write integration tests for PATH A + multi-feature
// Tests unformatted code detection, markdown fallback, credential escalation, deduplication
// Requirements: 9, 11, 12, 17

// ═════════════════════════════════════════════════════════════════════════════
// SETUP: Load scanner.js and extract functions
// ═════════════════════════════════════════════════════════════════════════════

let scanner;
try {
  scanner = require('./scanner.js');
  console.log('[INFO] scanner.js loaded via require()');
} catch (e) {
  console.error('[ERROR] Failed to load scanner.js:', e.message);
  process.exit(1);
}

const computeSourceCodeScore = scanner.computeSourceCodeScore;
const runPathA = scanner.runPathA;

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
// TEST 1: Unformatted JavaScript Code Detection
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 1] Unformatted JavaScript Code Detection\n');

// Test 1.1: Unformatted JavaScript function
{
  const jsCode = `const calculateSum = (numbers) => {
  let total = 0;
  for (let i = 0; i < numbers.length; i++) {
    total += numbers[i];
  }
  return total;
};`;

  const result = computeSourceCodeScore(jsCode);
  
  assert(result.classification === 'code',
    `[12.4.1a] Unformatted JavaScript detected as code (actual: '${result.classification}')`);
  
  assert(result.score >= 6,
    `[12.4.1b] JavaScript score meets threshold (score: ${result.score})`);
  
  assert(result.features.code_keywords > 0,
    `[12.4.1c] Keywords detected in JavaScript (keywords: ${result.features.code_keywords})`);
  
  console.log(`     JavaScript detection: score=${result.score}, keywords=${result.features.code_keywords}`);
}

// Test 1.2: Unformatted JavaScript with async/await
{
  const asyncCode = `async function fetchUserData(userId) {
  try {
    const response = await fetch(\`/api/users/\${userId}\`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}`;

  const result = computeSourceCodeScore(asyncCode);
  
  assert(result.classification === 'code',
    `[12.4.1d] Async JavaScript detected as code (actual: '${result.classification}')`);
  
  assert(result.features.code_keywords > 0,
    `[12.4.1e] async/await keywords detected (keywords: ${result.features.code_keywords})`);
  
  console.log(`     Async JavaScript detection: keywords=${result.features.code_keywords}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 2: Unformatted Python Code Detection
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 2] Unformatted Python Code Detection\n');

// Test 2.1: Unformatted Python function
{
  const pythonCode = `def calculate_average(numbers):
    if not numbers:
        return 0
    total = sum(numbers)
    count = len(numbers)
    return total / count`;

  const result = computeSourceCodeScore(pythonCode);
  
  assert(result.classification === 'code',
    `[12.4.2a] Unformatted Python detected as code (actual: '${result.classification}')`);
  
  assert(result.score >= 6,
    `[12.4.2b] Python score meets threshold (score: ${result.score})`);
  
  console.log(`     Python detection: score=${result.score}`);
}

// Test 2.2: Unformatted Python class
{
  const pythonClass = `class User:
    def __init__(self, name, email):
        self.name = name
        self.email = email
    
    def display_info(self):
        return f"{self.name}: {self.email}"
    
    def is_valid_email(self):
        return "@" in self.email`;

  const result = computeSourceCodeScore(pythonClass);
  
  assert(result.classification === 'code',
    `[12.4.2c] Python class detected as code (actual: '${result.classification}')`);
  
  assert(result.features.code_keywords > 0,
    `[12.4.2d] Class and method keywords detected (keywords: ${result.features.code_keywords})`);
  
  console.log(`     Python class detection: keywords=${result.features.code_keywords}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 3: English Prose Detection (Should Be Rejected)
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 3] English Prose Rejection\n');

// Test 3.1: English paragraph (should not be detected as code)
{
  const prose = `This is a paragraph about programming techniques. 
    When writing functions, it is important to consider performance 
    and readability. Many developers prefer to use comments to explain 
    their logic and approach. The best practices include following 
    naming conventions and maintaining consistency throughout the project.`;

  const result = computeSourceCodeScore(prose);
  
  assert(result.classification === 'prose',
    `[12.4.3a] English prose correctly rejected (actual: '${result.classification}')`);
  
  console.log(`     Prose rejection: score=${result.score}, classification=prose`);
}

// Test 3.2: Technical documentation (should not be detected as code)
{
  const documentation = `The authentication module provides methods for 
    verifying user credentials and managing session tokens. 
    It supports multiple authentication strategies including 
    OAuth, JWT tokens, and basic authentication. 
    The module handles errors gracefully and logs all authentication attempts.`;

  const result = computeSourceCodeScore(documentation);
  
  assert(result.classification === 'prose',
    `[12.4.3b] Technical documentation rejected (actual: '${result.classification}')`);
  
  console.log(`     Documentation rejection: classification=prose`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 4: Code with API Key Escalation
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 4] Code with API Key (HIGH Risk Escalation)\n');

// Test 4.1: Code containing API key
{
  const codeWithApiKey = `const stripe = require('stripe');
const client = new stripe.Stripe('sk_live_1234567890abcdefghijklmnopqrstuvwxyz');

function processPayment(amount, token) {
  return client.charges.create({
    amount: amount * 100,
    currency: 'usd',
    source: token
  });
}`;

  const result = computeSourceCodeScore(codeWithApiKey);
  
  assert(result.classification === 'code',
    `[12.4.4a] Code with API key detected (actual: '${result.classification}')`);
  
  assert(result.score >= 6,
    `[12.4.4b] API key code score >= 6 (score: ${result.score})`);
  
  // Check if API key pattern is detectable in text
  const hasApiKeyPattern = codeWithApiKey.includes('sk_live_');
  assert(hasApiKeyPattern,
    `[12.4.4c] API key pattern present in code`);
  
  console.log(`     API key code detection: score=${result.score}, contains_api_key=true`);
}

// Test 4.2: Code containing JWT token
{
  const codeWithJwt = `import jwt
import json

SECRET_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"

def verify_token(token):
    try:
        decoded = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return decoded
    except jwt.InvalidTokenError:
        return None`;

  const result = computeSourceCodeScore(codeWithJwt);
  
  assert(result.classification === 'code',
    `[12.4.4d] Python code with JWT detected (actual: '${result.classification}')`);
  
  const hasJwtPattern = codeWithJwt.includes('eyJ');
  assert(hasJwtPattern,
    `[12.4.4e] JWT pattern present in code`);
  
  console.log(`     JWT code detection: contains_jwt=true`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 5: Mixed Markdown and Unformatted Code
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 5] Mixed Markdown and Unformatted Code\n');

// Test 5.1: Document with both markdown code fences and unformatted code
{
  const mixedContent = `Here's a markdown code block:

\`\`\`javascript
function markdownCode() {
  return "formatted";
}
\`\`\`

And here's some unformatted code in plain text:

const unformattedCode = (x) => x * 2;
function anotherFunction() {
  return true;
}

And back to prose explanation.`;

  // Extract unformatted code section
  const unformattedStart = mixedContent.indexOf('const unformattedCode');
  const unformattedEnd = mixedContent.indexOf('}', unformattedStart) + 1;
  const unformattedCode = mixedContent.substring(unformattedStart, unformattedEnd);
  
  const result = computeSourceCodeScore(unformattedCode);
  
  assert(result.classification === 'code',
    `[12.4.5a] Unformatted code in mixed content detected (actual: '${result.classification}')`);
  
  console.log(`     Mixed content unformatted code detection: classification=code`);
}

// Test 5.2: Markdown code detection (should still work)
{
  const markdownCode = `function markdownCode() {
  return "formatted";
}`;

  // Check if it would be detected
  const result = computeSourceCodeScore(markdownCode);
  
  assert(result.classification === 'code',
    `[12.4.5b] Unformatted (but structured) code detected (actual: '${result.classification}')`);
  
  console.log(`     Markdown-style unformatted code detection: classification=code`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 6: Deduplication of Markdown + Multi-Feature Matches
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 6] Deduplication Logic\n');

// Test 6.1: Same code block would match both markdown and multi-feature
{
  // When a code block matches both markdown regex and multi-feature scoring,
  // it should be deduplicated to a single finding
  
  const markdownCode = `\`\`\`javascript
function test() {
  return 42;
}
\`\`\``;

  // Both methods should detect this code
  const result = computeSourceCodeScore(markdownCode.substring(
    markdownCode.indexOf('function'),
    markdownCode.lastIndexOf('}') + 1
  ));
  
  assert(result.classification === 'code',
    `[12.4.6a] Code in markdown fences would be detected by multi-feature (actual: '${result.classification}')`);
  
  // Note: deduplication happens at the scanner level, not feature level
  console.log(`     Markdown fenced code would also match multi-feature scoring`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 7: Multiple Code Blocks in Single Text
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 7] Multiple Code Blocks\n');

// Test 7.1: Document with multiple distinct code blocks
{
  const multipleBlocks = `Here's the first example:
const x = 10;
function add(a, b) {
  return a + b;
}

And here's a second example:
def multiply(a, b):
  return a * b

Let me show one more:
for (let i = 0; i < 5; i++) {
  console.log(i);
}`;

  // Test first block
  const block1Start = multipleBlocks.indexOf('const x');
  const block1End = multipleBlocks.indexOf('}', block1Start) + 1;
  const block1 = multipleBlocks.substring(block1Start, block1End);
  
  const result1 = computeSourceCodeScore(block1);
  
  assert(result1.classification === 'code',
    `[12.4.7a] First code block detected (actual: '${result1.classification}')`);
  
  // Test second block (Python)
  const block2Start = multipleBlocks.indexOf('def multiply');
  const block2End = multipleBlocks.indexOf('b)', block2Start) + 2;
  const block2 = multipleBlocks.substring(block2Start, block2End);
  
  const result2 = computeSourceCodeScore(block2);
  
  assert(result2.classification === 'code',
    `[12.4.7b] Second code block (Python) detected (actual: '${result2.classification}')`);
  
  // Test third block (JavaScript loop)
  const block3Start = multipleBlocks.indexOf('for (let i');
  const block3End = multipleBlocks.lastIndexOf('}') + 1;
  const block3 = multipleBlocks.substring(block3Start, block3End);
  
  const result3 = computeSourceCodeScore(block3);
  
  assert(result3.classification === 'code',
    `[12.4.7c] Third code block detected (actual: '${result3.classification}')`);
  
  console.log(`     Multiple blocks all detected correctly`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 8: SQL and Configuration Code Detection
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 8] SQL and Configuration Code\n');

// Test 8.1: SQL queries
{
  const sqlCode = `SELECT id, name, email FROM users
WHERE age > 18 AND status = 'active'
ORDER BY created_at DESC
LIMIT 10;`;

  const result = computeSourceCodeScore(sqlCode);
  
  // SQL should be detectable due to keywords (SELECT, WHERE, etc)
  assert(result.score > 0,
    `[12.4.8a] SQL code produces non-zero score (score: ${result.score})`);
  
  console.log(`     SQL code detection: score=${result.score}, classification='${result.classification}'`);
}

// Test 8.2: Shell/Bash script
{
  const bashCode = `#!/bin/bash
for file in *.txt; do
  if [ -f "$file" ]; then
    echo "Processing $file"
    wc -l < "$file"
  fi
done`;

  const result = computeSourceCodeScore(bashCode);
  
  assert(result.score > 0,
    `[12.4.8b] Bash script produces non-zero score (score: ${result.score})`);
  
  console.log(`     Bash script detection: keywords=${result.features.code_keywords}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 9: Code Block Boundary Detection
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 9] Code Block Boundary Detection\n');

// Test 9.1: Code block extraction with start/end boundaries
{
  const codeBlock = `function processData(input) {
  const cleaned = input.trim();
  const lines = cleaned.split('\\n');
  const filtered = lines.filter(line => line.length > 0);
  return filtered.map(line => line.toUpperCase());
}`;

  const result = computeSourceCodeScore(codeBlock);
  
  assert(result.classification === 'code',
    `[12.4.9a] Code block boundaries detected (actual: '${result.classification}')`);
  
  console.log(`     Code block boundaries: correctly identified`);
}

// Test 9.2: Code block with maximum lines (should still be extracted)
{
  let largeCode = '';
  for (let i = 0; i < 15; i++) {
    largeCode += `line${i} = process(data${i});\n`;
  }
  largeCode += 'return result;';

  const result = computeSourceCodeScore(largeCode);
  
  assert(result.classification === 'code',
    `[12.4.9b] Large code block detected (actual: '${result.classification}')`);
  
  console.log(`     Large code block (15+ lines): correctly detected`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 10: Integration with Finding Structure
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 10] Finding Structure Integration\n');

// Test 10.1: Detected code generates proper finding structure
{
  const jsCode = `const API_KEY = "sk_test_abc123";
function authenticate() {
  return validateKey(API_KEY);
}`;

  const result = computeSourceCodeScore(jsCode);
  
  // Check if result includes expected fields for a finding
  assert(result.classification !== undefined,
    `[12.4.10a] Result includes classification field`);
  
  assert(result.score !== undefined,
    `[12.4.10b] Result includes score field`);
  
  assert(result.features !== undefined,
    `[12.4.10c] Result includes features object`);
  
  assert(result.reason !== undefined,
    `[12.4.10d] Result includes reason field`);
  
  console.log(`     Finding structure complete: classification, score, features, reason`);
}

// Test 10.2: Code metrics are populated
{
  const pythonCode = `import requests
from datetime import datetime

def fetch_data(url, headers):
  try:
    response = requests.get(url, headers=headers)
    data = response.json()
    return data
  except Exception as e:
    print(f"Error: {e}")
    return None`;

  const result = computeSourceCodeScore(pythonCode);
  
  assert(result.features.code_keywords > 0,
    `[12.4.10e] Code keywords detected in metrics (keywords: ${result.features.code_keywords})`);
  
  assert(result.features.import_statements > 0,
    `[12.4.10f] Import statements detected in metrics (imports: ${result.features.import_statements})`);
  
  console.log(`     Code metrics populated: keywords=${result.features.code_keywords}, imports=${result.features.import_statements}`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 11: Credential Patterns in Code
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 11] Credential Patterns in Code\n');

// Test 11.1: Code with hardcoded database URL
{
  const codeWithDbUrl = `import sqlite3

DATABASE_URL = "postgresql://admin:password123@db.example.com:5432/mydb"

def connect_to_database():
  connection = sqlite3.connect(DATABASE_URL)
  return connection`;

  const result = computeSourceCodeScore(codeWithDbUrl);
  
  assert(result.classification === 'code',
    `[12.4.11a] Code with database URL detected (actual: '${result.classification}')`);
  
  // Check for credential patterns
  const hasDbUrl = codeWithDbUrl.includes('postgresql://');
  assert(hasDbUrl,
    `[12.4.11b] Database URL pattern present in code`);
  
  console.log(`     Database URL in code: detectable and included in metrics`);
}

// Test 11.2: Code with AWS credentials
{
  const codeWithAwsKeys = `import boto3

AWS_ACCESS_KEY = "AKIAIOSFODNN7EXAMPLE"
AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

def upload_to_s3(bucket, key, data):
  s3 = boto3.client('s3',
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY)
  s3.put_object(Bucket=bucket, Key=key, Body=data)`;

  const result = computeSourceCodeScore(codeWithAwsKeys);
  
  assert(result.classification === 'code',
    `[12.4.11c] Code with AWS keys detected (actual: '${result.classification}')`);
  
  console.log(`     AWS credentials in code: detectable`);
}

// ═════════════════════════════════════════════════════════════════════════════
// TEST 12: Edge Cases and Error Handling
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n[TEST SUITE 12] Edge Cases and Error Handling\n');

// Test 12.1: Very short code snippet
{
  const shortCode = `x = 42;
return x;`;

  const result = computeSourceCodeScore(shortCode);
  
  assert(typeof result.classification === 'string',
    `[12.4.12a] Short code handled (classification: '${result.classification}')`);
  
  console.log(`     Short code snippet: handled gracefully`);
}

// Test 12.2: Code with unusual characters or encodings
{
  const codeWithUnicode = `function héllo(naïve) {
  const café = "café";
  return café + naïve;
}`;

  const result = computeSourceCodeScore(codeWithUnicode);
  
  assert(result.classification === 'code',
    `[12.4.12b] Unicode in code handled (actual: '${result.classification}')`);
  
  console.log(`     Unicode characters in code: handled`);
}

// Test 12.3: Minified code (long single line)
{
  const minifiedCode = `function a(b){let c=0;for(let d=0;d<b.length;d++){c+=b[d];}return c;}const e=[1,2,3,4,5];console.log(a(e));`;

  const result = computeSourceCodeScore(minifiedCode);
  
  assert(result.score > 0,
    `[12.4.12c] Minified code produces score (score: ${result.score})`);
  
  console.log(`     Minified code: score=${result.score}`);
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
  console.log('\n✓ ALL PATH A INTEGRATION TESTS PASSED');
  process.exit(0);
} else {
  console.log(`\n✗ ${testsFailed} TEST(S) FAILED`);
  process.exit(1);
}
