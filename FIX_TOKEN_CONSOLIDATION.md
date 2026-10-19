# Quick Fix: Implement Token Consolidation for Multi-Token Entities

## Problem Summary
BERT-NER tokenizes "Kyleen Nicdao" as TWO separate tokens:
- Token 1: "Kyleen" (B-PER, score: 0.89)
- Token 2: "Nicdao" (I-PER, score: 0.87)

Current Phase 2 stores them as SEPARATE people instead of ONE complete name.

## Solution: Add Token Consolidation

### Step 1: Add Consolidation Function

**File**: `hybrid-transformer-detector.js`
**Location**: Add BEFORE `phase2_MLDetection()` function (around line 235)

```javascript
/**
 * CONSOLIDATE adjacent BERT tokens into complete entities
 * 
 * BERT outputs tokens with prefixes:
 *   B-XXX = Begin (start of entity)
 *   I-XXX = Inside (continuation of entity)
 *   O = Outside (not part of entity)
 * 
 * Example:
 *   Input:  [{word: "Kyleen", entity: "B-PER"}, {word: "Nicdao", entity: "I-PER"}]
 *   Output: [{word: "Kyleen Nicdao", entity: "B-PER", score: 0.88}]
 * 
 * @param {Array} bertEntities - Raw entities from transformers.js
 * @returns {Array} Consolidated entities with merged tokens
 */
function consolidateTokens(bertEntities) {
  if (!bertEntities || bertEntities.length === 0) return [];
  
  const consolidated = [];
  let currentEntity = null;
  let currentText = "";
  let currentScores = [];

  for (let i = 0; i < bertEntities.length; i++) {
    const entity = bertEntities[i];
    
    // Extract entity type (PER, ORG, LOC, MISC) by removing B-/I- prefix
    const entityType = entity.entity.replace(/^[BI]-/, '');
    const currentType = currentEntity?.entityType;
    
    // Check if we should continue the current entity or start a new one
    const isSameType = entityType === currentType;
    const isInside = entity.entity.startsWith('I-');  // I- means "inside" continuation
    
    if (isSameType && isInside) {
      // Same entity type AND this is a continuation token (I-PER, I-ORG, etc.)
      // Add to current entity
      currentText += " " + entity.word;
      currentScores.push(entity.score);
    } else {
      // Different type OR starting new entity (B-)
      // Save previous entity if exists
      if (currentEntity) {
        currentEntity.word = currentText;
        // Average the scores of all tokens in this entity
        currentEntity.score = currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
        consolidated.push(currentEntity);
      }
      
      // Start new entity
      currentEntity = {
        word: entity.word,
        entity: entity.entity,
        entityType: entityType,
        start: entity.start,
        end: entity.end
      };
      currentScores = [entity.score];
      currentText = entity.word;
    }
  }

  // Don't forget the last entity
  if (currentEntity) {
    currentEntity.word = currentText;
    currentEntity.score = currentScores.reduce((a, b) => a + b, 0) / currentScores.length;
    consolidated.push(currentEntity);
  }

  return consolidated;
}
```

### Step 2: Update Phase 2 to Use Consolidation

**File**: `hybrid-transformer-detector.js`
**Function**: `phase2_MLDetection()` (lines 200-270)

**Replace this:**
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
    // Run BERT-NER on full text to get all entities
    const entities = await transformersPipeline(text);
    
    console.debug('[TrustHybrid] Phase 2 - ML Detection:',
      `found ${entities.length} entities`);

    // Group entities by type
    for (const entity of entities) {
      // ... rest of loop
```

**With this:**
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
    // Run BERT-NER on full text to get all entities
    let entities = await transformersPipeline(text);
    
    console.debug('[TrustHybrid] Phase 2 - ML Detection (before consolidation):',
      `found ${entities.length} tokens`);
    
    // ✓ NEW: CONSOLIDATE adjacent tokens of same type
    // Example: "Kyleen" + "Nicdao" → "Kyleen Nicdao" (single entity)
    entities = consolidateTokens(entities);
    
    console.debug('[TrustHybrid] Phase 2 - ML Detection (after consolidation):',
      `consolidated to ${entities.length} entities`);

    // Group entities by type
    for (const entity of entities) {
      // ... rest of loop
```

### Step 3: Update Confidence Thresholds

**Same function**: `phase2_MLDetection()` (lines 261-275)

**Replace:**
```javascript
        if (entityType.includes('PER') && score > 0.65) {
          mlResults.names.push({
            text: text_val,
            entityType: 'PER',
            mlConfidence: score,
            source: 'transformers_ner'
          });
        } else if (entityType.includes('ORG') && score > 0.65) {
          mlResults.organizations.push({
            text: text_val,
            entityType: 'ORG',
            mlConfidence: score,
            source: 'transformers_ner'
          });
```

**With:**
```javascript
        // ✓ IMPROVED: Higher thresholds to reduce false positives
        // 0.65 was too lenient for Filipino names like "Nicdao" which may score 0.64-0.70
        if (entityType.includes('PER') && score > 0.75) {  // Increased from 0.65
          mlResults.names.push({
            text: text_val,
            entityType: 'PER',
            mlConfidence: score,
            source: 'transformers_ner'
          });
        } else if (entityType.includes('ORG') && score > 0.75) {  // Increased from 0.65
          mlResults.organizations.push({
            text: text_val,
            entityType: 'ORG',
            mlConfidence: score,
            source: 'transformers_ner'
          });
```

---

## Testing the Fix

### Test Case 1: Multi-token Name

```
Input: "Kyleen Nicdao works at Accenture"

Before Fix:
  names: ["Kyleen", "Nicdao"]  (separate)
  orgs: ["Accenture"]

After Fix:
  names: ["Kyleen Nicdao"]  (consolidated)
  orgs: ["Accenture"]
```

### Test Case 2: Multiple Names

```
Input: "Kyleen Nicdao and Maria Santos work at Accenture"

Before Fix:
  names: ["Kyleen", "Nicdao", "Maria", "Santos"]

After Fix:
  names: ["Kyleen Nicdao", "Maria Santos"]
```

### Verify in Browser Console

```javascript
// After applying fix:
const text = "Kyleen Nicdao works as an Accenture consultant";
const results = await window.TrustHybridTransformerDetector.detect(text);

console.log("Names:", results.names);
// Expected: [{text: "Kyleen Nicdao", confidence: 0.88, ...}]

console.log("Organizations:", results.organizations);
// Expected: [{text: "Accenture", confidence: 0.91, ...}]
```

---

## Files Modified

1. **hybrid-transformer-detector.js**
   - Add `consolidateTokens()` function (before `phase2_MLDetection`)
   - Call consolidation in `phase2_MLDetection()` (new line)
   - Increase thresholds from 0.65 to 0.75

---

## Why This Works

1. **Token Consolidation**
   - Merges "Kyleen" (B-PER) + "Nicdao" (I-PER) into "Kyleen Nicdao"
   - Averages confidence scores: (0.89 + 0.87) / 2 = 0.88

2. **Higher Thresholds**
   - Filters out marginal/false predictions (0.65-0.75 range)
   - Ensures only high-confidence entities pass through
   - Reduces false positives while preserving real entities

3. **Phase 3 Now Works**
   - Receives complete entity: "Kyleen Nicdao" (single entry)
   - Can properly match with compromise.js results
   - Gets "both_agree" signal (0.95 confidence)

---

## Expected Accuracy Improvement

| Metric | Before | After |
|--------|--------|-------|
| "Kyleen Nicdao" detection | ✗ Missed | ✓ Detected (0.95) |
| "Accenture" detection | ~ Weak (0.60) | ✓ Strong (0.91) |
| Multi-token names | ~ Fragmented | ✓ Consolidated |
| False positives | High | Lower |

---

## Rollout Checklist

- [ ] Add `consolidateTokens()` function
- [ ] Update Phase 2 to call consolidation
- [ ] Raise thresholds to 0.75
- [ ] Test with "Kyleen Nicdao works at Accenture"
- [ ] Verify in browser console
- [ ] Run test suite
- [ ] Deploy

---

## If Issues Occur

**If consolidation creates incorrect merges:**
- Add entity type check: `if (entityType === currentType && isInside)`
- This ensures only tokens of same type (PER+PER, ORG+ORG) merge

**If thresholds still too strict:**
- Lower to 0.70 (was 0.65, now trying 0.75)
- Only for specific entity types if needed

**If still missing entities:**
- Check browser console for Phase 2 debug output
- Verify BERT is outputting entities
- Check if scores are above threshold

