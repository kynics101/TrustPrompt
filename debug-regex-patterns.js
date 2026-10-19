// debug-regex-patterns.js
// Debug why the simplified scan() isn't finding matches

const testCases = [
  { input: 'my number is 09098340056', label: 'measurement' },
  { input: 'Kyleen is beautiful', label: 'adjective' },
  { input: 'Kyleen Nicdao is my software engineer', label: 'multiword' }
];

console.log('=== REGEX PATTERN DEBUG ===\n');

// Test name trigger patterns
console.log('[PATTERN 1] Name Triggers:');
const nameTriggerPatterns = [
  { pattern: /\bmy\s+name\s+is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi, desc: 'my name is X' },
  { pattern: /\b(?:i\s+)?(?:am|'m)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi, desc: 'I am X' },
  { pattern: /\bcall\s+me\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi, desc: 'call me X' },
];

testCases.forEach(tc => {
  console.log(`\n  Input: "${tc.input}"`);
  nameTriggerPatterns.forEach(np => {
    np.pattern.lastIndex = 0; // Reset regex
    const match = np.pattern.exec(tc.input);
    if (match) {
      console.log(`    ✓ MATCH [${np.desc}]: "${match[1]}"`);
    } else {
      console.log(`    ✗ NO MATCH [${np.desc}]`);
    }
  });
});

// Test job title patterns
console.log('\n[PATTERN 2] Job Titles (is a/an/the):');
const jobTitlePatterns = [
  { pattern: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+a\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|and|on|for|of|or)|\.|,|;|$)/gi, desc: 'X is a JOB' },
  { pattern: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+an\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|and|on|for|of|or)|\.|,|;|$)/gi, desc: 'X is an JOB' },
  { pattern: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+the\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|and|on|for|of|or)|\.|,|;|$)/gi, desc: 'X is the JOB' },
];

testCases.forEach(tc => {
  console.log(`\n  Input: "${tc.input}"`);
  jobTitlePatterns.forEach(jp => {
    jp.pattern.lastIndex = 0; // Reset regex
    const match = jp.pattern.exec(tc.input);
    if (match) {
      console.log(`    ✓ MATCH [${jp.desc}]: NAME="${match[1]}", JOB="${match[2]}"`);
    } else {
      console.log(`    ✗ NO MATCH [${jp.desc}]`);
    }
  });
});

// Test honorific pattern
console.log('\n[PATTERN 3] Honorifics:');
const honorificPattern = /\b(Mr|Ms|Mrs|Miss|Mx|Sir|Madam|Dr|Prof|Professor|Rev|Reverend|Fr|Father|Sr|Esq|Eng|Engr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/gi;

testCases.forEach(tc => {
  console.log(`\n  Input: "${tc.input}"`);
  honorificPattern.lastIndex = 0; // Reset regex
  const match = honorificPattern.exec(tc.input);
  if (match) {
    console.log(`    ✓ MATCH: "${match[2]}" (${match[1]})`);
  } else {
    console.log(`    ✗ NO MATCH`);
  }
});

console.log('\n=== END DEBUG ===\n');
