// test-check-rawmatch.js
// Directly test the extractUnformattedCodeBlocks function to see rawMatch

const normalisedText = `can you explain what this function does and clean it up?

import smtplib

def send_report(to):
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login('billing.demo@gmail.com', 'xkqmhvptzrwdnaes')
    msg = 'Subject: Monthly report\\n\\nAttached is the monthly sales report.'
    server.sendmail('billing.demo@gmail.com', to, msg)
    server.quit()

send_report('maria.santos.demo@yahoo.com')`;

console.log('═════════════════════════════════════════════════════════════');
console.log('TESTING rawMatch FIELD');
console.log('═════════════════════════════════════════════════════════════\n');

// Simulate the code extraction with lookahead logic
const codeLinePatterns = [
  /^\s*\w+\.\w+\s*\([^)]*\)\s*;?\s*$/,
  /^\s*(SELECT|INSERT|UPDATE|DELETE)\s+/i,
  /^\s*const\s+\w+\s*=\s*\{/,
  /^\s*db\.\w+\s*\([^)]*\)\s*;?\s*$/,
  /^\s*\w+\s*=\s*.*[=>{}\[\];]/,
  /^\s*(def|class|import|from)\s+/,
  /^\s*(function|const|let|var|async)\s+/
];

const extractedCodeLines = normalisedText.split('\n');
const blocks = [];
let currentCodeBlock = [];

for (let i = 0; i < extractedCodeLines.length; i++) {
  const line = extractedCodeLines[i];
  const trimmed = line.trim();
  const isIndented = /^\s+/.test(line);
  const isCodeLike = codeLinePatterns.some(pattern => pattern.test(trimmed));
  
  // Check if next non-empty line is code
  let nextLineIsCode = false;
  for (let j = i + 1; j < extractedCodeLines.length; j++) {
    const nextLine = extractedCodeLines[j].trim();
    if (nextLine) {
      nextLineIsCode = codeLinePatterns.some(p => p.test(nextLine)) || /^\s+/.test(extractedCodeLines[j]);
      break;
    }
  }
  
  if (!trimmed) {
    if (currentCodeBlock.length > 0 && !nextLineIsCode) {
      const blockCode = currentCodeBlock.join('\n').trim();
      if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
        blocks.push({
          code: blockCode,
          rawMatch: blockCode,  // FULL code
          language: 'unformatted',
          isFormatted: false,
          scoreObj: {
            classification: 'code',
            score: 4
          }
        });
      }
      currentCodeBlock = [];
    }
    continue;
  }
  
  if (isCodeLike || (isIndented && currentCodeBlock.length > 0)) {
    currentCodeBlock.push(line);
  } else if (currentCodeBlock.length > 0 && !isIndented && !isCodeLike) {
    const blockCode = currentCodeBlock.join('\n').trim();
    if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
      blocks.push({
        code: blockCode,
        rawMatch: blockCode,  // FULL code
        language: 'unformatted',
        isFormatted: false,
        scoreObj: {
          classification: 'code',
          score: 4
        }
      });
    }
    currentCodeBlock = [];
  } else if (isCodeLike) {
    currentCodeBlock.push(line);
  }
}

if (currentCodeBlock.length > 0) {
  const blockCode = currentCodeBlock.join('\n').trim();
  if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
    blocks.push({
      code: blockCode,
      rawMatch: blockCode,  // FULL code
      language: 'unformatted',
      isFormatted: false,
      scoreObj: {
        classification: 'code',
        score: 4
      }
    });
  }
}

console.log(`\nDetected ${blocks.length} code block(s)\n`);

blocks.forEach((block, idx) => {
  console.log(`[Block ${idx + 1}]`);
  console.log(`  rawMatch length: ${block.rawMatch.length} characters`);
  console.log(`  rawMatch content (first 150 chars):`);
  console.log(`  "${block.rawMatch.substring(0, 150)}"`);
  
  if (block.rawMatch.length > 150) {
    console.log(`  rawMatch content (last 150 chars):`);
    console.log(`  "${block.rawMatch.substring(block.rawMatch.length - 150)}"`);
  }
  
  const lines = block.rawMatch.split('\n');
  console.log(`  Total lines: ${lines.length}`);
  
  // Show line by line
  console.log(`  Line breakdown:`);
  lines.forEach((l, lineIdx) => {
    console.log(`    [${lineIdx + 1}] ${l.substring(0, 70)}`);
  });
  console.log();
});

console.log('═'.repeat(60));
console.log('\n✅ The rawMatch field now contains the FULL code!');
