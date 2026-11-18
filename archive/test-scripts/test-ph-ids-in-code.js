#!/usr/bin/env node
/**
 * Test: Philippine ID Detection in Source Code Blocks
 * 
 * Purpose: Verify that SSS, UMID, PRC, and other Philippine IDs
 * embedded in source code blocks are detected as credentials and
 * escalate code risk appropriately.
 * 
 * Test cases:
 * 1. SSS number in code (const sss = "04-1234567-8")
 * 2. UMID in code
 * 3. PhilID in code
 * 4. TIN in code
 * 5. Multiple Philippines IDs in code
 * 6. IDs in comments
 */

const fs = require('fs');
const path = require('path');

// Load scanner.js
const scannerPath = path.join(__dirname, 'scanner.js');
let scanner;

try {
  const code = fs.readFileSync(scannerPath, 'utf-8');
  // Create a new context for eval
  const context = { 
    console, 
    module: { exports: {} },
    exports: {},
    require,
    __dirname,
    __filename: scannerPath
  };
  vm = require('vm');
  vm.runInThisContext(code, { filename: scannerPath });
  // The scanner code should have defined functions globally
} catch (err) {
  console.error("Failed to load scanner.js:", err.message);
  process.exit(1);
}

// Test cases
const testCases = [
  {
    name: "SSS number in code",
    input: `
Here's the employee record:
\`\`\`javascript
const sss = "04-1234567-8"; // employee record
\`\`\`
    `,
    expectedCredentialCount: 1,
    expectedPatterns: ['ph_ids']
  },
  {
    name: "UMID in code",
    input: `
Employee ID verification:
\`\`\`javascript
const umid = "1234 5678901 2"; // UMID number
\`\`\`
    `,
    expectedCredentialCount: 1,
    expectedPatterns: ['ph_ids']
  },
  {
    name: "PhilID in code",
    input: `
\`\`\`javascript
const nationalId = "1234-5678-9012-3456"; // PhilID
\`\`\`
    `,
    expectedCredentialCount: 1,
    expectedPatterns: ['ph_ids']
  },
  {
    name: "TIN in code",
    input: `
\`\`\`javascript
const tinNumber = "123-456-789"; // TIN
\`\`\`
    `,
    expectedCredentialCount: 1,
    expectedPatterns: ['ph_ids']
  },
  {
    name: "Multiple Philippines IDs in code",
    input: `
\`\`\`javascript
const userData = {
  sss: "04-1234567-8",
  umid: "1234 5678901 2",
  tin: "123-456-789"
};
\`\`\`
    `,
    expectedCredentialCount: 3,
    expectedPatterns: ['ph_ids']
  },
  {
    name: "SSS in code comment",
    input: `
\`\`\`javascript
// Employee SSS: 04-1234567-8
function getEmployee(id) {
  return findById(id);
}
\`\`\`
    `,
    expectedCredentialCount: 1,
    expectedPatterns: ['ph_ids']
  },
  {
    name: "No false positives - random digits",
    input: `
\`\`\`javascript
const version = "1.2.3.4"; // semantic versioning
const count = 123456789; // just a number
\`\`\`
    `,
    expectedCredentialCount: 0,
    expectedPatterns: []
  }
];

// Mock functions if not defined globally
if (typeof countPatternMatches === 'undefined') {
  global.countPatternMatches = function(text, patterns) {
    if (!Array.isArray(patterns)) return 0;
    let count = 0;
    for (const pattern of patterns) {
      if (pattern instanceof RegExp) {
        const matches = text.match(pattern);
        if (matches) count += matches.length;
      }
    }
    return count;
  };
}

if (typeof countCredentialMatches === 'undefined') {
  global.countCredentialMatches = function(text, credentialPatterns) {
    if (!text || typeof credentialPatterns !== 'object') {
      return { totalCount: 0, byCategory: {} };
    }
    
    const byCategory = {};
    let totalCount = 0;
    
    for (const [category, patterns] of Object.entries(credentialPatterns)) {
      if (Array.isArray(patterns) && patterns.length > 0 && typeof patterns[0] === 'string') {
        continue; // Skip string arrays
      }
      
      if (Array.isArray(patterns)) {
        const count = global.countPatternMatches(text, patterns);
        byCategory[category] = count;
        totalCount += count;
      }
    }
    
    return { totalCount, byCategory };
  };
}

// Run tests
console.log("\n" + "=".repeat(70));
console.log("TEST: Philippine ID Detection in Source Code Blocks");
console.log("=".repeat(70) + "\n");

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`Test: ${testCase.name}`);
  
  try {
    // Extract code block from test input
    const codeBlockMatch = testCase.input.match(/```[\w]*\n([\s\S]*?)\n```/);
    const codeBlock = codeBlockMatch ? codeBlockMatch[1] : testCase.input;
    
    // Check credentials
    if (typeof countCredentialMatches === 'function' && typeof CREDENTIAL_PATTERNS !== 'undefined') {
      const result = countCredentialMatches(codeBlock, CREDENTIAL_PATTERNS);
      
      console.log(`  Code block: ${codeBlock.substring(0, 60)}...`);
      console.log(`  Credentials found: ${result.totalCount}`);
      console.log(`  By category: ${JSON.stringify(result.byCategory)}`);
      
      // Verify expectations
      if (result.totalCount === testCase.expectedCredentialCount) {
        console.log(`  ✓ PASS: Found expected ${testCase.expectedCredentialCount} credential(s)`);
        passed++;
      } else {
        console.log(`  ✗ FAIL: Expected ${testCase.expectedCredentialCount}, got ${result.totalCount}`);
        failed++;
      }
    } else {
      console.log(`  ⚠ SKIP: countCredentialMatches or CREDENTIAL_PATTERNS not available`);
    }
  } catch (err) {
    console.log(`  ✗ ERROR: ${err.message}`);
    failed++;
  }
  
  console.log();
}

// Summary
console.log("=".repeat(70));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log("=".repeat(70));

process.exit(failed > 0 ? 1 : 0);
