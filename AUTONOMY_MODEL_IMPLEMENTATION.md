# TrustPrompt User Autonomy Model Implementation

**Date:** September 25, 2026  
**Status:** ✅ IMPLEMENTED & TESTED (8/8 tests pass)

---

## Core Philosophy

**TrustPrompt respects user autonomy.** The system:
- ✅ Scans and detects PII patterns
- ✅ Calculates and displays risk scores
- ✅ Provides masked/safe versions
- ✅ **Allows users to decide** whether to send

Users are trusted to make informed decisions about their own content, even if flagged as risky (fake test data, made-up names, etc.).

---

## When to Block (During Scanning)

Submission is **BLOCKED** only while TrustPrompt is actively analyzing:

1. **Debounce Timer Starts** - User begins typing
2. **During Pattern Matching** - Analyzing text against known patterns
3. **During Risk Scoring** - Calculating overall risk level
4. **Before Badge Displays** - Until status is shown

**Block Duration:** PENDING → SCANNING → DONE states

---

## When to Allow (After Scanning)

Submission is **ALLOWED** once scan completes:

| Risk Level | Badge | User Action | Result |
|-----------|-------|-------------|--------|
| `none` | 🟢 Green | Press Enter | ✅ Send immediately |
| `low` | 🟡 Yellow | Press Enter | ✅ Send (can review) |
| `moderate` | 🟠 Orange | Press Enter | ✅ Send (can copy safe version) |
| `high` | 🔴 Red | Press Enter | ✅ Send (can copy safe version) |
| *(empty)* | N/A | Press Enter | ✅ Send (no scan needed) |

**Key:** User autonomy applies to **all risk levels**, not just "none".

---

## Implementation Details

### 1. Modified handleSubmitAttempt() Function

**Old Behavior (Incorrect):**
```javascript
if (riskLevel === "none") {
  releaseSubmit(); // Blocked for all other levels
}
```

**New Behavior (Correct):**
```javascript
// Allow submission for ANY risk level (none/low/moderate/high)
// User has seen the badge and can make an informed decision
console.log("[TrustPrompt] scan complete, badge updated");
releaseSubmit(); // Always allowed after scan
```

### 2. Toast Messages During Scanning

**Only shown during PENDING/SCANNING states:**
```
"⏸ Scanning… TrustPrompt is analyzing your prompt. Please wait."
```

**Not shown after scan completes** - User can see badge and decide.

### 3. User Workflow

```
User Types
    ↓
    └─ Toast: "Scanning…" appears
       State: PENDING → SCANNING → DONE
       Badge: Updates to show risk level
    ↓
Badge Displays (green/yellow/orange/red)
    ↓
User Options:
  ├─ Press Enter to send original prompt
  ├─ Click "Copy Safe Version" (for moderate/high)
  ├─ Edit prompt manually
  └─ Close panel and discard
```

### 4. Early Submit During Debounce

If user presses Enter **before debounce expires**:

```
State: PENDING
Toast: "Scanning…" shows (user blocked)
Action: Debounce cancelled, scan runs immediately
After:  State → DONE, badge shows, user can now send
```

---

## Test Results

### Test Suite: `test-autonomy-model.js`

**All 8 tests PASSED (100% success rate):**

```
✓ TEST 1: Safe text (none) → scan complete → user sends
✓ TEST 2: High-risk (credit card) → scan complete → user CAN send ⭐
✓ TEST 3: Moderate-risk (email) → scan complete → user CAN send ⭐
✓ TEST 4: Low-risk content → scan complete → user sends
✓ TEST 5: Empty text → bypass scan → immediate allow
✓ TEST 6: Submit during debounce (PENDING) → BLOCKED until scan
✓ TEST 7: State machine transitions (IDLE → PENDING → SCANNING → DONE)
✓ TEST 8: User autonomy scenario - sends high-risk after reviewing ⭐
```

**⭐ = Critical tests proving user autonomy model works**

---

## Code Changes

### File: `content-script.js`

**Function: `handleSubmitAttempt(e)`**

```javascript
awaitScan().then(result => {
  console.log("[TrustPrompt/Claude] scan complete:", result);
  
  // Badge now shows the risk level — user can see and decide
  // Allow submission for ANY risk level (none/low/moderate/high)
  console.log("[TrustPrompt/Claude] scan complete, badge updated");
  console.log("[TrustPrompt/Claude] releasing submit — user has autonomy");
  releaseSubmit(); // Always allowed after scan completes
});
```

### File: `content-script.js`

**Toast Message During Scanning:**

```javascript
if (scanState === "PENDING" || scanState === "SCANNING") {
  showToast("⏸ Scanning… TrustPrompt is analyzing your prompt. Please wait.");
}
```

---

## Key Features

### ✅ Respect for User Choice
- Users are not forced to accept system decisions
- Users can send despite flagged content if they believe it's safe
- Users understand the risk and choose to proceed

### ✅ Clear Information
- Badge shows risk level before user submits
- Side panel provides detailed findings
- Safe version available for review/copying

### ✅ Smart Blocking
- Only blocks during active scanning (brief interruption)
- Releases immediately after analysis completes
- No friction once user is informed

### ✅ Flexible Options
- Send original prompt as-is
- Send masked/safe version (for moderate/high)
- Edit prompt manually
- Close and discard

---

## User Scenarios

### Scenario A: Test Data Submission
```
User: "My test card is 4532-1234-5678-9999"
System: Detects credit card pattern → HIGH risk
Badge: Shows 🔴 RED with findings
User: "This is just test data"
Action: User presses Enter → ✅ SENDS
Note: User made informed decision, system trusted them
```

### Scenario B: Real PII Mistake
```
User: (accidentally pasted real credit card)
System: Detects credit card pattern → HIGH risk
Badge: Shows 🔴 RED with "Credit Card Detected"
User: "Oh! That's real, I should redact it!"
Action: User clicks "Copy Safe Version" → edits → sends masked
Note: System prevented accidental leak while respecting autonomy
```

### Scenario C: Made-Up Names
```
User: "Contact Name: Fake Person, Email: test@test.com"
System: Detects email → MODERATE risk
Badge: Shows 🟠 ORANGE
User: "This is just test data"
Action: User presses Enter → ✅ SENDS
Note: User autonomy respected, but flagged for review
```

---

## Blocking vs. Non-Blocking States

### BLOCKING (User Cannot Send)
```
State: IDLE / PENDING / SCANNING
Badge: "Scanning…" (gray)
Toast: "Scanning… please wait"
Action: Enter key / Send button → BLOCKED
Until: Scan completes (state → DONE)
```

### NON-BLOCKING (User Can Send)
```
State: DONE
Badge: Risk level displayed (green/yellow/orange/red)
Toast: None (or informational only)
Action: Enter key / Send button → ✅ ALLOWED
Result: Submission proceeds with badge data sent to background
```

---

## Edge Cases Handled

### 1. Empty Text
```
Input: "" (empty)
Action: Immediately allowed
Reason: No PII to scan
```

### 2. Unchanged Text
```
State: DONE (cached from previous scan)
User Edits: Deletes character, re-adds it (same text)
Action: Scan skipped, previous result used
Badge: Shows cached risk level
```

### 3. Multiple Submit Attempts
```
First Enter: State PENDING → blocked, scans
Second Enter: State DONE → allowed
Result: No duplicate scans, clean state management
```

### 4. Shift+Enter (New Line)
```
Key: Shift+Enter
Action: Debounce restarted, not treated as submit
Result: New line added, scanning continues
```

---

## Performance Characteristics

- **No extra delays** - Scan runs at 400ms natural debounce
- **Fast release** - Once scan complete, user can send immediately
- **No re-scanning** - Cached results used if text unchanged
- **Efficient events** - Capture phase, early returns, minimal DOM ops

---

## Integration Points

### Content Script → Background
```javascript
sendToBackground({
  type: "SCAN_RESULT",
  riskLevel: riskLevel,     // none/low/moderate/high
  findings: findings,       // Pattern matches
  rawText: rawText          // Original text
});
```

### Badge State Flow
```
IDLE → PENDING (user typing)
      → SCANNING (debounce fires)
      → DONE (scan completes, badge updates)
      → User presses Enter → submission proceeds
```

---

## Files Modified

1. **`content-script.js`** - Core submit blocking logic
   - Updated `handleSubmitAttempt()` to allow all risk levels
   - Updated toast messages to show "Scanning…" (not "Blocked")
   - Respects user autonomy after scan completes

2. **`SUBMIT_INTERCEPTION_VERIFICATION.md`** - Documentation updated
   - Changed to "User Autonomy Model"
   - Updated test scenarios
   - Clarified blocking vs. non-blocking states

3. **`test-autonomy-model.js`** - New test suite
   - 8 comprehensive tests
   - Verifies blocking during scanning
   - Verifies allowing after scan
   - Tests user autonomy scenarios

---

## Design Philosophy Summary

> **TrustPrompt is a privacy advisor, not a gatekeeper.**
>
> The system warns users about potential PII exposure and provides tools
> to redact or mask content. But users retain full autonomy to decide what
> they share with AI, trusting their own judgment about whether flagged
> content is actual sensitive data or test/made-up values.

---

## Sign-Off

**Implementation Status:** ✅ COMPLETE  
**Test Status:** ✅ 8/8 PASSING (100%)  
**Philosophy:** ✅ USER AUTONOMY RESPECTED  

TrustPrompt now balances privacy protection with user agency. The system
protects against accidental data leaks while respecting user autonomy to
send content they believe is safe.

Ready for production deployment.

