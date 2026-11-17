# Philippine ID Detection - DEPLOYMENT CHECKLIST

## Root Cause Summary

The **Web Worker was caching an old copy of patterns.js**. Your regex fixes were in the file, but the worker never reloaded them. Solution: **Disable the worker and use main-thread scanning**.

---

## Pre-Deployment Verification

### ✅ Check File Changes

**1. patterns.js - Verify NO `\b` in patterns**

Run this in console to check:
```javascript
// Check that word boundaries are removed
const hasWordBoundary = /\bph_id_/.test(`ph_id_`);
console.log("Word boundary test:", hasWordBoundary);

// The actual regex should look like:
// /\d{4}-\d{4}-\d{4}-\d{4}/g  (National ID)
// NOT /\b\d{4}-\d{4}-\d{4}-\d{4}\b/g
```

**2. worker-bridge.js - Verify Worker Disabled**

Lines 64-72 should look like:
```javascript
function initWorker() {
  // TEMPORARY: Disable worker to force main-thread scanning
  console.log("[TrustPrompt/bridge] Worker disabled — using main thread for all scans");
  workerAlive = false;
  return;
  
  const workerUrl = chrome.runtime.getURL("trust-worker.js");
  // ... rest is unreachable ...
}
```

---

## Chrome Extension Deployment

### Step 1: Full Cache Clear

**Do NOT just refresh - follow these exact steps:**

1. Open Chrome DevTools: `F12`
2. Go to: **Application** tab (or **Storage** tab)
3. Left sidebar → **Clear storage** (or **Application Cache**)
   - ✅ Uncheck "Cookies and other site data"
   - ✅ Check everything else (Cache, Service Workers, etc.)
   - Click **Clear site data**

4. Left sidebar → **Service Workers**
   - Unregister all (click "Unregister" on each one)

5. Close DevTools: Press `F12`

### Step 2: Extension Reload

1. Open `chrome://extensions/`
2. Find **TrustPrompt (dev test)**
3. Click the **Refresh** button (circular arrow icon)
4. Verify it says "Updated"

### Step 3: Hard Refresh Browser

**With DevTools open:**
```
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

Wait for page to fully load.

### Step 4: Verify Console Output

**Check DevTools Console:**

You should see:
```
[TrustPrompt/bridge] Worker disabled — using main thread for all scans
```

If you DON'T see this message, the cache wasn't cleared properly. Go back to Step 1.

---

## Test Cases

### Test Setup

1. Open ChatGPT or Claude
2. Open DevTools: `F12`
3. Go to **Console** tab
4. Paste each test case below
5. **Immediately look for the red "HIGH RISK" badge** that should appear

### Test Cases (All Should Be Detected as HIGH RISK - Red Badge)

**1. National ID (16 digits, 4 groups of 4)**
```
3672-0413-9178-4769
```
Expected: Detected as "Philippine National ID" - HIGH RISK 🔴

**2. Passport (1 letter + 7 digits + 1 letter OR 2 letters + 7 digits)**
```
P7409785C
PA7203775
```
Expected: Detected as "Philippine Passport" - HIGH RISK 🔴

**3. GSIS (11 digits, no separators)**
```
31050021346
```
Expected: Detected as "GSIS" - HIGH RISK 🔴

**4. SSS (2 digits - 7 digits - 1 digit)**
```
31-0500213-4
```
Expected: Detected as "SSS" - HIGH RISK 🔴

**5. Voter's ID (4 digits - 2 digits - 8 digits - 1 letter)**
```
1234-56-78901234-M
```
Expected: Detected as "Voter's ID" - HIGH RISK 🔴

**6. UMID (4 digits - 7 digits - 1 digit)**
```
4310-5002134-6
```
Expected: Detected as "UMID" - HIGH RISK 🔴

**7. Driver's License (1 letter + 2 digits - 2 digits - 6 digits)**
```
C51-23-016208
```
Expected: Detected as "Driver's License" - HIGH RISK 🔴

### Expected Behavior

When you type each ID:
1. **Immediately** after pasting, a red/orange badge appears in the top-right
2. Badge shows the **ID type** (e.g., "Philippine National ID")
3. Badge shows **HIGH RISK** or similar warning
4. The detected text is **highlighted in the input field**
5. A sidebar shows the detection details

### If Tests FAIL

**Console Errors to Look For:**

1. **"Worker is not defined"** → `worker-bridge.js` not reloaded
   - Solution: Reload extension again (Step 2)

2. **"ReferenceError: TRUSTPROMPT_PATTERNS is not defined"** → patterns.js not loaded
   - Solution: Check manifest.json script loading order

3. **"Scanning..." stays forever** → Main thread scan is failing
   - Solution: Check browser console for errors in scanner.js

4. **No badge appears at all** → DOM monitoring not working
   - Solution: Check that dom-claude.js or dom-chatgpt.js is loaded
   - Look for messages like "[TrustPrompt] Claude content script loaded"

---

## Troubleshooting

### Issue: "Still not detecting after reload"

**Checklist:**
- [ ] Hard refresh (Ctrl+Shift+R), not just Ctrl+R
- [ ] Clear extension cache (Step 1)
- [ ] Reload extension (Step 2)
- [ ] Close and reopen the browser tab
- [ ] Check console for "[TrustPrompt/bridge] Worker disabled" message
- [ ] Verify patterns.js doesn't have `\b` in regex patterns

### Issue: "Detecting but wrong labels"

- Check `patterns.js` for correct pattern IDs
- Verify regex patterns match the sample formats exactly
- Run `test-regex-simple.js` to verify regex works: `node test-regex-simple.js`

### Issue: "Extension breaks or times out"

- Main thread scanning is slower but should still be <1s for normal prompts
- If timeout happens, increase `BASE_TIMEOUT_MS` in worker-bridge.js (currently 1500ms)
- Check browser console for JavaScript errors

---

## Validation: Content Script Loading

Open DevTools Console and run:
```javascript
// Should print: true
console.log("TRUSTPROMPT_PATTERNS defined:", typeof TRUSTPROMPT_PATTERNS !== 'undefined');

// Should print: 14 or more
console.log("Number of patterns:", TRUSTPROMPT_PATTERNS?.length);

// Should print a pattern object with regex
console.log("National ID pattern:", TRUSTPROMPT_PATTERNS?.find(p => p.id === 'ph_id_philid'));

// Should print: false (regex does NOT contain \b)
const natIdRegex = TRUSTPROMPT_PATTERNS?.find(p => p.id === 'ph_id_philid')?.regex;
console.log("National ID regex has word boundary:", natIdRegex?.source?.includes('\\b'));
```

**Expected Output:**
```
TRUSTPROMPT_PATTERNS defined: true
Number of patterns: 14
National ID pattern: {id: 'ph_id_philid', label: 'Philippine National ID', regex: /\d{4}-\d{4}-\d{4}-\d{4}/g, ...}
National ID regex has word boundary: false
```

---

## Deployment Sign-Off

When all test cases pass:

- [ ] All 7 ID types detect and show HIGH RISK badge
- [ ] Console shows "[TrustPrompt/bridge] Worker disabled" message
- [ ] No JavaScript errors in console
- [ ] Detection happens immediately after typing ID
- [ ] Correct ID labels appear (not "International Phone" etc.)

✅ **Ready for production!**

---

## Rollback Plan

If issues occur after deployment:

1. Undo the `worker-bridge.js` change (re-enable worker)
2. Reload extension
3. Hard refresh
4. This will revert to worker-based scanning (but with same pattern issue)

However, the root fix is keeping the worker disabled and using main-thread scanning, which ensures fresh patterns are always loaded.
