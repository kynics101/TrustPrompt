// Test the age context extraction with the specific input
const text = "What's the average height and weight of a 25 year old Filipino male?";
const numberStr = "25";
const numberIndex = text.indexOf(numberStr);

console.log("Full text:", text);
console.log("Number:", numberStr);
console.log("Number index:", numberIndex);

const contextStart = Math.max(0, numberIndex - 150);
const beforeText = text.substring(contextStart, numberIndex).toLowerCase().trim();
const afterStart = numberIndex + numberStr.length;
const contextEnd = Math.min(text.length, afterStart + 100);
const afterText = text.substring(afterStart, contextEnd).toLowerCase();

console.log("\nbeforeText:", beforeText);
console.log("afterText:", afterText);

// Test the patterns
const averagePattern = /\b(average|typical|general|demographic|statistics?|common|usually|normally|generally)\b/;
const whatIsPattern = /\b(what\s+is|what\s+are|what's|define|definition\s+of|explain|explained)\b/;

console.log("\nPattern tests:");
console.log("averagePattern matches:", averagePattern.test(beforeText));
console.log("whatIsPattern matches:", whatIsPattern.test(beforeText));

// Test all non-PII patterns
const nonPIIContextPatterns = [
  /\b(what\s+is|what\s+are|what's|define|definition\s+of|explain|explained)\b/,
  /\b(average|typical|general|demographic|statistics?|common|usually|normally|generally)\b/,
];

console.log("\nNon-PII context match:");
const hasNonPIIContext = nonPIIContextPatterns.some(m => m.test(beforeText)) || nonPIIContextPatterns.some(m => m.test(afterText));
console.log("Has non-PII context:", hasNonPIIContext);
