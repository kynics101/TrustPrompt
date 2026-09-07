// test-perf-validators.js
// Performance measurement for Philippine ID structural validators
// Task 9.1: Measure structural validator performance
// Target: each validator < 1ms per call, overall < 10ms for all 14 types

// Import the validators from patterns.js
// Note: This script runs in Node.js, so we load patterns.js directly

const fs = require('fs');
const path = require('path');

// Read patterns.js and extract validators
const patternsCode = fs.readFileSync(path.join(__dirname, 'patterns.js'), 'utf-8');

// Create a module to hold the validators
const validators = {};

// We'll use a safer approach: extract and execute the relevant functions
// by creating a temporary scope

eval(patternsCode);

// Define the 14 Philippine ID validator functions with test data
const validatorTests = [
  {
    name: 'PhilID',
    func: structuralValidatePHID_PhilID,
    testCases: [
      // Valid cases (12 digits: YYMMDD-CCC-OO-S)
      '900101123456',  // Example: 1990-01-01, city 234, order 56, male
      '850615678901',  // Example: 1985-06-15, city 890, order 01, female
      '920228234567',  // Example: 1992-02-28, city 345, order 67, male
      '881201345678',  // Example: 1988-12-01, city 567, order 78, female
      '950710456789',  // Example: 1995-07-10, city 678, order 89, male
    ],
  },
  {
    name: 'Driver\'s License',
    func: structuralValidatePHID_DriversLicense,
    testCases: [
      '01021234567',  // Region 01, municipality 02, series 1234, sequence 567
      '16031234890',  // Region 16, municipality 03, series 1234, sequence 890
      '0512AB12345',  // Region 05, municipality 12, alphanumeric
      '08071234567',  // Region 08, municipality 07, series 1234, sequence 567
      '13041234123',  // Region 13, municipality 04, series 1234, sequence 123
    ],
  },
  {
    name: 'Passport',
    func: structuralValidatePHID_Passport,
    testCases: [
      'P123456789',    // With P prefix, 9 digits
      '12345678',      // Without prefix, 8 digits
      'P12345678',     // With P prefix, 8 digits
      '223456789',     // Without prefix, starting with 2, 9 digits
      'P312345678',    // P prefix, starts with 3 (diplomatic)
    ],
  },
  {
    name: 'UMID',
    func: structuralValidatePHID_UMID,
    testCases: [
      '123456789012',  // 12 digits
      '100001120121',  // Valid format
      '150012101212',  // Valid format
      '199901015050',  // Valid format
      '120005060708',  // Valid format
    ],
  },
  {
    name: 'SSS',
    func: structuralValidatePHID_SSS,
    testCases: [
      '1234567890',    // 10 digits
      '01-345678-90',  // With separators
      '12 345678 90',  // With spaces
      '0134567890',    // Valid branch code
      '5932567890',    // Valid branch code
    ],
  },
  {
    name: 'GSIS',
    func: structuralValidatePHID_GSIS,
    testCases: [
      '1234567890',    // 10 digits
      '12-34567-890',  // With separators
      '0001345678',    // Valid agency code
      '9999567890',    // Valid agency code
      '5678901234',    // 10 digits
    ],
  },
  {
    name: 'PRC',
    func: structuralValidatePHID_PRC,
    testCases: [
      '1234567',       // 7 digits
      '123456',        // 6 digits
      '2021-1234567',  // With year prefix
      '1999-123456',   // With year prefix
      '0145678',       // Valid profession code
    ],
  },
  {
    name: 'TIN',
    func: structuralValidatePHID_TIN,
    testCases: [
      '123456789',     // 9 digits
      '123-45-678-9',  // With separators
      '100 345 678',   // With spaces
      '900123456',     // Valid area code
      '150234567',     // Valid area code
    ],
  },
  {
    name: 'PhilHealth',
    func: structuralValidatePHID_PhilHealth,
    testCases: [
      '123456789012',  // 12 digits
      '12-345-678-9-0-1-2',  // With separators
      '000123456789',  // Valid format
      '999123456789',  // Valid format
      '050501234567',  // Valid format
    ],
  },
  {
    name: 'NBI Clearance',
    func: structuralValidatePHID_NBIClearance,
    testCases: [
      '1234567',       // 7 digits
      '12-34-567-890', // With separators
      'NBI1234567',    // With NBI prefix
      '0010012345',    // 10 digits
      '99123456789',   // 11 digits (but should pass as 7-10 validation)
    ],
  },
  {
    name: 'Police Clearance',
    func: structuralValidatePHID_PoliceClearance,
    testCases: [
      'PNP-2021-123456',   // With PNP prefix and year
      '2021123456',        // With year
      'PNP123456',         // With PNP prefix only
      '123456',            // 6 digits
      'PNP-2020-1A2B3C',   // Alphanumeric
    ],
  },
  {
    name: 'PSA Certificate',
    func: structuralValidatePHID_PSACertificate,
    testCases: [
      '12345678',          // 8 digits
      '123-4567-8901-23',  // With separators (13 digits)
      '10100012021234',    // Valid format
      '20150062021012',    // Valid format (marriage)
      '30199112311234',    // Valid format (death)
    ],
  },
  {
    name: 'Barangay Clearance',
    func: structuralValidatePHID_BarangayClearance,
    testCases: [
      'BC-2021-1234',      // With BC prefix and year
      '2021121234',        // With year
      '2021-12-1234',      // With separators
      '1234',              // 4 digits
      'BC-2020-567890',    // 6 digits with prefix
    ],
  },
  {
    name: 'COMELEC Voter ID',
    func: structuralValidatePHID_COMELECVoterID,
    testCases: [
      '1234567890',        // 10 digits
      '12-345-678-90-1234', // With separators (14 digits)
      '0112340101234',      // Valid format
      '8234999901234567',   // Valid format (16 digits)
      '0105060708090101',   // Valid format
    ],
  },
];

/**
 * Run performance measurements
 */
function runPerformanceTests() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('Philippine ID Validators - Performance Measurement (Task 9.1)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const results = [];
  let totalTime = 0;

  for (const test of validatorTests) {
    const { name, func, testCases } = test;
    
    if (typeof func !== 'function') {
      console.warn(`⚠️  Validator not found: ${name}`);
      continue;
    }

    // Warm up: run once to cache regex/initialization
    for (const testCase of testCases) {
      func(testCase);
    }

    // Measure: run 100 iterations with all test cases
    const startTime = process.hrtime.bigint();
    
    for (let i = 0; i < 100; i++) {
      for (const testCase of testCases) {
        func(testCase);
      }
    }
    
    const endTime = process.hrtime.bigint();
    const timeMicros = Number(endTime - startTime) / 1000;  // Convert to microseconds
    const timeMs = timeMicros / 1000;  // Convert to milliseconds
    const timePerCall = timeMs / (100 * testCases.length);  // ms per call

    results.push({
      name,
      timeMicros,
      timeMs,
      timePerCall,
      iterations: 100 * testCases.length,
    });

    totalTime += timeMs;

    // Color-coded output
    const perCallStatus = timePerCall < 1 ? '✓' : timePerCall < 2 ? '⚠' : '✗';
    console.log(`${perCallStatus} ${name.padEnd(20)} | Total: ${timeMs.toFixed(4)}ms | Per call: ${timePerCall.toFixed(4)}ms`);
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`TOTAL TIME FOR ALL VALIDATORS: ${totalTime.toFixed(4)}ms`);
  console.log(`TARGET: < 10ms`);
  
  const targetStatus = totalTime < 10 ? '✓ PASS' : '✗ FAIL';
  console.log(`STATUS: ${targetStatus}`);
  
  console.log('════════════════════════════════════════════════════════════════\n');

  // Detailed report
  console.log('DETAILED RESULTS:\n');
  console.log('ID Type'.padEnd(20) + ' | Iterations'.padEnd(12) + ' | Total (ms)'.padEnd(12) + ' | Per Call (ms)'.padEnd(14) + ' | Status');
  console.log('-'.repeat(80));

  for (const result of results) {
    const status = result.timePerCall < 1 ? '✓ PASS' : result.timePerCall < 2 ? '⚠ WARN' : '✗ FAIL';
    console.log(
      result.name.padEnd(20) + ' | ' +
      `${result.iterations}`.padEnd(12) + ' | ' +
      `${result.timeMs.toFixed(4)}`.padEnd(12) + ' | ' +
      `${result.timePerCall.toFixed(6)}`.padEnd(14) + ' | ' +
      status
    );
  }

  console.log('\nPERFORMANCE ANALYSIS:');
  console.log(`Requirement 20: All validators must complete < 1ms per call`);
  console.log(`Requirement 20: Overall validation for all 14 types < 10ms`);
  
  const failedPerCall = results.filter(r => r.timePerCall >= 1);
  if (failedPerCall.length > 0) {
    console.log(`\n⚠️  ${failedPerCall.length} validator(s) exceed 1ms per call threshold:`);
    failedPerCall.forEach(r => {
      console.log(`   - ${r.name}: ${r.timePerCall.toFixed(6)}ms`);
    });
  } else {
    console.log('\n✓ All validators pass individual < 1ms threshold');
  }

  if (totalTime < 10) {
    console.log(`✓ Total time ${totalTime.toFixed(4)}ms passes < 10ms threshold`);
  } else {
    console.log(`✗ Total time ${totalTime.toFixed(4)}ms EXCEEDS 10ms threshold`);
  }

  console.log('\n');
}

// Run the tests
runPerformanceTests();
