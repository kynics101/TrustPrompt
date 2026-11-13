// test-id-and-code.js
// Test why IDs and source code are not being recorded together

const TrustScanner = require('./scanner.js');

const testPrompts = [
  {
    id: 1,
    text: `how do i send this payload as json?  
payload.put("postalId", "K4829165-7302-M");`,
    expectedFindings: ['source_code', 'postalId_pattern']
  },
  {
    id: 2,
    text: `is this query safe from sql injection?
db.execute("INSERT INTO members (sss) VALUES ('31-0500213-4')");`,
    expectedFindings: ['source_code', 'sss_pattern']
  }
];

console.log('═════════════════════════════════════════════════════════════');
console.log('ID + SOURCE CODE DETECTION TEST');
console.log('═════════════════════════════════════════════════════════════\n');

testPrompts.forEach(test => {
  console.log(`\n📝 PROMPT ${test.id}:`);
  console.log('─'.repeat(60));
  console.log(test.text);
  console.log('\n' + '─'.repeat(60));
  
  try {
    const result = TrustScanner.scan(test.text);
    
    console.log(`\nFindings: ${result.findings ? result.findings.length : 0}`);
    
    if (result.findings && result.findings.length > 0) {
      const patterns = {};
      
      result.findings.forEach(finding => {
        const type = finding.patternId || finding.category || 'unknown';
        if (!patterns[type]) patterns[type] = [];
        patterns[type].push(finding);
      });
      
      console.log('\nBy Pattern Type:');
      Object.keys(patterns).forEach(type => {
        console.log(`  • ${type}: ${patterns[type].length} finding(s)`);
        patterns[type].forEach((f, idx) => {
          console.log(`    [${idx + 1}] Risk: ${f.risk} | Match: ${(f.rawMatch || f.value || '').substring(0, 50)}`);
        });
      });
      
      // Check if BOTH ID and code detected
      const hasCode = result.findings.some(f => f.patternId === 'source_code' || f.category === 'source_code');
      const hasId = result.findings.some(f => 
        f.patternId && (f.patternId.includes('postalId') || f.patternId.includes('sss') || f.patternId.includes('SSS'))
      );
      
      console.log(`\n✓ Has Source Code: ${hasCode}`);
      console.log(`✓ Has ID Pattern: ${hasId}`);
      
      if (hasCode && hasId) {
        console.log('\n✅ BOTH detected together');
      } else if (hasCode && !hasId) {
        console.log('\n❌ Code detected but ID NOT detected');
      } else if (!hasCode && hasId) {
        console.log('\n❌ ID detected but Code NOT detected');
      } else {
        console.log('\n❌ NEITHER detected');
      }
    } else {
      console.log('❌ NO FINDINGS');
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
  }
});

console.log('\n' + '═'.repeat(60));
