// Quick syntax test for scanner.js
try {
  require('./scanner.js');
  console.log('✓ scanner.js syntax is valid');
  process.exit(0);
} catch (e) {
  console.error('✗ Syntax error in scanner.js:', e.message);
  process.exit(1);
}
