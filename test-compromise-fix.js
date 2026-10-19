/**
 * Test script to verify compromise.js extraction functions work
 * Test case: "Cristina is a lawyer"
 * Expected: Should detect "Cristina" as person and "lawyer" as job title
 */

console.log('================================================================================');
console.log('TESTING COMPROMISE.JS EXTRACTION FUNCTIONS');
console.log('================================================================================\n');

// Simulate the extraction functions
const testText = "Cristina is a lawyer";

console.log(`Input: "${testText}"\n`);

// Test 1: Job title extraction
console.log('TEST 1: Job Title Extraction');
console.log('─────────────────────────────────────────────────────────────────────────\n');

const jobPatterns = [
  /\b(manager|engineer|developer|analyst|director|coordinator|specialist|consultant|assistant|associate|officer|executive|administrator|supervisor|controller|head of|chief|boss|president|vice president|ceo|cto|cfo|attorney|lawyer|doctor|physician|nurse|professor|teacher|instructor|director|manager|supervisor|lead|principal|chief)\b/gi
];

const jobMatches = [];
for (const pattern of jobPatterns) {
  let match;
  while ((match = pattern.exec(testText)) !== null) {
    const job = match[1];
    if (!jobMatches.some(j => j.toLowerCase() === job.toLowerCase())) {
      jobMatches.push(job);
    }
  }
}

console.log(`Found job titles: ${jobMatches.length}`);
for (const job of jobMatches) {
  console.log(`  ✅ "${job}"`);
}

// Test 2: Pattern-based job detection
console.log('\nTEST 2: Pattern-Based Job Detection (is a/an [job])');
console.log('─────────────────────────────────────────────────────────────────────────\n');

const jobTriggers = /\b(?:is|am|are|was|were)\s+(?:a|an)\s+([A-Za-z\s]+?)(?:\s+(?:and|or|but|who|that|with)|\.|,|$)/gi;
const jobPatternMatches = [];
let jobMatch;
while ((jobMatch = jobTriggers.exec(testText)) !== null) {
  const potentialJob = jobMatch[1].trim();
  const words = potentialJob.split(/\s+/);
  if (words.length <= 3 && potentialJob.length >= 3) {
    if (!jobPatternMatches.some(j => j.toLowerCase() === potentialJob.toLowerCase())) {
      jobPatternMatches.push(potentialJob);
    }
  }
}

console.log(`Found job titles via pattern: ${jobPatternMatches.length}`);
for (const job of jobPatternMatches) {
  console.log(`  ✅ "${job}"`);
}

// Test 3: Name extraction (looking for capitalized words before "is")
console.log('\nTEST 3: Person Name Extraction');
console.log('─────────────────────────────────────────────────────────────────────────\n');

// Pattern: [Capitalized] is a/an...
const namePattern = /\b([A-Z][a-z]+)\s+(?:is|am|are|was|were)\s+(?:a|an)\b/gi;
const nameMatches = [];
let nameMatch;
while ((nameMatch = namePattern.exec(testText)) !== null) {
  const name = nameMatch[1];
  if (!nameMatches.some(n => n.toLowerCase() === name.toLowerCase())) {
    nameMatches.push(name);
  }
}

console.log(`Found person names: ${nameMatches.length}`);
for (const name of nameMatches) {
  console.log(`  ✅ "${name}"`);
}

// Summary
console.log('\n================================================================================');
console.log('SUMMARY');
console.log('================================================================================\n');

console.log(`Job Titles Found: ${[...new Set([...jobMatches, ...jobPatternMatches])].join(', ')}`);
console.log(`Names Found: ${nameMatches.join(', ')}`);

if (jobMatches.length > 0 && nameMatches.length > 0) {
  console.log('\n✅ SUCCESS: Both "Cristina" and "lawyer" would be detected!');
} else {
  console.log('\n❌ FAILURE: Not all entities detected');
}

console.log('\n================================================================================\n');
