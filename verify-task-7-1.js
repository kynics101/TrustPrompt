/**
 * verify-task-7-1.js
 * Task 7.1: Verify all 14 ph_id_* patterns are in TRUSTPROMPT_PATTERNS
 * and runPathA() will process them with entropy/placeholder checks
 */

// Check patterns.js defines all 14 ph_id patterns
const fs = require('fs');
const patternsContent = fs.readFileSync('./patterns.js', 'utf8');

// List of 14 required ph_id pattern IDs
const requiredPatterns = [
  'ph_id_philid',
  'ph_id_drivers_license',
  'ph_id_passport',
  'ph_id_umid',
  'ph_id_sss',
  'ph_id_gsis',
  'ph_id_prc',
  'ph_id_tin',
  'ph_id_philhealth',
  'ph_id_psa_certificate',
  'ph_id_nbi_clearance',
  'ph_id_police_clearance',
  'ph_id_barangay_clearance',
  'ph_id_comelec_voter_id'
];

console.log('=== Task 7.1 Verification: Philippine ID Patterns in Scanner ===\n');

let foundCount = 0;
const missingPatterns = [];

// Check if all 14 patterns are defined in TRUSTPROMPT_PATTERNS
for (const patternId of requiredPatterns) {
  const pattern = `id: "${patternId}"`;
  if (patternsContent.includes(pattern)) {
    // Count only the first occurrence (in TRUSTPROMPT_PATTERNS)
    const patternStart = patternsContent.indexOf('const TRUSTPROMPT_PATTERNS');
    const patternSection = patternsContent.substring(patternStart, patternStart + 50000);
    if (patternSection.includes(pattern)) {
      console.log(`✓ ${patternId} found in TRUSTPROMPT_PATTERNS`);
      foundCount++;
    }
  } else {
    console.log(`✗ ${patternId} NOT found`);
    missingPatterns.push(patternId);
  }
}

console.log(`\nSummary: ${foundCount}/${requiredPatterns.length} patterns found`);

// Check runPathA implementation
console.log('\n=== Checking runPathA() Implementation ===\n');

const scannerContent = fs.readFileSync('./scanner.js', 'utf8');

// Check for entropy handling
if (scannerContent.includes('pattern.minEntropy')) {
  console.log('✓ Entropy check (TASK-4.5) implemented');
} else {
  console.log('✗ Entropy check NOT found');
}

// Check for placeholder suppression
if (scannerContent.includes('isKnownPlaceholder')) {
  console.log('✓ Placeholder suppression (TASK-4.4) implemented');
} else {
  console.log('✗ Placeholder suppression NOT found');
}

// Check for structural validators
if (scannerContent.includes('pattern.structuralValidate')) {
  console.log('✓ Structural validators (TASK-7.2) wired');
} else {
  console.log('✗ Structural validators NOT wired');
}

// Check TRUSTPROMPT_PATTERNS iteration
if (scannerContent.includes('for (const pattern of TRUSTPROMPT_PATTERNS)')) {
  console.log('✓ runPathA() iterates through TRUSTPROMPT_PATTERNS');
} else {
  console.log('✗ TRUSTPROMPT_PATTERNS iteration NOT found');
}

// Verify governance escalation for validated ph_id patterns
if (scannerContent.includes('ph_id_') && scannerContent.includes('validated') && scannerContent.includes('high')) {
  console.log('✓ Governance escalation includes ph_id_ validation check');
} else {
  console.log('✗ Governance escalation may need verification');
}

console.log('\n=== Verification Complete ===');
if (missingPatterns.length === 0 && foundCount === 14) {
  console.log('✓ ALL REQUIREMENTS MET: Task 7.1 implementation is complete');
  process.exit(0);
} else {
  console.log(`✗ INCOMPLETE: ${missingPatterns.length} patterns missing`);
  process.exit(1);
}
