#!/usr/bin/env node
/**
 * Test: Debug SSS detection flow
 * 
 * Tests each step:
 * 1. Pattern matching
 * 2. Validation
 * 3. Credential detection
 * 4. Extraction
 */

// Step 1: Test the regex pattern matches SSS
console.log("=".repeat(70));
console.log("STEP 1: Regex Pattern Matching");
console.log("=".repeat(70));

const sssPattern = /\d{2}-\d{7}-\d/g;
const codeBlock = `const sss = "04-1234567-8"; // employee record`;

sssPattern.lastIndex = 0;
const match = sssPattern.exec(codeBlock);
console.log(`Code: ${codeBlock}`);
console.log(`Pattern: /\\d{2}-\\d{7}-\\d/g`);
console.log(`Match: ${match ? match[0] : "NO MATCH"}`);

if (match) {
  console.log("✓ Regex matches SSS\n");
} else {
  console.log("✗ REGEX FAILED TO MATCH\n");
  process.exit(1);
}

// Step 2: Test validation
console.log("STEP 2: Structural Validation");
console.log("-".repeat(70));

function normalizePHID(value, stripChars = " \\-\\.") {
  if (!value || typeof value !== "string") return "";
  const pattern = new RegExp(`[${stripChars}]`, "g");
  return value.replace(pattern, "");
}

function structuralValidatePHID_SSS(raw) {
  if (!raw || typeof raw !== "string") return false;
  const normalized = normalizePHID(raw);
  if (!/^\d{10}$/.test(normalized)) return false;
  
  const branchFirst = normalized.charCodeAt(0) - 48;
  const branchSecond = normalized.charCodeAt(1) - 48;
  const branchCode = branchFirst * 10 + branchSecond;
  
  if (branchCode < 1 || branchCode > 59) return false;
  return true;
}

const isValid = structuralValidatePHID_SSS(match[0]);
console.log(`Validation result: ${isValid ? "✓ VALID" : "✗ INVALID"}`);

if (!isValid) {
  console.log("✗ VALIDATION FAILED\n");
  process.exit(1);
}

// Step 3: Test credential indicator detection
console.log("\n" + "STEP 3: Credential Indicator Scoring");
console.log("-".repeat(70));

const CREDENTIAL_PATTERNS = {
  ph_ids: [
    /\d{2}-\d{7}-\d/g,
    /\d{4}\s\d{7}\s\d/g,
    /\d{4}-\d{4}-\d{4}-\d{4}/g,
    /\d{3}-\d{3}-\d{3}/g,
    /\d{1,3}-\d{2}-\d{6,7}/g
  ],
  api_keys: [
    /sk-[A-Za-z0-9]{20,}/g
  ]
};

function countPatternMatches(text, patterns) {
  if (!Array.isArray(patterns)) return 0;
  let count = 0;
  for (const pattern of patterns) {
    if (pattern instanceof RegExp) {
      const matches = text.match(pattern);
      if (matches) count += matches.length;
    }
  }
  return count;
}

function countCredentialMatches(text, credentialPatterns) {
  if (!text || typeof credentialPatterns !== 'object') {
    return { totalCount: 0, byCategory: {} };
  }
  
  const byCategory = {};
  let totalCount = 0;
  
  for (const [category, patterns] of Object.entries(credentialPatterns)) {
    if (Array.isArray(patterns) && patterns.length > 0 && typeof patterns[0] === 'string') {
      continue;
    }
    
    if (Array.isArray(patterns)) {
      const count = countPatternMatches(text, patterns);
      byCategory[category] = count;
      totalCount += count;
    }
  }
  
  return { totalCount, byCategory };
}

function computeCredentialIndicators(text) {
  if (!text || !text.trim()) {
    return {
      signal: "credential_indicators",
      value: 0.0,
      components: {
        credentialCount: 0,
        patterns: 0,
        byCategory: {}
      }
    };
  }
  
  if (!CREDENTIAL_PATTERNS || typeof CREDENTIAL_PATTERNS !== 'object') {
    return {
      signal: "credential_indicators",
      value: 0.0,
      components: {
        credentialCount: 0,
        patterns: 0,
        byCategory: {}
      }
    };
  }
  
  const matches = countCredentialMatches(text, CREDENTIAL_PATTERNS);
  const credentialCount = matches.totalCount;
  const byCategory = matches.byCategory;
  
  const credentialSignal = Math.min(1.0, credentialCount * 0.33);
  const patternCount = Object.keys(CREDENTIAL_PATTERNS).length;
  
  return {
    signal: "credential_indicators",
    value: credentialSignal,
    components: {
      credentialCount,
      patterns: patternCount,
      byCategory
    }
  };
}

const credResult = computeCredentialIndicators(codeBlock);
console.log(`Text to analyze: ${codeBlock}`);
console.log(`Credential count: ${credResult.components.credentialCount}`);
console.log(`By category: ${JSON.stringify(credResult.components.byCategory)}`);
console.log(`Signal value: ${credResult.value}`);

if (credResult.components.credentialCount > 0) {
  console.log("✓ Credentials detected\n");
} else {
  console.log("✗ NO CREDENTIALS DETECTED\n");
  process.exit(1);
}

// Step 4: Test credential extraction
console.log("STEP 4: Credential Extraction");
console.log("-".repeat(70));

function extractCredentialsFromCode(codeBlock, sourceContext = "source_code") {
  if (!codeBlock || !CREDENTIAL_PATTERNS) {
    return [];
  }

  const findings = [];
  const processedMatches = new Set();

  for (const [category, patterns] of Object.entries(CREDENTIAL_PATTERNS)) {
    if (Array.isArray(patterns) && patterns.length > 0 && typeof patterns[0] === 'string') {
      continue;
    }

    if (Array.isArray(patterns)) {
      for (const pattern of patterns) {
        if (!(pattern instanceof RegExp)) continue;

        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        while ((match = regex.exec(codeBlock)) !== null) {
          const matchText = match[0];
          const matchKey = `${category}::${matchText}`;

          if (processedMatches.has(matchKey)) {
            continue;
          }
          processedMatches.add(matchKey);

          let patternId = category;
          let label = category;

          if (category === 'ph_ids') {
            if (/\d{2}-\d{7}-\d/.test(matchText)) {
              patternId = 'ph_id_sss';
              label = 'SSS Number (Social Security System) [Source Code]';
            }
          }

          const finding = {
            patternId,
            label,
            risk: 'high',
            rawMatch: matchText,
            safeVersion: '[CREDENTIAL REMOVED]',
            source: 'credential_extraction_from_code'
          };

          console.log(
            `Extracted credential: patternId=${finding.patternId}, match="${matchText}"`
          );
          findings.push(finding);
        }
      }
    }
  }

  return findings;
}

const extracted = extractCredentialsFromCode(codeBlock);
console.log(`Findings extracted: ${extracted.length}`);

for (const finding of extracted) {
  console.log(`  - ${finding.patternId}: ${finding.rawMatch}`);
}

if (extracted.length > 0) {
  console.log("\n✓ Credentials successfully extracted\n");
} else {
  console.log("\n✗ NO CREDENTIALS EXTRACTED\n");
  process.exit(1);
}

// Summary
console.log("=".repeat(70));
console.log("FLOW COMPLETE");
console.log("=".repeat(70));
console.log(`✓ All steps passed:`);
console.log(`  1. Regex matched: 04-1234567-8`);
console.log(`  2. Validation passed: true`);
console.log(`  3. Credential detection: ${credResult.components.credentialCount} credential(s) found`);
console.log(`  4. Extraction: ${extracted.length} finding(s) created`);
console.log("\n");
