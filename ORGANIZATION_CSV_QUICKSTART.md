# Organization CSV Integration — Quick Start

## 5-Minute Setup

### 1. Add Files to Your Project

Copy these three files into your project:
- `organization-loader.js` — CSV loading & lookups
- `organization-detector-enhanced.js` — Validation & extraction
- (CSV already exists at `csv/organizations.csv`)

### 2. Update manifest.json

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": [
      "lib/validator.min.js",
      "gazetteer.js",
      "organization-loader.js",           // ← NEW
      "organization-detector-enhanced.js", // ← NEW
      "linguistic-detector-refactored.js",
      "scanner.js",
      "content-script.js"
    ]
  }]
}
```

### 3. Initialize in scanner.js

Find `const TrustScanner = (() => {` and add:

```javascript
const TrustScanner = (() => {
  let orgDetectorReady = false;

  async function ensureOrgDetectorInitialized() {
    if (orgDetectorReady) return true;
    try {
      const detector = TrustOrganizationDetectorEnhanced.getInstance();
      await detector.initialize();
      orgDetectorReady = true;
      return true;
    } catch (error) {
      console.warn('[TrustScanner] Org detector init failed:', error.message);
      return false;
    }
  }

  // In your scan function, add this call at the start:
  return {
    scan: async (text, options = {}) => {
      await ensureOrgDetectorInitialized();
      // ... rest of your code ...
    }
  };
})();
```

### 4. Use in Organization Extraction

In `linguistic-detector-refactored.js`, update `extractOrganizations()`:

```javascript
async function extractOrganizations(doc, fullText) {
  const findings = [];
  const detector = TrustOrganizationDetectorEnhanced.getInstance();

  // Get extracted organizations
  const extractedOrgs = extractOrganizationContexts(fullText);

  // Validate each one
  for (const org of extractedOrgs) {
    const validation = detector.validateOrganization(org);
    findings.push({
      patternId: 'nlp_organization',
      label: 'Organization (NLP)',
      risk: 'low',
      confidence: validation.confidence,     // NEW
      rawMatch: org,
      safeVersion: '[ORG REDACTED]',
      source: 'C_linguistic',
      validated: validation.isKnown          // NEW
    });
  }

  return findings;
}
```

### 5. Test It

In browser DevTools console:

```javascript
const detector = TrustOrganizationDetectorEnhanced.getInstance();
await detector.initialize();

// Test exact match
detector.validateOrganization('Apple Inc.');
// → { isKnown: true, confidence: 1.0, reason: 'exact_match' }

// Test fuzzy match
detector.validateOrganization('Appl Inc');
// → { isKnown: true, confidence: 0.75, reason: 'fuzzy_match', distance: 1 }

// Test extraction
detector.extractContextualOrgs('I work at Google and my boss works for Microsoft.');
// → [{ org: 'Google', confidence: 1.0 }, { org: 'Microsoft', confidence: 1.0 }]
```

Done! Your organization detection now supports:
- ✓ 22,151 known organizations
- ✓ Fuzzy matching (typo tolerance)
- ✓ Abbreviation validation
- ✓ Confidence scoring

---

## Common Use Cases

### Use Case 1: Validate User Input

```javascript
const input = 'Acccenture';  // User typo
const result = detector.validateOrganization(input);

if (result.isKnown) {
  console.log(`You probably meant: ${result.matchedOrg}`);
  // → You probably meant: Accenture
}
```

### Use Case 2: Filter High-Confidence Orgs

```javascript
const text = 'I work at Apple and my colleague at Unknown Corp.';
const findings = detector.extractContextualOrgs(text);

const highConfidence = findings.filter(f => f.confidence >= 0.75);
// → [{ org: 'Apple', confidence: 1.0 }]
// Unknown Corp filtered out (not in CSV)
```

### Use Case 3: Handle Abbreviations

```javascript
const abbrev = 'AAPL';
const result = detector.validateOrganization(abbrev);
if (result.isKnown) {
  console.log(`Abbreviation for: ${result.matchedOrg}`);
  // → Abbreviation for: Apple Inc.
}
```

### Use Case 4: Risk Scoring Integration

```javascript
// In risk scoring logic
if (finding.patternId === 'nlp_organization') {
  if (finding.validated && finding.confidence >= 0.75) {
    // Known org with high confidence
    baseScore *= 0.95;  // Slightly reduce risk (it's verified)
  } else if (!finding.validated) {
    // Unknown org
    baseScore *= 1.0;   // Same risk (could be false positive)
  }
}
```

---

## Configuration Cheat Sheet

```javascript
// Loader config
const loader = TrustOrganizationLoader.getInstance();
loader.updateConfig({
  maxFuzzyDistance: 2,        // Typo tolerance (1-3)
  minOrgLength: 2,            // Skip short names (1-5)
  enableLogging: false        // Debug output
});

// Detector config
const detector = TrustOrganizationDetectorEnhanced.getInstance();
detector.updateConfig({
  enableFuzzyMatch: true,     // Allow typos
  minOrgLength: 3,            // Minimum org name length
  confidenceScores: {
    exactMatch: 1.0,          // Exact CSV match
    fuzzyMatch: 0.75,         // Typo match
    contextualPattern: 0.50   // Pattern extraction
  }
});
```

---

## Troubleshooting

### Problem: CSV not loading

```javascript
const loader = TrustOrganizationLoader.getInstance();
const stats = loader.getStats();
console.log(stats);
// If initialized: false, check:
// 1. CSV path: /csv/organizations.csv exists?
// 2. Browser console errors for CORS/fetch failures
// 3. File encoding (must be UTF-8)
```

### Problem: Too many false positives

```javascript
detector.updateConfig({
  minOrgLength: 4,            // Increase minimum length
  enableFuzzyMatch: false     // Disable typo tolerance
});
```

### Problem: Missing typo matches

```javascript
detector.updateConfig({
  fuzzyDistanceThreshold: 3   // Increase distance threshold
});
```

### Problem: Slow performance

```javascript
// For large texts, disable fuzzy matching on first pass
detector.updateConfig({
  enableFuzzyMatch: false     // Skip expensive edit distance
});

// Or only validate high-confidence extractions
const findings = detector.extractContextualOrgs(text);
const verified = findings.filter(f => f.confidence >= 0.8);
```

---

## API Reference

### TrustOrganizationLoader

```javascript
const loader = TrustOrganizationLoader.getInstance();

// Load CSV (one-time, async)
await loader.load();

// Check if org is known (exact match)
loader.isKnownOrg(orgName);                    // → boolean

// Find fuzzy match (typo tolerance)
loader.findFuzzyMatch(input, maxDistance);     // → { org, distance, type }

// Find orgs starting with prefix
loader.findByPrefix(prefix, limit);            // → [org1, org2, ...]

// Get known abbreviations
loader.getAbbreviations(orgName);              // → [abbr1, abbr2, ...]

// Check if looks like an org (abbrev or prefix)
loader.looksLikeOrg(input);                    // → boolean

// Get statistics
loader.getStats();                             // → { initialized, totalOrganizations, ... }

// Update configuration
loader.updateConfig({ maxFuzzyDistance: 3 });
```

### TrustOrganizationDetectorEnhanced

```javascript
const detector = TrustOrganizationDetectorEnhanced.getInstance();

// Initialize (loads CSV via loader)
await detector.initialize();

// Validate single organization
detector.validateOrganization(orgName);        // → { isKnown, confidence, risk, reason, ... }

// Extract orgs from text (pattern-based)
detector.extractContextualOrgs(text);          // → [{ org, pattern, confidence, ... }]

// Filter findings by confidence threshold
detector.filterFindings(findings, minConfidence);  // → [deduped findings]

// Get statistics and configuration
detector.getStats();                           // → { enableFuzzyMatch, loaderStats, ... }

// Update configuration
detector.updateConfig({ minOrgLength: 4 });
```

---

## Supported Organization Patterns

```
Pattern 1: "works at/for [ORG]"
  Examples:
    - "I work at Apple Inc."
    - "She works for Microsoft."
    - "Employed by Google"

Pattern 2: "is the head/member/part of [ORG]"
  Examples:
    - "I am the head of Sales"
    - "Part of Accenture"
    - "Member of the management team"

Pattern 3: "at [ORG] office/headquarters"
  Examples:
    - "At Apple headquarters"
    - "At Microsoft office"

Pattern 4: "[ORG] employee/staff"
  Examples:
    - "Google employee"
    - "Microsoft staff member"

Pattern 5: Abbreviations
  Examples:
    - "AAPL" → Apple Inc.
    - "MSFT" → Microsoft
```

---

## Performance Tips

1. **Lazy initialization**: Load CSV only on first scan, not on extension startup
2. **Batch validation**: Validate multiple orgs in a loop (reuses loaded CSV)
3. **Confidence filtering**: Filter by confidence threshold to reduce processing
4. **Disable fuzzy for large texts**: Skip expensive edit-distance for texts > 5000 chars
5. **Cache results**: Store validation results for frequently seen organizations

---

## What's Next?

See the full integration guide for:
- Advanced configuration options
- Performance benchmarks
- Complete test suite
- Real-world scenarios
- Troubleshooting details
- Future enhancements

File: `ORGANIZATION_CSV_INTEGRATION_GUIDE.md`

---

## Files Created

1. **organization-loader.js** (360 lines)
   - CSV loading and indexing
   - Exact/fuzzy/prefix lookups
   - Abbreviation extraction

2. **organization-detector-enhanced.js** (380 lines)
   - Organization validation
   - Contextual extraction
   - Confidence scoring

3. **test-organization-csv.js** (450 lines)
   - 25+ automated tests
   - Performance benchmarks
   - Real-world scenarios

4. **ORGANIZATION_CSV_INTEGRATION_GUIDE.md** (600 lines)
   - Full integration documentation
   - Configuration reference
   - Troubleshooting guide

5. **ORGANIZATION_CSV_QUICKSTART.md** (this file)
   - 5-minute setup guide
   - Common use cases
   - Quick reference

---

**Ready to integrate?** Start with step 1 above, then refer to the full guide for details.
