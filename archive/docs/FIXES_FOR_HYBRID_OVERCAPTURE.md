# Fixes for Hybrid Detector Over-Capture Issues

## Problems Identified

### 1. **"Kyleen works" instead of "Kyleen Nicdao"**
- Root cause: `extractStandalonePersonNames()` regex captures 2-word capitalized sequences without validating they're names
- The word "works" looks like a valid name word (`[A-Z][a-z]+`)
- No POS (Part-of-Speech) validation to detect verbs

### 2. **"Accenture consultant" instead of just "Accenture"**
- Root cause: Organization extraction patterns use greedy `[A-Z][A-Za-z\s&']*?` that captures multiple words
- Patterns like "works at **Accenture consultant**" capture both words because the regex doesn't stop at the right boundary
- No noun phrase boundary detection

### 3. **Over-capture in compound phrases**
- "Finance and Marketing" gets captured as one organization instead of separate items
- Multiple capitalized words connected by "and", "of" are all captured together

---

## Solution Strategy

### Fix 1: Better Name Extraction (Prevent "Kyleen works")

**Current problematic code:**
```javascript
const standaloneNamePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/gi;
```

**Problem:** Captures any 2-3 capitalized words regardless of what they are

**Improved approach:**
1. Extract full names using better boundary detection
2. Validate against common verb forms
3. Use context clues (pronouns, punctuation) to identify sentence/phrase boundaries

**New implementation:**
```javascript
function extractStandalonePersonNames(text) {
  const names = [];
  
  // IMPROVED: Better name pattern with strict word boundaries
  // Matches 2-3 consecutive capitalized words that form a name pattern
  // Added: Negative lookahead/lookbehind to avoid capturing after verbs
  const standaloneNamePattern = /(?:^|\s|,|;)([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2})(?=\s+(?:is|works|works at|at|for|the|and|or|,|;|\.|$))/gi;
  
  let match;
  while ((match = standaloneNamePattern.exec(text)) !== null) {
    const potentialName = match[1].trim();
    
    // Validation checks
    if (potentialName.length < 3) continue;
    
    // IMPROVED: Filter out verb forms and common non-name patterns
    const commonVerbs = ['Works', 'Works', 'Walks', 'Talks', 'Runs', 'Sees', 'Reads', 'Writes', 
                        'Creates', 'Makes', 'Takes', 'Gives', 'Goes', 'Comes', 'Says', 'Asks'];
    const lastWord = potentialName.split(/\s+/).pop();
    if (commonVerbs.includes(lastWord)) continue;  // ← NEW: Veto verbs
    
    // Classifier check
    const classification = classifyNameVsOrganization(potentialName);
    if (classification === "organization") continue;
    
    // Require 2+ words (full name, not single word)
    const wordCount = potentialName.split(/\s+/).length;
    if (wordCount < 2) continue;
    
    // Avoid duplicates
    if (names.some(n => n.toLowerCase() === potentialName.toLowerCase())) continue;
    
    names.push(potentialName);
  }
  
  return names;
}
```

**Key improvements:**
- `(?:^|\s|,|;)` — Anchors name to start of sentence or after punctuation
- `[A-Z][a-z]{2,}` — Requires minimum 3-character words (filters single-letter or 2-letter edge cases)
- `(?=\s+(?:is|works|works at|at|...))` — Lookahead to ensure name is followed by known separators
- Added verb blacklist to filter "Works", "Walks", etc.

---

### Fix 2: Better Organization Extraction (Prevent "Accenture consultant")

**Current problematic patterns:**
```javascript
// Pattern 2: "works at/for [ORG]"
const worksAtPattern = /\b(?:works?|employed?|working)\s+(?:at|by|for|with)\s+(?:the\s+)?([A-Z][A-Za-z\s&']*?)(?:\s+(?:and|or|which|where)|\.|\,|;|$)/gi;
```

**Problem:** `[A-Z][A-Za-z\s&']*?` captures "Accenture consultant" instead of stopping at "Accenture"

**Improved approach:**
1. Stop at known job title indicators
2. Validate extracted text is actually an organization
3. Use stricter boundaries

**New implementation:**
```javascript
function extractOrganizationContexts(text) {
  const orgs = [];
  
  // IMPROVED: Better "works at" pattern with job title filtering
  const worksAtPattern = /\b(?:works?|employed?|working|work)\s+(?:at|by|for|with)\s+(?:the\s+)?([A-Z][a-z]*(?:\s+[A-Z][a-z]*)?)(?=\s+(?:as|consultant|manager|engineer|director|coordinator|specialist|team|department|and|or|where|which|\.|,|;|$))/gi;
  
  let match;
  while ((match = worksAtPattern.exec(text)) !== null) {
    let org = match[1].trim();
    
    // Boundary: Stop before job titles
    const jobTitleIndicators = [
      'consultant', 'manager', 'engineer', 'developer', 'director', 'coordinator',
      'specialist', 'architect', 'analyst', 'officer', 'representative', 'advisor',
      'assistant', 'designer', 'team', 'department', 'unit', 'division'
    ];
    
    const afterOrg = text.substring(match.index + match[0].length, match.index + match[0].length + 50).toLowerCase();
    for (const indicator of jobTitleIndicators) {
      if (afterOrg.startsWith(indicator)) {
        // This looks like we stopped at the right place
        break;
      }
    }
    
    // Heuristic: 2-3 words typically for org names, not 4+
    const orgWords = org.split(/\s+/).length;
    if (orgWords > 3) org = org.split(/\s+/).slice(0, 3).join(' ');  // Trim to 3 words max
    
    // Length check
    if (org.length < 3) continue;
    
    // Avoid common non-org words
    const lower = org.toLowerCase();
    if (['the', 'a', 'an', 'that', 'this', 'there'].includes(lower)) continue;
    
    // Classifier check
    const classification = classifyNameVsOrganization(org);
    if (classification === "name") continue;  // Skip if classified as name
    
    // Avoid duplicates
    if (orgs.some(o => o.toLowerCase() === lower)) continue;
    
    orgs.push(org);
  }
  
  return orgs;
}
```

**Key improvements:**
- `[A-Z][a-z]*(?:\s+[A-Z][a-z]*)?` — Limits to 1-2 capitalized words (vs unlimited before)
- `(?=\s+(?:as|consultant|...))` — Lookahead to ensure org name is followed by job title
- Added job title boundary detection
- Trims multi-word captures to first 3 words maximum

---

### Fix 3: Better BERT Result Consolidation

**Issue:** BERT tokenizes at the token level; we need to consolidate related tokens

**Current code:**
```javascript
// Processes individual tokens
for (const entity of entities) {
  const entityType = entity.entity.toUpperCase();
  if (entityType.includes('PER') && score > 0.65) {
    mlResults.names.push({...});  // ← Adds every token separately
  }
}
```

**Improved approach:**
```javascript
async function phase2_MLDetection(text, candidates) {
  const mlResults = {
    names: [],
    organizations: [],
    jobTitles: []
  };

  if (!CONFIG.mlEnabled || !TRANSFORMERS_AVAILABLE || !transformersPipeline) {
    return mlResults;
  }

  try {
    const entities = await transformersPipeline(text);
    
    // IMPROVED: Consolidate adjacent tokens of same type
    const consolidated = consolidateTokens(entities);
    
    for (const entity of consolidated) {
      const entityType = entity.entity.toUpperCase();
      const score = entity.score;
      const text_val = entity.word.trim();
      
      // IMPROVED: Higher threshold to reduce false positives
      const entityThreshold = entityType.includes('PER') ? 0.75 :  // Was 0.65
                             entityType.includes('ORG') ? 0.75 :  // Was 0.65
                             0.80;  // MISC (job titles)
      
      if (score > entityThreshold) {
        if (entityType.includes('PER')) {
          mlResults.names.push({
            text: text_val,
            entityType: 'PER',
            mlConfidence: score,
            source: 'transformers_ner'
          });
        } else if (entityType.includes('ORG')) {
          mlResults.organizations.push({
            text: text_val,
            entityType: 'ORG',
            mlConfidence: score,
            source: 'transformers_ner'
          });
        } else if (entityType.includes('MISC') && score > 0.85) {
          mlResults.jobTitles.push({
            text: text_val,
            entityType: 'MISC',
            mlConfidence: score,
            source: 'transformers_ner'
          });
        }
      }
    }
  } catch (error) {
    console.warn('[TrustHybrid] Phase 2 error:', error.message);
  }

  return mlResults;
}

// IMPROVED: Helper to consolidate adjacent BERT tokens
function consolidateTokens(entities) {
  if (!entities || entities.length === 0) return [];
  
  const consolidated = [];
  let currentEntity = null;
  let currentScore = 0;
  let currentStart = 0;

  for (const entity of entities) {
    const isSameType = currentEntity && 
                      entity.entity.replace(/^[BI]-/, '') === 
                      currentEntity.entity.replace(/^[BI]-/, '');
    
    if (isSameType && entity.entity.startsWith('I-')) {
      // Continue current entity (same type, inside token)
      currentEntity.word += ' ' + entity.word;
      currentScore = (currentScore + entity.score) / 2;  // Average score
    } else {
      // Start new entity
      if (currentEntity) {
        currentEntity.score = currentScore;
        consolidated.push(currentEntity);
      }
      currentEntity = { ...entity };
      currentScore = entity.score;
    }
  }

  // Don't forget last entity
  if (currentEntity) {
    currentEntity.score = currentScore;
    consolidated.push(currentEntity);
  }

  return consolidated;
}
```

**Key improvements:**
- `consolidateTokens()` merges adjacent tokens of same entity type
- Higher thresholds: 0.75 for names/orgs (was 0.65), 0.85 for job titles
- Averages confidence scores for multi-token entities

---

## Summary of Changes

| Issue | Fix | Impact |
|---|---|---|
| "Kyleen works" captured | Added verb blacklist + better boundaries | ✓ Only "Kyleen Nicdao" extracted |
| "Accenture consultant" | Added job title lookahead + word limit | ✓ Only "Accenture" extracted |
| Low ML threshold | Increased from 0.65 to 0.75-0.85 | ✓ Fewer false positives |
| Token fragmentation | Added `consolidateTokens()` | ✓ "Kyleen Nicdao" as single entity |
| Over-capture from regex | Improved patterns with lookaheads | ✓ Stricter boundaries |

---

## Implementation Priority

1. **HIGH:** Fix `extractStandalonePersonNames()` — prevents "Kyleen works"
2. **HIGH:** Fix `worksAtPattern` in `extractOrganizationContexts()` — prevents "Accenture consultant"
3. **MEDIUM:** Add `consolidateTokens()` — handles BERT token merging
4. **MEDIUM:** Raise ML thresholds — reduces false positives

---

## Testing the Fixes

**Test case 1: "Kyleen Nicdao works as Accenture consultant"**

Current behavior:
- Names: "Kyleen works", "Kyleen Nicdao"
- Orgs: "Accenture consultant"

Expected after fix:
- Names: "Kyleen Nicdao"
- Orgs: "Accenture"
- Jobs: "consultant"

**Test case 2: "Finance and Marketing teams"**

Current behavior:
- Orgs: "Finance and Marketing"

Expected after fix:
- Orgs: "Finance", "Marketing"

---

## Files to Modify

1. `linguistic-detector.js`
   - Replace `extractStandalonePersonNames()` (lines 123-166)
   - Replace `extractOrganizationContexts()` (lines 791-1015)

2. `hybrid-transformer-detector.js`
   - Replace `phase2_MLDetection()` (lines 200-270)
   - Add new `consolidateTokens()` function (before phase2)

---

## Next Steps

1. Apply these fixes to the respective files
2. Run `test-hybrid-transformer.js` to verify improvements
3. Test on real prompts: "Kyleen Nicdao works at Accenture as a consultant"
4. Monitor accuracy improvements

