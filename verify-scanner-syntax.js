#!/usr/bin/env node
// Quick syntax verification for scanner.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'scanner.js');
const code = fs.readFileSync(filePath, 'utf8');

// Count braces
const openBraces = (code.match(/\{/g) || []).length;
const closeBraces = (code.match(/\}/g) || []).length;

console.log(`Open braces: ${openBraces}`);
console.log(`Close braces: ${closeBraces}`);
console.log(`Balanced: ${openBraces === closeBraces ? '✓ YES' : '✗ NO'}`);

// Try to parse as JavaScript
try {
  new Function(code);
  console.log('✓ Syntax is valid');
} catch (e) {
  console.error('✗ Syntax error:', e.message);
  console.error('Line:', e.stack.split('\n')[1]);
}
