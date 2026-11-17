// Test if linguistic-detector.js loads and exports correctly in browser context
const fs = require('fs');

console.log("=== Testing Linguistic Detector Load ===\n");

// Simulate browser globals
global.window = {
  nlp: {}, // Fake compromise.js nlp object
};
global.chrome = {
  runtime: {
    getURL: (path) => path  // Mock for CSV URLs
  }
};
global.globalThis = global;

// Mock fetch for CSV loading
global.fetch = (url) => {
  console.log(`[MOCK FETCH] Loading: ${url}`);
  
  if (url.includes('occupations.csv')) {
    return Promise.resolve({
      text: () => Promise.resolve('librarian\nengineer\nmanager\n')
    });
  }
  
  if (url.includes('organizations.csv')) {
    return Promise.resolve({
      text: () => Promise.resolve('Google\nAmazon\nUniversity of Santo Tomas\n')
    });
  }
  
  return Promise.reject(new Error(`Unknown URL: ${url}`));
};

// Load the detector
try {
  const detectorCode = fs.readFileSync('linguistic-detector.js', 'utf8');
  
  console.log("✓ Loaded linguistic-detector.js");
  console.log(`File size: ${detectorCode.length} bytes\n`);
  
  // Execute it in global context
  eval(detectorCode);
  
  console.log("✓ Executed linguistic-detector.js\n");
  
  // Check if detector is exposed
  setTimeout(() => {
    console.log("=== After execution (500ms delay) ===\n");
    
    if (typeof window !== 'undefined' && typeof window.TrustLinguisticDetector !== 'undefined') {
      console.log("✅ window.TrustLinguisticDetector is defined");
      
      if (typeof window.TrustLinguisticDetector.scan === 'function') {
        console.log("✅ TrustLinguisticDetector.scan is a function");
        
        // Test it
        console.log("\n--- Testing scan function ---");
        const testResult = window.TrustLinguisticDetector.scan("Maria is a librarian in university of santo tomas");
        console.log(`Test scan result: ${testResult.length} findings`);
        testResult.forEach(f => {
          console.log(`  - [${f.patternId}] "${f.rawMatch}"`);
        });
      } else {
        console.log("❌ TrustLinguisticDetector.scan is NOT a function");
        console.log("   Type:", typeof window.TrustLinguisticDetector.scan);
      }
    } else {
      console.log("❌ window.TrustLinguisticDetector is NOT defined");
      console.log("   window defined?", typeof window !== 'undefined');
      console.log("   window keys:", Object.keys(window || {}).slice(0, 10));
    }
    
    if (typeof globalThis !== 'undefined' && typeof globalThis.TrustLinguisticDetector !== 'undefined') {
      console.log("✅ globalThis.TrustLinguisticDetector is defined");
    } else {
      console.log("❌ globalThis.TrustLinguisticDetector is NOT defined");
    }
  }, 500);
  
} catch (err) {
  console.error("❌ Error loading or executing detector:");
  console.error("   Message:", err.message);
  console.error("   Stack:", err.stack.split('\n').slice(0, 5).join('\n'));
}
