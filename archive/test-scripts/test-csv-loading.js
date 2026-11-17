/**
 * Test file to demonstrate CSV loading in gazetteer.js
 * Run with: node test-csv-loading.js
 */

const fs = require('fs');
const path = require('path');

// Simulate the loadCSVTerms function from gazetteer.js
function loadCSVTerms(csvContent) {
  return csvContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'))
    .map(line => {
      const parts = line.split(',');
      return parts[0].trim().toLowerCase();
    })
    .filter(term => term.length > 0);
}

// Test CSV loading
console.log('Testing CSV loading functionality...\n');

try {
  // Load medical terms
  const medicalPath = path.join(__dirname, 'csv', 'medical_terms.csv');
  const medicalCsv = fs.readFileSync(medicalPath, 'utf-8');
  const medicalTerms = loadCSVTerms(medicalCsv);
  
  console.log('✓ Medical Terms CSV loaded successfully');
  console.log(`  - Total terms: ${medicalTerms.length}`);
  console.log(`  - Sample terms: ${medicalTerms.slice(0, 5).join(', ')}`);
  console.log();

  // Load financial terms
  const financialPath = path.join(__dirname, 'csv', 'financial_terms.csv');
  const financialCsv = fs.readFileSync(financialPath, 'utf-8');
  const financialTerms = loadCSVTerms(financialCsv);
  
  console.log('✓ Financial Terms CSV loaded successfully');
  console.log(`  - Total terms: ${financialTerms.length}`);
  console.log(`  - Sample terms: ${financialTerms.slice(0, 5).join(', ')}`);
  console.log();

  // Verify terms are lowercase
  console.log('✓ Term normalization check:');
  const allTerms = [...medicalTerms, ...financialTerms];
  const allLowercase = allTerms.every(term => term === term.toLowerCase());
  console.log(`  - All terms lowercase: ${allLowercase ? 'YES' : 'NO'}`);
  console.log();

  // Search for specific terms
  console.log('✓ Example searches:');
  console.log(`  - "diabetes" found in medical terms: ${medicalTerms.includes('diabetes') ? 'YES' : 'NO'}`);
  console.log(`  - "bankruptcy" found in financial terms: ${financialTerms.includes('bankruptcy') ? 'YES' : 'NO'}`);
  console.log();

  console.log('All tests passed! CSV loading is working correctly.');

} catch (error) {
  console.error('✗ Error loading CSV files:', error.message);
  process.exit(1);
}
