// Test: Diagnose why "Company: Pacific Harvest Foods Inc." is flagged as personal_label
// This appears to be a new false positive not yet addressed

console.log('═'.repeat(80));
console.log('DIAGNOSIS: Company/Location/Shift Label False Positive');
console.log('═'.repeat(80));
console.log();

const testText = `Position: warehouse supervisor. Company: Pacific Harvest Foods Inc. Location: Tarlac City. Shift: night. Rewrite as a one-paragraph job summary for our internal newsletter.`;

console.log('Test Input:');
console.log('-'.repeat(70));
console.log(testText);
console.log();
console.log('-'.repeat(70));
console.log();

// The text contains these structured labels:
// - Position: warehouse supervisor
// - Company: Pacific Harvest Foods Inc.
// - Location: Tarlac City
// - Shift: night

// These are NOT personal information in the sensitive sense - they're:
// 1. Generic labels describing a workplace posting
// 2. Non-unique values (company names, locations are public knowledge)
// 3. Metadata, not identifiers

console.log('Analysis:');
console.log('─'.repeat(70));
console.log();

console.log('1. LABEL PATTERNS PRESENT:');
console.log('   Position: [value]        ✓ Present');
console.log('   Company: [value]         ✓ Present');
console.log('   Location: [value]        ✓ Present');
console.log('   Shift: [value]           ✓ Present');
console.log();

console.log('2. CONTEXT INDICATORS:');
const hasJobContext = /(?:position|job|role|supervisor|warehouse|title|rewrite|newsletter|posting)/i.test(testText);
const hasCompanyInfo = /(?:company|location|shift)/i.test(testText);
const hasDocumentMarkers = /(?:rewrite|summary|newsletter|internal)/i.test(testText);

console.log(`   Job/Role context: ${hasJobContext ? 'YES' : 'NO'}`);
console.log(`   Company metadata: ${hasCompanyInfo ? 'YES' : 'NO'}`);
console.log(`   Document purpose: ${hasDocumentMarkers ? 'YES' : 'NO'}`);
console.log();

console.log('3. SENSITIVITY ASSESSMENT:');
console.log('   ✗ Is "Pacific Harvest Foods Inc." personal data?');
console.log('     → NO: It\'s a public company name');
console.log('   ✗ Is "Tarlac City" personal data?');
console.log('     → NO: It\'s a public location');
console.log('   ✗ Is "warehouse supervisor" personal data?');
console.log('     → NO: It\'s a generic job title');
console.log('   ✗ Is "night" personal data?');
console.log('     → NO: It\'s a generic shift designation');
console.log();

console.log('4. ROOT CAUSE:');
console.log('   The pattern likely matches ANY \'Label: value\' structure');
console.log('   without checking if it\'s actually personal/sensitive data.');
console.log();
console.log('   Examples of what SHOULD be caught:');
console.log('   ✓ Name: Maria Santos');
console.log('   ✓ Email: maria@example.com');
console.log('   ✓ Phone: +63-912-3456789');
console.log();
console.log('   Examples of what SHOULD NOT be caught:');
console.log('   ✗ Company: Pacific Harvest Foods Inc.');
console.log('   ✗ Location: Tarlac City');
console.log('   ✗ Position: warehouse supervisor');
console.log('   ✗ Shift: night');
console.log();

console.log('5. SOLUTION:');
console.log('   Add contextFilter to suppress matches when:');
console.log('   a) Preceded by generic metadata labels (Company:, Location:, Position:, Shift:)');
console.log('   b) Context contains job posting indicators');
console.log('   c) Value is public knowledge (not an identifier)');
console.log();

console.log('═'.repeat(80));
console.log('RECOMMENDATION');
console.log('═'.repeat(80));
console.log();
console.log('The "personal_label" pattern needs a contextFilter to:');
console.log();
console.log('1. Check for generic structural labels before the value:');
console.log('   (?:Company|Location|Position|Shift|Department|Role|Title|Office):');
console.log();
console.log('2. Check surrounding context for job posting/workplace metadata:');
console.log('   (?:newsletter|posting|job|position|supervisor|warehouse|rewrite)');
console.log();
console.log('3. Suppress if BOTH conditions are true (structural label + job context)');
console.log();
console.log('IMPLEMENTATION:');
console.log('Add to personal_label contextFilter in patterns.js:');
console.log();
console.log('```');
console.log('contextFilter: (match, text) => {');
console.log('  const context = text.substring(');
console.log('    Math.max(0, match.index - 200),');
console.log('    match.index + match[0].length + 200');
console.log('  );');
console.log('  ');
console.log('  // Suppress generic metadata labels');
console.log('  const isGenericLabel = /(?:Company|Location|Position|Shift|Department|Role|Title):/.test(context);');
console.log('  const hasJobContext = /(?:newsletter|posting|job|rewrite|supervisor)/.test(context);');
console.log('  ');
console.log('  // Suppress if it\'s a structural label in job context');
console.log('  return !(isGenericLabel && hasJobContext);');
console.log('}');
console.log('```');
