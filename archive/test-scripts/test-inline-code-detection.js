// Test detection of code blocks embedded in prose text

global.CODE_DETECTION_CONFIG = {
  LOG_SIGNAL_DETAILS: true,
  enableSourceCodeDetection: true
};

// Test case: Prose with code embedded (like the user's prompt)
const testInput = `Would you mind reviewing this function for bugs before I push it? I'm worried about edge cases when the cart is empty. Here it is: \`\`\`javascript
function getUserTotal(cart){
  let total = 0;
  for (const item of cart){
    total += item.price * item.qty;
  }
  return total;
}
\`\`\`

Any improvements you'd suggest would be appreciated.`;

console.log('═'.repeat(80));
console.log('TEST: Code Block Embedded in Prose');
console.log('═'.repeat(80));
console.log('Input (first 100 chars):');
console.log(testInput.substring(0, 100) + '...');
console.log();

// Inline implementation of updated detectFormattedCodeBlock
function detectFormattedCodeBlock(text) {
  if (!text || typeof text !== 'string') {
    return { isFormatted: false, language: '', code: '' };
  }

  // Try line-start pattern first (traditional markdown)
  const markdownFenceRegex = /^```[\s\w]*$|^~~~[\s\w]*$/m;
  const fenceStartMatch = text.match(markdownFenceRegex);
  
  if (!fenceStartMatch) {
    // Try alternative pattern: find backticks anywhere (inline code)
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
    
    console.log('[TrustPrompt/CodeDetection] Formatted code block detected (inline):', {
      language: language || '(none)',
      length: codeContent.length,
      lineCount: (codeContent.match(/\n/g) || []).length + 1
    });
    console.log('[TrustPrompt/CodeDetection] Classification: CODE (formatted block bypass - no scoring required)');
    
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

  console.log('[TrustPrompt/CodeDetection] Formatted code block detected:', {
    language: language || '(none)',
    length: codeContent.length,
    lineCount: (codeContent.match(/\n/g) || []).length + 1
  });
  console.log('[TrustPrompt/CodeDetection] Classification: CODE (formatted block bypass - no scoring required)');

  return {
    isFormatted: true,
    language: language,
    code: codeContent
  };
}

const result = detectFormattedCodeBlock(testInput);

console.log('Result:');
console.log(`  isFormatted: ${result.isFormatted}`);
console.log(`  language: ${result.language}`);
console.log(`  code length: ${result.code.length} chars`);
console.log(`  code preview: ${result.code.substring(0, 50)}...`);
console.log();

if (result.isFormatted) {
  console.log('✓ SUCCESS: Code block detected even though embedded in prose!');
} else {
  console.log('✗ FAILED: Code block not detected');
}
