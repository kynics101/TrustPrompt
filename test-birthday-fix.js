// Test birthday context filtering with "my birthday" priority check

function determineYearsContext(fullText, numberIndex, numberStr) {
  const contextStart = Math.max(0, numberIndex - 150);
  const beforeText = fullText.substring(contextStart, numberIndex).toLowerCase().trim();
  
  const afterStart = numberIndex + numberStr.length;
  const contextEnd = Math.min(fullText.length, afterStart + 100);
  const afterText = fullText.substring(afterStart, contextEnd).toLowerCase();
  
  // IMPORTANT: If "my birthday" is explicitly in the text, it's age PII
  if (/\bmy\s+birthday\b/i.test(beforeText + " " + afterText)) {
    return "age";  // Personal birthday disclosure
  }
  
  const ageMarkers = [
    /\b(i\s+am|i'm|im|age|edad|old|aged|turned|born|will be|just turned|turning)\b/,
    /\b(my age|born|how old|what (age|year)|when (were|was) (i|you|they|he|she))\b/,
    /\byears?\s+old\b/,
    /\b(currently|is)\s+\d{1,3}\s+years?\b/,
    /\b(senior citizen|retirement age|adult|minor|under 18|over 65|age group|eligible at|over)\b/,
    /\b(born in|class of|graduating|graduated)\b/,
    /\b(my (son|daughter|wife|husband|kid|child|baby|friend|brother|sister))\b/,
  ];
  
  // NON-PII CONTEXTS
  const nonPIIContextPatterns = [
    /\b(today is|it is|the date is)\s+\w+\s+\d{1,2},?\s*\d{4}\b/,  
    /^on\s+\w+\s+\d{1,2},?\s*\d{4}\b/,  
    /\b(is\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/,  
    /\b(letter|email|memo|wrote|date:|re:|subject:)\b/,  
    /\b(scenario|example|suppose|imagine|in this case|for example|hypothetical)\b/,  
    /\b(story|tale|fiction|novel|character|plot|chapter)\b/,  
  ];
  
  // Check for non-PII contexts
  if (nonPIIContextPatterns.some(m => m.test(beforeText)) || nonPIIContextPatterns.some(m => m.test(afterText))) {
    return "non_pii_context";
  }
  
  if (ageMarkers.some(m => m.test(beforeText)) || ageMarkers.some(m => m.test(afterText))) {
    return "age";
  }
  
  return "unknown";
}

const testCases = [
  { text: "I will be applying for government IDs, please fill-out the usual forms for me, my birthday is on February 21, 2002", expected: "age", shouldFlag: true },
  { text: "today is october 21, 2026", expected: "non_pii_context", shouldFlag: false },
  { text: "Christmas is December 25", expected: "non_pii_context", shouldFlag: false },
  { text: "Easter is April 9, 2023", expected: "non_pii_context", shouldFlag: false },
  { text: "my birthday is on March 15", expected: "age", shouldFlag: true },
];

console.log("Testing Birthday Context Filtering with Priority Check:\n");
console.log("=".repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach(testCase => {
  const numberMatch = testCase.text.match(/(\d+)/);
  if (!numberMatch) {
    console.log(`❓ No number: "${testCase.text}"\n`);
    return;
  }
  
  const numberStr = numberMatch[0];
  const numberIndex = testCase.text.indexOf(numberStr);
  const result = determineYearsContext(testCase.text, numberIndex, numberStr);
  const willFlag = result === "age";
  const correct = willFlag === testCase.shouldFlag;
  
  if (correct) passed++; else failed++;
  
  const status = correct ? "✅" : "❌";
  
  console.log(`${status} ${testCase.expected.toUpperCase().padEnd(15)}`);
  console.log(`   Text: "${testCase.text}"`);
  console.log(`   Expected: ${testCase.shouldFlag ? "FLAG" : "DON'T FLAG"} | Got: ${result}\n`);
});

console.log("=".repeat(80));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("✅ All tests passing!");
}
