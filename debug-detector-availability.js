/**
 * Debug script to diagnose why TrustLinguisticDetector is not available
 * Run this in browser console after extension loads
 */

console.log('='.repeat(80));
console.log('[DEBUG] TrustLinguisticDetector Availability Diagnostic');
console.log('='.repeat(80));

// Check 1: Is window.TrustLinguisticDetector defined?
console.log('\n[CHECK 1] window.TrustLinguisticDetector:');
console.log('  typeof:', typeof window.TrustLinguisticDetector);
console.log('  value:', window.TrustLinguisticDetector);
console.log('  has scan method?', window.TrustLinguisticDetector && typeof window.TrustLinguisticDetector.scan === 'function');

// Check 2: Is globalThis.TrustLinguisticDetector defined?
console.log('\n[CHECK 2] globalThis.TrustLinguisticDetector:');
console.log('  typeof:', typeof globalThis.TrustLinguisticDetector);
console.log('  value:', globalThis.TrustLinguisticDetector);
console.log('  has scan method?', globalThis.TrustLinguisticDetector && typeof globalThis.TrustLinguisticDetector.scan === 'function');

// Check 3: Is window.nlp (compromise.js) available?
console.log('\n[CHECK 3] window.nlp (compromise.js):');
console.log('  typeof:', typeof window.nlp);
console.log('  value:', window.nlp);

// Check 4: Try calling scan directly
console.log('\n[CHECK 4] Direct scan test:');
if (window.TrustLinguisticDetector && typeof window.TrustLinguisticDetector.scan === 'function') {
  try {
    const testText = 'Cristina is a lawyer';
    console.log('  Testing with:', testText);
    const result = window.TrustLinguisticDetector.scan(testText);
    console.log('  Success! Result:', result);
    console.log('  Finding count:', result.length);
  } catch (err) {
    console.error('  Error during scan:', err);
  }
} else {
  console.error('  Cannot call scan - detector not available');
}

// Check 5: List all global objects that might be the detector
console.log('\n[CHECK 5] Looking for detector-like objects in window:');
for (const key of Object.keys(window)) {
  if (key.toLowerCase().includes('detector') || key.toLowerCase().includes('linguistic') || key.toLowerCase().includes('trust')) {
    console.log(`  ${key}:`, typeof window[key], window[key]);
  }
}

// Check 6: Check script loading order
console.log('\n[CHECK 6] Script loading order:');
const scripts = document.querySelectorAll('script[src]');
console.log(`Total scripts loaded: ${scripts.length}`);
for (let i = 0; i < scripts.length; i++) {
  const src = scripts[i].src;
  if (src.includes('compromise') || src.includes('linguistic') || src.includes('scanner')) {
    console.log(`  [${i}] ${src.split('/').pop()}`);
  }
}

// Check 7: Try testLinguisticDetector function
console.log('\n[CHECK 7] testLinguisticDetector function:');
console.log('  typeof window.testLinguisticDetector:', typeof window.testLinguisticDetector);
if (typeof window.testLinguisticDetector === 'function') {
  console.log('  Calling testLinguisticDetector()...');
  try {
    const result = window.testLinguisticDetector();
    console.log('  Result:', result);
  } catch (err) {
    console.error('  Error:', err);
  }
}

console.log('\n' + '='.repeat(80));
console.log('[DEBUG] Diagnostic complete');
console.log('='.repeat(80));
