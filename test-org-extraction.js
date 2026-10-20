// Quick test of organization extraction
const linguisticDetector = require('./linguistic-detector.js');

const testCases = [
  "She works in Apple.",
  "She works in Apple Inc.",
  "She works as a librarian in university of santo tomas.",
  "She is a librarian in the university of santo tomas.",
  "I work for Google and Amazon.",
  "Martha is head of OICT.",
  "She works at the university.",
];

console.log("=== ORGANIZATION EXTRACTION TESTS ===\n");

testCases.forEach(text => {
  console.log(`Input: "${text}"`);
  const result = linguisticDetector.scan(text);
  console.log(`Organizations: ${result.organizations.join(', ') || '(none)'}`);
  console.log(`Jobs: ${result.jobs.join(', ') || '(none)'}`);
  console.log();
});
