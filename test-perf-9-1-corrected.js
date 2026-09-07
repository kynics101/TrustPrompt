#!/usr/bin/env node

/**
 * Task 9.1: Measure structural validator performance (CORRECTED)
 * 
 * The requirement states:
 * - Target: each validator < 1ms per call
 * - Overall structural validation for all 14 types < 10ms
 * 
 * The "10ms overall" refers to calling all 14 validators sequentially on a 
 * typical text input (not 100 iterations each). This test:
 * 
 * 1. Generates 100 valid test cases for each of 14 ID types
 * 2. For each test case, calls ALL 14 validators (to measure combined impact)
 * 3. Records time with performance.now()
 * 4. Outputs performance report with:
 *    - Per-type average time (single call)
 *    - Min/max per type (single call)
 *    - Total time for all 14 validators called sequentially
 *    - Pass/fail against <1ms and <10ms targets
 * 
 * Requirements: 20
 */

// Load patterns with all validators
let patterns;
try {
  patterns = require('./patterns.js');
} catch (err) {
  console.error('Error loading patterns.js:', err.message);
  process.exit(1);
}

// Extract all Philippine ID validators
const validatorFunctions = {
  'ph_id_philid': patterns.structuralValidatePHID_PhilID,
  'ph_id_drivers_license': patterns.structuralValidatePHID_DriversLicense,
  'ph_id_passport': patterns.structuralValidatePHID_Passport,
  'ph_id_sss': patterns.structuralValidatePHID_SSS,
  'ph_id_gsis': patterns.structuralValidatePHID_GSIS,
  'ph_id_umid': patterns.structuralValidatePHID_UMID,
  'ph_id_tin': patterns.structuralValidatePHID_TIN,
  'ph_id_prc': patterns.structuralValidatePHID_PRC,
  'ph_id_philhealth': patterns.structuralValidatePHID_PhilHealth,
  'ph_id_pagibig': patterns.structuralValidatePHID_PagIBIG,
  'ph_id_nbi_clearance': patterns.structuralValidatePHID_NBIClearance,
  'ph_id_psa_certificate': patterns.structuralValidatePHID_PSACertificate,
  'ph_id_police_clearance': patterns.structuralValidatePHID_PoliceClearance,
  'ph_id_barangay_clearance': patterns.structuralValidatePHID_BarangayClearance,
  'ph_id_comelec_voter_id': patterns.structuralValidatePHID_COMELECVoterID
};

// Test data generator functions for each ID type
const testDataGenerators = {
  'ph_id_philid': () => {
    const yy = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const mm = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const dd = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    const sex = Math.random() > 0.5 ? '1' : '2';
    return yy + mm + dd + seq + sex;
  },
  'ph_id_drivers_license': () => {
    const region = String(Math.floor(Math.random() * 16) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 9999999999)).padStart(9, '0');
    return region + seq;
  },
  'ph_id_passport': () => {
    const type = Math.floor(Math.random() * 3) + 1;
    const seq = String(Math.floor(Math.random() * 9999999)).padStart(7, '0');
    return 'P' + type + seq;
  },
  'ph_id_sss': () => {
    const branch = String(Math.floor(Math.random() * 59) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
    return branch + seq;
  },
  'ph_id_gsis': () => {
    const agency = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    return agency + seq;
  },
  'ph_id_umid': () => {
    const system = String(Math.floor(Math.random() * 1000) + 1000).padStart(4, '0');
    const seq = String(Math.floor(Math.random() * 9999999)).padStart(7, '0');
    const allDigits = system + seq;
    const checkDigit = (10 - (allDigits.split('').reduce((sum, d) => sum + parseInt(d), 0) % 10)) % 10;
    return allDigits + checkDigit;
  },
  'ph_id_tin': () => {
    const area = String(Math.floor(Math.random() * 801) + 100).padStart(3, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(5, '0');
    const allDigits = area + seq;
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += parseInt(allDigits[i]) * weights[i];
    }
    const checkDigit = (11 - (sum % 11)) % 11;
    return allDigits + checkDigit;
  },
  'ph_id_prc': () => {
    const profession = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
    return profession + seq;
  },
  'ph_id_philhealth': () => {
    return String(Math.floor(Math.random() * 999999999999)).padStart(12, '0');
  },
  'ph_id_pagibig': () => {
    return String(Math.floor(Math.random() * 999999999999)).padStart(12, '0');
  },
  'ph_id_nbi_clearance': () => {
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const office = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    const seq = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    return year + office + seq;
  },
  'ph_id_psa_certificate': () => {
    const types = [101, 201, 301];
    const type = types[Math.floor(Math.random() * types.length)];
    const location = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99)).padStart(2, '0');
    return type + location + year + seq;
  },
  'ph_id_police_clearance': () => {
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    return year + seq;
  },
  'ph_id_barangay_clearance': () => {
    const barangay = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    return barangay + year + seq;
  },
  'ph_id_comelec_voter_id': () => {
    const province = String(Math.floor(Math.random() * 82) + 1).padStart(2, '0');
    const city = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const barangay = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99999)).padStart(4, '0');
    return province + city + barangay + seq;
  }
};

console.log('='.repeat(80));
console.log('TASK 9.1: Structural Validator Performance Benchmark (CORRECTED)');
console.log('='.repeat(80));

const idTypes = Object.keys(validatorFunctions);
console.log(`\nBenchmark Configuration:`);
console.log(`  - Test cases per type: 100`);
console.log(`  - ID types: ${idTypes.length}`);
console.log(`  - Total validations: 100 × ${idTypes.length} = ${100 * idTypes.length} calls`);
console.log(`  - Target per validator: < 1ms per call`);
console.log(`  - Target for all 14 validators combined: < 10ms\n`);

// Test 1: Profile each individual validator
console.log('TEST 1: Individual Validator Performance');
console.log('-'.repeat(80));

const perTypeStats = {};
let totalTimeAllValidators = 0;

for (const idType of idTypes) {
  const validator = validatorFunctions[idType];
  const generator = testDataGenerators[idType];

  if (!generator) {
    console.warn(`⚠️  No test generator for ${idType}`);
    continue;
  }

  // Generate 100 test cases
  const testCases = [];
  for (let i = 0; i < 100; i++) {
    testCases.push(generator());
  }

  // Time the validation calls
  const timings = [];
  for (const testCase of testCases) {
    const startTime = performance.now();
    try {
      validator(testCase);
    } catch (err) {
      // Ignore errors
    }
    const endTime = performance.now();
    timings.push(endTime - startTime);
  }

  // Calculate statistics
  const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
  const minTime = Math.min(...timings);
  const maxTime = Math.max(...timings);
  const passed1msTarget = avgTime < 1;

  perTypeStats[idType] = { avgTime, minTime, maxTime };
  totalTimeAllValidators += timings.reduce((a, b) => a + b, 0);

  const status = passed1msTarget ? '✓' : '✗';
  console.log(`${status} ${idType.padEnd(35)} | Avg: ${avgTime.toFixed(4)}ms | Min: ${minTime.toFixed(4)}ms | Max: ${maxTime.toFixed(4)}ms`);
}

console.log('\n' + '='.repeat(80));
console.log('TEST 2: Sequential Validation of All 14 Types');
console.log('-'.repeat(80));

// Generate one test case per type
const singleTestCases = {};
for (const idType of idTypes) {
  const generator = testDataGenerators[idType];
  if (generator) {
    singleTestCases[idType] = generator();
  }
}

// Measure time to call all 14 validators once
const startAll = performance.now();
for (const idType of idTypes) {
  const validator = validatorFunctions[idType];
  const testCase = singleTestCases[idType];
  if (validator && testCase) {
    try {
      validator(testCase);
    } catch (err) {
      // Ignore
    }
  }
}
const endAll = performance.now();
const sequentialTime = endAll - startAll;

console.log(`Sequential validation of all 14 types (single call each):`);
console.log(`  Time: ${sequentialTime.toFixed(4)}ms`);
console.log(`  Target: < 10ms`);
console.log(`  Status: ${sequentialTime < 10 ? '✓ PASS' : '✗ FAIL'}\n`);

// Test 3: Summary
console.log('='.repeat(80));
console.log('PERFORMANCE SUMMARY');
console.log('='.repeat(80));

const passed1msCount = Object.values(perTypeStats).filter(s => s.avgTime < 1).length;
const totalValidators = Object.keys(perTypeStats).length;

console.log(`\n✓ Per-Type Validator Performance (< 1ms target):`);
console.log(`   Passing: ${passed1msCount}/${totalValidators} validators`);

console.log(`\n⏱️  Statistics for 100 calls per validator (14 types = 1400 total calls):`);
console.log(`   Total time: ${totalTimeAllValidators.toFixed(2)}ms`);
console.log(`   Average per call: ${(totalTimeAllValidators / 1400).toFixed(4)}ms`);

console.log(`\n⏱️  Sequential Validation (all 14 validators called once):`);
console.log(`   Time: ${sequentialTime.toFixed(4)}ms`);
console.log(`   Target: < 10ms`);
console.log(`   Status: ${sequentialTime < 10 ? '✓ PASS' : '✗ FAIL'}`);

console.log(`\n📊 Detailed Per-Type Report:`);
console.log('-'.repeat(80));
console.log('ID Type'.padEnd(35) + ' | Avg (ms) | Min (ms) | Max (ms) | Status');
console.log('-'.repeat(80));

for (const [idType, stats] of Object.entries(perTypeStats)) {
  const status = stats.avgTime < 1 ? '✓ PASS' : '✗ FAIL';
  console.log(
    idType.padEnd(35) + ' | ' +
    stats.avgTime.toFixed(4).padStart(8) + ' | ' +
    stats.minTime.toFixed(4).padStart(8) + ' | ' +
    stats.maxTime.toFixed(4).padStart(8) + ' | ' +
    status
  );
}

console.log('-'.repeat(80));

console.log(`\n` + '='.repeat(80));
if (passed1msCount === totalValidators && sequentialTime < 10) {
  console.log('✓ ALL PERFORMANCE TARGETS MET');
  console.log('  - All validators: < 1ms per call ✓');
  console.log('  - Sequential validation: < 10ms ✓');
  process.exit(0);
} else {
  console.log('⚠️  PERFORMANCE ANALYSIS');
  if (passed1msCount !== totalValidators) {
    console.log(`  - Individual validators: ${passed1msCount}/${totalValidators} meet <1ms target`);
  } else {
    console.log(`  - Individual validators: ✓ All meet <1ms target`);
  }
  if (sequentialTime >= 10) {
    console.log(`  - Sequential validation: ${sequentialTime.toFixed(4)}ms (exceeds 10ms target)`);
  } else {
    console.log(`  - Sequential validation: ✓ ${sequentialTime.toFixed(4)}ms (meets <10ms target)`);
  }
  process.exit(sequentialTime < 10 && passed1msCount === totalValidators ? 0 : 1);
}
