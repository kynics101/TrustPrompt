// Test to verify markdown detection works with raw (unnormalized) text

const testCases = [
  {
    name: "Prose + Formatted Code (inline backticks)",
    raw: `Would you mind reviewing this function for bugs? Here it is: \`\`\`javascript
function getUserTotal(cart){
  let total = 0;
  for (const item of cart){
    total += item.price * item.qty;
  }
  return total;
}
\`\`\``,
    shouldFind: true
  },
  {
    name: "Standalone formatted code",
    raw: `\`\`\`python
def greet():
    return "Hello"
\`\`\``,
    shouldFind: true
  },
  {
    name: "Code without backticks (prose)",
    raw: `Would you mind reviewing this function? It should calculate the total.`,
    shouldFind: false
  }
];

// Simple markdown detection (same as scanner.js)
function detectFormattedCodeBlock(text) {
  if (!text || typeof text !== 'string') {
    return { isFormatted: false, language: '', code: '' };
  }

  // Try line-start pattern first
  const markdownFenceRegex = /^```[\s\w]*$|^~~~[\s\w]*$/m;
  const fenceStartMatch = text.match(markdownFenceRegex);
  
  if (!fenceStartMatch) {
    // Try inline pattern
    const altFenceRegex = /```[\s\w]*\n|~~~[\s\w]*\n/;
    const altMatch = text.match(altFenceRegex);
    
    if (!altMatch) {
      return { isFormatted: false, language: '', code: '' };
    }
    
    const fenceStartIdx = text.indexOf(altMatch[0]);
    const afterFence = text.substring(fenceStartIdx + altMatch[0].length);
    const langMatch = altMatch[0].match(/```(\w+)|\s*~~~(\w+)/);
    const language = (langMatch ? (langMatch[1] || langMatch[2]) : '').toLowerCase();
    
    const closingMatch = afterFence.match(/\n```|\n~~~/);
    if (!closingMatch) {
      return { isFormatted: false, language: '', code: '' };
    }
    
    const codeContent = afterFence.substring(0, closingMatch.index);
    
    console.log(`  ✓ Found inline formatted code: ${language || '(no language)'}, ${codeContent.length} chars`);
    
    return {
      isFormatted: true,
      language: language,
      code: codeContent
    };
  }

  // Traditional line-start logic
  const fenceStart = fenceStartMatch[0];
  const langMatch = fenceStart.match(/^`{3}(\w+)|^~{3}(\w+)/);
  const language = (langMatch ? (langMatch[1] || langMatch[2]) : '').toLowerCase();

  const closingFenceRegex = /^```|^~~~/m;
  const firstNewline = text.indexOf('\n');
  if (firstNewline === -1) {
    return { isFormatted: false, language: '', code: '' };
  }

  const afterFirstFence = text.substring(firstNewline + 1);
  const closingMatch = afterFirstFence.match(closingFenceRegex);

  if (!closingMatch) {
    return { isFormatted: false, language: '', code: '' };
  }

  const codeContent = afterFirstFence.substring(0, closingMatch.index);

  console.log(`  ✓ Found line-start formatted code: ${language || '(no language)'}, ${codeContent.length} chars`);

  return {
    isFormatted: true,
    language: language,
    code: codeContent
  };
}

console.log('═'.repeat(80));
console.log('TEST: Markdown Detection with Raw (Unnormalized) Text');
console.log('═'.repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
  console.log(`Test ${i+1}: ${test.name}`);
  console.log(`  Input: ${test.raw.substring(0, 60)}...`);
  
  const result = detectFormattedCodeBlock(test.raw);
  const found = result.isFormatted;
  
  if (found === test.shouldFind) {
    console.log(`  Result: ✓ PASS (found=${found}, expected=${test.shouldFind})`);
    passed++;
  } else {
    console.log(`  Result: ✗ FAIL (found=${found}, expected=${test.shouldFind})`);
    failed++;
  }
  console.log();
});

console.log('═'.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(80));

if (failed === 0) {
  console.log('✓✓✓ ALL TESTS PASSED - Raw text markdown detection working!');
} else {
  console.log('✗ Some tests failed');
}
