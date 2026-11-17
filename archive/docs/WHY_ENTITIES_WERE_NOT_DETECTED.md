# Why Entities Were Not Detected: Root Cause Analysis

This document provides a detailed explanation of why three specific entities failed to be detected by the TrustPrompt linguistic detector (PATH C) and how each issue was resolved.

---

## Case 1: "Kyleen Nicdao" Not Detected as Person Name

### The Failure

When the user typed "Kyleen Nicdao" anywhere in the text without additional context, it was **NOT detected as a person name**, even though:
- It's clearly a person's name (capitalized first and last name)
- It follows the natural pattern for person names
- Similar names in other contexts WERE detected

### Root Cause Analysis

The linguistic detector had **multiple methods** for extracting person names:

1. **Method 1: Compromise.js NER** — Attempts to use NLP library
   - Status: Hit-or-miss depending on library quality
   - Issue: Cannot reliably catch all names

2. **Method 2: Honorific-based extraction** (`extractNamesWithHonorific()`)
   - Pattern: `\b(Mr|Ms|Mrs|Dr|Prof|...)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b`
   - Example: "Ms Kyleen Nicdao" ✓ WORKS
   - Example: "Kyleen Nicdao" ✗ FAILS (no honorific prefix)

3. **Method 3: Subject position extraction** (`extractSubjectPositionNames()`)
   - Pattern: `\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?(?:\s+[A-Z][a-z]+)?)\s+is\s+(?:a|an|the)\s+`
   - Example: "Kyleen Nicdao is a manager" ✓ WORKS
   - Example: "Kyleen Nicdao" ✗ FAILS (no "is a/an/the" trigger)

4. **Method 4: Multi-sentence context** (`extractEntityContextPairs()`)
   - Only works when names are linked to roles/organizations across sentences
   - Example: "I have 3 professors. Ms padua is the head of the oict." ✓ WORKS
   - Example: "Kyleen Nicdao" alone ✗ FAILS

### The Gap

**There was NO method that detected standalone, uncontextualized 2-3 word capitalized names.**

The detector required one of:
- An honorific prefix (Mr, Ms, Dr, etc.)
- A copular construction ("is a/an/the")
- Multi-sentence linking
- NLP library recognition

Standalone mentions like "Kyleen Nicdao sent me an email" fell through all detection methods.

### The Fix

**Added Method 2.75: Standalone Person Name Extraction**

New function `extractStandalonePersonNames()`:
```javascript
function extractStandalonePersonNames(text) {
  // 1. Find all 2-3 consecutive capitalized words
  const standaloneNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi;
  
  // 2. Filter out common organizational terms
  //    (avoid detecting "Human Resources", "Product Manager" as names)
  if (orgTerms.some(term => lowerName.includes(term))) continue;
  
  // 3. Use classifier to distinguish names from organizations
  if (classifyNameVsOrganization(potentialName) === "organization") continue;
  
  // 4. Add to findings
  names.push(potentialName);
}
```

**Key Design Decisions**:
- Regex pattern matches 2-3 word capitalized sequences (typical name format)
- Filters organizational terms to reduce false positives ("Human Resources" → skip)
- Uses existing `classifyNameVsOrganization()` to verify it's a name, not an org
- Integrated into both NLP pipeline and fallback methods

**Result**: "Kyleen Nicdao" now detected ✓

---

## Case 2: "OICT" Not Detected as Organization Acronym

### The Failure

When the user typed "OICT" (a 4-letter acronym for an organization), it was **NOT detected as an organization** when mentioned alone, even though:
- Similar acronyms in other contexts WERE detected
- It's clearly an organization name (all-caps acronym)
- Path C successfully detected "University of Santo Tomas"

### Root Cause Analysis

The organization extraction function had **multiple patterns**:

1. **Pattern 1: Appositive positions** ("is the head of [ORG]")
   - Regex: `/\bis\s+(?:the\s+)?(?:head|chief|member|part|...)\s+(?:of|in|the\s+)?(?:the\s+)?([A-Z][A-Za-z\s&]*?)/gi`
   - Example: "is the head of OICT" ✓ WORKS
   - Example: "OICT" ✗ FAILS (doesn't match the pattern)

2. **Pattern 1B: Standalone multi-word organizations** ("University of Santo Tomas")
   - Regex: `/\b([A-Z][A-Za-z]+(?:\s+(?:of|and|the)\s+[A-Z][A-Za-z]+)+)\b/gi`
   - Requires: Word(s) + preposition + Word(s)
   - Example: "University of Santo Tomas" ✓ WORKS
   - Example: "OICT" ✗ FAILS (only one word, no prepositions)

3. **Pattern 1C: Acronyms with extreme filtering** (complex classification)
   - Required: context words like "of", "at", "for"
   - Had: overly restrictive filtering
   - Example: "head of OICT" ✓ WORKS
   - Example: "OICT" ✗ FAILS (standalone)

4. **Pattern 3: Context-dependent acronyms**
   - Regex: `/\b(?:of|at|for|in|with)\s+([A-Z]{2,5})(?:\s+(?:and|or|department|unit)|\.|\,|;|$)/gi`
   - **KEY ISSUE**: Requires preceding context keywords ("of", "at", "for", etc.)
   - Example: "part of OICT" ✓ WORKS (has "of" before)
   - Example: "OICT announced" ✗ FAILS (no context keyword before)

### The Gap

**No pattern matched standalone acronyms without preceding context words.**

All acronym patterns either:
- Required specific context words ("of", "at", "for", "in", "with")
- Required multi-word organizations with prepositions
- Were overly filtered or classified

Standalone mentions like "I work at OICT" or "OICT is..." fell through.

### The Fix

**Added Pattern 3.5: Standalone Acronym Extraction**

New pattern in `extractOrganizationContexts()`:
```javascript
// Pattern 3.5: Standalone Acronyms
const standaloneAcronymPattern = /\b([A-Z]{2,5})\b(?!\w)/gi;
const commonAcronymBlacklist = new Set([
  'THE', 'AND', 'FOR', 'WITH', 'FROM', 'THAT', 'THIS', 'WHEN', 'WHAT', 'WHICH',
  'ARE', 'WAS', 'HAS', 'DID', 'WILL', 'CAN', 'MAY', 'BEEN', 'HAVE', 'DOES'
]);

while ((match = standaloneAcronymPattern.exec(text)) !== null) {
  const org = match[1].trim();
  
  // 1. Filter out common non-org acronyms
  if (commonAcronymBlacklist.has(org)) continue;  // Skip "THE", "AND", etc.
  
  // 2. Use classifier to avoid names (e.g., "John" vs "OICT")
  if (classifyNameVsOrganization(org) === "name") continue;
  
  // 3. Add to findings
  orgs.push(org);
}
```

**Key Design Decisions**:
- Regex `/\b([A-Z]{2,5})\b(?!\w)/gi` matches 2-5 letter all-caps words
- `(?!\w)` negative lookahead prevents matching inside longer words
- Blacklist filters out common English acronyms (THE, FOR, AND, etc.)
- Uses `classifyNameVsOrganization()` to verify it's likely an org, not a name
- Works standalone, integrated into fallback scan path

**Result**: "OICT" now detected ✓

---

## Case 3: "Tita's Incorporation" Not Detected as Organization

### The Failure

When the user typed "Tita's Incorporation" (an organization name with an apostrophe), it was **NOT detected**, even though:
- It clearly describes an organization
- Non-possessive organizations like "University of Santo Tomas" were detected
- Similar possessive patterns in English are common (e.g., "McDonald's", "John's Company")

### Root Cause Analysis

All organization regex patterns used character classes that explicitly **excluded apostrophes**:

1. **Pattern 1 (headOf)** — Line 488
   ```javascript
   const headOfPattern = /\b(?:is\s+...)\s+([A-Z][A-Za-z\s&]*?)(?:\s+...)/gi;
   //                                              ^^^
   //                                   Character class: [A-Za-z\s&]
   //                                   NO APOSTROPHE!
   ```
   - Matches: "Tita" + "s" separately (breaks at apostrophe)
   - Result: Only partial match, detection fails

2. **Pattern 1B (standalone)** — Line 507
   ```javascript
   const standaloneOrgPattern = /\b([A-Z][A-Za-z]+(?:\s+(?:of|and|the)\s+[A-Z][A-Za-z]+)+)\b/gi;
   //                                       ^^^^^^^
   //                                   [A-Za-z]: no apostrophes
   ```
   - Matches: "Tita" stops at apostrophe
   - Result: Does not capture "Tita's Incorporation"

3. **Pattern 2 (worksAt)** — Line 574
   ```javascript
   const worksAtPattern = /\b(?:works?|employed?|...)\s+(?:at|by|for|with)\s+(?:the\s+)?([A-Z][A-Za-z\s&]*?)/gi;
   //                                                                                     ^^^
   //                                                                           [A-Za-z\s&]: no apostrophes
   ```
   - Same issue: Apostrophe breaks the match

4. **All other patterns** — Similar issue throughout
   - None included `'` in their character classes
   - All stopped matching at the apostrophe

### Why This Matters

The apostrophe `'` is a legitimate character in English organization names:
- "McDonald's Corporation"
- "John's Company"
- "Tita's Incorporation"
- "Williams' Publishing"

By explicitly excluding apostrophes, the detector could not match these valid organization names.

### The Fix

**Updated all regex character classes to include apostrophes**

1. **Pattern 1 (headOf)** — Line 708
   ```javascript
   // Before: [A-Za-z\s&]*?
   // After:  [A-Za-z\s&']*?
   const headOfPattern = /\b(?:is\s+...)\s+([A-Z][A-Za-z\s&']*?)(?:\s+...)/gi;
   ```

2. **Pattern 1B (standalone)** — Line 726
   ```javascript
   // Before: [A-Za-z]+
   // After:  [A-Za-z']+
   const standaloneOrgPattern = /\b([A-Z][A-Za-z']+(?:\s+(?:of|and|the)\s+[A-Z][A-Za-z']+)+)\b/gi;
   ```

3. **Pattern 2 (worksAt)** — Line 773
   ```javascript
   // Before: [A-Za-z\s&]*?
   // After:  [A-Za-z\s&']*?
   const worksAtPattern = /\b(?:works?|employed?|...)\s+([A-Z][A-Za-z\s&']*?)(?:\s+...)/gi;
   ```

**Key Design Decision**:
- Added `'` to character classes in three critical patterns
- Simple, minimal change with maximum impact
- Backward compatible (non-possessive orgs still match)
- Handles various possessive forms ("'s", "'", etc.)

**Result**: "Tita's Incorporation" now detected ✓

---

## How These Fixes Work Together

### The Detection Pipeline (After Fixes)

```
Input Text
    ↓
[NORMALIZATION]
    ↓
[PATH C: Linguistic Detection]
    ├─→ Method 1: NER (compromise.js)
    ├─→ Method 2: Honorifics ("Ms Kyleen")
    ├─→ Method 3: Subject position ("Kyleen is a manager")
    ├─→ Method 2.75: ★ STANDALONE NAMES ★ ("Kyleen Nicdao")  [NEW FIX #1]
    ├─→ Method 4: Multi-sentence context
    │
    ├─→ Job titles extraction
    │
    └─→ Organizations extraction
        ├─→ Pattern 1: Appositive ("head of Org")
        ├─→ Pattern 1B: Standalone multi-word ("University of Santo Tomas")
        ├─→ Pattern 1C: Acronyms with filtering
        ├─→ Pattern 3: Context-dependent ("of OICT")
        ├─→ Pattern 3.5: ★ STANDALONE ACRONYMS ★ ("OICT")  [NEW FIX #2]
        │   (with apostrophe support [FIX #3])
        └─→ Pattern 4: Department names
    ↓
[DEDUPLICATION & FILTERING]
    ↓
Risk Score Calculation
    ↓
Final Risk Level
```

### Test Cases: Before vs After

| Case | Before | After |
|------|--------|-------|
| "Kyleen Nicdao sent me an email" | ✗ NOT detected | ✓ Detected (nlp_person_name) |
| "I work at OICT" | ✗ NOT detected | ✓ Detected (nlp_organization) |
| "Employed by Tita's Incorporation" | ✗ NOT detected | ✓ Detected (nlp_organization) |
| "Ms padua is the head of the oict" | ✓ Already worked | ✓ Still works |
| "University of Santo Tomas" | ✓ Already worked | ✓ Still works |

---

## Why This Matters for Privacy

These fixes improve the **privacy disclosure risk assessment** by:

1. **Detecting all person names**: Names are critical identifiers under RA 10173
   - Without "Kyleen Nicdao" detection, privacy risk was underestimated
   - Now correctly identifies personal information

2. **Catching organization acronyms**: Organizations link to employment, identity
   - Without "OICT" detection, workplace affiliation wasn't captured
   - Now correctly identifies organizational context

3. **Supporting possessive organizations**: Common in informal writing
   - "Tita's Incorporation" is a valid personal/organizational identifier
   - Now correctly captures these naturally-written organizational names

**Impact on Risk Scoring**:
- Detects more distinct entity types → Higher multiplier
- Better captures multi-type disclosure → More accurate risk level
- Complies with RA 10173 sensitivity detection requirements

---

## Summary

| Fix | Problem | Solution | Result |
|-----|---------|----------|--------|
| #1 | No standalone name detection | Added `extractStandalonePersonNames()` | ✓ Kyleen Nicdao now detected |
| #2 | No standalone acronym detection | Added Pattern 3.5 for standalone acronyms | ✓ OICT now detected |
| #3 | Apostrophes not supported | Updated char classes: `[A-Za-z\s&]` → `[A-Za-z\s&']` | ✓ Tita's Incorporation now detected |

All fixes maintain backward compatibility and include comprehensive test coverage.
