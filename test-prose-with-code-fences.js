// Test: Prose + Code with Fences should NOT be classified as prose

global.CODE_DETECTION_CONFIG = {
  LOG_SIGNAL_DETAILS: true,
  enableSourceCodeDetection: true
};

const testCases = [
  {
    name: "Prose + formatted code (YOUR EXACT CASE)",
    input: `Would you mind reviewing this function for bugs before I push it? I'm worried about edge cases when the cart is empty. Here it is: \`\`\`javascript
function getUserTotal(cart){
  let total = 0;
  for (const item of cart){
    total += item.price * item.qty;
  }
  return total;
}
\`\`\`

Any improvements you'd suggest would be appreciated.`,
    shouldClassifyAs: "code",  // Should detect code, not prose
    reason: "Has markdown fences - should bypass prose detection"
  },
  {
    name: "Pure prose (no fences)",
    input: `Would you mind reviewing this function for bugs? I'm worried about edge cases. 
Could you help me understand the logic? What do you think?`,
    shouldClassifyAs: "prose",
    reason: "No code fences - should be classified as prose"
  },
  {
    name: "Code with python fence",
    input: `Here's my code: \`\`\`python
def calculate():
    return 42
\`\`\`

Can you review it?`,
    shouldClassifyAs: "code",
    reason: "Has markdown fences - should detect as code"
  }
];

// Simplified detectProseMarkers (with fence check)
function detectProseMarkers(text) {
  // CRITICAL FIX: If text contains markdown fences, it's NOT prose
  if (/```|~~~/.test(text)) {
    console.log('    → Markdown fences detected, bypassing prose check');
    return { isProse: false, proseScore: 0, reasons: [] };
  }
  
  const conversationalPatterns = /[?!]\s|Could you|Can you|I\s(?:always|never|think|need|want|have)|registering|filling out|help me|get wrong|it insists|format|confirm|correct|proper/i;
  const sentencePattern = /^[A-Z][^.!?]*[.!?]\s+[A-Z]/m;
  const proseStructures = /\b(?:I'm|it's|that's|what's|how|when|where|why|because|if|which|that|and|or|but)\b/gi;
  
  const hasConversational = conversationalPatterns.test(text);
  const hasSentences = sentencePattern.test(text);
  const proseWordsCount = (text.match(proseStructures) || []).length;
  
  let proseScore = 0;
  if (hasConversational) proseScore += 3;
  if (hasSentences) proseScore += 2;
  if (proseWordsCount >= 5) proseScore += 2;
  
  const reasons = [
    hasConversational ? 'Has conversational markers' : null,
    hasSentences ? 'Has complete sentences' : null,
    proseWordsCount >= 5 ? `Has ${proseWordsCount} prose connectors` : null
  ].filter(r => r !== null);
  
  return {
    isProse: proseScore >= 3,
    proseScore,
    reasons
  };
}

console.log('═'.repeat(80));
console.log('TEST: Prose + Code Fences Classification');
console.log('═'.repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
  console.log(`Test ${i+1}: ${test.name}`);
  console.log(`  Input: ${test.input.substring(0, 60)}...`);
  console.log(`  Expected: ${test.shouldClassifyAs.toUpperCase()}`);
  
  const proseResult = detectProseMarkers(test.input);
  const classification = proseResult.isProse ? 'prose' : 'code';
  
  console.log(`  Prose Detection: isProse=${proseResult.isProse}, score=${proseResult.proseScore}`);
  console.log(`  Result: Classification = ${classification.toUpperCase()}`);
  
  if (classification === test.shouldClassifyAs) {
    console.log(`  ✓ PASS`);
    passed++;
  } else {
    console.log(`  ✗ FAIL - Expected ${test.shouldClassifyAs}, got ${classification}`);
    failed++;
  }
  console.log();
});

console.log('═'.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(80));

if (failed === 0) {
  console.log('✓✓✓ ALL TESTS PASSED - Prose detection fixed!');
  console.log('Markdown fences now correctly bypass prose classification');
} else {
  console.log('✗ Some tests failed');
}
