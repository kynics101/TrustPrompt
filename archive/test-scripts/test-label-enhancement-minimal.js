// Minimal Test: Code Context Label Enhancement Function
// Tests only the label enhancement logic without full scanner dependencies

console.log("═══════════════════════════════════════════════════════════════");
console.log("  CODE CONTEXT LABEL ENHANCEMENT - UNIT TEST");
console.log("═══════════════════════════════════════════════════════════════\n");

// Extracted function from scanner.js - the enhancement logic
function enhanceFindingsWithCodeContext(findings) {
  // Check if source_code is present
  const hasSourceCode = findings.some(f => f.patternId === 'source_code');
  if (!hasSourceCode) {
    // No code context, return findings as-is
    return findings;
  }

  // Enhance findings: for standalone ID patterns found alongside source_code,
  // prepend "[Source Code] " to indicate they were found in code context
  return findings.map(f => {
    // Check if this is a standalone ID pattern (not already marked as code-specific)
    const isStandaloneIDPattern = 
      (f.patternId === 'ph_id_umid' || 
       f.patternId === 'ph_id_sss' || 
       f.patternId === 'ph_id_gsis' ||
       f.patternId === 'ph_id_passport' ||
       f.patternId === 'ph_id_prc' ||
       f.patternId === 'ph_id_tin' ||
       f.patternId === 'ph_id_drivers_license' ||
       f.patternId === 'ph_id_voters' ||
       f.patternId === 'ph_id_philhealth' ||
       f.patternId === 'ph_id_pagibig' ||
       f.patternId === 'ph_id_psa_certificate' ||
       f.patternId === 'ph_id_police_clearance' ||
       f.patternId === 'ph_id_barangay_clearance');

    // If this is a standalone ID found alongside code, mark it as "[Source Code]"
    if (isStandaloneIDPattern) {
      return {
        ...f,
        label: `[Source Code] ${f.label}`,
        reason: f.reason + ' (Found within source code context.)'
      };
    }

    return f;
  });
}

// Test cases
const testCases = [
  {
    name: "Case 1: Standalone UMID + Source Code → Label is enhanced",
    input: [
      { patternId: 'ph_id_umid', label: 'UMID (Unified Multi-Purpose ID)', reason: 'UMID is sensitive', rawMatch: '0111-3044737-0', risk: 'high' },
      { patternId: 'source_code', label: 'Source Code Block', reason: 'Code detected', rawMatch: 'const id = 0111-3044737-0;', risk: 'low' }
    ],
    expectedLabels: [
      '[Source Code] UMID (Unified Multi-Purpose ID)',
      'Source Code Block'
    ]
  },
  {
    name: "Case 2: Standalone SSS + Source Code → Label is enhanced",
    input: [
      { patternId: 'ph_id_sss', label: 'SSS (Social Security System)', reason: 'SSS is sensitive', rawMatch: '12-3456789-0', risk: 'high' },
      { patternId: 'source_code', label: 'Source Code Block', reason: 'Code detected', rawMatch: 'let sss = "12-3456789-0";', risk: 'low' }
    ],
    expectedLabels: [
      '[Source Code] SSS (Social Security System)',
      'Source Code Block'
    ]
  },
  {
    name: "Case 3: Code-specific pattern (already marked) → No enhancement",
    input: [
      { patternId: 'ph_id_umid_variable_assignment', label: 'UMID in Code Variable Assignment', reason: 'UMID in code', rawMatch: 'const umid = "0111-3044737-0";', risk: 'high' },
      { patternId: 'source_code', label: 'Source Code Block', reason: 'Code detected', rawMatch: 'const umid = "0111-3044737-0";', risk: 'low' }
    ],
    expectedLabels: [
      'UMID in Code Variable Assignment',  // No "[Source Code]" prefix - already code-specific
      'Source Code Block'
    ]
  },
  {
    name: "Case 4: Standalone UMID without Code → No enhancement",
    input: [
      { patternId: 'ph_id_umid', label: 'UMID (Unified Multi-Purpose ID)', reason: 'UMID is sensitive', rawMatch: '0111-3044737-0', risk: 'high' }
    ],
    expectedLabels: [
      'UMID (Unified Multi-Purpose ID)'  // No "[Source Code]" prefix - no source_code detected
    ]
  },
  {
    name: "Case 5: Multiple IDs + Source Code → All enhanced",
    input: [
      { patternId: 'ph_id_umid', label: 'UMID (Unified Multi-Purpose ID)', reason: 'UMID', rawMatch: '0111-3044737-0', risk: 'high' },
      { patternId: 'ph_id_sss', label: 'SSS (Social Security System)', reason: 'SSS', rawMatch: '12-3456789-0', risk: 'high' },
      { patternId: 'source_code', label: 'Source Code Block', reason: 'Code', rawMatch: 'const ids = {umid: "0111-3044737-0", sss: "12-3456789-0"};', risk: 'low' }
    ],
    expectedLabels: [
      '[Source Code] UMID (Unified Multi-Purpose ID)',
      '[Source Code] SSS (Social Security System)',
      'Source Code Block'
    ]
  }
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n### ${testCase.name}`);
  
  try {
    const output = enhanceFindingsWithCodeContext(testCase.input);
    const actualLabels = output.map(f => f.label);
    
    // Verify
    const allMatch = testCase.expectedLabels.length === actualLabels.length &&
                     testCase.expectedLabels.every((expected, idx) => expected === actualLabels[idx]);
    
    if (allMatch) {
      console.log(`✅ PASS`);
      console.log(`  Expected: ${testCase.expectedLabels.join(' | ')}`);
      console.log(`  Got:      ${actualLabels.join(' | ')}`);
      passed++;
    } else {
      console.log(`❌ FAIL`);
      console.log(`  Expected: ${testCase.expectedLabels.join(' | ')}`);
      console.log(`  Got:      ${actualLabels.join(' | ')}`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ ERROR: ${err.message}`);
    failed++;
  }
}

console.log(`\n${"═".repeat(70)}`);
console.log(`RESULTS: ${passed}/${passed + failed} tests passed`);
console.log(`${"═".repeat(70)}`);

if (failed === 0) {
  console.log("\n✅ All tests passed! The label enhancement function works correctly.");
} else {
  console.log(`\n❌ ${failed} test(s) failed.`);
}
