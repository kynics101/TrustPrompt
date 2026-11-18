# Web Worker Network Error - Fix Applied

## Problem Identified

**Error Message:**
```
Uncaught NetworkError: Failed to execute 'importScripts' on 'WorkerGlobalScope': 
The script at 'chrome-extension://[hash]/trust-worker.js' failed to load.
```

## Root Cause

The issue was in how the blob URL was being handled:

1. ❌ **OLD CODE**: Called `URL.revokeObjectURL(blobUrl)` immediately after creating the worker
2. ❌ This invalidated the blob URL before the worker could load the extension URLs
3. ❌ When the worker tried to `importScripts()`, the blob context was already revoked
4. ❌ This caused a network/context error

## Solution Applied

**NEW CODE** in `worker-bridge.js`:

1. ✅ **Don't revoke immediately** - Keep the blob URL alive
2. ✅ **Store reference** - Save `worker.blobUrl` on the worker object
3. ✅ **Revoke on cleanup** - Only revoke when worker terminates (in `restartWorker()`)
4. ✅ **Error handling** - Added try-catch in worker's `_importScripts` wrapper

### Key Changes

**Before:**
```javascript
const blobUrl = URL.createObjectURL(blob);
worker = new Worker(blobUrl);
URL.revokeObjectURL(blobUrl);  // ❌ TOO EARLY!
```

**After:**
```javascript
const blobUrl = URL.createObjectURL(blob);
worker = new Worker(blobUrl);
worker.blobUrl = blobUrl;       // ✅ Keep reference

// ... later, in restartWorker():
if (worker.blobUrl) {
  URL.revokeObjectURL(worker.blobUrl);  // ✅ Revoke when done
}
```

---

## How to Test the Fix

### 1. Reload Extension

```bash
# In Chrome:
chrome://extensions/ → Find TrustPrompt → Click reload button
```

### 2. Check DevTools Console

Open DevTools on Claude.ai or ChatGPT and look for:

```
✅ SUCCESS:
[TrustPrompt/bridge] Web Worker started (blob trampoline + data injection)
[TrustPrompt/worker] Data availability check: { medical: "ready", ... }

❌ STILL FAILING:
Uncaught NetworkError: Failed to execute 'importScripts'...
```

### 3. Test Scanning

Type in the prompt box:
```
My name is John Smith
```

**Expected**: Badge appears within 100ms showing "Low risk detected"

### 4. Verify Performance

Check the timing logs:
```
[TrustPrompt/Performance] Scan Timeline Summary
Total scan time: 80-150ms
  ├─ Worker call (async): 80-120ms
  └─ Result rendering: 2-5ms
```

---

## If Error Still Occurs

### Check 1: Bundle File Exists

```bash
# Verify worker-data-bundle.js exists
ls -l worker-data-bundle.js
```

If missing, regenerate:
```bash
npm run build:worker
```

### Check 2: Manifest Configuration

```bash
# Verify both files are in web_accessible_resources
grep -A 10 "web_accessible_resources" manifest.json | grep -E "(trust-worker|worker-data-bundle)"
```

Should see:
```
"worker-data-bundle.js",
"trust-worker.js"
```

### Check 3: Extension URL Format

In DevTools Console on the page:
```javascript
// Check the actual extension URLs being used
console.log(chrome.runtime.getURL("trust-worker.js"));
console.log(chrome.runtime.getURL("worker-data-bundle.js"));
```

Both should return valid chrome-extension URLs like:
```
chrome-extension://aBc123dEf456/trust-worker.js
chrome-extension://aBc123dEf456/worker-data-bundle.js
```

### Check 4: Worker Error Details

Add more debugging to `worker-bridge.js`:

```javascript
worker.onerror = function(err) {
  console.error('[TrustPrompt/bridge] Worker error:', {
    message: err.message,
    filename: err.filename,
    lineno: err.lineno,
    colno: err.colno,
    error: err.error
  });
};
```

---

## Advanced Debugging

### View Worker Errors in DevTools

1. Go to Chrome `chrome://extensions/`
2. Find TrustPrompt → Click "Inspect"
3. Switch to the **Workers** section
4. Check console for importScripts errors

### Enable Detailed Logging

Add this to the top of the blob code in `worker-bridge.js`:

```javascript
self.DEBUG_IMPORTS = true;
self._importScripts = function(urls) {
  if (!Array.isArray(urls)) urls = [urls];
  console.log('[TrustPrompt/worker] Attempting to import:', urls);
  for (const url of urls) {
    try {
      console.log('[TrustPrompt/worker] Loading:', url);
      importScripts(url);
      console.log('[TrustPrompt/worker] ✅ Loaded:', url);
    } catch (err) {
      console.error('[TrustPrompt/worker] ❌ Failed to load:', url, err);
      throw err;
    }
  }
};
```

---

## Fallback Behavior

If the worker still fails to start:

1. ✅ Worker initialization fails (caught by try-catch)
2. ✅ Falls back to Strategy 2 (direct URL) - usually fails on Claude
3. ✅ Falls back to Strategy 3 (main thread)
4. ✅ **Scanning still works**, just slower (~400-900ms)

Check console for:
```
[TrustPrompt/bridge] running scan on main thread
```

This means the worker couldn't start, but the extension is still functional.

---

## Changes Made

### Modified Files

1. **worker-bridge.js**
   - ✅ Don't revoke blob URL immediately
   - ✅ Store blob URL on worker object
   - ✅ Revoke only on cleanup
   - ✅ Added error handling in `_importScripts` wrapper

### Why This Fix Works

- **Blob URLs need to stay alive** while the worker loads scripts
- **Revoking too early** severs the connection before imports complete
- **Keeping reference** ensures browser doesn't garbage-collect the blob
- **Cleaning up later** prevents memory leaks

---

## Performance After Fix

Expected scan times (with worker running):

```
Path A (Regex):     ~30ms
Path B (Gazetteer): ~20ms
Path C (Linguistic):~25ms
Risk Scoring:       ~5ms
━━━━━━━━━━━━━━━━━
Total Worker Time:  ~80ms

Main Thread Impact: ~5ms (message overhead)

User Perceived Delay: 100-200ms
(Includes 400ms debounce)
```

---

## Next Steps

1. **Reload extension** (if you haven't already)
2. **Test on Claude.ai**: Type a prompt, verify badge appears
3. **Check DevTools**: Verify "Web Worker started" message
4. **Monitor performance**: Scans should be 80-150ms

If issues persist, see "Advanced Debugging" section above.

---

## Reference

- [Blob URLs - MDN](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL)
- [Web Workers - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [importScripts - MDN](https://developer.mozilla.org/en-US/docs/Web/API/WorkerGlobalScope/importScripts)
- [Chrome Extension CSP - Manifest V3](https://developer.chrome.com/docs/extensions/mv3/content_security_policy/)

---

**Status**: Fix applied ✅ Ready to test
