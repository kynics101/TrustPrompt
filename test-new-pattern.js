// Test the NEW simplified METHOD 3 pattern

const testText = "Maricel Balais is experiencing heavy menstruation and she want to her gynecologist";

console.log("Test text:", testText);
console.log("");

// NEW simplified pattern
const newPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+is\b/gi;

console.log("=== NEW SIMPLIFIED PATTERN ===");
console.log("Pattern: /\\b([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)\\s+is\\b/gi");
console.log("");

let newMatch;
let matchCount = 0;
while ((newMatch = newPattern.exec(testText)) !== null) {
  console.log(`Match ${++matchCount}:`);
  console.log(`  Full: "${newMatch[0]}"`);
  console.log(`  Name: "${newMatch[1]}"`);
}

console.log(`\nTotal matches: ${matchCount}`);
console.log("");

if (matchCount >= 1) {
  console.log("✅ SUCCESS: Pattern found 'Maricel Balais'");
} else {
  console.log("❌ FAILED: Pattern did not find 'Maricel Balais'");
}
