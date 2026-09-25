// Fix multiline string literals in the calibration test file
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'test-code-detection-calibration.js');
let content = fs.readFileSync(filePath, 'utf8');

// The file has actual CRLF newlines embedded inside string literals
// We need to convert those to \n escape sequences inside the string values

// Strategy: find each affected sample by ID and replace
const fixes = [
  {
    id: 'sql-03',
    newLine: "  { id: 'sql-03', lang: 'sql', text: `UPDATE users u\\nSET last_login = NOW(), login_count = login_count + 1\\nFROM (SELECT id, email FROM users WHERE active = 1) sub\\nWHERE u.id = sub.id\\nRETURNING u.id, u.last_login, sub.email;` },"
  },
  {
    id: 'sh-01',
    newLine: "  { id: 'sh-01', lang: 'shell', text: `#!/bin/bash\\nset -euo pipefail\\nNODE_ENV=production\\nexport DATABASE_URL=\"postgresql://user:pass@localhost/db\"\\nnpm install --production && npm run build && npm start\\necho \"Startup complete\"` },"
  },
  {
    id: 'sh-02',
    newLine: "  { id: 'sh-02', lang: 'shell', text: `for file in *.json; do\\n  echo \"Processing\"\\n  node validate.js || exit 1\\ndone\\necho \"All validated\"` },"
  },
  {
    id: 'sh-05',
    newLine: "  { id: 'sh-05', lang: 'shell', text: `docker build -t trustprompt:latest .\\ndocker tag trustprompt:latest registry.example.com/trustprompt:latest\\ndocker push registry.example.com/trustprompt:latest\\ndocker run -d --name tp-scanner -p 3000:3000 trustprompt:latest\\necho \"Deployment complete\"` },"
  }
];

for (const fix of fixes) {
  // Match the entire line block for this sample id (handle both \r\n and \n endings, and multiline content)
  const regex = new RegExp(
    `  \\{ id: '${fix.id}'[^]*?\\},\\r?\\n`,
    'g'
  );
  const result = content.replace(regex, fix.newLine + '\n');
  if (result === content) {
    console.warn(`WARNING: Could not find sample ${fix.id} to fix`);
  } else {
    content = result;
    console.log(`Fixed: ${fix.id}`);
  }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Done. File saved.');
