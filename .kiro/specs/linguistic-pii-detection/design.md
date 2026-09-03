# Linguistic PII Detection — Design Document

## Overview

This design document specifies the technical implementation of PATH C (Linguistic Detection) for TrustPrompt. PATH C uses compromise.js for tokenization, part-of-speech tagging, and named entity recognition to detect three categories of broad PII that are too variable for regex or gazetteer approaches:

1. **Person names** (PERSON entities)
2. **Job titles / roles** (JOB entities, or noun phrases after triggers)
3. **Organization names** (ORG entities)

PATH C runs in parallel with PATH B (Gazetteer) on the normalized `textNLP` view after the Normalizer produces both `textRegex` (for PATH A) and `textNLP` (for PATH B/C).

## Architecture

### High-Level Flow

```
rawText
  │
  ├─→ Normalizer.normalize()
  │     ├─→ textRegex (PATH A)
  │     └─→ textNLP (PATH B || PATH C)
  │
  ├─→ PATH A (regex + validator.js)
  │
  ├─→ [PARALLEL START]
  │   ├─→ PATH B (Gazetteer.scan)
  │   └─→ PATH C (LinguisticDetector.scan)  ← NEW
  │   [PARALLEL END]
  │
  ├─→ mergeAndDedupe(A, B, C findings)
  │
  ├─→ suppressPlaceholders()
  │
  └─→ computeRiskScore()
       └─→ Scanner.scan() → { findings, riskLevel, score }
```

### Implementation Structure

```
linguistic-detector.js
  ├─ Module initialization
  │   ├─ Check for compromise.js availability
  │   ├─ Pre-compile token templates / regexes if available
  │   └─ Initialize cache / state (if stateful)
  │
  ├─ scan(textNLP)
  │   ├─ Step 1: Tokenize
  │   ├─ Step 2: POS tagging
  │   ├─ Step 3: NER tagging
  │   ├─ Step 4: Extract findings
  │   └─ return findings[]
  │
  ├─ Helper functions
  │   ├─ extractPersons()
  │   ├─ extractJobTitles()
  │   ├─ extractOrganizations()
  │   ├─ mergeAdjacentTokens()
  │   ├─ applyTriggerFilters()
  │   └─ filterCommonEntities()
  │
  └─ Constants
      ├─ JOB_TRIGGER_PHRASES (for POS heuristic fallback)
      ├─ COMMON_FIRST_NAMES (optional filtering)
      ├─ COMMON_JOB_TITLES (optional filtering)
      └─ NER_ENTITY_TYPES (PERSON, ORG, JOB)
```

### Integration with Scanner

In `scanner.js`, the `scan()` function will be updated:

```javascript
function scan(rawText) {
  // ... existing code ...
  
  const { masked, textRegex, textNLP, wasCapsConverted } = 
    TrustNormalizer.normalize(rawText);

  const pathAFindings = runPathA(textRegex);
  
  // Path B and Path C run in parallel
  const pathBFindings = TrustGazetteer.scan(textNLP);
  const pathCFindings = TrustLinguisticDetector.scan(textNLP);  // NEW
  
  const merged = mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings);  // Updated
  const findings = suppressPlaceholders(merged);
  const { score, riskLevel, governance } = computeRiskScore(findings);
  
  return { findings, riskLevel, score, governance, normalisedText: masked, wasCapsConverted };
}
```

## Linguistic Detector Implementation

### Module Initialization

```javascript
const TrustLinguisticDetector = (() => {
  // Check if compromise.js is available
  const COMPROMISE_AVAILABLE = typeof window !== 'undefined' && window.nlp !== undefined;
  
  if (!COMPROMISE_AVAILABLE) {
    console.debug('[TrustPrompt/PATH_C] compromise.js not found; skipping linguistic detection');
  }
  
  // Pre-compile or cache data structures
  const JOB_TRIGGER_PHRASES = [
    'work as', 'work like', 'employed as', 'role is',
    'position is', 'my title is', 'job title is'
  ];
  
  const COMMON_FIRST_NAMES = new Set([
    'john', 'mary', 'james', 'david', 'robert', 'michael', 'william', 'richard',
    'charles', 'joseph', 'thomas', 'alice', 'bob', 'charlie', 'example', 'user'
  ]);
  
  const COMMON_JOB_TITLES = new Set([
    'manager', 'engineer', 'developer', 'analyst', 'designer', 'director',
    'coordinator', 'specialist', 'consultant', 'assistant', 'associate'
  ]);
  
  // ... module code ...
})();
```

### Core Scanning Function

```javascript
function scan(textNLP) {
  if (!COMPROMISE_AVAILABLE) {
    return [];
  }
  
  if (!textNLP || textNLP.trim().length === 0) {
    return [];
  }
  
  const findings = [];
  
  try {
    // Step 1: Tokenize and tag
    const doc = nlp(textNLP);
    
    // Step 2–4: Extract entities
    const personFindings = extractPersons(doc);
    const jobFindings = extractJobTitles(doc);
    const orgFindings = extractOrganizations(doc);
    
    findings.push(...personFindings, ...jobFindings, ...orgFindings);
    
    // Deduplicate within PATH C (same entity extracted multiple ways)
    return deduplicateWithinPath(findings);
    
  } catch (error) {
    console.error('[TrustPrompt/PATH_C] Error during linguistic detection:', error);
    return [];
  }
}
```

### Entity Extraction Functions

#### Person Names

```javascript
function extractPersons(doc) {
  const findings = [];
  
  // Method 1: NER tagging (if available)
  const nerEntities = doc.entities();
  for (const entity of nerEntities) {
    if (entity.tag === 'PERSON') {
      const rawMatch = entity.text();
      
      // Optional: Filter obvious non-PII
      if (shouldFilterCommonName(rawMatch)) {
        continue;
      }
      
      findings.push({
        patternId: 'nlp_person_name',
        label: 'Person Name (NLP)',
        risk: 'low',
        rawMatch,
        safeVersion: '[NAME REDACTED]',
        source: 'C_linguistic',
        validated: false
      });
    }
  }
  
  // Method 2: Heuristic "my name is X" trigger
  const triggerMatch = textNLP.match(/(?:my name is|i (?:am|'m) called|i (?:am|'m))\s+([A-Za-z\s]+?)(?:\.|,|and|but|$)/i);
  if (triggerMatch) {
    const rawMatch = triggerMatch[1].trim();
    if (!findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
      findings.push({
        patternId: 'nlp_person_name',
        label: 'Person Name (NLP)',
        risk: 'low',
        rawMatch,
        safeVersion: '[NAME REDACTED]',
        source: 'C_linguistic',
        validated: false
      });
    }
  }
  
  return findings;
}
```

#### Job Titles

```javascript
function extractJobTitles(doc) {
  const findings = [];
  
  // Method 1: NER tagging (if compromise.js tags JOB entities)
  const nerEntities = doc.entities();
  for (const entity of nerEntities) {
    if (entity.tag === 'JOB') {
      const rawMatch = entity.text();
      
      if (shouldFilterCommonJobTitle(rawMatch)) {
        continue;
      }
      
      findings.push({
        patternId: 'nlp_job_title',
        label: 'Job Title (NLP)',
        risk: 'low',
        rawMatch,
        safeVersion: '[JOB TITLE REDACTED]',
        source: 'C_linguistic',
        validated: false
      });
    }
  }
  
  // Method 2: POS heuristic — find noun phrases after trigger phrases
  for (const trigger of JOB_TRIGGER_PHRASES) {
    const regex = new RegExp(`\\b${trigger}\\s+([A-Za-z\\s]+?)(?:\\bat\\b|in|for|from|,|\\.|$)`, 'gi');
    let match;
    while ((match = regex.exec(textNLP)) !== null) {
      const rawMatch = match[1].trim();
      
      if (shouldFilterCommonJobTitle(rawMatch)) {
        continue;
      }
      
      if (!findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
        findings.push({
          patternId: 'nlp_job_title',
          label: 'Job Title (NLP)',
          risk: 'low',
          rawMatch,
          safeVersion: '[JOB TITLE REDACTED]',
          source: 'C_linguistic',
          validated: false
        });
      }
    }
  }
  
  return findings;
}
```

#### Organization Names

```javascript
function extractOrganizations(doc) {
  const findings = [];
  
  // Method 1: NER tagging (compromise.js ORG entities)
  const nerEntities = doc.entities();
  for (const entity of nerEntities) {
    if (entity.tag === 'ORG') {
      const rawMatch = entity.text();
      
      findings.push({
        patternId: 'nlp_organization',
        label: 'Organization (NLP)',
        risk: 'low',
        rawMatch,
        safeVersion: '[ORGANIZATION REDACTED]',
        source: 'C_linguistic',
        validated: false
      });
    }
  }
  
  // Method 2: Heuristic "work at X" or "work for X"
  const workAtRegex = /(?:work (?:at|for)|employed (?:at|by)|work with)\s+([A-Za-z\s\.]+?)(?:\s+(?:in|since|for)|$)/gi;
  let match;
  while ((match = workAtRegex.exec(textNLP)) !== null) {
    const rawMatch = match[1].trim();
    
    // Avoid flagging common words
    if (rawMatch.length < 3 || rawMatch.toLowerCase() === 'home') {
      continue;
    }
    
    if (!findings.some(f => f.rawMatch.toLowerCase() === rawMatch.toLowerCase())) {
      findings.push({
        patternId: 'nlp_organization',
        label: 'Organization (NLP)',
        risk: 'low',
        rawMatch,
        safeVersion: '[ORGANIZATION REDACTED]',
        source: 'C_linguistic',
        validated: false
      });
    }
  }
  
  return findings;
}
```

### Helper Functions

```javascript
function shouldFilterCommonName(name) {
  const lower = name.toLowerCase();
  const firstWord = lower.split(/\s+/)[0];
  return COMMON_FIRST_NAMES.has(firstWord);
}

function shouldFilterCommonJobTitle(title) {
  const lower = title.toLowerCase();
  return COMMON_JOB_TITLES.has(lower);
}

function deduplicateWithinPath(findings) {
  const seen = new Map();
  const result = [];
  
  for (const f of findings) {
    const key = f.rawMatch.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, f);
      result.push(f);
    }
  }
  
  return result;
}

function mergeAdjacentTokens(tokens) {
  // Utility to merge consecutive PERSON or ORG tokens into single spans
  // Used for cases like "Alice Smith" tagged as two separate entities
  // Returns list of merged spans
}
```

## Scanner Updates

### Updated Constants

Add to `patterns.js`:

```javascript
// PATH C linguistic detection patterns
const LINGUISTIC_PATTERNS = {
  nlp_person_name: {
    id: 'nlp_person_name',
    label: 'Person Name (NLP)',
    risk: 'low',
    validate: null,  // No mathematical validation for NLP
    sanitize: () => '[NAME REDACTED]'
  },
  nlp_job_title: {
    id: 'nlp_job_title',
    label: 'Job Title (NLP)',
    risk: 'low',
    validate: null,
    sanitize: () => '[JOB TITLE REDACTED]'
  },
  nlp_organization: {
    id: 'nlp_organization',
    label: 'Organization (NLP)',
    risk: 'low',
    validate: null,
    sanitize: () => '[ORGANIZATION REDACTED]'
  }
};
```

### Update BASE_SCORES in scanner.js

```javascript
const BASE_SCORES = {
  // ... existing ...
  
  // PATH C linguistic (contextual tier, score 2)
  nlp_person_name:  2,
  nlp_job_title:    2,
  nlp_organization: 2
};

const ENTITY_TIER = {
  // ... existing ...
  
  nlp_person_name:  'contextual',
  nlp_job_title:    'contextual',
  nlp_organization: 'contextual'
};
```

### Update mergeAndDedupe

```javascript
function mergeAndDedupe(pathA, pathB, pathC) {
  const seen = new Map();
  for (const f of [...pathA, ...pathB, ...pathC]) {
    const key = f.rawMatch.trim().toLowerCase();
    const ex = seen.get(key);
    if (!ex || RISK_ORDER[f.risk] > RISK_ORDER[ex.risk]) {
      seen.set(key, f);
    }
  }
  return [...seen.values()];
}
```

## Performance Considerations

1. **Compromise.js initialization**: The library is assumed to be pre-loaded in the global scope (`window.nlp`). No dynamic import overhead at scan time.

2. **Tokenization cost**: Tokenizing 100–500 characters typically takes 5–15ms on a modern machine.

3. **Caching**: Entity types and NER models are cached within the compromise.js library; we do not re-parse static data.

4. **Fallback heuristics**: If NER is not available, regex-based trigger phrase matching (~5–10ms) provides acceptable coverage.

5. **Overall budget**: 50ms per scan. Typical execution: 10–20ms tokenization + 5–10ms NER extraction + 5–10ms heuristics = 20–40ms total.

## Error Handling

```javascript
function scan(textNLP) {
  if (!COMPROMISE_AVAILABLE) {
    console.debug('[TrustPrompt/PATH_C] compromise.js not found; skipping linguistic detection');
    return [];
  }
  
  if (!textNLP || typeof textNLP !== 'string' || textNLP.trim().length === 0) {
    return [];
  }
  
  try {
    // ... extraction logic ...
    return findings;
  } catch (error) {
    console.error('[TrustPrompt/PATH_C] Error during linguistic detection:', error);
    return [];  // Fail gracefully; return empty findings
  }
}
```

## Testing Strategy

### Correctness Properties (Property-Based Testing)

1. **Round-trip property**: Extracting an entity and then re-scanning should find the same entity (or a semantically equivalent one).

2. **Invariant property**: The number of findings returned is never negative; each finding has required fields (patternId, risk, rawMatch, source).

3. **Idempotence**: Scanning the same text twice returns the same findings (order-independent comparison).

4. **Metamorphic property**: If text A is a substring of text B, then findings from A should be a subset of findings from B (with possible additional context-driven findings).

### Integration Tests

1. **Basic detection**:
   - "My name is Alice Smith" → finds PERSON: "Alice Smith"
   - "I work as a Senior Engineer" → finds JOB: "Senior Engineer"
   - "I'm employed at Acme Corp" → finds ORG: "Acme Corp"

2. **Graceful degradation**:
   - If compromise.js is unavailable, PATH C returns empty list; scanner continues normally.

3. **Parallel execution**:
   - PATH B and PATH C both process the same `textNLP` input concurrently; findings merge correctly.

4. **Deduplication**:
   - If PATH A or B finds "John Smith" and PATH C also finds it, the merged finding list contains only one entry with the highest risk level.

5. **Edge cases**:
   - Empty text → empty findings
   - Text with no entities → empty findings
   - Text with common non-PII names (e.g., "example user") → may be filtered (optional feature)
   - Mixed language text (English + Tagalog) → compromise.js behavior on non-English text

## Acceptance Criteria Correctness Properties

### AC 1.2: Scanner invokes PATH C

**Property**: For any normalized text input, PATH C is invoked if and only if compromise.js is available.

```javascript
// Test using fast-check or hypothesis
function prop_pathCInvokedWhenAvailable(text) {
  const result = scanner.scan(text);
  // If compromise is available, results should include PATH C findings or empty list
  // If compromise is unavailable, PATH A + PATH B findings only
  return true;  // Verified through spy/mock on TrustLinguisticDetector.scan
}
```

### AC 2.1: Person Name Detection

**Property**: For any text containing a person name mention (e.g., "my name is X"), PATH C finds at least one PERSON finding.

```javascript
function prop_personNameDetected(name) {
  const text = `My name is ${name}`;
  const result = scanner.scan(text);
  const personFinding = result.findings.find(f => f.patternId === 'nlp_person_name');
  return personFinding !== undefined;
}
```

### AC 3.1: Job Title Detection

**Property**: For any text containing a job title mention (e.g., "I work as X"), PATH C finds at least one JOB finding.

```javascript
function prop_jobTitleDetected(jobTitle) {
  const text = `I work as a ${jobTitle}`;
  const result = scanner.scan(text);
  const jobFinding = result.findings.find(f => f.patternId === 'nlp_job_title');
  return jobFinding !== undefined;
}
```

### AC 4.1: Organization Detection

**Property**: For any text containing an organization mention (e.g., "I work at X"), PATH C finds at least one ORG finding.

```javascript
function prop_organizationDetected(orgName) {
  const text = `I work at ${orgName}`;
  const result = scanner.scan(text);
  const orgFinding = result.findings.find(f => f.patternId === 'nlp_organization');
  return orgFinding !== undefined;
}
```

### AC 5.4: Finding Structure

**Property**: All PATH C findings have required fields and correct structure.

```javascript
function prop_findingStructure(findings) {
  for (const f of findings) {
    assert(typeof f.patternId === 'string');
    assert(f.patternId.startsWith('nlp_'));
    assert(typeof f.label === 'string');
    assert(f.risk === 'low');  // All PATH C findings are 'low' risk
    assert(typeof f.rawMatch === 'string' && f.rawMatch.length > 0);
    assert(typeof f.safeVersion === 'string');
    assert(f.source === 'C_linguistic');
    assert(f.validated === false);
  }
  return true;
}
```

### AC 6.2: Graceful Degradation

**Property**: If compromise.js is unavailable, PATH C does not raise an error and returns empty findings.

```javascript
function prop_gracefulDegradation() {
  // Mock window.nlp as undefined
  const result = linguisticDetector.scan('My name is Alice');
  return Array.isArray(result) && result.length === 0;
}
```

### AC 7: Performance

**Property**: For typical input (100–500 chars), PATH C execution time is under 50ms.

```javascript
function prop_performanceBudget(text) {
  const start = performance.now();
  linguisticDetector.scan(text);
  const elapsed = performance.now() - start;
  return elapsed < 50;
}
```

## Design Decisions

1. **Fallback heuristics**: If compromise.js does not provide NER (or provides incomplete NER), we use regex-based trigger phrase extraction as a fallback. This ensures robustness.

2. **Risk level**: All PATH C findings are `low` risk because NER is probabilistic and entities alone do not identify an individual (per RA 10173). Contextual combination with PATH A/B findings may raise the overall risk score.

3. **No mathematical validation**: Unlike PATH A findings (which use validator.js for Luhn checks, etc.), PATH C findings have `validated: false`. This is appropriate because NER is a heuristic.

4. **Optional filtering**: Common first names and job titles can be filtered to reduce false positives, but this is optional and logged for transparency.

5. **Parallel execution**: PATH B and PATH C share the same `textNLP` input but execute independently. This allows future optimization (Web Workers, etc.) without architectural changes.

## Dependencies

- **compromise.js**: Main NLP library. Expected in global scope as `window.nlp`. Optional; detector gracefully skips if unavailable.
- **scanner.js**: Host module; needs updates to invoke PATH C and merge findings.
- **normalizer.js**: Provides `textNLP` normalized view (already exists).
- **patterns.js**: Needs new pattern definitions for PATH C entity types.

## Future Enhancements

1. **Dynamic entity types**: Extend NER to detect other entity types (LOCATION, PRODUCT, etc.) as needed.

2. **Confidence scoring**: Track compromise.js confidence scores for each entity; optionally weight findings by confidence.

3. **Context window expansion**: For trigger phrases, expand the extraction window based on punctuation and sentence boundaries.

4. **Custom NER model**: Train a domain-specific NER model on TrustPrompt-relevant entity types if default compromise.js coverage is insufficient.

5. **Language detection**: Detect non-English text and apply appropriate NLP pipeline (e.g., spaCy for multiple languages).

