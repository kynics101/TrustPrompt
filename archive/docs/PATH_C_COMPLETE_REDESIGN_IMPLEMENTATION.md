# PATH C Complete Redesign - Implementation Plan

## Executive Summary

Current PATH C approach is fundamentally flawed:
- **False positives**: Matches everything capitalized, then tries to filter
- **False negatives**: Misses real names/orgs due to overly strict filters
- **Root cause**: Inverted logic - should match ONLY with strong context signals

## New Approach: Context-First Detection

Instead of: "Match broad pattern → Filter false positives"
Use: "Match only with strong contextual signals"

**Core principle**: A name/organization/job is only PII when context PROVES it's PII.

---

## Implementation Plan

### Step 1: Create New Module Structure

Create separate functions:
- `detectPersonNamesContextDriven(text)` - Returns array of {text, confidence, signal_type}
- `detectOrganizationsContextDriven(text)` - Returns array of {text, confidence, signal_type}
- `detectJobTitlesContextDriven(text)` - Returns array of {text, confidence, signal_type}

### Step 2: Implement Each Detector with Multiple Signals

#### Person Names - 5 Signals

**Signal 1: Explicit Cues (95% confidence)**
```javascript
const patterns = [
  /(?:my\s+name\s+is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
  /(?:i\s+am|i'm)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
  /(?:call\s+me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi,
];
```

**Signal 2: Honorific Markers (90% confidence)**
```javascript
/(?:Mr|Ms|Mrs|Dr|Prof|Rev|Engr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi
```

**Signal 3: Subject-Predicate (85% confidence)**
```javascript
// [Name] works at/for/in [Org]
// [Name] is a [Job]
// [Name] manages/leads [Team]
/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:works?|is\s+a|manages?|leads?)\s+/gi
```

**Signal 4: Reference Context (70% confidence)**
```javascript
// according to Maria, contact John, ask Sarah, tell Alice
/(?:according\s+to|contact|call|email|message|ask|tell)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/gi
```

**Signal 5: Repeated Mentions (75% confidence)**
```javascript
// Count capitalized words that appear 2+ times
// Exclude: the, and, this, that, common words
```

#### Organizations - 4 Signals

**Signal 1: Employment Context (90% confidence)**
```javascript
/(?:works?|employed?|working|part\s+of|member\s+of|head\s+of)\s+(?:at|by|for|in|with|of)\s+(?:the\s+)?([A-Z][A-Za-z\s&'-]*?)(?:\s+(?:and|or|which|where|department|division)|\.|\,|;|$)/gi
```

**Signal 2: Organization Markers (88% confidence)**
```javascript
// [Name] Inc, [Name] Corporation, University of [Name]
// Markers: Inc, Corp, Ltd, LLC, Company, University, etc.
```

**Signal 3: Structured Organization (82% confidence)**
```javascript
// "University of Santo Tomas", "Department of IT"
/\b(?:University\s+of|School\s+of|Department\s+of|College\s+of|Institute\s+of|Center\s+for)\s+(?:the\s+)?([A-Z][A-Za-z\s&'-]*?)(?:\.|\,|;|$)/gi
```

**Signal 4: Known Orgs Whitelist (70% confidence)**
```javascript
// Only large, well-known organizations
// Minimum 5 characters to avoid common names
// Whitelist: Google, Microsoft, Apple, IBM, etc.
```

#### Job Titles - 3 Signals

**Signal 1: Predicate Position (85% confidence)**
```javascript
// [Name] is a [Title]
// [Name] works as a [Title]
/(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is\s+a|works?\s+as\s+a)\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:at|in|for|of|with|by|and|or)|\.|\,|$)/gi
```

**Signal 2: Role Descriptors (80% confidence)**
```javascript
// "as the manager of", "serve as director", "head of operations"
// Extract the job phrase
/(?:as\s+(?:the\s+)?|serve\s+as\s+|head\s+of|chief\s+|responsible\s+for)\s+([a-z]+(?:\s+[a-z]+)*?)(?:\s+(?:of|at|in)|\.|\,|$)/gi
```

**Signal 3: Role Indicators (70% confidence)**
```javascript
// "my manager", "team lead", "senior engineer"
// Match: [INDICATOR] [NAME]
// Indicators: professor, manager, director, analyst, engineer, etc.
```

### Step 3: Scoring and Confidence

```javascript
const CONFIDENCE_LEVELS = {
  HIGH: 0.85,      // Redact immediately
  MEDIUM: 0.65,    // Flag for review
  LOW: 0.40        // Log and analyze
};

// Return findings with confidence:
{
  text: "Maria",
  confidence: 0.95,
  signal: "explicit_cue",
  signal_description: "Found after 'my name is'"
}
```

### Step 4: Disable False Positive Sources

1. **Don't match isolated capitalized words**
   - "Hello This" - No signal matches
   - "Good Day" - No signal matches

2. **Don't match common words**
   - "trust prompt sample" - Doesn't match any employment/name/role context

3. **Don't use weak heuristics**
   - Remove `classifyNameVsOrganization()` scoring (too vague)
   - Remove broad pattern matching + filtering approach

### Step 5: Integration Points

In `scan()` function:
```javascript
function scan(textNLP) {
  const findings = [];
  
  // NEW: Context-driven detection
  const personFindings = detectPersonNamesContextDriven(textNLP);
  const orgFindings = detectOrganizationsContextDriven(textNLP);
  const jobFindings = detectJobTitlesContextDriven(textNLP);
  
  // Convert to findings format
  for (const person of personFindings) {
    if (person.confidence >= CONFIDENCE_LEVELS.HIGH) {
      findings.push({
        patternId: 'nlp_person_name',
        label: `Person Name (${person.signal})`,
        risk: 'low',
        rawMatch: person.text,
        safeVersion: '[NAME REDACTED]',
        source: 'C_linguistic',
        validated: false,
        confidence: person.confidence,
        signal: person.signal
      });
    }
  }
  
  // Similar for org and job
  
  return findings;
}
```

---

## Expected Improvements

### False Positives Eliminated

| Input | Before | After |
|-------|--------|-------|
| "Hello this is important" | "Hello This" (FP) | None ✓ |
| "trust prompt sample system" | "Trust Prompt Sample" (FP) | None ✓ |
| "good day friend" | "Good Day" (FP) | None ✓ |

### False Negatives Reduced

| Input | Before | After |
|-------|--------|-------|
| "I met Maria at the conference" | Missed (single word) | "Maria" (Signal 4) ✓ |
| "works at Google" | Maybe missed | "Google" (Signal 1) ✓ |
| "John is a software engineer" | Maybe | "John" (Signal 3) + "software engineer" (Signal 1) ✓ |

### True Positives Preserved

| Input | Before | After |
|-------|--------|-------|
| "My name is Maria" | "Maria" ✓ | "Maria" (Signal 1, 95%) ✓ |
| "Mr. Smith works here" | "Smith" ✓ | "Smith" (Signal 2, 90%) ✓ |
| "Kyleen works in Accenture" | Maybe broken | Both ✓ |

---

## Implementation Roadmap

1. **Phase 1**: Implement `detectPersonNamesContextDriven()`
   - Add 5 signals
   - Test against sample sentences
   - Verify confidence scoring

2. **Phase 2**: Implement `detectOrganizationsContextDriven()`
   - Add 4 signals
   - Test employment contexts
   - Verify acronym handling

3. **Phase 3**: Implement `detectJobTitlesContextDriven()`
   - Add 3 signals
   - Test predicate position
   - Verify with common jobs

4. **Phase 4**: Integration
   - Update `scan()` function
   - Disable old extractStandalonePersonNames
   - Disable old extractOrganizationContexts
   - Disable old extractPredicateJobTitles

5. **Phase 5**: Testing
   - Test false positives are eliminated
   - Test false negatives are reduced
   - Test true positives are preserved
   - Verify confidence scoring

---

## Key Principles (DO NOT VIOLATE)

1. **Context is King**
   - Only match when context signals presence of PII
   - No broad pattern + filter approach

2. **Conservative by Default**
   - Miss real PII rather than flag false positive
   - User can provide feedback

3. **Confidence Scoring**
   - HIGH: 95%, 90%, 85% - immediate redaction
   - MEDIUM: 70%, 75% - flag for review
   - LOW: 65%, 40% - log for analysis

4. **No Dictionary Dependency**
   - Doesn't require complete name/org database
   - Works for unique/new names
   - Handles spelling variations

5. **Signals Are Declarative**
   - Each signal is one reason to flag PII
   - No complex scoring logic
   - Easy to understand why something was flagged

---

## Questions Before Implementation

1. Should we support multi-sentence context (e.g., previous sentence mentions role)?
2. Should we use compromise.js POS tags as signals?
3. What's the target false positive rate? (0%, 5%,10%?)
4. Should single-word organization names be supported or rejected?
5. Should we log rejected signals for analysis?
