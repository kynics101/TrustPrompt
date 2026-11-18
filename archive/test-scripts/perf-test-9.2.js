// Performance testing for Task 9.2: Validate and optimize validators
const patterns = require('./patterns.js');

// Extract all Philippine ID validators from TRUSTPROMPT_PATTERNS
const phidPatterns = patterns.TRUSTPROMPT_PATTERNS.filter(p => p.id && p.id.includes('ph_id'));

console.log('=== Philippine ID Validator Performance Test (Task 9.2) ===\n');
console.log('Found ' + phidPatterns.length + ' Philippine ID patterns\n');

// Test samples for each validator type
const testSamples = {
  'ph_id_philid': '123456789012',
  'ph_id_drivers_license': '01-0201-1234-567',
  'ph_id_passport': 'P123456789',
  'ph_id_umid': '123456789012',
  'ph_id_sss': '12-3456789-01',
  'ph_id_gsis': '1234-56789-0',
  'ph_id_prc': '202101234567',
  'ph_id_tin': '123-45-678-9',
  'ph_id_philhealth': '12-345678-901-2',
  'ph_id_pag_ibig': '123456789012',
  'ph_id_nbi_clearance': '12-34-567-890',
  'ph_id_police_clearance': 'PNP-2021-123456',
  'ph_id_psa_certificate': '123-456-789-012',
  'ph_id_barangay_clearance': 'BC-2021-1234',
  'ph_id_comelec_voter_id': '12-34-56-1234-5678'
};

let totalTime = 0;
let validatorCount = 0;
let slowValidators = [];

// Performance test: run each validator 100 times
console.log('--- Individual Validator Performance (100 iterations each) ---\n');

phidPatterns.forEach(pattern => {
  if (!pattern.structuralValidate) return;
  
  const testValue = testSamples[pattern.id];
  if (!testValue) {
    console.log('⚠️  No test sample for ' + pattern.id);
    return;
  }

  const iterations = 100;
  const startTime = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    pattern.structuralValidate(testValue);
  }
  
  const endTime = performance.now();
  const totalMs = endTime - startTime;
  const avgMs = totalMs / iterations;
  totalTime += totalMs;
  validatorCount++;

  const status = avgMs < 1 ? '✅' : '⚠️ ';
  console.log(status + pattern.label);
  console.log('   ID: ' + pattern.id);
  console.log('   ' + totalMs.toFixed(2) + 'ms total, ' + avgMs.toFixed(4) + 'ms/call\n');
  
  if (avgMs >= 1) {
    slowValidators.push({
      id: pattern.id,
      label: pattern.label,
      avgMs: avgMs
    });
  }
});

// Overall performance test: simulate scanning 14 IDs once each
console.log('--- Overall Performance Test ---\n');
const overallStart = performance.now();

phidPatterns.forEach(pattern => {
  if (!pattern.structuralValidate) return;
  const testValue = testSamples[pattern.id];
  if (testValue) pattern.structuralValidate(testValue);
});

const overallEnd = performance.now();
const overallTime = overallEnd - overallStart;

console.log('Total time for all ' + validatorCount + ' validators (1 call each): ' + overallTime.toFixed(3) + 'ms');
console.log('Average per validator: ' + (overallTime / validatorCount).toFixed(4) + 'ms');
console.log('Requirement 20 Target: < 10ms for all 14 validators combined');
console.log((overallTime < 10) ? '✅ PASS - Performance meets requirement' : '⚠️ NEED OPTIMIZATION - Above 10ms threshold');

if (slowValidators.length > 0) {
  console.log('\n⚠️ Validators exceeding 1ms threshold (Requirement 20):');
  slowValidators.forEach(v => {
    console.log('   - ' + v.label + ' (' + v.avgMs.toFixed(4) + 'ms)');
  });
} else {
  console.log('\n✅ All validators under 1ms threshold');
}

console.log('\n=== Summary ===');
console.log('Average total time: ' + (totalTime / (phidPatterns.length * 100)).toFixed(4) + 'ms per validator (avg of 100 iterations)');
console.log('Overall efficiency: ' + (overallTime < 10 ? 'Excellent' : overallTime < 15 ? 'Good' : 'Needs optimization'));
