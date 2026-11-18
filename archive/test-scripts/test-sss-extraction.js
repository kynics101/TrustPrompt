#!/usr/bin/env node
/**
 * Test: Credential Extraction from Code Blocks
 * 
 * Purpose: Verify that credentials in code are extracted as separate findings.
 * This test uses a mock CREDENTIAL_PATTERNS to avoid dependency on TrustNormalizer.
 */

// Define test credential patterns
const CREDENTIAL_PATTERNS = {
  ph_ids: [
    /\d{2}-\d{7}-\d/g,              // SSS
    /\d{4}\s\d{7}\s\d/g,            // UMID
    /\d{4}-\d{4}-\d{4}-\d{4}/g,     // PhilID
    /\d{3}-\d{3}-\d{3}/g,           // TIN
    /\d{1,3}-\d{2}-\d{6,7}/g        // Driver's License
  ],
  api_keys: [
    /sk-[A-Za-z0-9]{20,}/g,
    /(?:api[_-]?key|apikey)\s*[:=]\s*["']?([A-Za-z0-9\-_+\/]{10,})["']?/gi
  ],
  jwt_tokens: [
    /eyJ[A-Za-z0-9\-_]{7,}\.eyJ[A-Za-z0-9\-_]{7,}\.[A-Za-z0-9\-_]{7,}/g
  ],
  connection_strings: [
    /mongodb:\/\/[^\s]+/gi,
    /postgresql:\/\/[^\s]+/gi
  ],
  // Skip string arrays
  credential_variable_names: [
    "api_key", "sss", "password", "token"
  ]
};

// Mock credential extraction function
function extractCredentialsFromCode(codeBlock, sourceContext = "source_code") {
  if (!codeBlock || !CREDENTIAL_PATTERNS) {
    return [];
  }

  const findings = [];
  const processedMatches = new Set();

  for (const [category, patterns] of Object.entries(CREDENTIAL_PATTERNS)) {
    // Skip string arrays
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
            } else if (/\d{4}\s\d{7}\s\d/.test(matchText)) {
              patternId = 'ph_id_umid';
              label = 'UMID (Unified Multi-Purpose ID) [Source Code]';
            } else if (/\d{4}-\d{4}-\d{4}-\d{4}/.test(matchText)) {
              patternId = 'ph_id_philid';
              label = 'PhilID (National ID) [Source Code]';
            } else if (/\d{3}-\d{3}-\d{3}/.test(matchText)) {
              patternId = 'ph_id_tin';
              label = 'TIN (Tax ID) [Source Code]';
            } else if (/\d{1,3}-\d{2}-\d{6,7}/.test(matchText)) {
              patternId = 'ph_id_drivers_license';
              label = "Driver's License [Source Code]";
            }
          }

          const finding = {
            patternId,
            label,
            risk: 'high',
            rawMatch: matchText,
            safeVersion: '[CREDENTIAL REMOVED]',
            validated: true,
            source: 'credential_extraction_from_code',
            elevated: true,
            elevation_reason: 'credential_in_code',
            credentialCategory: category,
            sourceContext
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

const codeBlock = `const userData = {
  sss: "04-1234567-8",
  umid: "1234 5678901 2",
  tin: "123-456-789"
};`;

console.log("\n" + "=".repeat(70));
console.log("TEST: Credential Extraction from Code Blocks");
console.log("=".repeat(70));

console.log("\nCode Block:");
console.log(codeBlock);

console.log("\n" + "-".repeat(70));
console.log("Extracting credentials...\n");

const findings = extractCredentialsFromCode(codeBlock);

console.log("-".repeat(70));
console.log(`\nTotal Credentials Extracted: ${findings.length}`);

if (findings.length > 0) {
  console.log("\nExtracted Findings:");
  findings.forEach((finding, index) => {
    console.log(`\n${index + 1}. ${finding.patternId}`);
    console.log(`   Label: ${finding.label}`);
    console.log(`   Match: ${finding.rawMatch}`);
    console.log(`   Risk: ${finding.risk}`);
  });
}

// Verify SSS was extracted
const sssFindings = findings.filter(f => f.patternId === 'ph_id_sss');
const allPhFindings = findings.filter(f => f.patternId.startsWith('ph_id_'));

console.log("\n" + "=".repeat(70));
console.log("Summary:");
console.log(`- Total findings: ${findings.length}`);
console.log(`- SSS findings: ${sssFindings.length}`);
console.log(`- Philippine ID findings: ${allPhFindings.length}`);

if (sssFindings.length > 0) {
  console.log("\n✓ SUCCESS: SSS number WAS extracted as a separate finding!");
  console.log(`  SSS: ${sssFindings[0].rawMatch}`);
  console.log(`  Label: ${sssFindings[0].label}`);
} else {
  console.log("\n✗ FAILED: SSS number was NOT extracted");
}

console.log("=".repeat(70) + "\n");

process.exit(sssFindings.length > 0 ? 0 : 1);
