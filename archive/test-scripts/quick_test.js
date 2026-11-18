// Quick test of the fixed linguistic detector
const fs = require('fs');

// Load the detector code
const detectorCode = fs.readFileSync('linguistic-detector.js', 'utf8');

// Create a safe eval context
const detector = {};
eval(`(function() {
  ${detectorCode.replace(/globalThis\./g, 'detector.').replace(/window\./g, 'detector.')}
})();`);

console.log("Testing linguistic detector...\n");

const testCases = [
  {
    text: "maricel is a librarian in university of santo tomas",
    name: "Librarian case"
  },
  {
    text: "Balais said the work was important",
    name: "Surname in subject"
  },
  {
    text: "Ms Balais is the head of IT",
    name: "Surname with honorific"
  }
];

for (const test of testCases) {
  console.log(`📝 ${test.name}`);
  console.log(`   Input: "${test.text}"`);
  
  try {
    if (detector.TrustLinguisticDetector && detector.TrustLinguisticDetector.scan) {
      const results = detector.TrustLinguisticDetector.scan(test.text);
      console.log(`   ✓ Results: ${results.length} findings`);
      results.forEach(r => {
        console.log(`     - [${r.patternId}] "${r.rawMatch}"`);
      });
    } else {
      console.log(`   ✗ Detector not available`);
    }
  } catch (err) {
    console.log(`   ✗ Error: ${err.message}`);
  }
  console.log("");
}
