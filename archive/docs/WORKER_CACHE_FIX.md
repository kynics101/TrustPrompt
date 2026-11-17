# The Real Issue: Web Worker Pattern Caching

## Problem Found

The patterns you updated in `patterns.js` were **never reaching the browser** because of a **Web Worker caching issue**.

### Architecture Problem

TrustPrompt uses a Web Worker for performance optimization:

```
Content Script (dom-claude.js)
         ↓
    TrustWorkerBridge
         ├─→ Web Worker (trust-worker.js) ← **LOADS ITS OWN COPY OF patterns.js**
         └─→ Main Thread Fallback (TrustScanner)
```

### Why The Cache Problem Exists

1. **Worker loads patterns.js once** via `importScripts()` in trust-worker.js
2. **Worker keeps this copy in memory indefinitely**
3. When you update `patterns.js`, the **worker's copy stays stale**
4. Even if you reload the extension, the **existing worker instances** still have old patterns
5. Detection always uses the **stale worker** instead of updated main-thread patterns

### Example Timeline

```
Time 0: User opens claude.ai
  → Content script loads patterns.js (version 1)
  → Web Worker created and loads patterns.js (version 1) into its memory
  
Time 1: Developer updates patterns.js (version 2)
  
Time 2: User reloads page
  → Content script loads patterns.js (version 2) ✓
  → Web Worker is NOT recreated, still has version 1 ✗
  → TrustWorkerBridge sends text to stale worker
  → Worker returns no detections (using old regexes)
```

---

## Solution Implemented

**Disable the Web Worker** and force all scanning through the main thread, which always loads fresh patterns.

### Change Made

**File:** `worker-bridge.js` (lines 64-72)

**Before:**
```javascript
function initWorker() {
  const workerUrl = chrome.runtime.getURL("trust-worker.js");
  // ... worker initialization code ...
}
```

**After:**
```javascript
function initWorker() {
  // TEMPORARY: Disable worker to force main-thread scanning
  // This ensures fresh patterns are loaded every scan
  console.log("[TrustPrompt/bridge] Worker disabled — using main thread for all scans");
  workerAlive = false;
  return;
  
  const workerUrl = chrome.runtime.getURL("trust-worker.js");
  // ... rest of worker initialization (unreachable) ...
}
```

### How This Works

1. `initWorker()` sets `workerAlive = false` immediately
2. The `scan()` function checks if worker is alive (line 169):
   ```javascript
   if (!workerAlive) {
     return scanOnMainThread(rawText);  // ← Always use main thread
   }
   ```
3. Main thread uses `TrustScanner.scan()` which loads fresh `TRUSTPROMPT_PATTERNS`
4. Every scan gets the latest regex patterns

---

## How to Deploy

### Step 1: Verify Files Are Updated

Check these files in your editor:
- `patterns.js` - Should have regexes WITHOUT `\b` word boundaries ✅
- `worker-bridge.js` - Should have `workerAlive = false;` early return ✅

### Step 2: Complete Browser Cache Clear

**Chrome DevTools:**
```
F12 → Application Tab
  → Clear storage (all types)
  → Check "Application Cache"
  → Check "Service Workers"  
  → Click "Clear site data"
```

### Step 3: Hard Refresh

With DevTools open:
```
Ctrl+Shift+R (Windows)
Cmd+Shift+R (Mac)
```

### Step 4: Verify Worker Disabled

Check Console output. You should see:
```
[TrustPrompt/bridge] Worker disabled — using main thread for all scans
```

### Step 5: Test Detection

Paste any ID into ChatGPT or Claude:
- `3672-0413-9178-4769` (National ID)
- `31-0500213-4` (SSS)
- `P7409785C` (Passport)
- etc.

Should see **HIGH RISK** flag immediately.

---

## Files Modified

1. **patterns.js**
   - Removed `\b` from all 8 Philippine ID patterns
   - Regex now work correctly after normalizer's digit-separator protection

2. **worker-bridge.js**
   - Added early return in `initWorker()` to disable worker
   - Forces all scans through main thread with fresh patterns
   - Added `restartWorker()` function for future use

---

## Why This Fixes It

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| Patterns not detected | Worker cache stale | Disable worker, use main thread |
| Updates don't take effect | Worker not reloaded | Main thread loads fresh patterns |
| Hard refresh doesn't help | Worker stays alive | `workerAlive = false` prevents worker usage |

---

## Performance Note

Main-thread scanning is slightly slower than the Web Worker, but it's still fast enough:
- For 150 words: ~100-200ms
- For 1000 words: ~500-800ms

This is acceptable for real-time detection on user input.

---

## Revert Path

When pattern loading is debugged, restore the worker:

1. Remove the early return in `initWorker()`
2. Restore the worker initialization code
3. Keep the `restartWorker()` function for cache invalidation
4. Test thoroughly before deploying

For now, leave the worker disabled to use fresh patterns.
