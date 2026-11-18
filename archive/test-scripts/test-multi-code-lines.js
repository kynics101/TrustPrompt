// test-multi-code-lines.js
// Test why a multi-line code block is detected as multiple separate code blocks

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
console.log('MULTI-LINE CODE BLOCK DETECTION TEST');
console.log('═════════════════════════════════════════════════════════════\n');

console.log('Input prompt:\n');
console.log(prompt);
console.log('\n' + '─'.repeat(60) + '\n');

// Simulate the code line extraction logic
const codeLinePatterns = [
  /^\s*\w+\.\w+\s*\([^)]*\)\s*;?\s*$/,           // method calls
  /^\s*(SELECT|INSERT|UPDATE|DELETE)\s+/i,       // SQL
  /^\s*const\s+\w+\s*=\s*\{/,                    // const
  /^\s*db\.\w+\s*\([^)]*\)\s*;?\s*$/,            // db.execute
  /^\s*\w+\s*=\s*.*[=>{}\[\];]/                  // assignments
];

const lines = prompt.split('\n');
const detectedCodeLines = [];

lines.forEach((line, idx) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  
  const isCodeLike = codeLinePatterns.some(pattern => pattern.test(trimmed));
  
  if (isCodeLike && /[(){}\[\];=,:]/.test(trimmed)) {
    detectedCodeLines.push({
      line: idx + 1,
      code: trimmed,
      matched: true
    });
  }
});

console.log(`Detected ${detectedCodeLines.length} individual code lines:\n`);
detectedCodeLines.forEach((item, idx) => {
  console.log(`[${idx + 1}] Line ${item.line}: ${item.code.substring(0, 70)}`);
});

console.log('\n' + '═'.repeat(60));
console.log('\nPROBLEM:');
console.log('Each method call line (server.starttls(), server.login(), etc.)');
console.log('is being detected as a SEPARATE source code block.');
console.log('\nEXPECTED BEHAVIOR:');
console.log('Multi-line Python function should be detected as ONE block,');
console.log('not fragmented into individual lines.');
console.log('\nREASON:');
console.log('The fix extracts code lines individually when it encounters');
console.log('lines with method calls. In a Python function, each indented');
console.log('line matches the pattern /^\\s*\\w+\\.\\w+\\s*\\([^)]*\\)...$/');
