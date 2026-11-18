const TrustPrompt = require('./scanner');

// Test the shipping note scenario with false positives
const testCases = [
  {
    name: "Shipping Note - All False Positives",
    text: "ORDER shipped on 03-14-1998 to warehouse. Parcel has 5 KG of TYPE O RICE plus loan form",
    expectedFindings: [],
    expectedSuppressed: [
      { pattern: "birthday_date", value: "03-14-1998", reason: "shipping/order date, not personal birth date" },
      { pattern: "blood_type_mention", value: "TYPE O", reason: "rice classification, not blood type" },
      { pattern: "weight_mention", value: "5 KG", reason: "parcel weight, not personal weight" }
    ]
  },
  {
    name: "Order Date vs Birthday",
    text: "Your order from 12-25-1990 has been processed",
    expectedFindings: [],
    expectedSuppressed: [
      { pattern: "birthday_date", value: "12-25-1990", reason: "order reference date" }
    ]
  },
  {
    name: "Shipping Cost Estimate",
    text: "Parcel weighs 2.5 kg. Estimated shipping cost: $15",
    expectedFindings: [],
    expectedSuppressed: [
      { pattern: "weight_mention", value: "2.5 kg", reason: "parcel weight in shipping context" }
    ]
  },
  {
    name: "Food Item Shipment",
    text: "Package contains 500g of TYPE A RICE and 250g of flour",
    expectedFindings: [],
    expectedSuppressed: [
      { pattern: "blood_type_mention", value: "TYPE A", reason: "rice variety, not blood type" },
      { pattern: "weight_mention", value: "500g", reason: "food ingredient weight" },
      { pattern: "weight_mention", value: "250g", reason: "food ingredient weight" }
    ]
  },
  {
    name: "Valid Personal Age in Shipping Context",
    text: "I am 34 years old and need this shipped to my address by 03-14-2025",
    expectedFindings: [
      { pattern: "age_value", value: "34 years old", reason: "personal age disclosure" }
    ],
    expectedSuppressed: [
      { pattern: "birthday_date", value: "03-14-2025", reason: "future shipping deadline, not birth date" }
    ]
  },
  {
    name: "Medical Record with Order",
    text: "Patient blood type O positive, order shipped 01-15-1998",
    expectedFindings: [
      { pattern: "blood_type_mention", value: "O positive", reason: "personal medical record" }
    ],
    expectedSuppressed: [
      { pattern: "birthday_date", value: "01-15-1998", reason: "order date, not personal birth date" }
    ]
  }
];

async function runTests() {
  console.log("=" . repeat(80));
  console.log("Testing Shipping Note False Positives");
  console.log("=" . repeat(80));
  console.log();

  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    console.log("-".repeat(70));
    console.log(`Input: "${testCase.text}"`);
    console.log();

    const result = TrustPrompt.scan(testCase.text);
    
    console.log(`Results (${result.findings.length} findings):`);
    if (result.findings.length === 0) {
      console.log("  (no findings)");
    } else {
      result.findings.forEach(f => {
        console.log(`  • ${f.type}: "${f.value}" (risk: ${f.risk})`);
      });
    }
    
    console.log();
    console.log("Expected Findings:");
    if (testCase.expectedFindings.length === 0) {
      console.log("  (none)");
    } else {
      testCase.expectedFindings.forEach(e => {
        console.log(`  • ${e.pattern}: "${e.value}" — ${e.reason}`);
      });
    }
    
    console.log();
    console.log("Expected Suppressions:");
    if (testCase.expectedSuppressed.length === 0) {
      console.log("  (none)");
    } else {
      testCase.expectedSuppressed.forEach(e => {
        console.log(`  • ${e.pattern}: "${e.value}" — ${e.reason}`);
      });
    }
    
    console.log();
    console.log("=" . repeat(70));
    console.log();
  }
}

runTests().catch(console.error);
