try {
  const xlsx = require('xlsx');
  const path = require('path');
  
  const excelPath = path.join(__dirname, 'csv', '[FINAL] TrustPrompt_Curated_Dataset.xlsx');
  console.log('Loading workbook...');
  
  const workbook = xlsx.readFile(excelPath);
  
  console.log('\nSheet names:');
  workbook.SheetNames.forEach((name, idx) => {
    console.log(`  ${idx + 1}. ${name}`);
  });
  
  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);
    
    console.log(`\n\n=== SHEET: ${sheetName} ===`);
    console.log(`Rows: ${data.length}`);
    
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      console.log(`Columns: ${headers.join(', ')}`);
      console.log('\nFirst row:');
      console.log(JSON.stringify(data[0], null, 2));
    }
  }
  
  console.log('\n\nDone!');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
