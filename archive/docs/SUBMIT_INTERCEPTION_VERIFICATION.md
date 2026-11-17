# Submit Interception Implementation - User Autonomy Model

**Date:** September 25, 2026  
**Status:** ✅ COMPLETE AND TESTED  

## Overview

This document verifies the submit interception system that **respects user autonomy**. TrustPrompt scans text and displays risk scores, but **allows users to send regardless of detected risk level**. The system only blocks submission **during scanning/scoring**, not after results are shown.

---

## Key Design Principle

**User Autonomy:** Users who believe flagged content (like made-up names, fake numbers, test data) is not actually a risk can proceed to send it. TrustPrompt provides the risk score and masked suggestions, but the final decision is the user's.

---

## Blocking Behavior

### WHEN TO BLOCK (Only During Scanning)

1. **Debounce Timer Starts** - Once user starts typing (prevents original unscanned submission)
2. **During Scanning** - While patterns are being analyzed
3. **During Scoring** - While risk level is being calculated
4. **Before Badge Shows** - Until status (safe/low/moderate/high) is displayed

### WHEN NOT TO BLOCK (Allow Submission)

1. ✅ After scan completes with `"none"` risk → Submit allowed immediately
2. ✅ After scan completes with `"low"` risk → Submit allowed (badge shows yellow)
3. ✅ After scan completes with `"moderate"` risk → Submit allowed (badge shows orange)
4. ✅ After scan completes with `"high"` risk → Submit allowed (badge shows red)
5. ✅ Empty text → Submit allowed without scanning
6. ✅ Text hasn't changed since last scan → Submit allowed immediately

---

## Implementation Changes

### 1. **Modified handleSubmitAttempt() Logic**

**Before (Incorrect):** Blocked submission for any risk level ≥ moderate
```javascript
if (result.riskLevel === "none") {
  releaseSubmit(); // BLOCKED for all other levels
}
```

**After (Correct):** Always allows submission once scan completes
```javascript
// Allow submission for ANY risk level (none/low/moderate/high)
console.log("[TrustPrompt/Claude] scan complete, badge updated");
releaseSubmit(); // ALLOWED regardless of risk
```

### 2. **Updated Toast Messages**

**During Scanning (Blocking):**
```
"⏸ Scanning… TrustPrompt is analyzing your prompt. Please wait."
```

**After Scan Complete (Not Blocking):**
- No blocking toast shown
- Badge displays risk level (user can review in side panel if needed)
- Submission proceeds automatically

### 3. **State Machine Behavior**

```
User Types
    ↓
PENDING state (debounce running)
    ↓
    ├─ User presses Enter/Send BEFORE debounce expires
    │  └─ BLOCKED: Toast shows "Scanning…"
    │     Then: Debounce cancelled, scan runs immediately
    │
    └─ Debounce expires
       └─ SCANNING state: runScan() executes
          ↓
          └─ DONE state: Results cached
             ↓
             ├─ Badge updates with risk level
             ├─ User presses Enter/Send
             └─ ALLOWED: Submit released regardless of risk
```

---

## Test Scenarios - User Autonomy Model

### Scenario 1: Safe Text (riskLevel = "none")
```
Input:          "Hello, how are you today?"
Scan Result:    "none"
Badge Shows:    ✅ Green "Safe — no issues found"
User Presses:   Enter
Action:         ✅ SUBMIT ALLOWED immediately
```

### Scenario 2: Low Risk - User Continues (riskLevel = "low")
```
Input:          Content with low-risk pattern
Scan Result:    "low"
Badge Shows:    ⚠️ Yellow "Low risk detected"
User Thinks:    "This is just test data, I'll send it"
User Presses:   Enter
Action:         ✅ SUBMIT ALLOWED (user autonomy)
Toast:          None (not blocking)
```

### Scenario 3: Moderate Risk - User Reviews & Continues (riskLevel = "moderate")
```
Input:          "Send to john.doe@example.com"
Scan Result:    "moderate"
Badge Shows:    🟠 Orange "Moderate risk detected"
User Review:    Opens TrustPrompt panel, sees masked email
User Thinks:    "It's a test email, I'll send the masked version or original"
User Presses:   Enter
Action:         ✅ SUBMIT ALLOWED (user autonomy - can copy safe version or send original)
```

### Scenario 4: High Risk - User Decides (riskLevel = "high")
```
Input:          "Card: 4532-1234-5678-9999"
Scan Result:    "high"
Badge Shows:    🔴 Red "High risk detected"
Panel Shows:    Credit card detected | Safe: [REDACTED]
User Options:   
  ├─ Copy safe version and send
  ├─ Edit prompt manually
  └─ Send original as-is (user's choice)
Action:         ✅ SUBMIT ALLOWED (user autonomy - they decide)
```

### Scenario 5: User Presses Enter During Debounce
```
User Types:     "Hello world"
Debounce:       Timer running (not yet expired)
User Presses:   Enter (BEFORE 400ms debounce completes)
Toast Shows:    "⏸ Scanning… Please wait."
Action:         ⏹️ BLOCKED (scan not complete)
Then:           Debounce cancelled, scan runs immediately
After Scan:     ✅ SUBMIT ALLOWED (badge now shows risk)
```

---

## Extraction Paths

### Path 1: Debounce Timer Expires (User Pauses Typing)
```
User types → Key event → Restart debounce timer
            → User pauses
            → 400ms passes without key events
            → runScan() executes
            → Badge updates with risk level
            → User can now submit
```

### Path 2: Submit Event Before Debounce Expires
```
User types → Key event → Restart debounce timer
           → User presses Enter OR clicks Send button
           → BLOCKED: "Scanning…" toast
           → Debounce cancelled
           → runScan() executes immediately
           → Badge updates with risk level
           → ALLOWED: Submission proceeds
```

### Path 3: Shift+Enter (New Line - NOT A SUBMIT)
```
User types → Key event → Restart debounce timer
           → User presses Shift+Enter
           → New line added
           → Debounce timer restarts
           → No submission attempt
```

---

## Badge Integration

| Badge State | Color | Label | User Action | Result |
|------------|-------|-------|------------|--------|
| Scanning | Gray | "TrustPrompt is scanning…" | Cannot submit | Blocked until complete |
| None | 🟢 Green | "Safe — no issues found" | Can submit | ✅ Allowed |
| Low | 🟡 Yellow | "Low risk detected" | Can submit | ✅ Allowed |
| Moderate | 🟠 Orange | "Moderate risk detected" | Can submit | ✅ Allowed (can review/copy safe ver) |
| High | 🔴 Red | "High risk detected" | Can submit | ✅ Allowed (can review/copy safe ver) |

---

## Code Quality

### Logging (Scanning Phase)
```
[TrustPrompt/Claude] handleSubmitAttempt called — state: PENDING
[TrustPrompt/Claude] showing blocking toast - state is PENDING
[TrustPrompt/Claude] awaiting scan...
[TrustPrompt/Claude] scan complete: {riskLevel: "moderate", findings: [...]}
```

### Logging (After Scan Complete)
```
[TrustPrompt/Claude] scan complete, badge updated with riskLevel: moderate
[TrustPrompt/Claude] releasing submit — user has autonomy to proceed
```

---

## Files Modified

- **`content-script.js`** - Updated handleSubmitAttempt() to allow submission after scan completes
  - Removed risk-level-based blocking
  - Added "user autonomy" principle to all risk levels
  - Updated toast messages to reflect scanning (not risk blocking)

---

## Key Differences from Previous Implementation

| Aspect | Before | After |
|--------|--------|-------|
| Moderate/High Risk | ❌ Blocked | ✅ Allowed |
| Toast Message | "Message blocked - high risk" | "Scanning… analyzing" |
| User Control | System decides | User decides |
| Philosophy | Prevent risk | Show risk, user chooses |
| Side Panel | Info-only | Info + tools (copy safe ver) |

---

## User Experience Flow

```
1. User types → Badge shows "Scanning…"
2. Debounce expires → Scan runs
3. Badge updates to risk level (safe/low/moderate/high)
4. User can:
   ├─ Press Enter to send (respects original + badge info)
   ├─ Click side panel to review findings
   ├─ Click "Copy Safe Version" for moderate/high
   ├─ Edit the prompt manually
   └─ Close and discard

5. Whatever user chooses, TrustPrompt provides the data
   and the user makes the final decision.
```

---

## Deployment Checklist

- [x] User autonomy principle implemented
- [x] Only blocks during scanning/scoring
- [x] Allows submission for all risk levels
- [x] Toast shows only during scanning (not after)
- [x] Badge displays before submission allowed
- [x] All paths tested and verified
- [x] Documentation updated
- [x] Respects Shift+Enter (new line behavior)

---

## Sign-Off

**Implementation Date:** September 25, 2026  
**Status:** ✅ READY FOR PRODUCTION  

TrustPrompt now respects user autonomy by providing risk scores and masked suggestions, but allowing users to make the final decision about submission, even for high-risk content.



