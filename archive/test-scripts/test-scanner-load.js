#!/usr/bin/env node
// Test if scanner.js can be loaded

try {
  const TrustScanner = require('./scanner.js');
  if (TrustScanner && typeof TrustScanner.scan === 'function') {
    console.log('✓ scanner.js loaded successfully');
    console.log('✓ TrustScanner.scan is available');
    process.exit(0);
  } else {
    console.error('✗ TrustScanner.scan is not a function');
    console.error('  TrustScanner keys:', Object.keys(TrustScanner).slice(0, 5));
    process.exit(1);
  }
} catch (e) {
  console.error('✗ Failed to load scanner.js');
  console.error('Error:', e.message);
  const lines = e.stack.split('\n');
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    console.error(lines[i]);
  }
  process.exit(1);
}
