// Test file for age and date detection patterns

const testCases = [
  // Your exact example
  {
    text: "I am 17 years old with blue eye color, blood type o+, and my license will expire this november 25, 2026 what are the steps",
    expectedMatches: {
      age: ["17 years old"],
      eyeColor: ["blue eye color"],
      bloodType: ["blood type o+"],
      date: ["25, 2026", "november 25, 2026"]
    }
  },
  
  // Age variations
  {
    text: "I am 25 yrs old",
    expectedMatches: { age: ["25 yrs old"] }
  },
  {
    text: "I'm 30 y/o",
    expectedMatches: { age: ["30 y/o"] }
  },
  {
    text: "aged 42",
    expectedMatches: { age: ["aged 42"] }
  },
  {
    text: "age: 18",
    expectedMatches: { age: ["age: 18"] }
  },
  
  // Date variations
  {
    text: "my birthdate is 25/12/1995",
    expectedMatches: { date: ["25/12/1995"] }
  },
  {
    text: "DOB: 25-12-1995",
    expectedMatches: { date: ["25-12-1995"] }
  },
  {
    text: "born on 1995-12-25",
    expectedMatches: { date: ["1995-12-25"] }
  },
  {
    text: "December 25, 1995 is my birthday",
    expectedMatches: { date: ["December 25, 1995"] }
  },
  {
    text: "I was born on 25 December 1995",
    expectedMatches: { date: ["25 December 1995"] }
  },
  {
    text: "born January 1st, 2000",
    expectedMatches: { date: ["January 1st, 2000"] }
  },
  
  // Blood types
  {
    text: "My blood type is O+",
    expectedMatches: { bloodType: ["blood type is O+"] }
  },
  {
    text: "blood type AB-",
    expectedMatches: { bloodType: ["blood type AB-"] }
  },
  
  // Eye colors  
  {
    text: "he has brown eyes",
    expectedMatches: { eyeColor: ["brown eyes"] }
  },
  {
    text: "eye colour: blue",
    expectedMatches: { eyeColor: ["eye colour: blue"] }
  },
  
  // Marital status
  {
    text: "I'm married",
    expectedMatches: { maritalStatus: ["I'm married"] }
  },
  {
    text: "He is single",
    expectedMatches: { maritalStatus: ["is single"] }
  }
];

// Patterns from patterns.js
const ageRegex = /\b(\d{1,3})\s*(?:years?\s+old|yrs?\s+old|y\/o|yo)\b|\b(?:i\s+am|aged?|age:?)\s+(\d{1,3})\b/gi;
const dateRegex = /(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi;
const eyeColorRegex = /(?:eye\s*colou?r?|eyes?)\s*(?:is|are|:)?\s*(?:blue|brown|green|black|hazel|gray|grey|amber|dark|light|blue-grey|light brown|dark brown|honey|black brown)\b/gi;
const bloodTypeRegex = /(?:blood\s*type|type)\s*(?:is|:)?\s*([ABO](?:B|O)?[+-]?|AB[+-]?|O[+-]?|A[+-]?|rh\s*[+-]?)\b/gi;
const maritalStatusRegex = /(?:marital\s*status|relationship\s*status|I'?m|am|is|are)\s+(?:single|married|divorced|widowed|separated|in\s+a\s+relationship|engaged|unmarried|not\s+married)\b/gi;

console.log("=".repeat(70));
console.log("TRUSTPROMPT PII DETECTION - AGE & DATE PATTERN TESTING");
console.log("=".repeat(70));

let totalTests = 0;
let passedTests = 0;

testCases.forEach((testCase, idx) => {
  console.log(`\n[TEST ${idx + 1}] "${testCase.text.substring(0, 60)}..."`);
  
  const results = {
    age: testCase.text.match(ageRegex),
    date: testCase.text.match(dateRegex),
    eyeColor: testCase.text.match(eyeColorRegex),
    bloodType: testCase.text.match(bloodTypeRegex),
    maritalStatus: testCase.text.match(maritalStatusRegex)
  };
  
  let testPassed = true;
  
  Object.entries(testCase.expectedMatches).forEach(([type, expected]) => {
    totalTests++;
    const actual = results[type];
    const found = actual && actual.length > 0;
    
    if (found) {
      console.log(`  ✓ ${type.toUpperCase()}: ${actual.join(", ")}`);
      passedTests++;
    } else {
      console.log(`  ✗ ${type.toUpperCase()}: Expected "${expected.join(", ")}" but found nothing`);
      testPassed = false;
    }
  });
  
  if (!testPassed) {
    console.log(`  STATUS: FAILED`);
  } else {
    console.log(`  STATUS: PASSED`);
  }
});

console.log("\n" + "=".repeat(70));
console.log(`RESULTS: ${passedTests}/${totalTests} pattern detections passed`);
console.log("=".repeat(70));

if (passedTests === totalTests) {
  console.log("\n✓ All tests PASSED! Age and date detection is working correctly.");
} else {
  console.log(`\n✗ ${totalTests - passedTests} test(s) FAILED. Review the patterns above.`);
}
