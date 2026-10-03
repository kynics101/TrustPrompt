// Test to understand the placeholder characters

const DS_PH_OPEN  = "\uE002";
const DS_PH_CLOSE = "\uE003";

console.log('DS_PH_OPEN:', DS_PH_OPEN, '(code:', DS_PH_OPEN.charCodeAt(0), ')');
console.log('DS_PH_CLOSE:', DS_PH_CLOSE, '(code:', DS_PH_CLOSE.charCodeAt(0), ')');

// Example: "0909 834 0056"
// After digit separator protection:
// - "0 8" → "\uE0020\uE003" (but storing just "0 8")
// - "4 0" → "\uE0021\uE003" (but storing just "4 0")
// Result: "0909\uE0020\uE0034\uE0021\uE0030056"

const example = `0909${DS_PH_OPEN}0${DS_PH_CLOSE}34${DS_PH_OPEN}1${DS_PH_CLOSE}0056`;
console.log('\nExample protected text:', example);
console.log('Visible:', JSON.stringify(example));

// The regex needs to match this, so we need to allow these placeholder chars
// Current regex: /(?:\+63|0)[\s\-]?9[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{3}/
// Needs to be: /(?:\+63|0)[\s\-\uE002\uE003]*?9[\s\-\uE002\uE003]*?\d{2}[\s\-\uE002\uE003]*?\d{4}[\s\-\uE002\uE003]*?\d{3}/

console.log('\nOr more generally, include placeholders in character classes:');
console.log('[\\s\\-] → [\\s\\-\\uE002\\uE003]');
