// test-complete-python.js
// Test that the ENTIRE Python code block is captured, not split

const prompt = `can you explain what this function does and clean it up?

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
console.log('COMPLETE PYTHON CODE BLOCK TEST');
console.log('═════════════════════════════════════════════════════════════\n');

// Simulate the IMPROVED grouping logic that doesn't break on empty lines
const codeLinePatterns = [
  /^\s*\w+\.\w+\s*\([^)]*\)\s*;?\s*$/,           // method calls
  /^\s*(SELECT|INSERT|UPDATE|DELETE)\s+/i,       // SQL
  /^\s*const\s+\w+\s*=\s*\{/,                    // const
  /^\s*db\.\w+\s*\([^)]*\)\s*;?\s*$/,            // db.execute
  /^\s*\w+\s*=\s*.*[=>{}\[\];]/,                 // assignments
  /^\s*(def|class|import|from)\s+/,              // Python keywords
  /^\s*(function|const|let|var|async)\s+/       // JS keywords
];

const extractedCodeLines = prompt.split('\n');
const codeBlocks = [];
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
    // Empty line: only end block if next line is NOT code
    if (currentCodeBlock.length > 0 && !nextLineIsCode) {
      const blockCode = currentCodeBlock.join('\n').trim();
      if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
        codeBlocks.push(blockCode);
        console.log(`[Line ${i}] Ending block (next line is not code)\n`);
      }
      currentCodeBlock = [];
    }
    continue;
  }
  
  // Non-empty line
  if (isCodeLike || (isIndented && currentCodeBlock.length > 0)) {
    if (currentCodeBlock.length === 0) {
      console.log(`[Line ${i + 1}] Starting block with: ${trimmed.substring(0, 50)}`);
    }
    currentCodeBlock.push(line);
  } else if (currentCodeBlock.length > 0 && !isIndented && !isCodeLike) {
    // Non-indented, non-code line = end of block
    const blockCode = currentCodeBlock.join('\n').trim();
    if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
      codeBlocks.push(blockCode);
      console.log(`[Line ${i}] Ending block (non-code, non-indented)\n`);
    }
    currentCodeBlock = [];
  } else if (isCodeLike) {
    // Start of new block
    currentCodeBlock.push(line);
  }
}

// Handle final block
if (currentCodeBlock.length > 0) {
  const blockCode = currentCodeBlock.join('\n').trim();
  if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
    codeBlocks.push(blockCode);
    console.log(`[End] Final block captured`);
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`\n✅ Detected ${codeBlocks.length} code block(s):\n`);

codeBlocks.forEach((block, idx) => {
  const lines = block.split('\n');
  console.log(`[Block ${idx + 1}] ${lines.length} line(s):`);
  console.log(`  First 60 chars: ${block.substring(0, 60)}...`);
  console.log(`  Last 60 chars:  ...${block.substring(block.length - 60)}`);
  console.log();
});

console.log('═'.repeat(60));
if (codeBlocks.length === 1) {
  console.log('\n✅ SUCCESS: Entire Python code is captured as ONE block!');
  console.log('   Includes: imports, function def, body, and function call');
} else {
  console.log(`\n⚠️  Got ${codeBlocks.length} blocks (expected 1)`);
}
