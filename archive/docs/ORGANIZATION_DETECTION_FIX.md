# Organization Misclassification Fix

## Problem Statement

The linguistic detector (Path C) was incorrectly classifying common words as organizations when analyzing "paul have diabetes":

### False Positives Detected
- **"Paul"** → Classified as organization (should be person name)
- **"have"** → Classified as organization (should not be detected at all)
- **"diabetes"** → Classified as organization (should be medical term)

### Desired Behavior
- **"paul have diabetes"** should only detect:
  - Name: "Paul"
  - Medical: "diabetes"
  - No organizations at all

## Root Cause

The compromise.js NLP library's Named Entity Recognition (NER) `doc.organizations()` method was overly aggressive and tagging single-word candidates and common words as organizations.

**Original filtering in `extractOrganizations()`**:
```javascript
// Only checked length, not content
if (!rawMatch || rawMatch.length < 3) continue;
if (isCodePattern(text, rawMatch)) continue;
```

**Problem**: 
- "Paul" (4 chars) → passes length check
- "have" (4 chars) → passes length check  
- "diabetes" (8 chars) → passes length check

The filters didn't check if the candidate was actually a name, verb, or medical term.

## Solution

Created a new filtering function `shouldFilterCommonOrganization()` that specifically rejects:

### 1. Common Person Names (First & Last)
```javascript
const commonNames = new Set([
  'paul', 'john', 'james', 'michael', 'david', 'robert', 'william', 'richard',
  'charles', 'joseph', 'thomas', 'alice', 'mary', 'patricia', 'jennifer', 'linda',
  'barbara', 'susan', 'jessica', 'sarah', 'karen', 'nancy', 'betty', 'margaret',
  'smith', 'johnson', 'williams', 'brown', 'jones', 'garcia', 'miller', 'davis',
  'rodriguez', 'martinez', 'hernandez', 'lopez', 'reyes', 'cruz', 'torres', 'nicdao'
]);
if (commonNames.has(lower)) return true;
```

### 2. Medical Terms
```javascript
const medicalTerms = new Set([
  'diabetes', 'cancer', 'fever', 'hypertension', 'depression', 'anxiety', 'asthma',
  'arthritis', 'allergies', 'infection', 'virus', 'bacteria', 'treatment', 'medication',
  'diagnosis', 'disease', 'illness', 'condition', 'symptom', 'pain', 'fatigue',
  'headache', 'migraine', 'flu', 'cold', 'cough', 'pneumonia', 'covid', 'mpox'
]);
if (medicalTerms.has(lower)) return true;
```

### 3. Common Verbs
```javascript
const commonVerbs = new Set([
  'have', 'has', 'had', 'do', 'does', 'did', 'be', 'being', 'been',
  'is', 'are', 'was', 'were', 'am', 'will', 'would', 'could', 'should',
  'may', 'might', 'must', 'can', 'need', 'want', 'like', 'love', 'think',
  'know', 'believe', 'say', 'said', 'tell', 'told', 'ask', 'asked', 'give',
  'made', 'make', 'work', 'help', 'go', 'come', 'get', 'take', 'bring'
]);
if (commonVerbs.has(lower)) return true;
```

### 4. Single-Word Non-Organizations
```javascript
const singleWordNonOrgs = new Set([
  'and', 'or', 'but', 'the', 'a', 'an', 'this', 'that', 'these', 'those',
  'person', 'people', 'thing', 'stuff', 'item', 'group', 'team', 'member',
  'information', 'data', 'system', 'technology', 'service', 'result', 'file',
  'name', 'file', 'type', 'text', 'content', 'message', 'email', 'phone'
]);

const words = lower.split(/\s+/).length;
if (words === 1 && singleWordNonOrgs.has(lower)) return true;
```

### 5. Lowercase Single Words (Unlikely Org Names)
```javascript
// Real org names are typically capitalized and/or multi-word
if (words === 1 && /^[a-z]+$/.test(candidate)) return true;
```

## Implementation Details

**File Modified**: `linguistic-detector.js`

**New Function**: `shouldFilterCommonOrganization()` (added before `isCodePattern()`)

**Updated Method**: `extractOrganizations()` now calls this filter at 4 points:
1. Line ~1376: Filter NER results from `doc.organizations()`
2. Line ~1404: Filter contextual organization extractions
3. Line ~1420: Filter appositive phrase organizations
4. Line ~1441: Filter entity context organizations
5. Line ~1463: Filter trigger phrase organizations

## Test Results

All filtering tests pass:

✅ "Paul" → Filtered (person name)
✅ "paul" → Filtered (person name, lowercase)
✅ "have" → Filtered (common verb)
✅ "diabetes" → Filtered (medical term)
✅ "Google" → Kept (real organization)
✅ "Microsoft" → Kept (real organization)
✅ "Apple Inc" → Kept (multi-word organization)
✅ "OICT" → Kept (acronym organization)
✅ "Acme" → Kept (capitalized org-like name)
✅ "John Smith Company" → Kept (multi-word with "company")
✅ "John" → Filtered (just a person name)

## Impact

### User Benefit #1: Accurate PII Detection
- **Before**: "paul have diabetes" → 3 organizations detected (wrong!)
- **After**: "paul have diabetes" → 1 name + 1 medical term (correct!)

### User Benefit #2: Better Risk Scoring
- Correct entity types detected → Accurate multiplier calculation
- Distinct entity type count is accurate
- Risk badge reflects real disclosure risk, not false positives

### User Benefit #3: Cleaner UI
- No confusing extra findings in the side panel
- Masked version doesn't over-redact
- Users see actual PII they shared, not algorithm artifacts

## Backward Compatibility

✅ **Fully backward compatible**
- Real organizations (Google, Microsoft, Apple Inc, etc.) still detected
- Multi-word organization names preserved
- Acronyms and capitalized org names work correctly
- No API changes or data structure modifications
- Existing findings that were correct remain unchanged

## False Positive Prevention

The comprehensive filter prevents common NER misclassifications:

| Misclassified As Org | Actual Type | Filter Applied |
|---|---|---|
| Paul | Person name | Common names set |
| have | Verb | Common verbs set |
| diabetes | Medical term | Medical terms set |
| data | Technology term | Single-word non-orgs set |
| john | Person name | Common names set |

## Extensibility

The filter is designed to be easily extended with additional categories:
```javascript
// Can add more categories as needed:
const commonLocationTerms = new Set([...]);
const commonTitleTerms = new Set([...]);
if (commonLocationTerms.has(lower)) return true;
if (commonTitleTerms.has(lower)) return true;
```
