// debug-regex-patterns-v2.js
// Test corrected patterns that handle possessive markers and adjectives

const testCases = [
  { input: 'my number is 09098340056', label: 'measurement', expected: 'none' },
  { input: 'Kyleen is beautiful', label: 'adjective', expected: 'Kyleen' },
  { input: 'Kyleen Nicdao is my software engineer', label: 'multiword', expected: 'Kyleen, Nicdao, software engineer' }
];

console.log('=== CORRECTED REGEX PATTERNS ===\n');

// Test standalone name detection (for "Kyleen is beautiful")
console.log('[PATTERN 1] Standalone Person Names:');
const standaloneNamePattern = /\b([A-Z][a-z]+)\b/g;  // Single capitalized words only

testCases.forEach(tc => {
  console.log(`\n  Input: "${tc.input}"`);
  const matches = [];
  let match;
  standaloneNamePattern.lastIndex = 0;
  while ((match = standaloneNamePattern.exec(tc.input)) !== null) {
    matches.push(match[1]);
  }
  if (matches.length > 0) {
    console.log(`    ✓ MATCHES: [${matches.join(', ')}]`);
  } else {
    console.log(`    ✗ NO MATCHES`);
  }
});

// Test corrected job title patterns (with optional possessive/article prefix)
console.log('\n[PATTERN 2] Job Titles with Possessive (is [a|an|the|my|...] JOB):');
const correctedJobTitlePatterns = [
  { 
    pattern: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the|my|your|his|her|its|our|their)?\s*([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|and|on|for|of|or)|\.|,|;|$)/gi, 
    desc: 'X is [article/possessive] JOB' 
  }
];

testCases.forEach(tc => {
  console.log(`\n  Input: "${tc.input}"`);
  correctedJobTitlePatterns.forEach(jp => {
    jp.pattern.lastIndex = 0;
    const match = jp.pattern.exec(tc.input);
    if (match) {
      console.log(`    ✓ MATCH: NAME="${match[1]}", JOB="${match[2]}"`);
    } else {
      console.log(`    ✗ NO MATCH`);
    }
  });
});

// Test combined approach for "Kyleen is beautiful"
console.log('\n[ANALYSIS] "Kyleen is beautiful" case:');
console.log('  - Should detect: "Kyleen" (standalone name)');
console.log('  - Should NOT detect: "beautiful" (it\'s an adjective, not a job)');
console.log('  - Solution: Use standalone name + aggressive job title filtering');

// Test combined approach for "Kyleen Nicdao is my software engineer"
console.log('\n[ANALYSIS] "Kyleen Nicdao is my software engineer" case:');
console.log('  - Should detect: "Kyleen" (standalone), "Nicdao" (standalone), "software engineer" (job title)');
console.log('  - Pattern needs to handle: "is my [job]"');
console.log('  - Solution: Allow possessive/articles between "is" and job title');

console.log('\n=== END ANALYSIS ===\n');
