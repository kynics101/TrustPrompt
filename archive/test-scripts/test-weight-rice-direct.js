const patterns = require('./patterns.js');

const text = "ORDER 4111111111111112 SHIPPED ON 03-14-1998 TO WAREHOUSE B. THE PARCEL HAS 5 KG OF TYPE O RICE PLUS A LOAN APPLICATION FORM.";

const pattern = patterns.TRUSTPROMPT_PATTERNS.find(p => p.id === 'weight_mention');
if (!pattern) {
  console.error("weight_mention pattern not found");
  process.exit(1);
}

console.log("Testing weight_mention contextFilter");
console.log("Text:", text);
console.log();

// Manually test the context extraction and filtering
const rawMatch = "5 KG ";
const matchIndex = 76;

const beforeStart = Math.max(0, matchIndex - 150);
const beforeText = text.slice(beforeStart, matchIndex).toLowerCase();

const afterStart = matchIndex + rawMatch.length;
const afterText = text.slice(afterStart, Math.min(text.length, afterStart + 150)).toLowerCase();

const fullContext = beforeText + " [MATCH] " + afterText;

console.log("Match:", `"${rawMatch}"`);
console.log("Match index:", matchIndex);
console.log();
console.log("beforeText:", `"${beforeText}"`);
console.log();
console.log("afterText:", `"${afterText}"`);
console.log();

// Test the markers
const nonIdContextMarkers = [
  /\b(ship|shipping|courier|parcel|cargo|freight|mail|postal|delivery|transport|estimate|cost|charge|fee|order|shipped|warehouse)\b/i,
  /\b(ceiling|shelf|furniture|table|chair|desk|cabinet|door|window|room|box|package|product|item)\b/i,
  /\b(recipe|ingredient|cook|bake|flour|sugar|food|meal|dish|serving|portion|bag.*mangoes?|dried.*mangoes?)\b/i,
];

const personalAttributeMarkers = [
  /\b(i\s+am|i\s*'?m|my|me)\s+.*?(?:weight|weighs?|kg|g|lbs?|pounds?)\b/i,
  /\b(weight|weighs?)\s+(?:is|:)?\s*(?:my|mine|i|me)\b/i,
  /\b(my|i\s+am|i\s*'?m)\s+.*?\b(?:kg|g|lbs?|pounds?)\b/i,
];

const objectSubjectMarkers = [
  /\b(box|boxes|bag|bags|package|packages|item|items|product|products?)\s+(?:weighs?|is|has)\s+.*?(?:\d+)\s*(?:kg|g|lbs?|pounds?)\b/i,
  /(?:\d+)\s*(?:kg|g|lbs?|pounds?)\s+(?:bag|bags|box|boxes|package|packages|item|items|of|dried|mangoes?)\b/i,
  /\b(mangoes?|flour|sugar|ingredients?|food|meal|dish)\s+(?:weighs?|is)?\s+.*?(?:\d+)\s*(?:kg|g|lbs?|pounds?)\b/i,
  /\b(weighs?|heavy)\s+(?:around|about|approximately|roughly)?\s+(?:\d+)\s*(?:kg|g|lbs?|pounds?)\s+(?:and|,).*?(?:box|bag|item|package|product|food|ingredient)\b/i,
];

const idContextMarkers = [
  /\b(id|driver.?s?.*license|passport|identification|document|form|medical|health|record|profile)\b/i,
  /\b(height|weight|physical.*characteristic|personal.*information|biometric)\b/i,
];

console.log("Testing markers:");
console.log("Has personal attribute:", personalAttributeMarkers.some(m => m.test(fullContext)));
console.log("Has object subject:", objectSubjectMarkers.some(m => m.test(fullContext)));
console.log("Has ID marker:", idContextMarkers.some(m => m.test(fullContext)));
console.log("Has non-ID marker:", nonIdContextMarkers.some(m => m.test(fullContext)));
console.log();

const hasPersonalAttribute = personalAttributeMarkers.some(m => m.test(fullContext));
const hasObjectSubject = objectSubjectMarkers.some(m => m.test(fullContext));
const hasIdMarker = idContextMarkers.some(m => m.test(fullContext));
const hasNonIdMarker = nonIdContextMarkers.some(m => m.test(fullContext));

const shouldSuppress = hasObjectSubject || (hasNonIdMarker && !hasPersonalAttribute && !hasIdMarker);
console.log("shouldSuppress:", shouldSuppress);
console.log("Return value:", !shouldSuppress);

