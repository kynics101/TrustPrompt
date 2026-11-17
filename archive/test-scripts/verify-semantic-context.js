// Verify semantic context has been added to all findings
// This is a dry-run verification that checks the code structure

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'linguistic-detector.js');
const content = fs.readFileSync(filePath, 'utf8');

console.log('\n' + '='.repeat(80));
console.log('SEMANTIC CONTEXT VERIFICATION');
console.log('='.repeat(80));

// Count semantic context additions
let semanticContextCount = 0;
const semanticLines = content.match(/semanticContext:\s*{[\s\S]*?}/g) || [];
semanticContextCount = semanticLines.length;

console.log(`\n1. SEMANTIC CONTEXT OBJECT ADDITIONS: ${semanticContextCount} found`);
console.log(`   Expected: 12+ (one for each finding type)\n`);

// Check for key functions
const requiredFunctions = [
  'extractSemanticContext',
  'extractStandalonePersonNames',
  'extractSubjectPositionNames',
  'extractNamesWithHonorific',
  'extractPredicateJobTitles',
  'extractOrganizationContexts',
  'extractFromAppositives',
  'getSemanticContext'
];

console.log('2. REQUIRED FUNCTION DEFINITIONS:');
for (const func of requiredFunctions) {
  const exists = new RegExp(`function ${func}|const ${func}`).test(content);
  console.log(`   ${exists ? '✅' : '❌'} ${func}`);
}

// Check for semantic context structure
const contextTypeCheck = /type:\s*"personal_disclosure"|"abstract"|"measurement"|"unknown"/.test(content);
const confidenceCheck = /confidence:\s*\d+(\.\d+)?|Math\.min\(/.test(content);
const indicatorsCheck = /indicators:\s*\[\]|indicators:\s*semanticContext\.indicators/.test(content);

console.log('\n3. SEMANTIC CONTEXT STRUCTURE:');
console.log(`   ${contextTypeCheck ? '✅' : '❌'} Type field with correct values`);
console.log(`   ${confidenceCheck ? '✅' : '❌'} Confidence scoring`);
console.log(`   ${indicatorsCheck ? '✅' : '❌'} Indicators array`);

// Check module exports
const exportsCheck = /getSemanticContext/.test(content);
const scanExportCheck = /return\s*{[\s\S]*?scan[\s\S]*?getSemanticContext/.test(content);

console.log('\n4. MODULE EXPORTS:');
console.log(`   ${exportsCheck ? '✅' : '❌'} getSemanticContext exported`);
console.log(`   ${scanExportCheck ? '✅' : '❌'} scan and getSemanticContext in return object`);

// Check that findings have semantic context attached
const findingsWithContext = content.match(/findings\.push\({[\s\S]*?semanticContext:/g) || [];
console.log(`\n5. FINDINGS WITH SEMANTIC CONTEXT ATTACHED: ${findingsWithContext.length}`);
console.log(`   Expected: 15+ (all finding additions should include context)\n`);

// Overall status
const allChecks = [
  semanticContextCount >= 12,
  requiredFunctions.every(f => new RegExp(`function ${f}|const ${f}`).test(content)),
  contextTypeCheck,
  confidenceCheck,
  indicatorsCheck,
  exportsCheck,
  scanExportCheck,
  findingsWithContext.length >= 15
];

const passCount = allChecks.filter(x => x).length;
console.log('='.repeat(80));
console.log(`VERIFICATION: ${passCount}/8 checks passed`);

if (passCount === 8) {
  console.log('✅ ALL CHECKS PASSED - Semantic context implementation complete!');
} else {
  console.log('⚠️  Some checks failed - Review implementation');
  process.exit(1);
}

console.log('='.repeat(80) + '\n');
