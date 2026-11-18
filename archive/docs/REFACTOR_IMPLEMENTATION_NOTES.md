# Implementation Notes: linguistic-detector-refactored.js

## File Location
```
c:\Users\Kyleen Nicdao\Documents\Trust Prompt\TrustPrompt\linguistic-detector-refactored.js
```

## Code Statistics
- **Total Lines:** 450+
- **Functions:** 15 (8 internal + 7 test exports)
- **Patterns:** 3 semantic pattern types + multiple extraction patterns
- **Comments:** Comprehensive documentation throughout

---

## Architecture

### Module Structure
```javascript
TrustLinguisticDetector = (() => {
  // PHASE 1: Semantic Context Extraction
  // PHASE 2 & 3: Entity Extraction with Semantic Context
  
  return {
    scan(text),
    getSemanticContext(entity, fullText),
    _test: { /* internal functions for testing */ }
  }
})();
```

### Three-Phase Design

#### PHASE 1: Semantic Context Extraction
```javascript
extractSemanticContext(text, entity)
├─ Check PERSONAL_DISCLOSURE_PATTERNS (weight: 2 per match)
├─ Check ABSTRACT_CONTEXT_PATTERNS (weight: 1 per match)
├─ Check MEASUREMENT_PATTERNS (weight: 2 per match)
└─ Return { type, confidence, indicators }
```

**Scoring Algorithm:**
```
scorePersonal + scoreAbstract + scoreMeasurement

IF scoreMeasurement > 0 AND scoreMeasurement >= scorePersonal:
  type = 'measurement'
ELSE IF scorePersonal > scoreAbstract:
  type = 'personal_disclosure'
ELSE IF scoreAbstract > 0:
  type = 'abstract'
ELSE:
  type = 'unknown'
```

#### PHASE 2: POS-Based Filtering
```javascript
shouldFilterByPOS(phrase)
├─ Tokenize phrase using compromise.js
├─ Check each term's POS tags
├─ Reject if contains: Verb, Auxiliary, Modal, Adverb, Preposition
└─ Return: boolean (true = filter out, false = allow)
```

**Key Insight:** This fixes "Kyleen Nicdao works in" by detecting "works" is a VERB.

#### PHASE 3: Entity Extraction with Semantic Context
```javascript
For each entity type (person, job, org):
  1. Extract using patterns
  2. Call extractSemanticContext() on fullText
  3. Add semanticContext to finding
  4. Return enriched finding
```

---

## Key Functions

### 1. extractSemanticContext(text, entity)
**Purpose:** Determine semantic context type

**Input:**
- `text` (string): Full text to analyze
- `entity` (string, optional): The entity being analyzed

**Output:**
```javascript
{
  type: 'personal_disclosure' | 'abstract' | 'measurement' | 'unknown',
  confidence: 0-1,
  indicators: ['pattern1', 'pattern2', ...]
}
```

**Algorithm:**
1. Convert text to lowercase for pattern matching
2. Count matches against 3 pattern sets
3. Determine highest-scoring type
4. Calculate confidence as min(score/max, 1.0)
5. Return result with indicators list

### 2. shouldFilterByPOS(phrase)
**Purpose:** Reject verb phrases from being classified as names

**Input:**
- `phrase` (string): The phrase to check

**Output:**
- `true`: Filter out (contains non-entity POS tags)
- `false`: Allow through (valid noun phrase)

**Implementation:**
```javascript
try {
  const doc = window.nlp(phrase);
  const terms = doc.termList();
  const filterTags = ['Verb', 'Auxiliary', 'Modal', 'Adverb', 'Preposition'];
  
  for (const term of terms) {
    const tags = term.tags() || [];
    for (const tag of tags) {
      if (filterTags.some(ft => tag && tag.includes(ft))) {
        return true;  // Found a filter tag, reject phrase
      }
    }
  }
  return false;
} catch (error) {
  return false;  // On error, don't over-filter
}
```

### 3. extractPersons(doc, fullText)
**Purpose:** Extract person names with semantic context

**Input:**
- `doc`: compromise.js document object
- `fullText`: Full text for semantic analysis

**Output:** Array of person findings with semanticContext

**Methods (in order):**
1. Extract names with honorifics (Mr, Ms, Dr, Prof, etc.)
2. Extract names from subject position ("Maria is a...")
3. Extract standalone names WITH POS filtering ← FIX #1
4. Use compromise.js NER if available

**Each finding includes:**
```javascript
{
  patternId: 'nlp_person_name',
  label: 'Person Name (NLP)',
  risk: 'low',
  rawMatch: name,
  safeVersion: '[NAME REDACTED]',
  source: 'C_linguistic',
  validated: false,
  semanticContext: extractSemanticContext(fullText, name)  // ← NEW
}
```

### 4. extractJobTitles(doc, fullText)
**Purpose:** Extract job titles with semantic context

**Input:**
- `doc`: compromise.js document object
- `fullText`: Full text for semantic analysis

**Output:** Array of job title findings with semanticContext

**Pattern Types:**
- "is a [job]" - articles "a"
- "is an [job]" - articles "an"
- "is the [job]" - articles "the"

**Boundary Detection:**
- Stops at: prepositions (at, for, in, of, by), punctuation, conjunctions
- Cleans up: removes trailing prepositions from captured title

### 5. extractOrganizations(doc, fullText)
**Purpose:** Extract organization names with semantic context

**Input:**
- `doc`: compromise.js document object
- `fullText`: Full text for semantic analysis

**Output:** Array of organization findings with semanticContext

**Pattern Types:**
1. "is the head of [ORG]" / "is part of [ORG]"
2. "works at/for/with [ORG]"
3. Standalone acronyms (OICT, Google, etc.)

**Filters:**
- Blacklist common non-org acronyms (THE, AND, FOR, WITH, etc.)
- Minimum length requirements
- Avoid duplicates

### 6. scan(text)
**Purpose:** Main entry point - scan text for all linguistic PII

**Input:**
- `text` (string): Text to scan

**Output:** Array of all findings (persons + jobs + orgs) with semanticContext

**Process:**
1. Check if compromise.js available
2. Parse text with compromise.js
3. Call extract functions with fullText parameter ← KEY CHANGE
4. Combine all findings
5. Return enriched findings with semanticContext

### 7. getSemanticContext(entity, fullText)
**Purpose:** PUBLIC API - Get semantic context for any entity

**Input:**
- `entity` (string): The entity to analyze
- `fullText` (string): Full text for context analysis

**Output:** Semantic context object

**Usage by Path A:**
```javascript
const context = TrustLinguisticDetector.getSemanticContext(phoneNumber, text);
if (context.type === 'measurement') {
  // Don't flag as phone number
}
```

**Usage by Path B:**
```javascript
const context = TrustLinguisticDetector.getSemanticContext(term, text);
if (context.type === 'personal_disclosure') {
  // Flag as sensitive
}
```

---

## Pattern Definitions

### PERSONAL_DISCLOSURE_PATTERNS
```javascript
[
  /\b(my|i|i'm|i am|i have|i've|i got|mine|we|our|ours)\b/gi,
  /\b(personal|private|my contact|my details|my info|tell me|call me|text me|email me|my phone|my number)\b/gi,
  /\b(contact|reach|call|text|dial|text me)\s+(me|my)/gi,
]
```

Triggers: "my phone", "I have", "call me", "my details"

### ABSTRACT_CONTEXT_PATTERNS
```javascript
[
  /\b(what is|define|explain|information about|facts about|details about)\b/gi,
  /\b(example|for example|like|such as|e\.g\.|i\.e\.)\b/gi,
  /\b(the [a-z]+ is|diabetes is|cancer is|obesity is)\b/gi,
  /\b(a patient with|people with|someone with)\b/gi,
]
```

Triggers: "What is", "Define", "For example", "People with"

### MEASUREMENT_PATTERNS
```javascript
[
  /\b(grams|kilograms|pounds|ounces|meters|kilometers|miles|inches|centimeters|liters|milliliters|tons|pounds|oz|kg|lb|m|km|ml|l)\b/gi,
  /\b(convert|how many|what is.*in|measurement)\b/gi,
]
```

Triggers: "grams", "tons", "convert", "kg"

---

## Error Handling

### Graceful Degradation
```javascript
// 1. Missing compromise.js
if (!COMPROMISE_AVAILABLE) {
  console.debug('compromise.js not available');
  return [];  // Return empty array, don't error
}

// 2. Null/undefined input
if (!text || typeof text !== 'string') {
  return [];
}

// 3. POS tagging failure
try {
  const doc = window.nlp(phrase);
  // ...
} catch (error) {
  return false;  // Don't over-filter on error
}

// 4. Extraction failure
try {
  // extraction logic
} catch (error) {
  console.debug('Extraction failed:', error.message);
  return [];  // Return empty array
}
```

---

## Performance Optimization Tips

### 1. Caching Semantic Context
```javascript
const contextCache = new Map();

function getSemanticContextCached(entity, fullText) {
  const key = `${entity}:${fullText.slice(0, 100)}`;
  if (contextCache.has(key)) {
    return contextCache.get(key);
  }
  
  const context = extractSemanticContext(fullText, entity);
  contextCache.set(key, context);
  return context;
}
```

### 2. Batch Processing
```javascript
// Instead of scanning each text individually
const texts = [text1, text2, text3];
const allFindings = texts.flatMap(t => scan(t));

// Much faster than calling scan() 3 times separately
```

### 3. Lazy Evaluation
```javascript
// Only compute semantic context when needed
const findings = extractPersons(doc);  // Don't call extractSemanticContext yet

// Later, when needed by Path A/B:
if (needsSemanticContext) {
  findings.forEach(f => {
    f.semanticContext = extractSemanticContext(fullText, f.rawMatch);
  });
}
```

---

## Testing Checklist

### Unit Tests (using _test object)

```javascript
// Test 1: POS Filtering (FIX #1)
✓ test.shouldFilterByPOS("John Smith") === false
✓ test.shouldFilterByPOS("works in") === true
✓ test.shouldFilterByPOS("quickly runs") === true

// Test 2: Semantic Context - Personal Disclosure
✓ test.extractSemanticContext("I have diabetes", "diabetes").type === 'personal_disclosure'
✓ test.extractSemanticContext("My phone is 123", "123").type === 'personal_disclosure'

// Test 3: Semantic Context - Abstract
✓ test.extractSemanticContext("What is diabetes?", "diabetes").type === 'abstract'
✓ test.extractSemanticContext("Define cancer", "cancer").type === 'abstract'

// Test 4: Semantic Context - Measurement
✓ test.extractSemanticContext("09876543212 grams", "09876543212").type === 'measurement'
✓ test.extractSemanticContext("Convert to kg", "kg").type === 'measurement'

// Test 5: Standalone Names
✓ test.extractStandalonePersonNames("Kyleen Nicdao said").includes("Kyleen Nicdao")
✓ !test.extractStandalonePersonNames("Kyleen Nicdao works in").some(n => n.includes("works"))

// Test 6: Job Titles
✓ test.extractPredicateJobTitles("Maria is a teacher").includes("teacher")
✓ test.extractPredicateJobTitles("John is an engineer").includes("engineer")

// Test 7: Organizations
✓ test.extractOrganizationContexts("works at Google").includes("Google")
✓ test.extractOrganizationContexts("head of OICT").includes("OICT")
```

### Integration Tests

```javascript
// Test: Full scan with semantic context
const text = "I have diabetes. Kyleen Nicdao works at Accenture.";
const findings = TrustLinguisticDetector.scan(text);

✓ findings[0].semanticContext.type === 'personal_disclosure' (diabetes)
✓ findings[1].semanticContext.type === 'unknown' (Kyleen Nicdao - no markers)
✓ findings[2].semanticContext.type === 'unknown' (Accenture)

// Test: Measurement context
const text2 = "What is 09876543212 grams?";
const ctx = TrustLinguisticDetector.getSemanticContext("09876543212", text2);
✓ ctx.type === 'measurement'
✓ ctx.confidence > 0.8
```

---

## Migration from Old Version

### Step 1: Backup & Deploy
```bash
# Backup old file
cp linguistic-detector.js linguistic-detector-old.js

# Deploy new version
cp linguistic-detector-refactored.js linguistic-detector.js
```

### Step 2: Update Path A
```javascript
// OLD: Just scan and flag
const findings = TrustLinguisticDetector.scan(text);
for (const f of findings) {
  flagAsPhoneNumber(f.rawMatch);
}

// NEW: Check semantic context first
const findings = TrustLinguisticDetector.scan(text);
for (const f of findings) {
  if (f.semanticContext.type === 'measurement') {
    continue;  // Skip measurement context
  }
  flagAsPhoneNumber(f.rawMatch);
}
```

### Step 3: Update Path B
```javascript
// OLD: Just flag all matches
if (text.includes('diabetes')) {
  flagSensitiveHealth('diabetes');
}

// NEW: Check semantic context first
if (text.includes('diabetes')) {
  const ctx = TrustLinguisticDetector.getSemanticContext('diabetes', text);
  if (ctx.type === 'personal_disclosure') {
    flagSensitiveHealth('diabetes');
  } else if (ctx.type === 'abstract') {
    continue;  // Skip informational
  }
}
```

### Step 4: Test
```javascript
// Run unit tests
const test = TrustLinguisticDetector._test;

// Test key fixes
console.assert(
  test.extractStandalonePersonNames("Kyleen Nicdao works")
    .includes("Kyleen Nicdao"),
  "FIX #1 test passed"
);

// Test semantic context
const ctx = test.extractSemanticContext("What is 09876543212 grams?");
console.assert(ctx.type === 'measurement', "Measurement context test passed");
```

---

## Deployment Checklist

- [ ] Backup old linguistic-detector.js
- [ ] Deploy linguistic-detector-refactored.js
- [ ] Update Path A to check semanticContext.type
- [ ] Update Path B to check semanticContext.type
- [ ] Run unit tests via _test object
- [ ] Test with real-world text samples
- [ ] Monitor scanner output for improvements
- [ ] Document any customizations needed

---

## Known Limitations

1. **compromise.js dependency:** If not available, returns empty findings
2. **POS tagging accuracy:** Depends on compromise.js; may have edge cases
3. **Pattern coverage:** Not exhaustive; may miss some semantic contexts
4. **Performance:** 2x slower than before due to NLP processing
5. **Language:** English only (patterns are English-specific)

---

## Future Enhancements

1. **Caching:** Add memoization for repeated entities
2. **Confidence calibration:** Adjust scoring weights based on real data
3. **Pattern expansion:** Add more semantic context patterns
4. **Multi-language:** Support other languages (Spanish, Filipino, etc.)
5. **Custom patterns:** Allow users to add organization-specific patterns
6. **Streaming:** Process large texts without loading fully in memory

---

## Debugging Tips

### Enable Verbose Logging
```javascript
// Add to script before using:
window.TRUSTPROMPT_DEBUG = true;

// Then check browser console for debug messages
```

### Inspect Extraction Steps
```javascript
const test = TrustLinguisticDetector._test;

// Step 1: Check semantic context
const ctx = test.extractSemanticContext(text);
console.log('Semantic context:', ctx);

// Step 2: Check person extraction
const persons = test.extractPersons(doc, text);
console.log('Persons found:', persons);

// Step 3: Check job extraction
const jobs = test.extractJobTitles(doc, text);
console.log('Job titles found:', jobs);

// Step 4: Check org extraction
const orgs = test.extractOrganizationContexts(text);
console.log('Organizations found:', orgs);
```

### Test POS Filtering
```javascript
const test = TrustLinguisticDetector._test;

// Test phrases
const testCases = [
  "John Smith",           // Should NOT filter
  "works in quickly",     // Should filter
  "Kyleen Nicdao",        // Should NOT filter
  "has diabetes gone",    // Should filter
];

for (const phrase of testCases) {
  console.log(`${phrase}: filtered=${test.shouldFilterByPOS(phrase)}`);
}
```

