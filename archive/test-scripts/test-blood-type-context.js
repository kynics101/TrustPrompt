/**
 * Test: Blood Type Mention - Medical Context Only
 * 
 * This pattern should ONLY capture blood type in medical/health contexts.
 * It should NOT match personality types, learning styles, or other classifications.
 */

const testCases = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SHOULD BE SUPPRESSED (NOT medical information)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    name: "Personality Framework - Type A",
    text: "I'm studying personality frameworks and keep seeing references to a 'Type A' personality versus more relaxed types",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Psychology/personality context, not medical"
  },
  
  {
    name: "Psychology Paper - Type A Behavior",
    text: "Type A behavior is characterized by competitiveness and urgency",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Psychology context"
  },
  
  {
    name: "Learning Styles - Type A vs Type B",
    text: "In the learning style model, Type A learners are analytical while Type B learners are intuitive",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Learning/education context"
  },
  
  {
    name: "Work Style Classification",
    text: "Our corporate training program classifies employees as Type A or Type B based on work style",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Business/classification context"
  },
  
  {
    name: "Communication Style",
    text: "Type A communicators are direct, while Type B communicators are more collaborative",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Communication/behavioral context"
  },
  
  {
    name: "Temperament Model",
    text: "The temperament assessment identifies Type A and Type B personality traits",
    pattern: "blood_type_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Psychological assessment context"
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOULD BE DETECTED (actual medical blood type information)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    name: "Blood Donation - Type A",
    text: "My blood type is Type A and I'm eligible to donate blood",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Direct blood type disclosure"
  },
  
  {
    name: "Medical Test Result",
    text: "The blood test results show my blood type is A positive",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Medical context"
  },
  
  {
    name: "Hospital Record",
    text: "Patient blood type: Type B - compatible with B and AB donors",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Medical/hospital context"
  },
  
  {
    name: "Doctor's Note",
    text: "Doctor confirmed my blood type as O negative during the health screening",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Medical professional context"
  },
  
  {
    name: "Transfusion Compatibility",
    text: "Blood transfusion compatibility: Type AB can receive from Type A, B, AB, and O",
    pattern: "blood_type_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Medical/transfusion context"
  },
];

console.log("Blood Type Mention Context Filtering - Medical Only");
console.log("=".repeat(75));
console.log("\nPurpose: This pattern should ONLY capture blood type in medical contexts");
console.log("It should NOT match personality types, learning styles, or classifications.\n");

console.log("Test Cases:");
console.log("-".repeat(75));

testCases.forEach((testCase, index) => {
  const status = testCase.shouldDetect ? "✓ SHOULD DETECT" : "✗ SHOULD SUPPRESS";
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log(`   Pattern: ${testCase.pattern}`);
  console.log(`   Expected: ${status}`);
  console.log(`   Reason: ${testCase.expectedBehavior}`);
  console.log(`   Text: "${testCase.text.substring(0, 60)}..."`);
});

console.log("\n" + "=".repeat(75));
console.log("\nKey Changes in Implementation:");
console.log("-".repeat(75));
console.log(`
1. Added contextFilter function to blood_type_mention pattern

2. Medical Context Markers (ALLOW):
   - Keywords: blood type, RH factor, transfusion, donation, medical, doctor, hospital
   - Patterns: "my blood type is", "blood type A+", etc.

3. Non-Medical Context Markers (SUPPRESS):
   - Personality: personality, framework, behavior, trait, psychological, psychology
   - Learning: learning style, communication style, work style
   - Classification: model, theory, system, category, typology
   - Comparison: vs, versus, compared to, more relaxed
   - Similar types: introvert, extrovert, driver, amiable, analytical

4. Logic:
   - IF (NO medical markers) OR (has non-medical markers) → SUPPRESS
   - IF (has medical markers) AND (NO non-medical markers) → DETECT
`);

console.log("=".repeat(75));
console.log("\nExpected Results After Fix:");
console.log("-".repeat(75));
console.log(`
Personality Context:
  "Type A personality versus more relaxed types"
  Result: ✗ SUPPRESSED (not medical)

Psychology Paper:
  "Type A behavior is characterized by competitiveness"
  Result: ✗ SUPPRESSED (not medical)

Blood Donation:
  "My blood type is Type A and I'm eligible to donate"
  Result: ✓ DETECTED (medical context)

Medical Test:
  "Blood test results show blood type A positive"
  Result: ✓ DETECTED (medical context)
`);
console.log("=".repeat(75));
