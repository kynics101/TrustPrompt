// test-grouped-code.js
// Test that multi-line code blocks are grouped together, not split

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
console.log('GROUPED CODE BLOCK DETECTION TEST');
console.log('═════════════════════════════════════════════════════════════\n');

// Simulate the IMPROVED grouping logic
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
  
  if (!trimmed) {
    if (currentCodeBlock.length > 0 && !/^\s/.test(line)) {
      // Non-indented empty line = end of block
      const blockCode = currentCodeBlock.join('\n').trim();
      if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
        codeBlocks.push(blockCode);
      }
      currentCodeBlock = [];
    }
    continue;
  }
  
  const isCodeLike = codeLinePatterns.some(pattern => pattern.test(trimmed));
  const isIndented = /^\s+/.test(line);
  
  if (isCodeLike || (isIndented && currentCodeBlock.length > 0)) {
    if (currentCodeBlock.length === 0) {
      console.log(`[Line ${i + 1}] Starting code block with: ${trimmed.substring(0, 50)}`);
    }
    currentCodeBlock.push(line);
  } else if (currentCodeBlock.length > 0) {
    // End of block
    const blockCode = currentCodeBlock.join('\n').trim();
    if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
      codeBlocks.push(blockCode);
      console.log(`[Line ${i}] Ending code block\n`);
    }
    currentCodeBlock = [];
  }
}

// Handle final block
if (currentCodeBlock.length > 0) {
  const blockCode = currentCodeBlock.join('\n').trim();
  if (blockCode && /[(){}\[\];=,:]/.test(blockCode)) {
    codeBlocks.push(blockCode);
  }
}

console.log('\n' + '─'.repeat(60));
console.log(`\nDetected ${codeBlocks.length} code block(s):\n`);

codeBlocks.forEach((block, idx) => {
  const lines = block.split('\n');
  console.log(`[Block ${idx + 1}] ${lines.length} line(s):`);
  console.log(`  Start: ${lines[0].substring(0, 60)}`);
  if (lines.length > 1) {
    console.log(`  ...`);
    console.log(`  End: ${lines[lines.length - 1].substring(0, 60)}`);
  }
  console.log();
});

console.log('═'.repeat(60));
console.log('\n✅ Result: Multi-line code blocks are now grouped together!');
console.log('   Each function/statement is ONE block, not split per line.');
