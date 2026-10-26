// Quick test to verify phone and IP detection in patterns
// Run: node test-phone-ip-detection.js

// Load patterns
const testText = "Email maria.santos@example.com for the proposal, her number is 09171234567, office's server 192.168.1.1";

console.log("Testing detection with text:", testText);
console.log("\n=== PATTERN TESTS ===\n");

// Test ph_mobile regex - UPDATED to handle +63 prefix with better boundaries
const ph_mobile_regex = /(\+639|09)[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d[\s\-]?\d/gi;
const phoneMatches = testText.match(ph_mobile_regex);
console.log("ph_mobile regex test:");
console.log("  Matches:", phoneMatches);

// Test ipv4 regex
const ipv4_regex = /\b((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
const ipMatches = testText.match(ipv4_regex);
console.log("\nipv4 regex test:");
console.log("  Matches:", ipMatches);

// Test email regex
const email_regex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const emailMatches = testText.match(email_regex);
console.log("\nemail regex test:");
console.log("  Matches:", emailMatches);

console.log("\n=== SUMMARY ===");
console.log("Expected detections: 1 email, 1 phone, 1 IP");
console.log("Actual detections:");
console.log(`  Email: ${emailMatches ? emailMatches.length : 0}`);
console.log(`  Phone: ${phoneMatches ? phoneMatches.length : 0}`);
console.log(`  IP: ${ipMatches ? ipMatches.length : 0}`);

// Detailed IP validation
console.log("\n=== IP ADDRESS VALIDATION ===");
const testIPs = [
  "192.168.1.1",
  "255.255.255.255",
  "0.0.0.0",
  "256.256.256.256",  // Invalid
  "192.168",           // Invalid (incomplete)
];

testIPs.forEach(ip => {
  const isValid = ipv4_regex.test(ip);
  console.log(`  ${ip}: ${isValid ? "✓ Valid" : "✗ Invalid"}`);
  ipv4_regex.lastIndex = 0;  // Reset regex state
});

// Detailed phone validation - UPDATED for +63 prefix testing
console.log("\n=== PHONE NUMBER VALIDATION ===");
const testPhones = [
  "09171234567",
  "0917-123-4567",
  "0917 123 4567",
  "+639171234567",
  "+63-917-123-4567",
  "+63 917 123 4567",
  "+63-9-171-234-567",
  "09001234567",      // Valid prefix
  "08171234567",      // Invalid prefix (08XX is not mobile)
  "09171234567x",     // With extra char
];

testPhones.forEach(phone => {
  ph_mobile_regex.lastIndex = 0;  // Reset regex state
  const isValid = ph_mobile_regex.test(phone);
  console.log(`  ${phone}: ${isValid ? "✓ Valid" : "✗ Invalid"}`);
});

