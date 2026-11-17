// test-full-scan.js
// Test the full scanner to see exactly what it detects

const TrustScanner = require('./scanner.js');

const fullPrompt = `can you explain what this function does and clean it up?

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
console.log('FULL SCANNER TEST - Complete Python Code');
console.log('═════════════════════════════════════════════════════════════\n');

console.log('Input prompt length:', fullPrompt.length);
console.log('Input starts with:', fullPrompt.substring(0, 100));
console.log('Input ends with:', fullPrompt.substring(fullPrompt.length - 50));
console.log('\n' + '─'.repeat(60) + '\n');

try {
  const result = TrustScanner.scan(fullPrompt);
  
  console.log('\nScan completed successfully');
  console.log('\nFindings summary:');
  
  if (result.findings && result.findings.length > 0) {
    // Group by pattern type
    const byType = {};
    result.findings.forEach(f => {
      const type = f.patternId || f.category || 'unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(f);
    });
    
    Object.keys(byType).forEach(type => {
      console.log(`\n${type}: ${byType[type].length} finding(s)`);
      byType[type].forEach((f, idx) => {
        const match = (f.rawMatch || f.value || '').substring(0, 100);
        console.log(`  [${idx + 1}] "${match}"`);
        if (f.rawMatch && f.rawMatch.length > 100) {
          console.log(`       ... (${f.rawMatch.length} total chars)`);
        }
      });
    });
  } else {
    console.log('NO FINDINGS');
  }
  
  // Specifically check for source code
  const sourceCodeFindings = (result.findings || []).filter(f => f.patternId === 'source_code');
  console.log('\n' + '═'.repeat(60));
  console.log(`\nSource Code Findings: ${sourceCodeFindings.length}`);
  
  if (sourceCodeFindings.length > 0) {
    sourceCodeFindings.forEach((f, idx) => {
      console.log(`\n[Block ${idx + 1}]`);
      console.log(`  Length: ${f.rawMatch.length} characters`);
      console.log(`  Content (first 200 chars):`);
      console.log(`  ${f.rawMatch.substring(0, 200)}`);
      if (f.rawMatch.length > 200) {
        console.log(`  ...\n  Content (last 100 chars):`);
        console.log(`  ${f.rawMatch.substring(f.rawMatch.length - 100)}`);
      }
      
      // Count lines
      const lines = f.rawMatch.split('\n');
      console.log(`  Lines: ${lines.length}`);
    });
  }
  
} catch (err) {
  console.log('ERROR:', err.message);
  console.log(err.stack);
}
