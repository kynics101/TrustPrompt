/**
 * Debug script to see what happens to Philippine IDs during normalization
 * Run: node debug-normalization.js
 */

const fs = require("fs");

// Load normalizer
eval(fs.readFileSync(__dirname + "/normalizer.js", "utf8"));

const testSamples = [
  "3672-0413-9178-4769",      // National ID
  "P7409785C",                 // Passport
  "PA7203775",                 // Passport
  "31050021346",               // GSIS
  "31-0500213-4",              // SSS
  "1234-56-78901234-M",        // Voter's ID
  "4310-5002134-6",            // UMID
  "C51-23-016208",             // Driver's License
];

const patterns = [
  { id: "ph_id_philid", regex: /\d{4}-\d{4}-\d{4}-\d{4}/g },
  { id: "ph_id_passport", regex: /[A-Z]\d{7}[A-Z]|[A-Z]{2}\d{7}/g },
  { id: "ph_id_gsis", regex: /[0-9]{4}[0-9]{7}/g },
  { id: "ph_id_sss", regex: /\d{2}-\d{7}-\d/g },
  { id: "ph_id_voters", regex: /\d{4}-\d{2}-\d{8}-[A-Z]/g },
  { id: "ph_id_umid", regex: /\d{4}-\d{7}-\d/g },
  { id: "ph_id_drivers_license", regex: /[A-Z]\d{2}-\d{2}-\d{6}/g },
];

console.log("═══════════════════════════════════════════════════════════════");
console.log("NORMALIZATION DEBUG: What happens to Philippine IDs");
console.log("═══════════════════════════════════════════════════════════════\n");

for (const sample of testSamples) {
  console.log(`\n─────────────────────────────────────────────────────────────`);
  console.log(`SAMPLE: "${sample}"`);
  console.log(`─────────────────────────────────────────────────────────────`);
  
  // Run normalization
  const normalized = TrustNormalizer.normalize(sample);
  
  console.log(`Original:       "${sample}"`);
  console.log(`textRegex:      "${normalized.textRegex}"`);
  console.log(`textNLP:        "${normalized.textNLP}"`);
  console.log(`Caps converted: ${normalized.wasCapsConverted}`);
  
  // Test each pattern against the normalized text
  console.log(`\nPattern matching results against textRegex:`);
  
  let anyMatched = false;
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = [];
    let match;
    while ((match = regex.exec(normalized.textRegex)) !== null) {
      matches.push(match[0]);
    }
    
    if (matches.length > 0) {
      console.log(`  ✓ ${pattern.id}: MATCHED "${matches.join(", ")}"`);
      anyMatched = true;
    } else {
      console.log(`  ✗ ${pattern.id}: NO MATCH`);
    }
  }
  
  if (!anyMatched) {
    console.log(`\n  ⚠️  NO PATTERNS MATCHED!`);
    console.log(`  Characters in normalized text:`);
    for (let i = 0; i < normalized.textRegex.length; i++) {
      const char = normalized.textRegex[i];
      const code = char.charCodeAt(0);
      console.log(`    [${i}]: '${char}' (U+${code.toString(16).toUpperCase().padStart(4, '0')})`);
    }
  }
}

console.log(`\n═══════════════════════════════════════════════════════════════`);
console.log("END DEBUG");
console.log("═══════════════════════════════════════════════════════════════\n");
