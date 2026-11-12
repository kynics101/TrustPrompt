const TrustPrompt = require('./scanner.js');

// Test 1: Pedro Ramos breach profile
const text1 = "Name: Pedro Ramos, Engineer at Meralco, 6 ft, 80 kg, Catholic, bank loan ₱500,000, email pedro@example.com.";
const result1 = TrustPrompt.scan(text1);
console.log('TEST 1: Pedro Ramos Breach Profile');
console.log('Text:', text1);
console.log('Findings:', result1.findings);
console.log('Height detected:', result1.findings.some(f => typeof f === 'string' && f.includes('height')));
console.log('Weight detected:', result1.findings.some(f => typeof f === 'string' && f.includes('weight')));
console.log();

// Test 2: Shipping note with 5 KG
const text2 = 'SUMMARIZE THIS SHIPPING NOTE: ORDER 4111111111111112 SHIPPED ON 03-14-1998 TO WAREHOUSE B. THE PARCEL HAS 5 KG OF TYPE O RICE PLUS A LOAN APPLICATION FORM.';
const result2 = TrustPrompt.scan(text2);
console.log('TEST 2: Shipping Note');
console.log('Text:', text2);
console.log('Findings:', result2.findings);
console.log('Weight detected:', result2.findings.some(f => typeof f === 'string' && f.includes('weight')));
