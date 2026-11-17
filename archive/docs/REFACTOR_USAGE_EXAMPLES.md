# Refactored linguistic-detector.js - Usage Examples

## Quick Start

### Basic Scanning

```javascript
// Scan text for linguistic PII
const text = "Kyleen Nicdao works in Accenture. Maria is a human resource manager.";
const findings = TrustLinguisticDetector.scan(text);

console.log(findings);
// Output:
// [
//   {
//     patternId: 'nlp_person_name',
//     label: 'Person Name (NLP)',
//     rawMatch: 'Kyleen Nicdao',
//     semanticContext: {
//       type: 'unknown',
//       confidence: 0,
//       indicators: []
//     }
//   },
//   {
//     patternId: 'nlp_organization',
//     label: 'Organization (NLP)',
//     rawMatch: 'Accenture',
//     semanticContext: { ... }
//   },
//   {
//     patternId: 'nlp_person_name',
//     label: 'Person Name (NLP - Subject Position)',
//     rawMatch: 'Maria',
//     semanticContext: { ... }
//   },
//   {
//     patternId: 'nlp_job_title',
//     label: 'Job Title (NLP)',
//     rawMatch: 'human resource manager',
//     semanticContext: { ... }
//   }
// ]
```

---

## PHASE 1: Semantic Context Extraction

### Example 1: Personal Disclosure Context

```javascript
const text = "I have diabetes and my blood pressure is high.";
const context = TrustLinguisticDetector.getSemanticContext('diabetes', text);

console.log(context);
// Output:
// {
//   type: 'personal_disclosure',
//   confidence: 0.9,
//   indicators: ['i have', 'my']
// }
```

**Use Case - Path B Integration:**
```javascript
// In Path B (content filtering):
const context = TrustLinguisticDetector.getSemanticContext('diabetes', text);

if (context.type === 'personal_disclosure') {
  // FLAG as sensitive personal health information
  addFinding({
    type: 'personal_health_info',
    term: 'diabetes',
    risk: 'high',
    reason: 'Personal disclosure: user mentions "I have diabetes"'
  });
}
```

### Example 2: Abstract/Informational Context

```javascript
const text = "What is diabetes? It is a medical condition. Define obesity.";
const context = TrustLinguisticDetector.getSemanticContext('diabetes', text);

console.log(context);
// Output:
// {
//   type: 'abstract',
//   confidence: 0.8,
//   indicators: ['what is', 'define']
// }
```

**Use Case - Path B Integration:**
```javascript
// In Path B (content filtering):
const context = TrustLinguisticDetector.getSemanticContext('diabetes', text);

if (context.type === 'abstract') {
  // DON'T FLAG - this is informational/educational content
  console.log('Educational content - no PII risk');
  return;
}
```

### Example 3: Measurement Context

```javascript
const text = "Convert 09876543212 grams to kilograms. What is this in pounds?";
const context = TrustLinguisticDetector.getSemanticContext('09876543212', text);

console.log(context);
// Output:
// {
//   type: 'measurement',
//   confidence: 0.9,
//   indicators: ['grams', 'convert', 'kilograms']
// }
```

**Use Case - Path A Integration:**
```javascript
// In Path A (regex detection):
const match = '09876543212';
const context = TrustLinguisticDetector.getSemanticContext(match, text);

if (context.type === 'measurement') {
  // DON'T FLAG as phone number - it's a measurement
  console.log('Measurement context - not a phone number');
  return;
}

// Otherwise, normal phone number detection applies
```

### Example 4: Unknown Context

```javascript
const text = "Kyleen Nicdao said hello.";
const context = TrustLinguisticDetector.getSemanticContext('Kyleen Nicdao', text);

console.log(context);
// Output:
// {
//   type: 'unknown',
//   confidence: 0,
//   indicators: []
// }
```

**Use Case - Path A/B:**
```javascript
// When context is 'unknown', apply standard detection logic
const context = TrustLinguisticDetector.getSemanticContext(entity, text);

if (context.type === 'unknown') {
  // Apply normal rules (no special filtering)
  return standardDetection(entity);
}
```

---

## PHASE 2 & 3: Entity Extraction with Semantic Context

### Example 1: Extract Person Names with Semantic Context

```javascript
const text = "Kyleen Nicdao works at Accenture. I have three professors: Dr. Maria Santos, Mr. John Smith, and Ms. Sarah Johnson.";
const findings = TrustLinguisticDetector.scan(text);

// Filter to person names only
const personNames = findings.filter(f => f.patternId === 'nlp_person_name');

console.log(personNames);
// Output:
// [
//   {
//     patternId: 'nlp_person_name',
//     label: 'Person Name (NLP)',
//     rawMatch: 'Kyleen Nicdao',
//     safeVersion: '[NAME REDACTED]',
//     semanticContext: {
//       type: 'unknown',
//       confidence: 0,
//       indicators: []
//     }
//   },
//   {
//     patternId: 'nlp_person_name',
//     label: 'Person Name (NLP - Honorific)',
//     rawMatch: 'Maria Santos',
//     safeVersion: '[NAME REDACTED]',
//     semanticContext: {
//       type: 'personal_disclosure',
//       confidence: 0.8,
//       indicators: ['i have']  // From "I have three professors"
//     }
//   },
//   {
//     patternId: 'nlp_person_name',
//     label: 'Person Name (NLP - Honorific)',
//     rawMatch: 'John Smith',
//     safeVersion: '[NAME REDACTED]',
//     semanticContext: {
//       type: 'personal_disclosure',
//       confidence: 0.8,
//       indicators: ['i have']
//     }
//   },
//   {
//     patternId: 'nlp_person_name',
//     label: 'Person Name (NLP - Honorific)',
//     rawMatch: 'Sarah Johnson',
//     safeVersion: '[NAME REDACTED]',
//     semanticContext: {
//       type: 'personal_disclosure',
//       confidence: 0.8,
//       indicators: ['i have']
//     }
//   }
// ]
```

### Example 2: Extract Job Titles with Semantic Context

```javascript
const text = "Maria is a human resource manager. John is an engineer. Sarah is the head of IT.";
const findings = TrustLinguisticDetector.scan(text);

const jobTitles = findings.filter(f => f.patternId === 'nlp_job_title');

console.log(jobTitles);
// Output:
// [
//   {
//     patternId: 'nlp_job_title',
//     label: 'Job Title (NLP)',
//     rawMatch: 'human resource manager',
//     safeVersion: '[JOB REDACTED]',
//     semanticContext: {
//       type: 'unknown',
//       confidence: 0,
//       indicators: []
//     }
//   },
//   {
//     patternId: 'nlp_job_title',
//     label: 'Job Title (NLP)',
//     rawMatch: 'engineer',
//     safeVersion: '[JOB REDACTED]',
//     semanticContext: {
//       type: 'unknown',
//       confidence: 0,
//       indicators: []
//     }
//   },
//   {
//     patternId: 'nlp_job_title',
//     label: 'Job Title (NLP)',
//     rawMatch: 'head',
//     safeVersion: '[JOB REDACTED]',
//     semanticContext: {
//       type: 'unknown',
//       confidence: 0,
//       indicators: []
//     }
//   }
// ]
```

### Example 3: Extract Organizations with Semantic Context

```javascript
const text = "Kyleen works at Accenture. She is the head of the OICT. The Google office is nearby.";
const findings = TrustLinguisticDetector.scan(text);

const orgs = findings.filter(f => f.patternId === 'nlp_organization');

console.log(orgs);
// Output:
// [
//   {
//     patternId: 'nlp_organization',
//     label: 'Organization (NLP)',
//     rawMatch: 'Accenture',
//     safeVersion: '[ORG REDACTED]',
//     semanticContext: {
//       type: 'unknown',
//       confidence: 0,
//       indicators: []
//     }
//   },
//   {
//     patternId: 'nlp_organization',
//     label: 'Organization (NLP)',
//     rawMatch: 'OICT',
//     safeVersion: '[ORG REDACTED]',
//     semanticContext: { ... }
//   },
//   {
//     patternId: 'nlp_organization',
//     label: 'Organization (NLP)',
//     rawMatch: 'Google',
//     safeVersion: '[ORG REDACTED]',
//     semanticContext: { ... }
//   }
// ]
```

---

## FIX #1: POS Filtering for Standalone Names

### The Problem (Before)

```javascript
// "Nicdao works in" might be extracted as a name because:
// - Matches pattern: "[A-Z][a-z]+ [A-Z][a-z]+"
// - Is capitalized
// BUT it contains the verb "works" which shouldn't be part of a name
```

### The Solution (After)

```javascript
const text = "Kyleen Nicdao works in Accenture.";
const findings = TrustLinguisticDetector.scan(text);

const personNames = findings.filter(f => f.patternId === 'nlp_person_name');

console.log(personNames);
// Output:
// [
//   {
//     patternId: 'nlp_person_name',
//     label: 'Person Name (NLP)',
//     rawMatch: 'Kyleen Nicdao',  // ✓ CORRECT - only the actual name
//     semanticContext: { ... }
//   }
// ]
// Note: "Nicdao works in" is NOT extracted because shouldFilterByPOS() detects "works" is a VERB
```

**How It Works:**
```javascript
// Internal: shouldFilterByPOS() checking
shouldFilterByPOS("Kyleen Nicdao");
// → compromise.js tags: "Kyleen"=Noun, "Nicdao"=Noun/Name
// → No verb/adverb tags detected
// → Returns FALSE (don't filter)
// ✓ Extract "Kyleen Nicdao"

shouldFilterByPOS("Nicdao works in");
// → compromise.js tags: "Nicdao"=Noun, "works"=VERB, "in"=PREPOSITION
// → Verb tag detected!
// → Returns TRUE (do filter)
// ✗ Don't extract "Nicdao works in"
```

---

## Integration Examples

### Path A & B Workflow

```javascript
// In the combined scanner (Path A, B, and C):

async function scanText(fullText) {
  const findings = {
    pathA: [],
    pathB: [],
    pathC: []
  };

  // Path C: Linguistic detection
  const linguisticFindings = TrustLinguisticDetector.scan(fullText);
  findings.pathC = linguisticFindings;

  // Path A: Regex patterns with semantic context
  for (const finding of linguisticFindings) {
    if (finding.patternId === 'nlp_person_name') {
      const context = finding.semanticContext;
      
      // Example: Check if name appears in personal disclosure
      if (context.type === 'personal_disclosure') {
        findings.pathA.push({
          ...finding,
          flagged: true,
          reason: 'Personal disclosure context'
        });
      }
    }
  }

  // Path B: Content-based filtering with semantic context
  const keywords = ['diabetes', 'cancer', 'depression'];
  for (const keyword of keywords) {
    const context = TrustLinguisticDetector.getSemanticContext(keyword, fullText);
    
    if (fullText.toLowerCase().includes(keyword)) {
      // Only flag if context indicates personal disclosure, not abstract
      if (context.type === 'personal_disclosure') {
        findings.pathB.push({
          keyword,
          flagged: true,
          reason: 'Personal disclosure of sensitive health information',
          context
        });
      } else if (context.type === 'abstract') {
        // Don't flag - informational content
        console.log(`Skipping "${keyword}" - abstract/educational context`);
      }
    }
  }

  return findings;
}
```

### Full Workflow Example

```javascript
const fullText = "I have diabetes. My professor Dr. Maria Santos works at Accenture in the OICT department.";

// 1. Scan with Path C
const pathCFindings = TrustLinguisticDetector.scan(fullText);
console.log('Path C findings:', pathCFindings);

// 2. Path A: Use semantic context for phone numbers
const phoneNumbers = ['01234567890']; // hypothetical
for (const phone of phoneNumbers) {
  const context = TrustLinguisticDetector.getSemanticContext(phone, fullText);
  
  if (context.type === 'measurement') {
    console.log(`${phone} is in measurement context - skip`);
  } else if (context.type === 'personal_disclosure') {
    console.log(`${phone} is in personal disclosure context - FLAG`);
  }
}

// 3. Path B: Use semantic context for health terms
const healthTerms = ['diabetes', 'cancer', 'depression'];
for (const term of healthTerms) {
  if (fullText.toLowerCase().includes(term)) {
    const context = TrustLinguisticDetector.getSemanticContext(term, fullText);
    
    if (context.type === 'personal_disclosure') {
      console.log(`Personal disclosure of ${term} detected - FLAG`);
    } else if (context.type === 'abstract') {
      console.log(`Abstract mention of ${term} - skip`);
    }
  }
}

// Output:
// Path C findings: [
//   { rawMatch: 'diabetes', semanticContext: { type: 'personal_disclosure' } },
//   { rawMatch: 'Maria Santos', semanticContext: { type: 'personal_disclosure' } },
//   { rawMatch: 'Accenture', semanticContext: { type: 'unknown' } },
//   { rawMatch: 'OICT', semanticContext: { type: 'unknown' } }
// ]
// Personal disclosure of diabetes detected - FLAG
```

---

## Testing & Debugging

### Using the _test Object

```javascript
// Access internal functions for unit testing
const testFunctions = TrustLinguisticDetector._test;

// Test: shouldFilterByPOS
console.log(testFunctions.shouldFilterByPOS("Kyleen Nicdao"));
// Output: false (don't filter - valid name)

console.log(testFunctions.shouldFilterByPOS("works in quickly"));
// Output: true (do filter - contains verbs/adverbs)

// Test: extractSemanticContext
const context = testFunctions.extractSemanticContext(
  "I have diabetes and need medication.",
  "diabetes"
);
console.log(context);
// Output: { type: 'personal_disclosure', confidence: 0.8+, indicators: [...] }

// Test: extractStandalonePersonNames
const names = testFunctions.extractStandalonePersonNames(
  "Kyleen Nicdao works with Maria Santos."
);
console.log(names);
// Output: ["Kyleen Nicdao", "Maria Santos"]

// Test: extractPredicateJobTitles
const titles = testFunctions.extractPredicateJobTitles(
  "Maria is a human resource manager. John is an engineer."
);
console.log(titles);
// Output: ["human resource manager", "engineer"]

// Test: extractOrganizationContexts
const orgs = testFunctions.extractOrganizationContexts(
  "She works at Google and leads the OICT division."
);
console.log(orgs);
// Output: ["Google", "OICT"]
```

---

## Performance Considerations

```javascript
// Performance notes:

// 1. Semantic context extraction: ~1-2ms per entity
const start = performance.now();
const context = TrustLinguisticDetector.getSemanticContext('diabetes', fullText);
const duration = performance.now() - start;
console.log(`Semantic context: ${duration.toFixed(2)}ms`);

// 2. POS filtering: ~5-10ms per phrase (compromise.js NLP is slower)
// This is acceptable for single scans, but consider caching for batch operations

// 3. Full scan: ~50-200ms depending on text length
const scanStart = performance.now();
const findings = TrustLinguisticDetector.scan(fullText);
const scanDuration = performance.now() - scanStart;
console.log(`Full scan: ${scanDuration.toFixed(2)}ms`);
```

---

## Error Handling

```javascript
// All functions handle errors gracefully

// 1. Missing compromise.js
if (!window.nlp) {
  console.debug('compromise.js not available');
  const findings = TrustLinguisticDetector.scan(text);
  // Returns: [] (empty array, no error)
}

// 2. Invalid input
TrustLinguisticDetector.scan(null);
// Returns: [] (empty array, no error)

TrustLinguisticDetector.scan(undefined);
// Returns: [] (empty array, no error)

TrustLinguisticDetector.scan("");
// Returns: [] (empty array, no error)

// 3. POS tagging failure
shouldFilterByPOS("test");
// If compromise.js fails, returns: false (allow through, don't over-filter)
```

