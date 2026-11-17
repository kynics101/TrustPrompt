const patterns = require('./patterns.js');

const text = "ORDER shipped on 03-14-1998 to warehouse. Parcel has 5 KG of TYPE O RICE plus loan form";
const pattern = patterns.TRUSTPROMPT_PATTERNS.find(p => p.id === 'blood_type_mention');

// Manually extract context like the contextFilter does
const matchIndex = 61;  // From debug output
const matchValue = "TYPE O";

const beforeStart = Math.max(0, matchIndex - 200);
const beforeText = text.slice(beforeStart, matchIndex).toLowerCase();

const afterStart = matchIndex + matchValue.length;
const afterText = text.slice(afterStart, Math.min(text.length, afterStart + 200)).toLowerCase();

const fullContext = beforeText + " [MATCH] " + afterText;

console.log("Full text:", text);
console.log("Length:", text.length);
console.log();
console.log("Match at index", matchIndex, ":", `"${matchValue}"`);
console.log();
console.log("beforeStart:", beforeStart);
console.log("beforeText:", `"${beforeText}"`);
console.log();
console.log("afterStart:", afterStart);
console.log("afterText:", `"${afterText}"`);
console.log();
console.log("fullContext:", `"${fullContext}"`);
console.log();

// Test product markers
const productMarkers = [
  /type\s+[abo]\s+(?:rice|product|food|grain|item|variety|classification)/i,
  /\b[abo]\s+(?:rice|product|food|grain|item)\b/i,
];

console.log("Testing product markers:");
for (const marker of productMarkers) {
  const match = marker.test(fullContext);
  console.log(`  ${marker} → ${match ? "MATCHES" : "NO MATCH"}`);
}
