// test-prose-with-inline-code.js
// Tests whether inline backtick code is detected even in prose context

const TrustScanner = require('./scanner.js');

const testPrompt = `I keep getting a syntax error on one line and I can't see it. The line is \`const config = {retries: 3, timeout: 5000, debug: true};\` — to my eyes that looks perfectly valid, so what could possibly be wrong with it? Is it something about where I placed it in the file maybe?`;

console.log('═════════════════════════════════════════════════════════════');
console.log('TEST: Inline Code Detection in Prose Context');
console.log('═════════════════════════════════════════════════════════════\n');

console.log('Input prompt:\n');
console.log(testPrompt);
console.log('\n' + '─'.repeat(60) + '\n');

// Run the scanner
const result = TrustScanner.scan(testPrompt);

console.log('\nScan Results:');
console.log('─'.repeat(60));

if (result.findings && result.findings.length > 0) {
  console.log(`✅ DETECTED: ${result.findings.length} finding(s)\n`);
  
  result.findings.forEach((finding, idx) => {
    console.log(`[${idx + 1}] Pattern ID: ${finding.patternId}`);
    console.log(`    Label: ${finding.label}`);
    console.log(`    Risk: ${finding.risk}`);
    if (finding.language) {
      console.log(`    Language: ${finding.language}`);
    }
    if (finding.rawMatch) {
      console.log(`    Match: ${finding.rawMatch.substring(0, 70)}...`);
    }
    console.log();
  });
} else {
  console.log('❌ NO FINDINGS DETECTED\n');
}

console.log('═'.repeat(60));
console.log('Classification:', result.classification);
console.log('Risk Level:', result.risk);
console.log('═'.repeat(60));

// Check if source code was detected
const sourceCodeFindings = (result.findings || []).filter(f => 
  f.patternId === 'SOURCE_CODE' || 
  f.patternId === 'SOURCE_CODE_INLINE' ||
  (f.category && f.category === 'source_code')
);

if (sourceCodeFindings.length > 0) {
  console.log('\n✅ SUCCESS: Inline code in prose was detected!');
} else {
  console.log('\n❌ FAILURE: Inline code in prose was NOT detected');
}
