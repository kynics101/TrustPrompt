/**
 * Test: Weight and Height Mention - ID/Document Context Only
 * 
 * These patterns should ONLY capture measurements in ID/personal document contexts.
 * All general measurements should be suppressed.
 */

const testCases = [
  // ═══════════════════════════════════════════════════════════════════════════
  // SHOULD BE SUPPRESSED (NOT personal information from ID)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    name: "Shipping Package - Box Weight",
    text: "I'm mailing a care package... The box weighs around 3 kg",
    pattern: "weight_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Not in ID context"
  },
  
  {
    name: "Shipping Package - Item Weight",
    text: "...one of the items inside is a 500 g bag of dried mangoes",
    pattern: "weight_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Food item weight, not personal"
  },
  
  {
    name: "Furniture - Ceiling Height",
    text: "The ceiling is about 2.4 m high",
    pattern: "height_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Building dimension"
  },
  
  {
    name: "Furniture - Shelf Height",
    text: "the shelf I'm eyeing is listed as 180 cm",
    pattern: "height_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Furniture dimension"
  },
  
  {
    name: "Recipe Ingredient",
    text: "This recipe includes 250 g of flour for the cake",
    pattern: "weight_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Food ingredient, not personal"
  },
  
  {
    name: "General Measurement",
    text: "The table weighs about 50 kg",
    pattern: "weight_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Product/furniture weight"
  },
  
  {
    name: "Room Dimension",
    text: "This room is 4 m high and fits nicely",
    pattern: "height_mention",
    shouldDetect: false,
    expectedBehavior: "SUPPRESSED - Room dimension"
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SHOULD BE DETECTED (personal information from ID/medical)
  // ═══════════════════════════════════════════════════════════════════════════
  
  {
    name: "Driver's License - Height",
    text: "My driver's license says my height is 170 cm",
    pattern: "height_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - ID document context"
  },
  
  {
    name: "Driver's License - Weight",
    text: "According to my driver's license, my weight is 70 kg",
    pattern: "weight_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - ID/medical context"
  },
  
  {
    name: "Personal Profile - Height",
    text: "My height is 5'10\" tall",
    pattern: "height_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Direct personal attribute"
  },
  
  {
    name: "Medical Record - Weight",
    text: "Weight: 75 kg (from medical record)",
    pattern: "weight_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Medical document context"
  },
  
  {
    name: "Personal Information Form",
    text: "Please fill in your height 175 cm and weight 68 kg in the form",
    pattern: "weight_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Personal information form"
  },
  
  {
    name: "Passport Application",
    text: "Passport height: 168 cm weight: 62 kg",
    pattern: "weight_mention",
    shouldDetect: true,
    expectedBehavior: "DETECTED - Passport/ID context"
  },
];

console.log("Weight & Height Mention Context Filtering - ID-ONLY Detection");
console.log("=".repeat(75));
console.log("\nPurpose: These patterns should ONLY capture personal measurements from IDs");
console.log("They should NOT capture furniture, shipping, or food measurements.\n");

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
1. Added contextFilter functions to patterns.js
   - height_mention: Only matches in ID/document contexts
   - weight_mention: Only matches in ID/document contexts

2. ID Context Markers (ALLOW):
   - Keywords: id, driver's license, passport, identification, medical, health, record
   - Attributes: physical characteristic, personal information, biometric

3. Non-ID Context Markers (SUPPRESS):
   For height_mention:
     - Furniture: ceiling, shelf, furniture, room, building, wall, door, etc.
     - Interior design: rearrange, redesign, layout, fit
   
   For weight_mention:
     - Shipping: courier, parcel, cargo, delivery, cost, estimate
     - Furniture: box, package, product
     - Food: recipe, ingredient, flour, sugar, mangoes, dried fruits, bag

4. Logic:
   - IF has ID context AND no non-ID context → DETECT (personal info)
   - IF no ID context OR has non-ID context → SUPPRESS (not personal info)
`);

console.log("=".repeat(75));
console.log("\nExpected Results After Fix:");
console.log("-".repeat(75));
console.log(`
Shipping Scenario:
  "box weighs 3 kg, 500 g bag of mangoes"
  Result: ✗ SUPPRESSED (not in ID context)

Furniture Scenario:
  "ceiling is 2.4 m high, shelf is 180 cm"
  Result: ✗ SUPPRESSED (not in ID context)

Personal ID Scenario:
  "My driver's license says height 170 cm"
  Result: ✓ DETECTED (ID context present)

Medical Scenario:
  "Medical record: weight 70 kg"
  Result: ✓ DETECTED (medical context present)
`);
console.log("=".repeat(75));
