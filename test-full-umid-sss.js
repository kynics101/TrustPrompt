// Test full detection pipeline
// Load all needed files
const fs = require('fs');

// Load patterns first (needed by scanner)
eval(fs.readFileSync('patterns.js', 'utf8'));

// Load normalizer (needed by scanner)
eval(fs.readFileSync('normalizer.js', 'utf8'));

// Load scanner
eval(fs.readFileSync('scanner.js', 'utf8'));

console.log("Testing full UMID/SSS detection pipeline");
console.log("=".repeat(70));
console.log();

// Test 1: UMID only (should detect only UMID, not SSS)
console.log("TEST 1: UMID '4310-5002134-6' (should be UMID only)");
console.log("-".repeat(70));
const result1 = TrustScanner.scan("My UMID is 4310-5002134-6");
console.log("Findings:", result1.findings.map(f => `${f.patternId}:${f.rawMatch}`));
console.log();

// Test 2: SSS only (should detect only SSS)
console.log("TEST 2: SSS '31-0500213-4' (should be SSS only)");
console.log("-".repeat(70));
const result2 = TrustScanner.scan("My SSS is 31-0500213-4");
console.log("Findings:", result2.findings.map(f => `${f.patternId}:${f.rawMatch}`));
console.log();

// Test 3: Both in text (should detect both)
console.log("TEST 3: Both UMID and SSS in same text");
console.log("-".repeat(70));
const result3 = TrustScanner.scan("UMID: 4310-5002134-6 SSS: 31-0500213-4");
console.log("Findings:", result3.findings.map(f => `${f.patternId}:${f.rawMatch}`));
