// Test UMID/SSS deduplication logic

console.log("=".repeat(60));
console.log("TEST 1: UMID only - should detect UMID, not SSS");
console.log("=".repeat(60));

let text = "4310-5002134-6";

const umidRegex = /\d{4}-\d{7}-\d/g;
const sssRegex = /\d{2}-\d{7}-\d/g;

console.log("Testing:", text);
console.log("---");

const umidMatches = [...text.matchAll(umidRegex)];
const sssMatches = [...text.matchAll(sssRegex)];

console.log("UMID matches:", umidMatches.map(m => m[0]));
console.log("SSS matches:", sssMatches.map(m => m[0]));

// Simulate the deduplication logic
const pathAFindings = umidMatches.map(m => ({
  rawMatch: m[0].trim(),
  patternId: 'ph_id_umid',
  risk: 'high'
}));

const pathBFindings = [];
const pathCFindings = [];
const sourceCode = [];

const allFindings = [...pathAFindings, ...pathBFindings, ...pathCFindings, ...sourceCode];

// Add SSS findings
for (const m of sssMatches) {
  allFindings.push({
    rawMatch: m[0].trim(),
    patternId: 'ph_id_sss',
    risk: 'high'
  });
}

console.log("\nAll findings before dedup:");
allFindings.forEach(f => console.log(`  ${f.patternId}: ${f.rawMatch}`));

// First pass: collect all findings by rawMatch
const seen = new Map();
for (const f of allFindings) {
  const key = f.rawMatch.trim().toLowerCase();
  const ex = seen.get(key);
  if (!ex) {
    seen.set(key, f);
    console.log(`\nAdding to seen: "${key}" → ${f.patternId}`);
  } else {
    console.log(`\nSkipping duplicate: "${key}" (already have ${ex.patternId})`);
  }
}

// Second pass: Remove SSS findings that are substrings of UMID findings
const result = [...seen.values()];
console.log("\nBefore filtering SSS:");
result.forEach(f => console.log(`  ${f.patternId}: ${f.rawMatch}`));

const filtered = result.filter(f => {
  if (f.patternId === 'ph_id_sss') {
    const sssMatch = f.rawMatch.trim();
    const hasUmidParent = result.some(other => 
      other.patternId === 'ph_id_umid' && 
      other.rawMatch.includes(sssMatch)
    );
    console.log(`\nChecking SSS "${sssMatch}":`);
    console.log(`  hasUmidParent = ${hasUmidParent}`);
    if (hasUmidParent) {
      console.log(`  → FILTERING OUT (is substring of UMID)`);
      return false;
    }
  }
  return true;
});

console.log("\nFinal filtered results:");
filtered.forEach(f => console.log(`  ${f.patternId}: ${f.rawMatch}`));

// ─── TEST 2: Standalone SSS ───────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
console.log("TEST 2: Standalone SSS - should detect SSS only");
console.log("=".repeat(60));

text = "31-0500213-4";

const umidMatches2 = [...text.matchAll(umidRegex)];
const sssMatches2 = [...text.matchAll(sssRegex)];

console.log("Testing:", text);
console.log("---");
console.log("UMID matches:", umidMatches2.map(m => m[0]));
console.log("SSS matches:", sssMatches2.map(m => m[0]));

const pathAFindings2 = umidMatches2.map(m => ({
  rawMatch: m[0].trim(),
  patternId: 'ph_id_umid',
  risk: 'high'
}));

const allFindings2 = [...pathAFindings2, ...pathBFindings, ...pathCFindings, ...sourceCode];

for (const m of sssMatches2) {
  allFindings2.push({
    rawMatch: m[0].trim(),
    patternId: 'ph_id_sss',
    risk: 'high'
  });
}

console.log("\nAll findings before dedup:");
allFindings2.forEach(f => console.log(`  ${f.patternId}: ${f.rawMatch}`));

const seen2 = new Map();
for (const f of allFindings2) {
  const key = f.rawMatch.trim().toLowerCase();
  const ex = seen2.get(key);
  if (!ex) {
    seen2.set(key, f);
  }
}

const result2 = [...seen2.values()];
const filtered2 = result2.filter(f => {
  if (f.patternId === 'ph_id_sss') {
    const sssMatch = f.rawMatch.trim();
    const hasUmidParent = result2.some(other => 
      other.patternId === 'ph_id_umid' && 
      other.rawMatch.includes(sssMatch)
    );
    if (hasUmidParent) {
      return false;
    }
  }
  return true;
});

console.log("\nFinal filtered results:");
filtered2.forEach(f => console.log(`  ${f.patternId}: ${f.rawMatch}`));
