# Final Diagnostic Guide - Source Code Risk Issue

## New Logging Added

I've added strategic logging to pinpoint exactly where source code findings are disappearing. Open your browser console and look for these key checkpoints:

### Checkpoint 1: Source Code Detection
```
[TrustPrompt/scanner] Running SOURCE CODE DETECTION (FIRST - before linguistic analysis)...
[TrustPrompt/scanner] runSourceCodeDetection: extracted X blocks
[TrustPrompt/scanner] Processing block: "..." classification=code
[TrustPrompt/scanner] Pushing finding: patternId=source_code, risk=low
[TrustPrompt/scanner] runSourceCodeDetection returning X findings
[TrustPrompt/scanner] SOURCE CODE DETECTION findings: X → source_code blocks
```

**What to check**: Are sourceCodeFindings being returned? What's the count?

### Checkpoint 2: Adding to PATH A (NEW - ADDED)
```
★★★ SOURCE CODE FINDINGS BEFORE CONCAT: pathAFindings.length=X, sourceCodeFindings.length=Y
★★★ SOURCE CODE FINDINGS AFTER CONCAT: pathAFindings.length=Z
```

**What to check**: Does pathAFindings.length increase after concat? If Y=1 but Z doesn't increase, something's wrong.

### Checkpoint 3: After Merge
```
[TrustPrompt/scanner] After merge: X findings - source_code count: Y
```

**What to check**: Does source_code count match what was added? If it drops to 0, it was lost in merge.

### Checkpoint 4: After Suppress Placeholders
```
[TrustPrompt/scanner] After suppressPlaceholders: X findings - source_code count: Y
```

**What to check**: Does source_code count stay the same? If it drops, it's being suppressed.

### Checkpoint 5: Right Before Scoring (NEW - ADDED)
```
★★★ ABOUT TO SCORE: findings.length=X, source_code count=Y
```

**What to check**: Are findings present RIGHT BEFORE scoring? This is critical.

### Checkpoint 6: Scoring Result (NEW - ADDED)
```
★★★ SCORING RESULT: score=X, riskLevel=Y
```

**What to check**: What score and risk level are returned?

---

## How to Debug

1. **Copy code**: `const myValue = 5;` into the chat
2. **Open DevTools**: Press F12
3. **Go to Console tab**
4. **Look for all ★★★ lines** (new logging)
5. **Report the exact sequence** to me

---

## What Each Result Means

### ✅ GOOD Scenario
```
★★★ SOURCE CODE FINDINGS BEFORE CONCAT: pathAFindings.length=0, sourceCodeFindings.length=1
★★★ SOURCE CODE FINDINGS AFTER CONCAT: pathAFindings.length=1
[TrustPrompt/scanner] After merge: 1 findings - source_code count: 1
[TrustPrompt/scanner] After suppressPlaceholders: 1 findings - source_code count: 1
★★★ ABOUT TO SCORE: findings.length=1, source_code count=1
★★★ SCORING RESULT: score=2, riskLevel=low
FINAL RESULT - risk: low score:2
```

### ❌ BAD Scenario 1: Lost in Merge
```
★★★ ABOUT TO SCORE: findings.length=0, source_code count=0
```
**Problem**: Findings disappeared between concat and scoring
**Location**: mergeAndDedupe() or suppressPlaceholders()

### ❌ BAD Scenario 2: Lost After Concat
```
★★★ SOURCE CODE FINDINGS AFTER CONCAT: pathAFindings.length=0
```
**Problem**: Concat didn't work
**Reason**: sourceCodeFindings might be empty or pathAFindings is being reset

### ❌ BAD Scenario 3: Empty Source Code Findings
```
★★★ NO SOURCE CODE FINDINGS TO ADD
```
**Problem**: runSourceCodeDetection() returned empty array
**Reason**: Detection might be failing or text not being passed correctly

---

## Next Steps

1. Test with the new logging
2. Take a screenshot of the console output
3. Tell me what you see at these checkpoints:
   - ★★★ SOURCE CODE FINDINGS BEFORE CONCAT
   - ★★★ ABOUT TO SCORE
   - ★★★ SCORING RESULT

This will tell us exactly where the bug is, and I can fix it in ONE shot instead of going back and forth.
