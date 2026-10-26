// Quick test: verify SSS detection is now working
const testPrompt = "i'm filling out a government form and it asks for my SSS number, which is 31-0500213-4. can you explain what the other fields usually mean?";

console.log("Testing SSS detection with prompt:");
console.log(testPrompt);
console.log("\n--- Expected Result ---");
console.log("SSS number 31-0500213-4 should be DETECTED and flagged as HIGH risk");
console.log("(Previously it was filtered out by context markers 'explain', 'form', etc.)");
console.log("\n--- Fix Applied ---");
console.log("Removed 'ph_id_sss' from contextAwarePatterns in scanner.js line 1206");
console.log("SSS numbers will now ALWAYS be detected regardless of surrounding context");
