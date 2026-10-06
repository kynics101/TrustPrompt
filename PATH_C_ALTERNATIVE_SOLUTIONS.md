# PATH C Alternative Solutions

Given that:
1. Dictionary-only approach misses too many names/orgs
2. Pattern-based NLP approach produces too many false positives
3. Can't disable PATH C entirely
4. Need to detect names/organizations with vague/unique spelling

## Alternative Solutions

### Solution 1: Statistical/ML Model (Recommended)
**Use a small quantized NER model instead of rule-based approach**

**How it works:**
- Use `transformers.js` with a quantized BERT-NER model
- Runs locally in browser (no external API)
- Returns named entity labels: PERSON, ORG, LOC, MISC
- Much more accurate than hand-crafted rules

**Pros:**
- Handles any name/organization (learned from training data)
- Reduces false positives significantly
- Handles context automatically
- Works with unique/misspelled names

**Cons:**
- Larger JS bundle size (~5-20MB for quantized model)
- Slower inference (but acceptable for pre-send checking)
- Requires model download on first use

**Implementation:**
```javascript
import { pipeline } from "@xenova/transformers";

const ner = await pipeline("token-classification", "Xenova/bert-base-multilingual-cased-ner");
const result = await ner("My name is Maria and I work at Google");
// Returns: [
//   { entity: "B-PER", word: "Maria", score: 0.99 },
//   { entity: "B-ORG", word: "Google", score: 0.98 }
// ]
```

**Decision threshold:** Flag if confidence > 0.75

---

### Solution 2: Hybrid Approach (Pattern + Model Fallback)
**Use rules for high-confidence cases, ML for ambiguous cases**

**How it works:**
1. Try strong context signals (explicit cues, honorifics)
2. If found → return with high confidence
3. If not found → use ML model as fallback
4. Combine results

**Pros:**
- Fast for common cases (rules)
- Accurate for edge cases (ML)
- Reduces model inference calls
- Best of both worlds

**Cons:**
- More complex implementation
- Need to maintain both systems

**Example:**
```
Input: "Kyleen works in Accenture"
→ Rule: "works in [ORG]" finds "Accenture" → return HIGH confidence
→ Rule: "subject predicate" finds "Kyleen" → return HIGH confidence

Input: "Claude believes in hope"
→ No rule matches
→ ML model: finds PERSON:"Claude", not person:"hope"
→ Return filtered results
```

---

### Solution 3: User-Controlled Sensitivity Settings
**Let users adjust detection sensitivity**

```javascript
const NER_CONFIG = {
  mode: "conservative" | "balanced" | "aggressive",
  // conservative: only high-confidence signals (>0.85)
  // balanced: medium + high (>0.65)
  // aggressive: all signals (>0.40)
  
  minNameConfidence: 0.80,    // user setting
  minOrgConfidence: 0.80,
  minJobConfidence: 0.75,
  
  // User can disable specific false positive sources
  disableIsolatedCapWords: true,    // don't flag "Hello"
  disableCommonPhrases: true,        // don't flag "sample prompt"
  requireContextSignal: true,        // only flag with strong context
};
```

**Pros:**
- Flexible - users can choose tradeoff
- Transparent - users understand what's flagged
- No algorithm changes needed

**Cons:**
- Doesn't fix underlying detection problems
- Users might choose wrong settings
- Still produces false positives

---

### Solution 4: Post-Processing / Veto Layer
**Additional filtering after detection to remove obvious false positives**

```javascript
const vetoPatterns = {
  // Veto if detected "name" is part of common phrase
  "hello this": true,
  "sample prompt": true,
  "trust prompt sample": true,
  
  // Veto if organization is actually a verb phrase
  "is responsible": true,
  "be sent to": true,
  "it won": true,
  
  // Veto if capitalized word appears at sentence start
  // (likely capitalization, not proper noun)
};

// After detection, check each finding against veto list
if (vetoPatterns[finding.rawMatch.toLowerCase()]) {
  continue; // skip this false positive
}
```

**Pros:**
- Simple to implement
- Can be updated based on user feedback
- Doesn't break existing logic

**Cons:**
- Still reactive (not proactive)
- Requires manual curation of false positive patterns
- Will always miss some false positives

---

### Solution 5: Prompt Context Awareness
**Analyze the type of prompt to adjust sensitivity**

```javascript
const promptType = detectPromptType(text);
// Detects: email, code, document, chat, etc.

// Different detection settings per type
const config = {
  email: { nameDetection: "high", orgDetection: "high" },
  code: { nameDetection: "low", orgDetection: "low" },
  chat: { nameDetection: "medium", orgDetection: "medium" },
  document: { nameDetection: "high", orgDetection: "high" },
};

// Apply appropriate detection rules
```

**Pros:**
- Context-aware (code shouldn't flag variables as names)
- Reduces false positives in code contexts
- Improves accuracy in natural language

**Cons:**
- Need to detect prompt type accurately
- More complex logic
- Still doesn't solve fundamental problem

---

### Solution 6: External NER API (Last Resort)
**Use cloud-based NER service when high accuracy needed**

**Services:**
- Google Cloud NLP
- AWS Comprehend
- IBM Watson NLP
- Azure Text Analytics

**Pros:**
- Best accuracy (enterprise-grade models)
- No local resource constraint
- Handles multiple languages

**Cons:**
- Privacy concerns (data sent to cloud)
- Network dependency
- Cost per request
- Latency
- User might reject due to privacy

---

## Recommendation: Solution 1 + Solution 3

**Use transformers.js BERT-NER model with user sensitivity settings**

### Why:
1. **Accuracy**: ML models are trained on real data, much better than hand-crafted rules
2. **Coverage**: Works with any name/organization
3. **Local**: Runs entirely in browser (privacy)
4. **Flexible**: Users can adjust sensitivity
5. **Maintainable**: No complex rules to maintain

### Implementation Steps:

**Step 1: Add transformers.js dependency**
```bash
npm install @xenova/transformers
```

**Step 2: Create NER detector**
```javascript
async function detectNEREntities(text) {
  const ner = await pipeline("token-classification", 
    "Xenova/bert-base-multilingual-cased-ner");
  const results = await ner(text);
  
  return {
    persons: results.filter(r => r.entity.includes("PER")),
    organizations: results.filter(r => r.entity.includes("ORG")),
    locations: results.filter(r => r.entity.includes("LOC")),
  };
}
```

**Step 3: Adjust confidence threshold**
```javascript
const findings = [];

for (const entity of nerResults.persons) {
  if (entity.score > config.minNameConfidence) {
    findings.push({
      type: 'nlp_person_name',
      text: entity.word,
      confidence: entity.score,
      source: 'C_linguistic_ml'
    });
  }
}
```

**Step 4: Let users adjust settings**
```javascript
// Settings UI allows user to choose:
// - Sensitivity: Conservative/Balanced/Aggressive
// - Min confidence: 0.50 - 0.95
// - Detection types: Names/Orgs/Jobs
```

---

## Quick Comparison

| Approach | Accuracy | Speed | Coverage | Complexity | Privacy |
|----------|----------|-------|----------|------------|---------|
| Current rules | 40% | Fast | Low | High | ✓ High |
| ML (transformers.js) | 85%+ | Slow* | High | Low | ✓ High |
| Hybrid | 90%+ | Fast** | High | High | ✓ High |
| Cloud API | 95%+ | Medium | High | Low | ✗ Low |
| User settings | ~50% | Fast | Low | Low | ✓ High |

*Slow but acceptable for pre-send check
**Hybrid is fast for common cases, slow for fallback

---

## Questions for Implementation:

1. **Model size acceptable?** (5-20MB quantized BERT)
2. **Download on first use okay?** (ML model cached after first use)
3. **User settings complexity acceptable?** (Sensitivity slider)
4. **Multi-language support needed?** (BERT handles 104 languages)
5. **Fallback behavior if model download fails?** (Use conservative rules)
