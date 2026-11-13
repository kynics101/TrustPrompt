/**
 * Test: Blood Type Mention - Personal Disclosure vs Educational Content
 * 
 * This pattern should ONLY capture blood type when it's a personal disclosure.
 * It should NOT match:
 * 1. Educational/informational posts about blood types
 * 2. General discussions about blood type importance
 * 3. Community health information
 * 4. Personality/learning style classifications
 */

const testCases = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SHOULD BE SUPPRESSED (NOT personal disclosure)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    name: "Educational Health Post - O-negative",
    text: "I'm writing a quick educational post for a community health drive and want the facts right. In general terms, can you explain why hospitals say O-negative donors are so valuable",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Educational content, not personal disclosure"
  },
  
  {
    name: "General Information Article",
    text: "Blood type O- is considered the universal donor because it has no A or B antigens",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - General informational content"
  },
  
  {
    name: "Community Health Campaign",
    text: "Our community health drive needs to explain why Type AB+ receivers are universal recipients",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Public health information"
  },
  
  {
    name: "Educational Explanation",
    text: "Type O blood lacks both A and B antigens, making it compatible with all types",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Educational explanation"
  },
  
  {
    name: "Health Facts Post",
    text: "Facts about blood types: O positive and O negative are valuable for emergency transfusions",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - General health facts"
  },
  
  {
    name: "Donor Compatibility Guide",
    text: "Universal donors (O-) can donate to any blood type, which is why they're crucial in emergencies",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Educational guide"
  },
  
  {
    name: "Blog Post - Why AB- matters",
    text: "This blog post explains why AB- blood is important for plasma donations",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Informational blog content"
  },
  
  {
    name: "Personality Framework",
    text: "Type A personality versus Type B personality framework",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Psychology/personality context"
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOULD BE DETECTED (personal disclosure)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    name: "Personal Disclosure - Direct",
    text: "My blood type is O-negative and I'm eligible to donate",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Personal disclosure"
  },
  
  {
    name: "Doctor's Note - Patient Record",
    text: "Patient blood type: A+ confirmed in medical screening",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Medical record context"
  },
  
  {
    name: "Donation Registration",
    text: "I want to register as a donor. My blood type is B negative",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Personal donation disclosure"
  },
  
  {
    name: "Medical Test Result",
    text: "The blood test results confirm I have type AB positive",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Personal medical test result"
  },
  
  {
    name: "Hospital Admission",
    text: "Upon admission, they recorded that my blood type is O positive",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Personal hospital record"
  },
];

console.log("Blood Type Mention - Personal Disclosure vs Educational");
console.log("=".repeat(80));
console.log("\nPurpose: ONLY detect blood type when it's a personal disclosure");
console.log("Suppress educational/informational mentions about blood types in general\n");

console.log("Test Cases:");
console.log("-".repeat(80));

testCases.forEach((testCase, index) => {
  const status = testCase.shouldDetect ? "✓ SHOULD DETECT (PII)" : "✗ SHOULD SUPPRESS (not PII)";
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log(`   Expected: ${status}`);
  console.log(`   Reason: ${testCase.expectedBehavior}`);
  console.log(`   Text: "${testCase.text.substring(0, 65)}..."`);
});

console.log("\n" + "=".repeat(80));
console.log("\nKey Changes in Implementation:");
console.log("-".repeat(80));
console.log(`
1. Added THREE-TIER context detection:
   - Personal Disclosure Markers (DETECT)
   - Educational/Informational Markers (SUPPRESS)
   - Non-Medical Markers (SUPPRESS)

2. Personal Disclosure Markers (ALLOW detection):
   - "my blood type is..."
   - "I have type O..."
   - "blood type: AB+"
   - Patient/donor records in medical context

3. Educational Context Markers (SUPPRESS):
   - Keywords: educational post, health post, community health, facts
   - Patterns: "explain why", "universal donor", "valuable donors"
   - Intent: "write post", "information about", "facts right"
   - "without referring to anyone's personal records"

4. Logic:
   - IF (personal disclosure) AND (NOT educational) → DETECT ✓
   - IF (educational) OR (personality) OR (learning style) → SUPPRESS ✓
   - IF (no personal context) → SUPPRESS ✓
`);

console.log("=".repeat(80));
console.log("\nExpected Results After Fix:");
console.log("-".repeat(80));
console.log(`
SCENARIO 1: Educational Content
  User: "I'm writing a health post explaining why O- is valuable"
  Mention: "O-negative donors"
  Result: ✗ SUPPRESSED (educational context, not PII)

SCENARIO 2: Personal Disclosure
  User: "I just found out my blood type is O-negative"
  Mention: "blood type is O-negative"
  Result: ✓ DETECTED (personal disclosure, PII)

SCENARIO 3: Community Health Campaign
  User: "facts about Type AB+ for our health drive"
  Mention: "Type AB+"
  Result: ✗ SUPPRESSED (public health information, not personal)

SCENARIO 4: Medical Record
  User: "My doctor said I'm type B positive"
  Mention: "type B positive"
  Result: ✓ DETECTED (medical record context, PII)
`);
console.log("=".repeat(80));
console.log("\nKey Distinction:");
console.log("-".repeat(80));
console.log(`
NOT PII (General Information):
  • Blood type facts and explanations
  • Why certain types are valuable
  • Universal donor/recipient concepts
  • Educational posts without personal references
  • Community health information
  • Donor compatibility guides

PII (Personal Information):
  • "My blood type is..."
  • "I have type X..."
  • Personal medical records
  • Donation registration
  • Hospital/doctor records with personal blood type
  • Direct personal health disclosures
`);
console.log("=".repeat(80));
