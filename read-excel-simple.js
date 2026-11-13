const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

console.log('Starting Excel read...');

const excelPath = path.join(__dirname, 'csv', '[FINAL] TrustPrompt_Curated_Dataset.xlsx');

console.log('Path:', excelPath);
console.log('Exists:', fs.existsSync(excelPath));

// Read as buffer first
console.log('Reading file as buffer...');
const buffer = fs.readFileSync(excelPath);
console.log('Buffer size:', buffer.length);

// Parse from buffer
console.log('Parsing buffer with xlsx...');
const workbook = xlsx.read(buffer, { type: 'buffer' });

console.log('Parsed successfully!');
console.log('Sheet names:', workbook.SheetNames);

// Just get sheet names for now
for (const sheetName of workbook.SheetNames) {
  console.log(`\n${sheetName}:`);
  const sheet = workbook.Sheets[sheetName];
  console.log('  Dimensions:', sheet['!ref']);
}

console.log('\nDone!');
