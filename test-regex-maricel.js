// Quick test of the regex patterns to see if they match "Maricel Balais"

const testText = "Maricel Balais is experiencing heavy menstruation and she want to her gynecologist";

console.log("=== TESTING REGEX PATTERNS ===\n");
console.log(`Test text: "${testText}"\n`);

// Pattern A: Multi-word names
const multiWordPattern = /\b([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the|my|your|his|her|its|our|their)?\s*([a-z]+)/gi;
console.log("=== PATTERN A: Multi-word names ===");
let multiMatch;
let multiCount = 0;
while ((multiMatch = multiWordPattern.exec(testText)) !== null) {
  console.log(`✓ Match found:`);
  console.log(`  Full: "${multiMatch[0]}"`);
  console.log(`  Name: "${multiMatch[1]}"`);
  console.log(`  After: "${multiMatch[2]}"`);
  multiCount++;
}
console.log(`Total multi-word matches: ${multiCount}\n`);

// Pattern B: Single-word names
const singleWordPattern = /\b([A-Z][a-z]+)\s+is\s+(?:a|an|the|my|your|his|her|its|our|their)?\s*([a-z]+)/gi;
console.log("=== PATTERN B: Single-word names ===");
let singleMatch;
let singleCount = 0;
while ((singleMatch = singleWordPattern.exec(testText)) !== null) {
  console.log(`✓ Match found:`);
  console.log(`  Full: "${singleMatch[0]}"`);
  console.log(`  Name: "${singleMatch[1]}"`);
  console.log(`  After: "${singleMatch[2]}"`);
  singleCount++;
}
console.log(`Total single-word matches: ${singleCount}\n`);

// Test if text is lowercase
console.log("=== TEXT ANALYSIS ===");
console.log(`Text starts with "Maricel": ${testText.startsWith("Maricel")}`);
console.log(`Text contains "Maricel Balais": ${testText.includes("Maricel Balais")}`);
console.log(`Text contains "maricel balais": ${testText.includes("maricel balais")}`);
console.log(`Char code of first letter: ${testText.charCodeAt(0)} (should be 77 for 'M')`);

// Test simpler patterns
console.log("\n=== SIMPLER PATTERNS ===");
const simplePattern1 = /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+is/;
const match1 = testText.match(simplePattern1);
console.log(`Pattern: /([A-Z][a-z]+\\s+[A-Z][a-z]+)\\s+is/`);
console.log(`Match: ${match1 ? match1[1] : "NO MATCH"}`);

const simplePattern2 = /Maricel\s+Balais\s+is/;
const match2 = testText.match(simplePattern2);
console.log(`Pattern: /Maricel\\s+Balais\\s+is/`);
console.log(`Match: ${match2 ? "YES" : "NO"}`);
