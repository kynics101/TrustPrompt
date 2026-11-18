const patterns = require('./patterns.js').TRUSTPROMPT_PATTERNS;

// Test 1: Pedro Ramos breach profile
const text1 = "Name: Pedro Ramos, Engineer at Meralco, 6 ft, 80 kg, Catholic, bank loan ₱500,000, email pedro@example.com.";

// Find height_mention pattern
const heightPattern = patterns.find(p => p.id === 'height_mention');
const weightPattern = patterns.find(p => p.id === 'weight_mention');

console.log("TEST 1: Pedro Ramos Profile");
console.log("Text:", text1);
console.log();

if (heightPattern && heightPattern.regex) {
  heightPattern.regex.lastIndex = 0;
  let match = heightPattern.regex.exec(text1);
  if (match) {
    console.log("HEIGHT MATCH FOUND:", match[0]);
    console.log("Match index:", match.index);
    if (heightPattern.contextFilter) {
      const result = heightPattern.contextFilter(match[0], text1, match.index);
      console.log("contextFilter returned:", result);
      console.log("Should ALLOW height?", result === true ? "YES ✓" : "NO ✗");
    }
  } else {
    console.log("NO HEIGHT MATCH");
  }
}

console.log();

if (weightPattern && weightPattern.regex) {
  weightPattern.regex.lastIndex = 0;
  let match = weightPattern.regex.exec(text1);
  if (match) {
    console.log("WEIGHT MATCH FOUND:", match[0]);
    console.log("Match index:", match.index);
    if (weightPattern.contextFilter) {
      const result = weightPattern.contextFilter(match[0], text1, match.index);
      console.log("contextFilter returned:", result);
      console.log("Should ALLOW weight?", result === true ? "YES ✓" : "NO ✗");
    }
  } else {
    console.log("NO WEIGHT MATCH");
  }
}

console.log("\n\n===========================================\n");

// Test 2: Shipping note with 5 KG
const text2 = "SUMMARIZE THIS SHIPPING NOTE: ORDER 4111111111111112 SHIPPED ON 03-14-1998 TO WAREHOUSE B. THE PARCEL HAS 5 KG OF TYPE O RICE PLUS A LOAN APPLICATION FORM.";

console.log("TEST 2: Shipping Note");
console.log("Text:", text2);
console.log();

if (weightPattern && weightPattern.regex) {
  weightPattern.regex.lastIndex = 0;
  let match = weightPattern.regex.exec(text2);
  if (match) {
    console.log("WEIGHT MATCH FOUND:", match[0]);
    console.log("Match index:", match.index);
    if (weightPattern.contextFilter) {
      const result = weightPattern.contextFilter(match[0], text2, match.index);
      console.log("contextFilter returned:", result);
      console.log("Should SUPPRESS weight?", result === false ? "YES ✓" : "NO ✗");
    }
  } else {
    console.log("NO WEIGHT MATCH");
  }
}
