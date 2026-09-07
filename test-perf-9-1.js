#!/usr/bin/env node

/**
 * Task 9.1: Measure structural validator performance
 * 
 * Performance benchmark test that:
 * 1. Generates 100 valid test cases for each of 14 ID types
 * 2. Calls structuralValidate() for each case
 * 3. Records time with console.time()
 * 4. Outputs performance report with:
 *    - Per-type average time
 *    - Min/max per type
 *    - Total time for all 14 types
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
    // PhilID: 12 numeric digits (YYMMDD + 6 sequence digits)
    const yy = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const mm = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
    const dd = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    const sex = Math.random() > 0.5 ? '1' : '2'; // 1=male, 2=female
    return yy + mm + dd + seq + sex;
  },
  'ph_id_drivers_license': () => {
    // Driver's License: 11 characters (2 digit region + 9 alphanumeric)
    const region = String(Math.floor(Math.random() * 16) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 9999999999)).padStart(9, '0');
    return region + seq;
  },
  'ph_id_passport': () => {
    // Passport: P + 6-8 digits (type starts with 1-3)
    const type = Math.floor(Math.random() * 3) + 1;
    const seq = String(Math.floor(Math.random() * 9999999)).padStart(7, '0');
    return 'P' + type + seq;
  },
  'ph_id_sss': () => {
    // SSS: 10 numeric digits (branch code 01-59 + 8 digits)
    const branch = String(Math.floor(Math.random() * 59) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99999999)).padStart(8, '0');
    return branch + seq;
  },
  'ph_id_gsis': () => {
    // GSIS: 10 numeric digits (agency 0001-9999 + 6 digits)
    const agency = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    return agency + seq;
  },
  'ph_id_umid': () => {
    // UMID: 12 numeric digits (system code 1000-1999 + seq + check digit)
    const system = String(Math.floor(Math.random() * 1000) + 1000).padStart(4, '0');
    const seq = String(Math.floor(Math.random() * 9999999)).padStart(7, '0');
    // Simple modulo 10 check digit for demo
    const allDigits = system + seq;
    const checkDigit = (10 - (allDigits.split('').reduce((sum, d) => sum + parseInt(d), 0) % 10)) % 10;
    return allDigits + checkDigit;
  },
  'ph_id_tin': () => {
    // TIN: 9 numeric digits (registration area 100-900 + 6 + check digit)
    const area = String(Math.floor(Math.random() * 801) + 100).padStart(3, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(5, '0');
    const allDigits = area + seq;
    // Simple modulo 11 check digit for demo
    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += parseInt(allDigits[i]) * weights[i];
    }
    const checkDigit = (11 - (sum % 11)) % 11;
    return allDigits + checkDigit;
  },
  'ph_id_prc': () => {
    // PRC: 6-7 digits (profession 01-99 + sequence)
    const profession = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
    return profession + seq;
  },
  'ph_id_philhealth': () => {
    // PhilHealth: 12 numeric digits
    return String(Math.floor(Math.random() * 999999999999)).padStart(12, '0');
  },
  'ph_id_pagibig': () => {
    // Pag-IBIG: 12 numeric digits
    return String(Math.floor(Math.random() * 999999999999)).padStart(12, '0');
  },
  'ph_id_nbi_clearance': () => {
    // NBI Clearance: 7-10 digits (year 00-99 + office 001-999 + seq)
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const office = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    const seq = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    return year + office + seq;
  },
  'ph_id_psa_certificate': () => {
    // PSA Certificate: 8-13 digits (type 101/201/301 + location + year + seq)
    const types = [101, 201, 301];
    const type = types[Math.floor(Math.random() * types.length)];
    const location = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99)).padStart(2, '0');
    return type + location + year + seq;
  },
  'ph_id_pagibig': () => {
    // Pag-IBIG: 12 numeric digits
    return String(Math.floor(Math.random() * 999999999999)).padStart(12, '0');
  },
  'ph_id_police_clearance': () => {
    // Police Clearance: 6-10 alphanumeric (optional year + sequence)
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 999999)).padStart(6, '0');
    return year + seq;
  },
  'ph_id_barangay_clearance': () => {
    // Barangay Clearance: 4-8 digits (barangay code 01-99 + year + seq)
    const barangay = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const year = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 9999)).padStart(4, '0');
    return barangay + year + seq;
  },
  'ph_id_comelec_voter_id': () => {
    // COMELEC Voter ID: 10-14 digits (province 01-82 + city 01-99 + barangay + seq)
    const province = String(Math.floor(Math.random() * 82) + 1).padStart(2, '0');
    const city = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const barangay = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');
    const seq = String(Math.floor(Math.random() * 99999)).padStart(4, '0');
    return province + city + barangay + seq;
  }
};

// Performance results storage
const perfResults = {
  perType: {},
  totalTime: 0,
  allTimings: []
};

console.log('='.repeat(80));
console.log('TASK 9.1: Structural Validator Performance Benchmark');
console.log('='.repeat(80));
console.log(`\nGenerating 100 valid test cases for each of ${Object.keys(validatorFunctions).length} ID types...\n`);

// Run benchmarks for each validator
const idTypes = Object.keys(validatorFunctions);
let totalAllTests = 0;
let grandStartTime = Date.now();

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
  let validCount = 0;

  for (const testCase of testCases) {
    const startTime = performance.now();
    try {
      const result = validator(testCase);
      const endTime = performance.now();
      const duration = endTime - startTime;
      timings.push(duration);
      perfResults.allTimings.push(duration);
      if (result) validCount++;
    } catch (err) {
      const endTime = performance.now();
      timings.push(endTime - startTime);
    }
  }

  // Calculate statistics
  const avgTime = timings.reduce((a, b) => a + b, 0) / timings.length;
  const minTime = Math.min(...timings);
  const maxTime = Math.max(...timings);
  const passed1msTarget = avgTime < 1;
  const totalTypeTime = timings.reduce((a, b) => a + b, 0);

  perfResults.perType[idType] = {
    avgTime,
    minTime,
    maxTime,
    totalTime: totalTypeTime,
    validCount,
    testCount: testCases.length,
    passed1msTarget
  };

  totalAllTests += totalTypeTime;

  // Print per-type results
  const statusColor = passed1msTarget ? '✓' : '✗';
  console.log(`${statusColor} ${idType.padEnd(35)} | Avg: ${avgTime.toFixed(4)}ms | Min: ${minTime.toFixed(4)}ms | Max: ${maxTime.toFixed(4)}ms`);
}

const grandEndTime = Date.now();
const grandTotalMs = grandEndTime - grandStartTime;

console.log('\n' + '='.repeat(80));
console.log('PERFORMANCE SUMMARY');
console.log('='.repeat(80));

// Per-type analysis
const passed1msCount = Object.values(perfResults.perType).filter(r => r.passed1msTarget).length;
const total1msCount = Object.keys(perfResults.perType).length;

console.log(`\n📊 Per-Type Analysis (1ms target):`);
console.log(`   Passing: ${passed1msCount}/${total1msCount} validators`);

// Aggregate statistics
const allTimings = perfResults.allTimings;
const avgOverall = allTimings.reduce((a, b) => a + b, 0) / allTimings.length;
const minOverall = Math.min(...allTimings);
const maxOverall = Math.max(...allTimings);
const passed10msTarget = totalAllTests < 10;

console.log(`\n⏱️  Overall Statistics (100 calls × 14 types = 1400 calls):`);
console.log(`   Total Time: ${totalAllTests.toFixed(2)}ms (gross: ${grandTotalMs}ms with overhead)`);
console.log(`   Average per call: ${avgOverall.toFixed(4)}ms`);
console.log(`   Min per call: ${minOverall.toFixed(4)}ms`);
console.log(`   Max per call: ${maxOverall.toFixed(4)}ms`);

console.log(`\n🎯 Target Validation:`);
console.log(`   ✓ All validators < 1ms per call: ${passed1msCount === total1msCount ? 'PASS' : 'FAIL'}`);
console.log(`   ${passed10msTarget ? '✓' : '✗'} Overall < 10ms for all 14 types: ${passed10msTarget ? 'PASS' : 'FAIL'} (${totalAllTests.toFixed(2)}ms)`);

// Detailed per-type report
console.log(`\n📋 Detailed Per-Type Report:`);
console.log('-'.repeat(80));
console.log('ID Type'.padEnd(35) + ' | Avg (ms) | Min (ms) | Max (ms) | Total (ms) | Status');
console.log('-'.repeat(80));

for (const [idType, result] of Object.entries(perfResults.perType)) {
  const status = result.passed1msTarget ? '✓ PASS' : '✗ FAIL';
  console.log(
    idType.padEnd(35) + ' | ' +
    result.avgTime.toFixed(4).padStart(8) + ' | ' +
    result.minTime.toFixed(4).padStart(8) + ' | ' +
    result.maxTime.toFixed(4).padStart(8) + ' | ' +
    result.totalTime.toFixed(2).padStart(10) + ' | ' +
    status
  );
}

console.log('-'.repeat(80));
console.log(`Total validation time for all 1400 calls: ${totalAllTests.toFixed(2)}ms`);

console.log(`\n` + '='.repeat(80));
if (passed1msCount === total1msCount && passed10msTarget) {
  console.log('✓ PERFORMANCE TARGETS MET');
  console.log('  - All 14 validators: < 1ms per call');
  console.log('  - Overall validation: < 10ms total');
  process.exit(0);
} else {
  console.log('✗ PERFORMANCE TARGETS NOT MET');
  if (passed1msCount !== total1msCount) {
    console.log(`  - Only ${passed1msCount}/${total1msCount} validators meet <1ms target`);
  }
  if (!passed10msTarget) {
    console.log(`  - Overall time ${totalAllTests.toFixed(2)}ms exceeds 10ms target`);
  }
  process.exit(1);
}
