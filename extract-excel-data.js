const fs = require('fs');
const path = require('path');

// Try to require xlsx, if not installed, provide installation instructions
let xlsx;
try {
  xlsx = require('xlsx');
} catch (e) {
  console.error('xlsx package not found. Installing...');
  require('child_process').execSync('npm install xlsx', { cwd: __dirname, stdio: 'inherit' });
  xlsx = require('xlsx');
}

const excelPath = path.join(__dirname, 'csv', '[FINAL] TrustPrompt_Curated_Dataset.xlsx');

console.log(`\n📂 Reading Excel file: ${excelPath}\n`);
console.log(`File exists: ${fs.existsSync(excelPath)}\n`);

if (!fs.existsSync(excelPath)) {
  console.error('❌ Excel file not found!');
  process.exit(1);
}

// Read the workbook
const workbook = xlsx.readFile(excelPath);

console.log('═══════════════════════════════════════════════════════════════');
console.log('📊 EXCEL FILE ANALYSIS');
console.log('═══════════════════════════════════════════════════════════════\n');

// List all sheet names
console.log('📋 SHEET NAMES:');
console.log(`Total sheets: ${workbook.SheetNames.length}\n`);
workbook.SheetNames.forEach((name, index) => {
  console.log(`  ${index + 1}. "${name}"`);
});

console.log('\n═══════════════════════════════════════════════════════════════\n');

// Analyze each sheet
workbook.SheetNames.forEach((sheetName, sheetIndex) => {
  console.log(`\n📄 SHEET: "${sheetName}"`);
  console.log('─────────────────────────────────────────────────────────────\n');
  
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);
  
  console.log(`Total rows: ${data.length}`);
  
  if (data.length === 0) {
    console.log('(No data in this sheet)');
  } else {
    // Show column headers
    const headers = Object.keys(data[0]);
    console.log(`\nColumn headers (${headers.length}):`);
    headers.forEach((header, idx) => {
      console.log(`  ${idx + 1}. ${header}`);
    });
    
    // Show first 5 rows
    console.log(`\nFirst 5 rows of data:`);
    console.log('─────────────────────────────────────────────────────────────');
    
    const rowsToShow = Math.min(5, data.length);
    for (let i = 0; i < rowsToShow; i++) {
      console.log(`\nRow ${i + 1}:`);
      headers.forEach(header => {
        const value = data[i][header];
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
        const truncated = displayValue.length > 100 ? displayValue.substring(0, 100) + '...' : displayValue;
        console.log(`  ${header}: ${truncated}`);
      });
    }
    
    // Look for test-related sheets
    if (sheetName.toLowerCase().includes('test') || sheetName.toLowerCase().includes('path')) {
      console.log(`\n⭐ This appears to be a TEST CASES sheet!`);
      console.log(`Sample data preview (first 3 rows):`);
      console.log(JSON.stringify(data.slice(0, 3), null, 2));
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
});

console.log('\n✅ Analysis complete!');
