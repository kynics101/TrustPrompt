// Quick test of regex patterns without compromise.js dependency

const text = "i am kyleen and I am a professor";

console.log("Testing regex patterns on:", text);
console.log("");

// Test person name patterns
console.log("=== Person Name Patterns ===");

// Pattern 1: "my name is X" or "i am called X"
const namePattern1 = /(?:my name is|i (?:am|'m) called|i (?:am|'m) named)\s+([A-Za-z\s]+?)(?:\.|,|and|but|because|\s+my|\s+i\s|$)/gi;
let match;
console.log("Pattern 1 (my name is / i am called):");
while ((match = namePattern1.exec(text)) !== null) {
  console.log("  Found:", match[1].trim());
}

// Pattern 2: "I am X" where X is a name (any capitalized word OR lowercase word when not followed by "a/an")
// Match: "i am <Word>" but not "i am a <word>" (which is a job title)
const namePattern2 = /\bi (?:am|'m)\s+(?!a\s+|an\s+)([A-Za-z]+)\b(?!\s+(?:a\s+|an\s+|the\s+|working|employed))/gi;
console.log("Pattern 2 (I am <Name> - not followed by a/an):");
while ((match = namePattern2.exec(text)) !== null) {
  console.log("  Found:", match[1].trim());
}

console.log("");
console.log("=== Job Title Patterns ===");

const JOB_TRIGGER_PHRASES = [
  'work as', 'work like', 'employed as', 'role is',
  'position is', 'my title is', 'job title is', 'i am a',
  'working as', 'work in the role of', "i'm a",
  'am a', 'am an'
];

for (const trigger of JOB_TRIGGER_PHRASES) {
  const escapedTrigger = trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`\\b${escapedTrigger}\\s+(?:a\\s+|an\\s+)?([A-Za-z\\s]+?)(?:\\s+(?:at|in|for|from|with)|,|\\.|\\s+in\\s+|\\s+working|\\s+since|$)`, 'gi');
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    const rawMatch = match[1].trim();
    if (rawMatch.length >= 2) {
      console.log(`Trigger "${trigger}" -> Found: "${rawMatch}"`);
    }
  }
}
