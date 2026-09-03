# TrustPrompt Browser Debugging Guide

## What Changed

The linguistic detector (PATH C) has been fixed to:
1. ✅ Be loaded in manifest.json 
2. ✅ Include fallback trigger phrase detection when compromise.js is unavailable
3. ✅ Have error handling in scanner.js if it doesn't load

## How to Test & Debug in Your Browser

### Step 1: Hard Reload the Extension

1. Go to `chrome://extensions/`
2. Find "TrustPrompt (dev test)"
3. Click the **REFRESH** icon (blue arrow icon)
4. Wait 2 seconds

### Step 2: Open DevTools Console

1. Go to https://claude.ai or https://chatgpt.com
2. **Right-click anywhere** → Select "Inspect" (or press F12)
3. Click the **"Console"** tab

### Step 3: Test the Prompt

In the chat input, type:
```
i am kyleen. professor
```

Then look at the console output. You should see:

```
[STARTUP] linguistic-detector.js loading...
[STARTUP] COMPROMISE_AVAILABLE: false
[STARTUP] TrustLinguisticDetector initialized
[DIAGNOSTIC] TrustLinguisticDetector type: object
[DIAGNOSTIC] Calling TrustLinguisticDetector.scan()
[DIAGNOSTIC] PATH C findings: 2
[TrustPrompt/scanner] risk: low score:2 | findings: 2 (A:0 B:0 C:2)
```

### Expected Results

- **Risk should change from "Safe"** to **"Low"** (green background with yellow icon)
- **Two findings should appear**: "kyleen" (person) and "professor" (job)
- The safe version should show: **"i am [NAME REDACTED]. [JOB TITLE REDACTED]"**

### If It's Still "Safe" — Troubleshooting

**Check Console For:**

1. **Error**: `[DIAGNOSTIC] TrustLinguisticDetector type: undefined`
   - **Problem**: File didn't load
   - **Fix**: Check manifest.json includes "linguistic-detector.js"

2. **Warning**: `TrustLinguisticDetector not available - PATH C skipped`
   - **Problem**: Module is undefined
   - **Fix**: Reload extension hard (Step 1 above)

3. **Error**: `PATH C error: ...`
   - **Problem**: Module crashed
   - **Fix**: Share the error message

4. **No console messages at all**
   - **Problem**: Extension didn't load
   - **Fix**: 
     - Verify extension is enabled in chrome://extensions
     - Check that you're on claude.ai or chatgpt.com
     - Try hard refresh

### Step 4: Share Console Output

If it's still not working:

1. Copy ALL console output (select all, Ctrl+C)
2. Paste into a file or share with me
3. Include:
   - Browser version
   - URL (claude.ai or chatgpt.com)
   - The exact prompt you tested

---

## Key Files Modified

1. **manifest.json** - Added linguistic-detector.js to content_scripts and web_accessible_resources
2. **linguistic-detector.js** - Added fallback trigger phrase detection + startup diagnostics
3. **scanner.js** - Added error handling and diagnostic logging

---

## What Should Happen (Step by Step)

1. Extension loads files in order:
   - lib/validator.min.js
   - patterns.js
   - gazetteer.js
   - **linguistic-detector.js** ← NEW
   - scanner.js

2. When you type "i am kyleen. professor":
   - Text is normalized
   - Scanner runs PATH A (regex)
   - Scanner runs PATH B (gazetteer)
   - **Scanner runs PATH C (linguistic detector) ← NEW**
   - Findings are merged
   - Risk score is calculated

3. Since compromise.js is unavailable, PATH C uses **trigger phrases**:
   - "i am" triggers person detection → finds "kyleen"
   - "professor" matches job title → finds "professor"

---

## If Everything Still Doesn't Work

**CRITICAL**: Please check:

```javascript
// Paste this in browser console and share the output:
console.log("manifest:", chrome.runtime.getManifest().content_scripts[0].js);
console.log("TrustScanner:", typeof TrustScanner);
console.log("TrustLinguisticDetector:", typeof TrustLinguisticDetector);
console.log("TrustScanner.scan('i am kyleen professor'):", TrustScanner.scan('i am kyleen professor'));
```

This will tell us exactly what's loaded and what's broken.

