const patterns = require('./patterns.js');

const pattern = patterns.TRUSTPROMPT_PATTERNS.find(p => p.id === 'blood_type_mention');
const text = "ORDER shipped on 03-14-1998 to warehouse. Parcel has 5 KG of TYPE O RICE plus loan form";

console.log("Text:", text);
console.log("Length:", text.length);
console.log();

pattern.regex.lastIndex = 0;
let match;
while ((match = pattern.regex.exec(text)) !== null) {
  console.log("Match found:");
  console.log("  Value:", `"${match[0]}"`);
  console.log("  Index:", match.index);
  console.log("  After match index:", match.index + match[0].length);
  console.log();
  
  // Show context
  const contextStart = Math.max(0, match.index - 50);
  const contextEnd = Math.min(text.length, match.index + match[0].length + 50);
  const context = text.substring(contextStart, contextEnd);
  console.log("  Context (±50):", context);
  console.log();
}
