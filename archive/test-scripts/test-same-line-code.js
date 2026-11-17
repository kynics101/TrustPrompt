// Test: Code on same line as fence marker (your exact case)

global.CODE_DETECTION_CONFIG = {
  LOG_SIGNAL_DETAILS: true,
  enableSourceCodeDetection: true
};

const testCases = [
  {
    name: "Code on SAME line as fence",
    input: `Here it is: \`\`\`function getUserTotal(cart){ let total = 0; for (const item of cart){ total += item.price * item.qty; } return total; }\`\`\``,
    expectedCode: `function getUserTotal(cart){ let total = 0; for (const item of cart){ total += item.price * item.qty; } return total; }`,
    shouldNotInclude: ["Here it is", "expected"]
  },
  {
    name: "Code on NEXT line (traditional markdown)",
    input: `Here's my code:\`\`\`javascript
function test() {
  return 42;
}\`\`\``,
    expectedCode: `function test() {\n  return 42;\n}`,
    shouldNotInclude: ["Here's my code"]
  },
  {
    name: "Your EXACT case with prose",
    input: `Would you mind reviewing this function? Here it is: \`\`\`function getUserTotal(cart){ let total = 0; for (const item of cart){ total += item.price * item.qty; } return total; }\`\`\` Any improvements?`,
    expectedCode: `function getUserTotal(cart){ let total = 0; for (const item of cart){ total += item.price * item.qty; } return total; }`,
    shouldNotInclude: ["Would you mind", "Any improvements", "reviewing"]
  }
];

// Simplified detectFormattedCodeBlock
function detectFormattedCodeBlock(text) {
  if (!text || typeof text !== 'string') {
    return { isFormatted: false, language: '', code: '' };
  }

  // Try "code on same line" pattern FIRST
  const sameLineMatch = text.match(/```([\w]*)(.*?)```/);
  
  if (sameLineMatch && sameLineMatch[2]) {
    let codeContent = sameLineMatch[2].trim();
    const potentialLang = sameLineMatch[1] || '';
    
    // If potentialLang looks like common language names, use it
    const commonLanguages = ['javascript', 'python', 'java', 'cpp', 'csharp', 'c', 'php', 'ruby', 'go', 'rust', 'sql', 'html', 'css', 'json', 'xml', 'yaml', 'bash', 'shell', 'sh'];
    const isLanguage = commonLanguages.includes(potentialLang.toLowerCase());
    
    // If potentialLang is NOT a known language, it's actually start of code
    if (potentialLang && !isLanguage) {
      codeContent = potentialLang + ' ' + codeContent;
    }
    
    const language = isLanguage ? potentialLang.toLowerCase() : '';
    
    console.log(`  ✓ Found same-line code: ${language || '(no lang)'}, ${codeContent.length} chars`);
    
    return {
      isFormatted: true,
      language: language,
      code: codeContent
    };
  }

  // Try line-start pattern
  const markdownFenceRegex = /^```[\s\w]*$|^~~~[\s\w]*$/m;
  const fenceStartMatch = text.match(markdownFenceRegex);
  
  if (fenceStartMatch) {
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

    console.log(`  ✓ Found line-start code: ${language || '(no lang)'}, ${codeContent.length} chars`);

    return {
      isFormatted: true,
      language: language,
      code: codeContent
    };
  }

  return { isFormatted: false, language: '', code: '' };
}

console.log('═'.repeat(80));
console.log('TEST: Code on Same Line as Fence Marker');
console.log('═'.repeat(80));
console.log();

let passed = 0;
let failed = 0;

testCases.forEach((test, i) => {
  console.log(`Test ${i+1}: ${test.name}`);
  console.log(`  Input: ${test.input.substring(0, 70)}...`);
  
  const result = detectFormattedCodeBlock(test.input);
  
  if (!result.isFormatted) {
    console.log(`  ✗ FAIL - Code not detected`);
    failed++;
    return;
  }

  // Check if code matches
  const codeMatches = result.code === test.expectedCode;
  const noExtraWords = test.shouldNotInclude.every(word => 
    !result.code.toLowerCase().includes(word.toLowerCase())
  );

  if (codeMatches && noExtraWords) {
    console.log(`  ✓ Code extracted correctly: ${result.code.length} chars`);
    console.log(`  ✓ No extra prose included`);
    console.log(`  ✓ PASS`);
    passed++;
  } else {
    if (!codeMatches) {
      console.log(`  ✗ Code doesn't match`);
      console.log(`    Expected: ${test.expectedCode.substring(0, 50)}...`);
      console.log(`    Got:      ${result.code.substring(0, 50)}...`);
    }
    if (!noExtraWords) {
      const included = test.shouldNotInclude.filter(word =>
        result.code.toLowerCase().includes(word.toLowerCase())
      );
      console.log(`  ✗ Extra words found: ${included.join(', ')}`);
    }
    console.log(`  ✗ FAIL`);
    failed++;
  }
  console.log();
});

console.log('═'.repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(80));

if (failed === 0) {
  console.log('✓✓✓ ALL TESTS PASSED - Same-line code extraction working!');
} else {
  console.log('✗ Some tests failed');
}
