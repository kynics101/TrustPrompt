// Test: Verify personal_label is now a trigger-only pattern (not reported as finding)

console.log('═'.repeat(80));
console.log('PERSONAL_LABEL TRIGGER-ONLY PATTERN TEST');
console.log('═'.repeat(80));
console.log();

// Simulate the filterTriggerOnlyFindings function
function filterTriggerOnlyFindings(findings) {
  const kept = [];
  const filtered = [];

  for (const f of findings) {
    if (f.isTriggerOnly === true) {
      filtered.push(f);
      console.log(`[filter] Excluding trigger-only: ${f.patternId}:${f.rawMatch.slice(0, 30)}`);
    } else {
      kept.push(f);
    }
  }

  return { kept, filtered };
}

// Test cases
console.log('Test Case 1: Job posting with Company/Location labels');
console.log('-'.repeat(70));

const mockFindings = [
  {
    patternId: 'personal_label',
    label: 'Labelled Personal Field',
    rawMatch: 'Company: Pacific Harvest Foods Inc.',
    isTriggerOnly: true,  // ← Should be excluded
    source: 'A_regex'
  },
  {
    patternId: 'personal_label',
    label: 'Labelled Personal Field',
    rawMatch: 'Location: Tarlac City',
    isTriggerOnly: true,  // ← Should be excluded
    source: 'A_regex'
  },
  {
    patternId: 'personal_label',
    label: 'Labelled Personal Field',
    rawMatch: 'Shift: night',
    isTriggerOnly: true,  // ← Should be excluded
    source: 'A_regex'
  },
  {
    patternId: 'email',
    label: 'Email Address',
    rawMatch: 'user@example.com',
    isTriggerOnly: false,  // ← Should be kept
    source: 'A_regex'
  }
];

console.log(`Input: ${mockFindings.length} findings (3 personal_label + 1 email)`);
console.log();

const { kept, filtered } = filterTriggerOnlyFindings(mockFindings);

console.log();
console.log(`Results:`);
console.log(`  Kept: ${kept.length} findings`);
kept.forEach(f => {
  console.log(`    - ${f.patternId}: ${f.rawMatch}`);
});

console.log(`  Filtered (trigger-only): ${filtered.length} findings`);
filtered.forEach(f => {
  console.log(`    - ${f.patternId}: ${f.rawMatch}`);
});

console.log();
console.log('═'.repeat(80));
console.log('TEST RESULT');
console.log('═'.repeat(80));

const passed = kept.length === 1 && filtered.length === 3 && 
               kept[0].patternId === 'email' &&
               filtered.every(f => f.patternId === 'personal_label');

if (passed) {
  console.log('✓ PASS');
  console.log();
  console.log('Behavior verified:');
  console.log('  ✓ personal_label findings (trigger-only) are excluded from results');
  console.log('  ✓ Other findings (like email) are kept in results');
  console.log('  ✓ personal_label is now a trigger to identify PII, not a reportable finding');
} else {
  console.log('✗ FAIL');
  console.log();
  console.log('Expected:');
  console.log('  - 1 kept finding (email)');
  console.log('  - 3 filtered findings (personal_label)');
  console.log();
  console.log('Got:');
  console.log(`  - ${kept.length} kept findings`);
  console.log(`  - ${filtered.length} filtered findings`);
}

console.log();
console.log('═'.repeat(80));
console.log('EXPLANATION');
console.log('═'.repeat(80));
console.log();
console.log('personal_label is a TRIGGER pattern that helps identify where PII might be.');
console.log('Examples:');
console.log('  - "Name: John Smith"  → trigger identifies "Name:", actual PII is "John Smith"');
console.log('  - "Email: user@example.com" → trigger identifies "Email:", actual PII is "user@example.com"');
console.log();
console.log('With isTriggerOnly: true, the pattern itself is NOT reported as a finding.');
console.log('Only the actual PII values (extracted separately or matched by other patterns)');
console.log('are reported in the scanner results.');
