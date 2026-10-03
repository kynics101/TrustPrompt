# Test Instructions: Source Code Detection Fix

## Quick Summary
Fixed two layers of issues preventing source code from reaching governance and badge:

1. **Layer 1 (Scanner Pipeline)**: Added logging to trace source_code findings through governance
2. **Layer 2 (Path C Filtering)**: Prevented Path C from misclassifying code as organizations

---

## What Was Wrong

### Problem 1: Console Detection Only
```
✓ Console detected: "source_code block found"
✗ Badge displayed: "No risk found" or wrong risk level
```

### Problem 2: Path C Misclassification
```
Input: const myValue = 5;
Before fix: Detected as nlp_organization (2 matches) ← WRONG
After fix:  Detected as source_code (1 match) ← CORRECT
```

---

## How to Test

### Test Case 1: Simple Code Variable
**Prompt:**
```
const myValue = 5;
```

**Expected Results After Fix:**
```
Console Logs:
[TrustPrompt/scanner] PATH A findings: 0
[TrustPrompt/scanner] PATH B findings: 0
[TrustPrompt/scanner] PATH C findings: 0  ← Filtered (was 2 before)
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks

Result:
✓ Badge shows: Low or Moderate risk
✓ Findings list includes: source_code (1 item)
✓ Risk level: "low" or "moderate"
```

### Test Case 2: Code with API Key
**Prompt:**
```
const apiKey = 'sk-abc123def456ghi789';
async function fetchUser(userId) {
  const res = await fetch('/api/users', {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  return res.json();
}
```

**Expected Results After Fix:**
```
Console Logs:
[TrustPrompt/scanner] PATH A findings: 0 or 1 (possible api_key detection)
[TrustPrompt/scanner] PATH B findings: 0
[TrustPrompt/scanner] PATH C findings: 0  ← No false organization matches
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code

Governance Decision:
- Code detected: source_code (5 points)
- Embedded credentials: apiKey escalation
- Result: HIGH risk (escalated due to credentials in code)

Result:
✓ Badge shows: High risk
✓ Findings include: source_code + api_key (if detected)
✓ Risk level: "high" (escalated)
```

### Test Case 3: Python Code
**Prompt:**
```
import psycopg2
connection = psycopg2.connect(
    host="db.example.com",
    database="prod_db",
    user="admin",
    password="SecurePassword123!"
)
```

**Expected Results After Fix:**
```
Console Logs:
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks

Code features detected:
- Keywords: import, connect
- Strong evidence: YES (import statement)
- Embedded credentials: YES (password in connection string)
- Classification: CODE
- Risk escalation: HIGH (credentials detected)

Result:
✓ Badge shows: High risk
✓ Findings: source_code
✓ Risk level: "high" (escalated for credentials)
```

### Test Case 4: Actual Organization Name
**Prompt:**
```
I work at Microsoft as a software engineer.
```

**Expected Results After Fix:**
```
Console Logs:
[TrustPrompt/scanner] PATH C findings: 1 → nlp_organization (Microsoft)
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 0

Result:
✓ Badge shows: Low risk
✓ Findings: nlp_organization (Microsoft)
✓ No false source_code detection
```

---

## Debugging: What to Check

### 1. If Badge Still Shows Wrong Risk

**Check Console for:**
```
[TrustPrompt/merge] After merge - source_code count: X
└─ Should be > 0 if code detected
└─ If 0, code is being lost in merge

[TrustPrompt/scorer] Scorable findings: X
└─ Should include "source_code" if it survived suppression
└─ If missing, source_code was filtered out as placeholder

[TrustPrompt/governance] Findings: X
└─ Should show source_code in findings list
└─ If missing, wasn't passed to governance
```

### 2. If Path C Still Shows False Positives

**Check Console for:**
```
[TrustPrompt/PATH C] detected (fallback): org:X
└─ Should be 0 for code-only prompts
└─ If > 0, code pattern filter might not be working
```

**Debug Filter:**
Add temporary logging in `isCodePattern()`:
```javascript
function isCodePattern(text, candidate) {
  console.log("[DEBUG] isCodePattern check:", { text: text.substring(0, 50), candidate });
  // ... rest of logic
  console.log("[DEBUG] isCodePattern result:", true|false);
}
```

### 3. If Governance Rules Not Applied

**Check Console for:**
```
[TrustPrompt/governance] Evaluating governance rules for X findings
[TrustPrompt/governance] Findings: source_code(low)
[TrustPrompt/governance] Rule 1 triggered: NO (not critical entity)
[TrustPrompt/governance] Rule 2 condition 1 - hasScoredEntity: YES
[TrustPrompt/governance] Rule 2 condition 2 - hasSensitiveContext: NO
[TrustPrompt/governance] Rule 3 check - hasAnyScoredEntity: YES, allLowImpact: NO
[TrustPrompt/governance] No rule triggered, retaining preliminary: moderate
```

---

## Key Logging Patterns to Expect

### Good Flow ✓
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1
[TrustPrompt/merge] After merge - source_code count: 1
[TrustPrompt/merge] After suppressPlaceholders - source_code count: 1
[TrustPrompt/scorer] Scorable findings: source_code
[TrustPrompt/governance] Findings: source_code(low)
→ Badge shows appropriate risk level ✓
```

### Bad Flow ❌
```
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1
[TrustPrompt/merge] After merge - source_code count: 0  ← Lost here!
[TrustPrompt/merge] After suppressPlaceholders - source_code count: 0
→ Badge shows wrong risk level ❌
```

---

## Version Check

### Before Updates
- Pattern A only matches formatted code (backticks)
- Path C misclassifies code as organizations
- source_code findings not scored

### After Updates
- Pattern A still only matches formatted code (unchanged)
- Path C filters code patterns correctly
- source_code findings properly scored and governed
- Full console trace enables debugging

---

## Browser Console Filter Tips

### View Only TrustPrompt Logs
```javascript
// In browser console, run:
// Filter to show only TrustPrompt logs
const filter = (msg) => msg.includes("[TrustPrompt");
console.log = ((orig) => (...args) => {
  if (args[0]?.toString().includes("[TrustPrompt")) {
    orig.apply(console, args);
  }
})(console.log);
```

### Search for Specific Issues
```
Path A issues: Search for "[TrustPrompt/scanner] PATH A"
Path C issues: Search for "[TrustPrompt/PATH C]"
Merge issues: Search for "[TrustPrompt/merge]"
Scoring issues: Search for "[TrustPrompt/scorer]"
Governance issues: Search for "[TrustPrompt/governance]"
```

---

## Expected Console Output (Complete Example)

### Input: `const myValue = 5;`

```
[TrustPrompt/scanner] SCAN START - input: const myValue = 5;
[TrustPrompt/scanner] Normalizing...
[TrustPrompt/scanner] Running PATH A (regex)...
[TrustPrompt/scanner] PATH A findings: 0
[TrustPrompt/scanner] Running PATH B (gazetteer)...
[TrustPrompt/scanner] PATH B findings: 0
[TrustPrompt/scanner] Running PATH C (linguistic)...
[TrustPrompt/PATH C] Attempting with compromise.js
[TrustPrompt/PATH C] detected (fallback): person:0 job:0 org:0
[TrustPrompt/scanner] PATH C findings: 0
[TrustPrompt/scanner] Running SOURCE CODE DETECTION (parallel with all paths)...
[TrustPrompt/CodeDetection] Feature: code_keywords 3 pts (threshold: >=1) PASS
[TrustPrompt/CodeDetection] Feature: import_stmts 0 pts (threshold: >=1) FAIL
[TrustPrompt/CodeDetection] Feature: braces 0 pts (threshold: >=2) FAIL
[TrustPrompt/CodeDetection] Feature: function_calls 0 pts (threshold: >=2) FAIL
[TrustPrompt/CodeDetection] Strong Evidence: CODE_KEYWORDS (3 pts)
[TrustPrompt/CodeDetection] Total Score: 3 (threshold: 6) | Strong Evidence: YES | Classification: CODE
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: 1 → source_code blocks
[TrustPrompt/merge] After merge: 1 findings - source_code count: 1
[TrustPrompt/merge] After suppressPlaceholders: 1 findings - source_code count: 1
[TrustPrompt/scorer] computeRiskScore called with 1 findings
[TrustPrompt/scorer] Scorable findings: source_code
[TrustPrompt/scorer] distinctTypes:1 [source_code] | base:5 ×1.00 = 5.00
[TrustPrompt/governance] Evaluating governance rules for 1 findings, preliminary: moderate
[TrustPrompt/governance] Findings: source_code(low)
[TrustPrompt/governance] Rule 2 condition 1 - hasScoredEntity: true types: source_code
[TrustPrompt/governance] Rule 2 condition 2 - hasSensitiveContext: false
[TrustPrompt/governance] Rule 3 check - hasAnyScoredEntity: true, allLowImpact: false
[TrustPrompt/governance] No rule triggered, retaining preliminary: moderate
[TrustPrompt/scanner] FINAL RESULT - risk: moderate score:5.00 | findings: 1
[TrustPrompt/scanner] Findings detail: source_code:const myValue = 5;
```

**Result**: Badge shows "Moderate risk - 1 item flagged" ✓

---

## Reporting Issues

If tests fail, provide:

1. **Exact input prompt**
2. **Expected vs. actual risk level**
3. **Console logs** (paste relevant [TrustPrompt] logs)
4. **Browser/environment**: Chrome version, OS, etc.
5. **Specific test case number** from above

---

## Success Criteria

- [ ] Test Case 1 passes (simple code variable)
- [ ] Test Case 2 passes (code with credentials)
- [ ] Test Case 3 passes (Python code)
- [ ] Test Case 4 passes (organization name, no false code detection)
- [ ] All console logs show expected patterns
- [ ] Badge displays appropriate risk levels
- [ ] No false nlp_organization detections for code
- [ ] source_code findings reach governance
