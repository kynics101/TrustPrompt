// test-source-code-detection.js
// Tests the source code detector against the 7 provided sources

const SourceCodeDetector = require('./source-code-detection.js');

const testSources = [
  {
    id: 1,
    description: 'Python function with names in string',
    text: `My teammate Roel Navarro wrote this function, and I do not understand it:
\`\`\`python
def greet():
    return 'Hello, Dr. Elena Cruz of Meralco'
\`\`\`
Please explain it line by line.`
  },
  {
    id: 2,
    description: 'SQL query with employee data',
    text: `Why does this query return nothing?
\`\`\`sql
SELECT * FROM employees WHERE name = 'Carlos Reyes' AND company = 'Globe Telecom' AND role = 'engineer';
\`\`\`
The table definitely has data.`
  },
  {
    id: 3,
    description: 'JavaScript object literal (inline code)',
    text: `I keep getting a syntax error on one line and I can't see it. The line is \`const config = {retries: 3, timeout: 5000, debug: true};\` — to my eyes that looks perfectly valid, so what could possibly be wrong with it? Is it something about where I placed it in the file maybe?`
  },
  {
    id: 4,
    description: 'Java method call with postal ID',
    text: `how do i send this payload as json?
\`payload.put("postalId", "K4829165-7302-M");\``
  },
  {
    id: 5,
    description: 'SQL injection vulnerability example',
    text: `is this query safe from sql injection?
\`db.execute("INSERT INTO members (sss) VALUES ('31-0500213-4')");\``
  },
  {
    id: 6,
    description: 'JavaScript string with credit card',
    text: `can you clean up this line for me?
\`const cardNo = "5163 8294 7015 3622";\``
  },
  {
    id: 7,
    description: 'Python SMTP function with credentials',
    text: `can you explain what this function does and clean it up?

\`\`\`python
import smtplib

def send_report(to):
    server = smtplib.SMTP('smtp.gmail.com', 587)
    server.starttls()
    server.login('billing.demo@gmail.com', 'xkqmhvptzrwdnaes')
    msg = 'Subject: Monthly report\\n\\nAttached is the monthly sales report.'
    server.sendmail('billing.demo@gmail.com', to, msg)
    server.quit()

send_report('maria.santos.demo@yahoo.com')
\`\`\``
  }
];

console.log('═══════════════════════════════════════════════════════════════');
console.log('SOURCE CODE DETECTION TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

let totalDetected = 0;
let totalSources = testSources.length;

testSources.forEach(source => {
  console.log(`\n📝 SOURCE ${source.id}: ${source.description}`);
  console.log('─'.repeat(60));
  
  const findings = SourceCodeDetector.detectSourceCode(source.text);
  
  if (findings.length > 0) {
    console.log(`✅ DETECTED: ${findings.length} code block(s)\n`);
    totalDetected++;
    
    findings.forEach((finding, idx) => {
      console.log(`  [${idx + 1}] Pattern: ${finding.patternId}`);
      console.log(`      Label: ${finding.label}`);
      console.log(`      Language: ${finding.language}`);
      console.log(`      Confidence: ${finding.confidence}/10`);
      console.log(`      Code Sample: ${finding.rawMatch.substring(0, 70)}...`);
      if (finding.patterns && finding.patterns.length > 0) {
        console.log(`      Patterns: ${finding.patterns.join(', ')}`);
      }
      console.log();
    });
  } else {
    console.log(`❌ NOT DETECTED\n`);
  }
});

console.log('\n' + '═'.repeat(60));
console.log(`DETECTION SUMMARY: ${totalDetected}/${totalSources} sources detected as code`);
console.log('═'.repeat(60));

if (totalDetected === totalSources) {
  console.log('\n✅ All sources successfully detected as source code');
} else {
  console.log(`\n⚠️  ${totalSources - totalDetected} sources not detected`);
  console.log('   Recommendations:');
  console.log('   - Check inline code pattern detection');
  console.log('   - Verify backtick extraction');
  console.log('   - Review language detection confidence thresholds');
}
