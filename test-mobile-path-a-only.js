// Test PATH A (regex) only, without gazetteer dependencies

require('./normalizer.js');
require('./patterns.js');
require('./validator-wrapper.js');

const Scanner = require('./scanner.js');

// Disable PATH B and C by preventing gazetteer and linguistic detector
global.TrustGazetteer = undefined;
global.TrustLinguisticDetector = undefined;

const testPrompt = "I'm registering for an overseas service and it insists on international dialing format, which I always get wrong. My Philippine number is +639189945231. Could you confirm that's the correct international form and help me fill out the 'mobile (with country code)' field properly?";

console.log('=== Testing ph_mobile detection (PATH A ONLY) ===');
console.log('Prompt:', testPrompt);
console.log('\n--- Running scan ---\n');

(async () => {
  try {
    const results = await Scanner.scan(testPrompt);
    
    console.log('\n--- Scan Results ---');
    console.log('Result type:', typeof results);
    console.log('Result keys:', results ? Object.keys(results) : 'null');
    
    const findings = results.findings || [];
    console.log('Total findings:', findings.length);
    
    findings.forEach((finding, idx) => {
      console.log(`\n[${idx}] ${finding.patternId} (${finding.label})`);
      console.log('  Risk:', finding.risk);
      console.log('  Match:', finding.rawMatch);
      console.log('  Validated:', finding.validated);
    });
    
    // Check if ph_mobile was found
    const mobileFinding = findings.find(f => f.patternId === 'ph_mobile');
    if (mobileFinding) {
      console.log('\n✓ SUCCESS: ph_mobile was detected!');
      console.log('  Mobile number:', mobileFinding.rawMatch);
      console.log('  Risk level:', mobileFinding.risk);
    } else {
      console.log('\n✗ FAIL: ph_mobile was NOT detected');
      console.log('Expected to find: ph_mobile for "+639189945231"');
    }
    
  } catch (e) {
    console.error('Error during scan:', e.message);
    console.error(e.stack);
  }
})();
