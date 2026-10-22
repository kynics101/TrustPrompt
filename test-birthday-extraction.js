// Test to debug why "March 07,2005" is not being detected in gazetteer extraction

// Simulate the extraction process
const testText = "my birthday is on March 07,2005";
const textWords = testText.split(/\s+/);

console.log('='.repeat(70));
console.log('SIMULATING GAZETTEER EXTRACTION');
console.log('='.repeat(70));
console.log(`Input text: "${testText}"`);
console.log(`Split words:`, textWords);
console.log('');

// The trigger is "my birthday is" - which would match at position 0
// After matching the trigger, extractValue would be called with startIdx pointing
// to the first word AFTER "is"

// But wait - the trigger is "my birthday is"
// That's 3 words: "my" (0), "birthday" (1), "is" (2)
// So startIdx would be 3, pointing to "on"

const triggerPhrase = "my birthday is";
const triggerWords = triggerPhrase.split(/\s+/);
console.log(`Trigger phrase: "${triggerPhrase}"`);
console.log(`Trigger words:`, triggerWords);
console.log(`Trigger word count: ${triggerWords.length}`);
console.log('');

const startIdx = triggerWords.length;  // Position 3
console.log(`startIdx (first word after trigger): ${startIdx}`);
console.log(`Word at startIdx: "${textWords[startIdx]}"`);
console.log('');

// Now simulate followPattern check
const followPattern = /^(on\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2},?\s+\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/i;

const nextWords = textWords.slice(startIdx).join(" ");
console.log(`nextWords (joined from startIdx): "${nextWords}"`);
console.log(`followPattern test: ${followPattern.test(nextWords)}`);
console.log('');

// Let's test with the CURRENT (broken) pattern
const currentPattern = /^(on\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i;

console.log('TESTING WITH CURRENT PATTERN:');
console.log(`Pattern: ${currentPattern.toString()}`);
console.log(`nextWords: "${nextWords}"`);
const testResult = currentPattern.test(nextWords);
console.log(`Match result: ${testResult}`);
if (testResult) {
  const match = nextWords.match(currentPattern);
  console.log(`Matched text: "${match[0]}"`);
}
console.log('');

// The problem is clear: the current pattern ONLY matches "on March" or just "March"
// It doesn't include the full date format "March 07,2005"
// After the followPattern check passes (because it matched "on Mar"), 
// the extractValue function needs to collect the words.

console.log('='.repeat(70));
console.log('WORD COLLECTION SIMULATION');
console.log('='.repeat(70));

// Simulate word collection (from extractValue function)
const STOP_WORDS = new Set([
  "and", "but", "or", "so", "yet", "for", "nor",
  "i", "you", "he", "she", "they", "we", "it",
  "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did",
  "will", "would", "could", "should", "may", "might",
  "the", "a", "an", "this", "that", "these", "those",
  "to", "of", "in", "on", "at", "by", "with", "from",
  "please", "can", "need", "want", "help", "tell", "give"
]);

const collected = [];
const max = 8;

for (let i = startIdx; i < textWords.length && collected.length < max; i++) {
  const word = textWords[i];
  const clean = word.replace(/[.,!?;:'"]/g, "").toLowerCase();

  console.log(`Word ${i}: "${word}" (cleaned: "${clean}")`);
  
  // Stop at stop words
  if (STOP_WORDS.has(clean)) {
    console.log(`  → STOP (is a stop word)`);
    break;
  }

  // Stop at sentence-ending punctuation in the word
  collected.push(word);
  console.log(`  → Collected`);
  
  if (/[.!?]$/.test(word)) {
    console.log(`  → STOP (ends with punctuation)`);
    break;
  }
}

console.log('');
console.log(`Collected words: [${collected.map(w => `"${w}"`).join(", ")}]`);
const span = collected.join(" ").replace(/[.,!?;:]$/, "").trim();
console.log(`Final span: "${span}"`);
console.log('');

console.log('='.repeat(70));
console.log('PROBLEM DIAGNOSIS');
console.log('='.repeat(70));
console.log('1. The trigger "my birthday is" matches at position 0');
console.log('2. extractValue is called with startIdx=3 (pointing to "on")');
console.log('3. followPattern test on "on March 07,2005" finds "on March" matches');
console.log('4. Word collection starts at "on"');
console.log('5. "on" is in STOP_WORDS, so collection STOPS immediately!');
console.log('6. Result: span = "" (empty string)');
console.log('');
console.log('✗ FIX NEEDED: "on" should NOT stop collection when used as preposition');
console.log('   Alternative: Add "my birthday is on" as a separate trigger');
