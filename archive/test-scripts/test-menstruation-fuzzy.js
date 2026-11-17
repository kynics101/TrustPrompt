// test-menstruation-fuzzy.js
// Test fuzzy matching for medical terms like "menstration" → "menstruation"

// Simulate the fuzzy matching functions from gazetteer.js

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function similarityRatio(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshtein(a, b) / maxLen;
}

const FUZZY_THRESHOLD = 0.80;

function fuzzyMatchMedicalTerm(text, term, threshold = FUZZY_THRESHOLD) {
  const textWords = text.toLowerCase().split(/\s+/);
  const termWords = term.toLowerCase().split(/\s+/);
  const tLen = termWords.length;
  const matches = [];

  // Single-word terms: match individual words
  if (tLen === 1) {
    textWords.forEach((word, idx) => {
      // Remove trailing punctuation for comparison
      const cleanWord = word.replace(/[.,!?;:'"]/g, "");
      const similarity = similarityRatio(cleanWord, term.toLowerCase());
      
      if (similarity >= threshold && cleanWord.length > 0) {
        matches.push({
          matchText: word,
          index: idx,
          canonical: term,
          similarity: similarity
        });
      }
    });
  } else {
    // Multi-word terms: match word sequences
    for (let i = 0; i <= textWords.length - tLen; i++) {
      const window = textWords.slice(i, i + tLen).join(" ");
      const similarity = similarityRatio(window, term.toLowerCase());
      
      if (similarity >= threshold) {
        matches.push({
          matchText: window,
          startIndex: i,
          endIndex: i + tLen,
          canonical: term,
          similarity: similarity
        });
      }
    }
  }

  return matches;
}

// Test cases
console.log("=== Testing Fuzzy Matching for Medical Terms ===\n");

// Test 1: "menstration" (typo) should match "menstruation" (correct)
console.log("Test 1: Detecting typo 'menstration'");
const text1 = "I am experiencing heavy menstration and need help";
const matches1 = fuzzyMatchMedicalTerm(text1, "menstruation");
console.log("Text:", text1);
console.log("Term to find: menstruation");
console.log("Matches found:", matches1.length);
if (matches1.length > 0) {
  matches1.forEach(m => {
    console.log(`  - "${m.matchText}" (similarity: ${(m.similarity * 100).toFixed(1)}%)`);
  });
} else {
  console.log("  No matches found");
}
console.log();

// Test 2: "menstruation" (correct) should match exactly
console.log("Test 2: Detecting correct spelling 'menstruation'");
const text2 = "I have heavy menstruation";
const matches2 = fuzzyMatchMedicalTerm(text2, "menstruation");
console.log("Text:", text2);
console.log("Term to find: menstruation");
console.log("Matches found:", matches2.length);
if (matches2.length > 0) {
  matches2.forEach(m => {
    console.log(`  - "${m.matchText}" (similarity: ${(m.similarity * 100).toFixed(1)}%)`);
  });
}
console.log();

// Test 3: Various typo forms
console.log("Test 3: Testing various typo forms");
const typos = [
  "i have heavy menstration",
  "suffering from mensuration",
  "my menstraton is bad",
  "experiencing mentration",
  "menstruation is painful"
];

for (const typoText of typos) {
  const matches = fuzzyMatchMedicalTerm(typoText, "menstruation");
  if (matches.length > 0) {
    console.log(`✓ FOUND: "${typoText}"`);
    matches.forEach(m => {
      console.log(`    "${m.matchText}" → "${m.canonical}" (${(m.similarity * 100).toFixed(1)}%)`);
    });
  } else {
    console.log(`✗ MISSED: "${typoText}"`);
  }
}
console.log();

// Test 4: Similarity calculations
console.log("Test 4: Similarity ratio calculations");
const testPairs = [
  ["menstruation", "menstration"],
  ["menstruation", "mensuration"],
  ["menstruation", "menstreation"],
  ["menstruation", "mentration"],
  ["menstruation", "period"],
  ["menstruation", "menstruation"]
];

for (const [word1, word2] of testPairs) {
  const ratio = similarityRatio(word1, word2);
  const pass = ratio >= FUZZY_THRESHOLD ? "✓ PASS" : "✗ FAIL";
  console.log(`  "${word1}" vs "${word2}": ${(ratio * 100).toFixed(1)}% ${pass}`);
}
console.log();

// Test 5: Normalization grouping
console.log("Test 5: Medical term normalization for grouping");
const MEDICAL_TERM_NORMALIZATION = {
  'menstration': 'menstruation',
  'mensuration': 'menstruation',
  'menstreation': 'menstruation',
  'menstraton': 'menstruation',
  'mentration': 'menstruation'
};

function normalizeMedicalTerm(term) {
  const lower = term.toLowerCase();
  return MEDICAL_TERM_NORMALIZATION[lower] || lower;
}

const testTerms = ["menstruation", "menstration", "mensuration", "heavy menstruation", "period"];
console.log("Normalizing terms for grouping:");
for (const term of testTerms) {
  const normalized = normalizeMedicalTerm(term);
  console.log(`  "${term}" → "${normalized}"`);
}
console.log();

console.log("=== All Tests Complete ===");
