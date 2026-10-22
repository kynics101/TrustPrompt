const text = "I am 17 years old with blue eye color, blood type o+, and my license will expire this novermber 25, 2026 what are the steps";

// NEW patterns for natural language personal attributes
const ageRegex = /\b(\d{1,3})\s+(?:years?\s+)?(?:old|yo|years?\s+old|age|edad)\b|(?:age[sd]?|aged|I\s+am)\s+(\d{1,3})(?:\s+years?\s+old)?/gi;
const eyeColorRegex = /(?:eye\s*colou?r?|eyes?)\s*(?:is|are|:)?\s*(?:blue|brown|green|black|hazel|gray|grey|amber|dark|light|blue-grey|light brown|dark brown|honey|black brown)\b/gi;
const bloodTypeRegex = /(?:blood\s*type|type)\s*(?:is|:)?\s*([ABO](?:B|O)?[+-]?|AB[+-]?|O[+-]?|A[+-]?|rh\s*[+-]?)\b/gi;

console.log("=== Testing: 'I am 17 years old with blue eye color, blood type o+, and my license will expire this novermber 25, 2026 what are the steps' ===\n");

const ageMatches = text.match(ageRegex);
console.log("✓ Age matches:", ageMatches);

const eyeMatches = text.match(eyeColorRegex);
console.log("✓ Eye color matches:", eyeMatches);

const bloodMatches = text.match(bloodTypeRegex);
console.log("✓ Blood type matches:", bloodMatches);

console.log("\n=== SUMMARY ===");
console.log("Total PII attributes detected: " + (
  (ageMatches ? ageMatches.length : 0) + 
  (eyeMatches ? eyeMatches.length : 0) + 
  (bloodMatches ? bloodMatches.length : 0)
));

