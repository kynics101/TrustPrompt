// test-organization-csv.js
// Test suite for organization CSV loader and enhanced detector
//
// Run in Node.js:
//   node test-organization-csv.js
//
// Or in browser console after loading the extension

/* global TrustOrganizationLoader, TrustOrganizationDetectorEnhanced */

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE: Organization CSV Integration
// ══════════════════════════════════════════════════════════════════════════════

const testResults = {
  passed: 0,
  failed: 0,
  errors: []
};

// ── Test utility ──────────────────────────────────────────────────────────
function assert(condition, message) {
  if (!condition) {
    testResults.failed++;
    testResults.errors.push(`✗ ${message}`);
    console.error(`✗ FAIL: ${message}`);
  } else {
    testResults.passed++;
    console.log(`✓ PASS: ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  assert(actual === expected, `${message} (expected: ${expected}, got: ${actual})`);
}

function assertIncludes(array, value, message) {
  assert(array.includes(value), `${message} (array doesn't include ${value})`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 1: Organization Loader
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('TEST SUITE 1: Organization Loader (organization-loader.js)');
console.log('='.repeat(80) + '\n');

async function testOrganizationLoader() {
  try {
    const loader = TrustOrganizationLoader.getInstance();
    console.log('Initializing loader...');
    const loaded = await loader.load();

    if (!loaded) {
      console.error('Failed to load CSV. Skipping loader tests.');
      return;
    }

    const stats = loader.getStats();
    console.log(`CSV loaded: ${stats.totalOrganizations} organizations`);

    // Test 1.1: Initialization
    assert(stats.initialized, 'Loader initialized');
    assert(stats.totalOrganizations > 1000, 'CSV has reasonable number of organizations');

    // Test 1.2: Exact match
    assert(loader.isKnownOrg('Apple Inc.'), 'Exact match: Apple Inc.');
    assert(loader.isKnownOrg('Accenture'), 'Exact match: Accenture');
    assert(!loader.isKnownOrg('XYZ Corporation That Does Not Exist'), 'Non-existent org returns false');

    // Test 1.3: Case-insensitive matching
    assert(loader.isKnownOrg('apple inc.'), 'Case-insensitive: lowercase');
    assert(loader.isKnownOrg('APPLE INC.'), 'Case-insensitive: uppercase');
    assert(loader.isKnownOrg('Apple Inc.'), 'Case-insensitive: mixed case');

    // Test 1.4: Fuzzy matching
    const fuzzyMatch = loader.findFuzzyMatch('Appl Inc');
    assert(fuzzyMatch !== null, 'Fuzzy match: returns result');
    assert(fuzzyMatch.distance <= 2, 'Fuzzy match: distance <= 2');
    console.log(`  - Fuzzy match: "Appl Inc" → "${fuzzyMatch.org}" (distance: ${fuzzyMatch.distance})`);

    // Test 1.5: Prefix search
    const prefixResults = loader.findByPrefix('Apple', 10);
    assert(prefixResults.length > 0, 'Prefix search: finds results for "Apple"');
    assertIncludes(prefixResults, 'Apple Inc.', 'Prefix search: includes "Apple Inc."');
    console.log(`  - Found ${prefixResults.length} orgs starting with "Apple"`);

    // Test 1.6: Abbreviations
    const abbrevs = loader.getAbbreviations('Apple Inc.');
    assert(abbrevs.length > 0, 'Abbreviations: extracted for Apple Inc.');
    assertIncludes(abbrevs, 'Apple', 'Abbreviations: includes "Apple"');
    console.log(`  - Abbreviations for "Apple Inc.": ${abbrevs.join(', ')}`);

    // Test 1.7: Looks like org
    assert(loader.looksLikeOrg('Apple'), 'looksLikeOrg: true for "Apple"');
    assert(loader.looksLikeOrg('AAPL'), 'looksLikeOrg: true for "AAPL" (abbreviation)');
    assert(!loader.looksLikeOrg('xyz'), 'looksLikeOrg: false for non-org');

    // Test 1.8: Edge cases
    assert(!loader.isKnownOrg(''), 'Empty string returns false');
    assert(!loader.isKnownOrg(null), 'Null returns false');
    assert(!loader.isKnownOrg('a'), 'Single character returns false (minOrgLength)');

  } catch (error) {
    console.error('ERROR in loader tests:', error.message);
    testResults.errors.push(`Loader test error: ${error.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 2: Organization Detector Enhanced
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('TEST SUITE 2: Organization Detector Enhanced');
console.log('='.repeat(80) + '\n');

async function testOrganizationDetectorEnhanced() {
  try {
    const detector = TrustOrganizationDetectorEnhanced.getInstance();
    console.log('Initializing detector...');
    const initialized = await detector.initialize();

    if (!initialized) {
      console.error('Failed to initialize detector. Skipping detector tests.');
      return;
    }

    // Test 2.1: Validation - Exact match
    const exactMatch = detector.validateOrganization('Apple Inc.');
    assert(exactMatch.isKnown, 'Validation: exact match is known');
    assertEquals(exactMatch.confidence, 1.0, 'Validation: exact match confidence is 1.0');
    assert(exactMatch.reason === 'exact_match', 'Validation: reason is "exact_match"');

    // Test 2.2: Validation - Fuzzy match
    const fuzzyMatch = detector.validateOrganization('Appl Inc');
    assert(fuzzyMatch.isKnown, 'Validation: fuzzy match is known');
    assert(fuzzyMatch.confidence >= 0.7, 'Validation: fuzzy match confidence >= 0.7');
    assert(fuzzyMatch.reason === 'fuzzy_match', 'Validation: reason is "fuzzy_match"');

    // Test 2.3: Validation - Unknown org
    const unknown = detector.validateOrganization('XYZ Corp That Definitely Does Not Exist 12345');
    assert(!unknown.isKnown, 'Validation: unknown org is not known');
    assertEquals(unknown.confidence, 0, 'Validation: unknown org confidence is 0');

    // Test 2.4: Contextual extraction - "works at"
    const textWorksAt = 'I work for Apple Inc. and she works at Microsoft.';
    const findingsWorksAt = detector.extractContextualOrgs(textWorksAt);
    assert(findingsWorksAt.length > 0, 'Extraction: "works at" pattern finds orgs');
    console.log(`  - Found ${findingsWorksAt.length} orgs in "works at" text`);

    // Test 2.5: Contextual extraction - Multiple patterns
    const textMulti = [
      'I am employed at Accenture.',
      'I worked for Google.',
      'I am a member of the Red Cross.',
      'She is part of Salesforce.'
    ].join(' ');

    const findingsMulti = detector.extractContextualOrgs(textMulti);
    assert(findingsMulti.length >= 2, 'Extraction: finds multiple org patterns');
    console.log(`  - Found ${findingsMulti.length} orgs across multiple patterns`);

    // Test 2.6: Confidence scoring
    const highConfidence = findingsMulti.filter(f => f.confidence >= 0.75);
    assert(highConfidence.length > 0, 'Filtering: finds high-confidence matches');
    console.log(`  - ${highConfidence.length}/${findingsMulti.length} are high-confidence`);

    // Test 2.7: Deduplication
    const textDuplicate = 'I work at Apple. My colleague also works at Apple Inc. Our company is Apple.';
    const findingsDuplicate = detector.extractContextualOrgs(textDuplicate);
    const filtered = detector.filterFindings(findingsDuplicate);
    assert(filtered.length <= findingsDuplicate.length, 'Filtering: deduplicates findings');
    console.log(`  - Deduplicated ${findingsDuplicate.length} → ${filtered.length} findings`);

    // Test 2.8: Contextual extraction - Edge cases
    const textEmpty = 'No organizations mentioned here. Just plain text.';
    const findingsEmpty = detector.extractContextualOrgs(textEmpty);
    console.log(`  - No orgs text: found ${findingsEmpty.length} (expected 0)`);

    // Test 2.9: Configuration update
    detector.updateConfig({ minOrgLength: 10 });
    const statsAfter = detector.getStats();
    assertEquals(statsAfter.minOrgLength, 10, 'Configuration: minOrgLength updated');
    detector.updateConfig({ minOrgLength: 3 });  // Reset

    // Test 2.10: Statistics
    const stats = detector.getStats();
    assert(stats.loaderStats.initialized, 'Stats: loader is initialized');
    console.log(`  - Total orgs available: ${stats.loaderStats.totalOrganizations}`);

  } catch (error) {
    console.error('ERROR in detector tests:', error.message);
    testResults.errors.push(`Detector test error: ${error.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST SUITE 3: Integration & Real-World Scenarios
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n' + '='.repeat(80));
console.log('TEST SUITE 3: Integration & Real-World Scenarios');
console.log('='.repeat(80) + '\n');

async function testIntegrationScenarios() {
  try {
    const detector = TrustOrganizationDetectorEnhanced.getInstance();
    const loader = TrustOrganizationLoader.getInstance();

    // Test 3.1: User-typed org name with typos
    console.log('\nScenario 1: User types org name with typo');
    const typoText = 'I worked at Acccenture for 5 years.';
    const typoFindings = detector.extractContextualOrgs(typoText);
    console.log(`  - Input: "${typoText}"`);
    console.log(`  - Found: ${typoFindings.map(f => f.org).join(', ')}`);

    // Test 3.2: Mix of known and unknown orgs
    console.log('\nScenario 2: Mix of known and unknown organizations');
    const mixedText = 'I worked at Apple, then moved to Unknown Corp, now at Google.';
    const mixedFindings = detector.extractContextualOrgs(mixedText);
    const knownMixed = mixedFindings.filter(f => f.isKnown);
    console.log(`  - Input: "${mixedText}"`);
    console.log(`  - Total found: ${mixedFindings.length}, Known: ${knownMixed.length}`);

    // Test 3.3: Organization with abbreviation
    console.log('\nScenario 3: Detecting abbreviations');
    const abbrevText = 'I work at AAPL (Apple) in California.';
    const abbrevFindings = detector.extractContextualOrgs(abbrevText);
    console.log(`  - Input: "${abbrevText}"`);
    console.log(`  - Found orgs: ${abbrevFindings.map(f => f.org).join(', ')}`);

    // Test 3.4: Complex multi-org text (real PII exposure scenario)
    console.log('\nScenario 4: Real PII exposure with org context');
    const realText = [
      'Hi, my name is Maria Santos.',
      'I work at Accenture in Manila as a Senior Analyst.',
      'I report to John Smith who is the head of Digital Services.',
      'Our team is part of the Philippines Technology Centre.',
      'Before Accenture, I was employed at Microsoft for 3 years.',
      'I hold a degree from University of Santo Tomas.'
    ].join(' ');

    const realFindings = detector.extractContextualOrgs(realText);
    console.log(`  - Found ${realFindings.length} organizations:`);
    for (const f of realFindings) {
      const status = f.isKnown ? '✓' : '✗';
      console.log(`    ${status} ${f.org} (confidence: ${f.confidence.toFixed(2)})`);
    }

    // Test 3.5: Performance: Large text
    console.log('\nScenario 5: Performance with large text');
    let largeText = 'Working at ';
    for (let i = 0; i < 50; i++) {
      largeText += 'Company ' + i + ', then ';
    }
    largeText += 'Apple Inc.';

    const start = Date.now();
    const largeFindings = detector.extractContextualOrgs(largeText);
    const elapsed = Date.now() - start;
    console.log(`  - Scanned ${largeText.length} chars, found ${largeFindings.length} orgs in ${elapsed}ms`);
    assert(elapsed < 100, 'Performance: extraction completes within 100ms');

  } catch (error) {
    console.error('ERROR in integration tests:', error.message);
    testResults.errors.push(`Integration test error: ${error.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n' + '═'.repeat(80));
  console.log('TRUSTPROMPT ORGANIZATION CSV INTEGRATION TEST SUITE');
  console.log('═'.repeat(80));

  try {
    await testOrganizationLoader();
    await testOrganizationDetectorEnhanced();
    await testIntegrationScenarios();
  } catch (error) {
    console.error('FATAL ERROR:', error.message);
    testResults.errors.push(`Fatal error: ${error.message}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(80));
  console.log('TEST SUMMARY');
  console.log('═'.repeat(80));
  console.log(`✓ Passed: ${testResults.passed}`);
  console.log(`✗ Failed: ${testResults.failed}`);

  if (testResults.errors.length > 0) {
    console.log('\nErrors:');
    for (const error of testResults.errors) {
      console.log(`  ${error}`);
    }
  }

  const totalTests = testResults.passed + testResults.failed;
  const passPercentage = totalTests > 0 ? ((testResults.passed / totalTests) * 100).toFixed(1) : 0;
  console.log(`\nPass Rate: ${passPercentage}% (${testResults.passed}/${totalTests})`);
  console.log('═'.repeat(80) + '\n');

  return testResults.failed === 0;
}

// ── Run tests ──────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && require.main === module) {
  // Node.js: run immediately
  runAllTests().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });
} else {
  // Browser: expose to console
  window.runOrganizationCsvTests = runAllTests;
  console.log('Run tests with: window.runOrganizationCsvTests()');
}

// Export for unit test frameworks (Jest, Mocha, etc.)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests, testResults };
}
