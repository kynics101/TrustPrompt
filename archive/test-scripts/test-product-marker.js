// Test product classification markers

const productMarker = /\btype\s+[abo]\s+(?:rice|product|food|grain|item)/i;

const testStrings = [
  "TYPE O RICE",
  "type o rice",
  "Type O rice",
  " TYPE O RICE ",
  "of TYPE O RICE plus",
  "has 5 KG of TYPE O RICE plus loan form",
];

console.log("Testing product marker pattern:");
console.log("Pattern:", productMarker);
console.log();

for (const str of testStrings) {
  const match = productMarker.test(str);
  console.log(`"${str}" → ${match ? "MATCHES" : "NO MATCH"}`);
}
