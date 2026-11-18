// Test to understand why "with" and "what" are matching to organizations with 0.90 similarity

function levenshteinDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array(m + 1).fill(0).map((_, i) => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

function similarityRatio(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - (levenshteinDistance(a, b) / maxLen);
}

console.log('========================================');
console.log('LEVENSHTEIN ANALYSIS: "with" and "what"');
console.log('========================================\n');

const testWords = ['with', 'what'];
const orgWords = ['wit', 'wist', 'will', 'wish', 'widen', 'wife', 'wild', 'wilson', 'wizards'];

testWords.forEach(testWord => {
  console.log(`\nTesting: "${testWord}" (length: ${testWord.length})`);
  console.log('─'.repeat(50));
  
  orgWords.forEach(org => {
    const distance = levenshteinDistance(testWord, org);
    const similarity = similarityRatio(testWord, org);
    
    console.log(
      `  "${org}" (${org.length}): ` +
      `distance=${distance}, ` +
      `similarity=${(similarity * 100).toFixed(1)}% ` +
      `${similarity >= 0.90 ? '❌ MATCHES AT 0.90 THRESHOLD' : ''}`
    );
  });
});

console.log('\n\n========================================');
console.log('KEY FINDING:');
console.log('========================================');
console.log('The issue is that SHORT WORDS like "with" (4 chars)');
console.log('have INFLATED similarity ratios due to the formula:');
console.log('  similarity = 1 - (distance / maxLength)');
console.log('');
console.log('Example:');
console.log('  "with" vs "wish": distance=1, maxLen=4');
console.log('  similarity = 1 - 1/4 = 0.75');
console.log('');
console.log('  "with" vs "wist": distance=1, maxLen=4');
console.log('  similarity = 1 - 1/4 = 0.75');
console.log('');
console.log('For 0.90 threshold with 4-char word:');
console.log('  max_distance = maxLen * (1 - 0.90)');
console.log('  max_distance = 4 * 0.10 = 0.4');
console.log('  So ONLY exact matches (distance=0) qualify!');
console.log('');
console.log('But if fuzzy matching is finding them at 0.90,');
console.log('they must be fuzzy-matching against MULTI-WORD phrases,');
console.log('or using a different calculation.');
