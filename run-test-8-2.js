#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

try {
  // Load all dependencies
  const normalizerCode = fs.readFileSync(path.join(__dirname, 'normalizer.js'), 'utf8');
  const patternsCode = fs.readFileSync(path.join(__dirname, 'patterns.js'), 'utf8');
  const validatorCode = fs.readFileSync(path.join(__dirname, 'lib', 'validator.min.js'), 'utf8');
  const scannerCode = fs.readFileSync(path.join(__dirname, 'scanner.js'), 'utf8');
  const gazetterCode = fs.readFileSync(path.join(__dirname, 'gazetteer.js'), 'utf8');

  // Execute all code in sequence
  eval(normalizerCode);
  eval(validatorCode);
  eval(patternsCode);
  eval(gazetterCode);
  eval(scannerCode);

  // Now load and run test
  const testCode = fs.readFileSync(path.join(__dirname, 'test-task-8-2-risk-scoring.js'), 'utf8');
  // Skip the header and dependency loading part
  const testPart = testCode.split('// Helper: Extract BASE_SCORES')[1];
  eval('const BASE_SCORES = TrustScanner.BASE_SCORES;\nconst ENTITY_TIER = TrustScanner.ENTITY_TIER;\n' + testPart);
} catch (err) {
  console.error('Error running test:', err.message);
  console.error(err.stack);
  process.exit(1);
}
