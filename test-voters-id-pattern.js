// Quick test to verify the voter's ID pattern works
const regex = /\b\d{4}-\d{2}-\d{8}-[A-Z]\b/g;

const testCases = [
  { value: "1234-56-78901234-M", shouldMatch: true, label: "Valid voter's ID" },
  { value: "9999-99-99999999-F", shouldMatch: true, label: "Valid voter's ID 2" },
  { value: "0000-00-00000000-A", shouldMatch: true, label: "Valid voter's ID 3" },
  { value: "1234-56-78901234-m", shouldMatch: false, label: "Lowercase letter (should not match)" },
  { value: "1234-56-7890123-M", shouldMatch: false, label: "Only 7 digits in middle section" },
  { value: "1234-56-789012345-M", shouldMatch: false, label: "9 digits in middle section" },
  { value: "P7432795C", shouldMatch: false, label: "Philippine Passport (should NOT match)" },
];

console.log("Testing Voter's ID Pattern\n");
console.log("Regex:", regex.source);
console.log("-----------------------------------\n");

testCases.forEach(test => {
  const matches = test.value.match(regex);
  const matched = matches ? true : false;
  const status = matched === test.shouldMatch ? "✓ PASS" : "✗ FAIL";
  console.log(`${status} | "${test.value}"`);
  console.log(`       Label: ${test.label}`);
  console.log(`       Expected: ${test.shouldMatch ? "match" : "no match"} | Got: ${matched ? "match" : "no match"}`);
  if (matches) console.log(`       Matched: ${matches.join(", ")}`);
  console.log("");
});
