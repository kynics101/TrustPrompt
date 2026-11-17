# Scanner Architecture Fix: Four-Path Parallel Execution

## Problem

The scanner was not properly implementing the agreed-upon four-path parallel architecture. Source code detection was nested inside `runPathA()`, meaning it only ran as part of PATH A's execution, not in true parallel with the other paths.

This meant:
- PATH B would complete without triggering source code detection
- Source code blocks would only be detected if PATH A was running
- The architecture was not symmetric across all paths

## Solution

Refactored the scanner to implement **four independent parallel paths**:

### Architecture Changes

```
BEFORE:
scan(rawText)
  ├─→ runPathA(textRegex)
  │     ├─→ Path A: regex + validator
  │     └─→ Path A: source code detection (NESTED) ❌
  │
  ├─→ PATH B: TrustGazetteer.scan(textNLP)
  │
  └─→ PATH C: TrustLinguisticDetector.scan(textNLP)
  
AFTER:
scan(rawText)
  ├─→ runPathA(textRegex)           [PATH A: regex + validator only]
  ├─→ TrustGazetteer.scan()         [PATH B: gazetteer]
  ├─→ TrustLinguisticDetector.scan()[PATH C: linguistic]
  └─→ runSourceCodeDetection()      [SOURCE CODE: parallel, independent] ✓
  
  All four paths run in parallel and return findings that are then merged.
```

### Detailed Changes

#### 1. **Created `runSourceCodeDetection()` function (New)**
- Extracted source code detection logic from `runPathA()`
- Runs independently on `normalisedText`
- Evaluates unformatted code blocks using `computeSourceCodeScore()`
- Performs credential escalation and context-aware elevation
- Returns array of findings with `patternId: "source_code"`

#### 2. **Cleaned up `runPathA()` function**
- Removed unformatted code block extraction (lines 1981-2015)
- Now only handles regex patterns and markdown-fenced code blocks
- Still handles markdown code with multi-feature scoring (TASK 12.1)
- Kept balanced for parallel execution

#### 3. **Updated `scan()` function**
- Now explicitly logs all four parallel paths
- Calls `runSourceCodeDetection(masked)` in parallel with other paths
- Updated merge call: `mergeAndDedupe(pathAFindings, pathBFindings, pathCFindings, sourceCodeFindings)`
- Updated logging to show source code findings count

#### 4. **Updated `mergeAndDedupe()` function**
- Added fourth parameter: `sourceCode = []`
- Properly includes source code findings in deduplication logic
- Maintains highest risk wins semantics

#### 5. **Updated Public API Exports**
- Added `runSourceCodeDetection` to TrustScanner public API

## Behavior Changes

### Source Code Detection Now:
✓ Runs **every scan**, regardless of what other paths detect
✓ Runs **in true parallel** with all three PII/credential paths
✓ Triggers for texts with **score ≥ 6 AND strong evidence present**
  - Your test case: score=6 with 1 strong evidence type (const keyword) → **SHOULD TRIGGER**
✓ Properly escalates to HIGH/MODERATE based on credentials found
✓ Can elevate via context-aware trigger phrases

### Example Flow (Your Test Case)

**Input:**
```javascript
const apiKey = 'sk-abc123def456ghi789';
async function fetchUser(userId) { ... }
```

**Source Code Detection Results:**
- Feature: code_keywords = 3 pts (const, async, function, return, await)
- Feature: braces = 2 pts (multiple braces)
- Feature: function_calls = 2+ pts
- **Total Score: 6+ pts**
- **Strong Evidence: YES** (code_keywords = 3 pts)
- **Classification: CODE** ✓
- **Escalation: HIGH** (API key detected: sk-...) ✓

This finding is added to the merged results and included in final risk calculation.

## Verification

✓ No TypeScript/JavaScript errors
✓ Architecture now symmetric across all paths
✓ Source code detection runs on every scan
✓ Findings properly merged and deduplicated
✓ Logging shows all four paths executing

## Files Modified

- `scanner.js`: Refactored scan pipeline architecture
