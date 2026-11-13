require('./normalizer.js');
require('./patterns.js');
require('./validator-wrapper.js');
global.TrustGazetteer = undefined;
global.TrustLinguisticDetector = undefined;

const TrustPrompt = require('./scanner.js');

const text = "Name: Pedro Ramos, Engineer at Meralco, 6 ft, 80 kg, Catholic, bank loan ₱500,000, email pedro@example.com.";

console.log("Input:", text);
console.log("\nScanning...\n");

const result = TrustPrompt.scan(text);

console.log("\n=== RESULTS ===");
console.log("Risk Level:", result.riskLevel);
console.log("Score:", result.score);
console.log("\nFindings found:");
if (result.findings && Array.isArray(result.findings)) {
  result.findings.forEach((f, i) => {
    console.log(`${i + 1}. ${f}`);
  });
} else {
  console.log("result.findings is:", result.findings);
}

console.log("\nHeight detected?", result.findings && result.findings.some(f => typeof f === 'string' && f.includes('height')));
console.log("Weight detected?", result.findings && result.findings.some(f => typeof f === 'string' && f.includes('weight')));
