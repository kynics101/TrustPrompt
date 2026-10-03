// test-code-flow-simple.js - Test source code detection flow
console.log("Testing source code detection flow...\n");

// Simple test data
const testCode = `function test() {
  const api_key = "sk-123456789";
  return api_key;
}`;

console.log("Input:");
console.log(testCode);
console.log("\nNote: In browser environment, TrustScanner will:");
console.log("1. Detect unformatted code via runSourceCodeDetection()");
console.log("2. Merge findings with pathA, pathB, pathC");
console.log("3. Pass to suppressPlaceholders() (should NOT suppress source_code)");
console.log("4. Pass to computeRiskScore() (should include in scorable)");
console.log("5. Pass to evaluateGovernance() (apply rules 1-4)");
console.log("6. Return risk level reflecting code + embedded credentials");
console.log("\nCheck browser console for detailed flow logs:");
console.log("- [TrustPrompt/scanner] logs");
console.log("- [TrustPrompt/merge] logs");
console.log("- [TrustPrompt/suppressed] logs");
console.log("- [TrustPrompt/scorer] logs");
console.log("- [TrustPrompt/governance] logs");
console.log("- [TrustPrompt/context] logs");
console.log("- [TrustPrompt/code] logs");
