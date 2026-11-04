# 🧪 Immediate Testing Instructions - Network Error Fix

## Quick Status

✅ **Network error has been fixed** in `worker-bridge.js`

The blob URL is now kept alive for the worker's lifetime instead of being revoked immediately.

---

## Step 1: Reload Extension (REQUIRED)

1. Go to **chrome://extensions/**
2. Find **TrustPrompt**
3. Click the **reload** button (⟳ icon)

**Wait 2-3 seconds** for the extension to reload.

---

## Step 2: Open DevTools on Test Page

1. Go to **https://claude.ai** or **https://chatgpt.com**
2. Press **F12** to open DevTools
3. Go to **Console** tab
4. Clear any previous messages (Ctrl+L or Cmd+K)

---

## Step 3: Check for Success Message

Look for these messages at the top of the console:

### ✅ SUCCESS (Should see these):
```
[TrustPrompt/bridge] Web Worker started (blob trampoline + data injection)
[TrustPrompt/worker] Data availability check: { 
  medical: "ready", 
  financial: "ready", 
  organizations: "ready", 
  gazetteer: "ready", 
  detector: "ready" 
}
```

### ❌ FAILURE (Should NOT see these):
```
Uncaught NetworkError: Failed to execute 'importScripts' 
on 'WorkerGlobalScope': The script at 'chrome-extension://...' failed to load.
```

**If you see the success message**, the fix worked! ✅ Go to Step 4.

**If you still see the error**, see Troubleshooting at the end.

---

## Step 4: Test Scanning Performance

Type this in the Claude/ChatGPT prompt box:

```
My name is Alice Johnson, I live in Manila, my phone is 09171234567, my email is alice@example.com
```

**Expected results:**

1. ✅ A floating badge appears above the prompt box
2. ✅ Badge appears within **100-200ms** after you stop typing
3. ✅ Badge says something like "**High risk detected**" or "**Moderate risk detected**"
4. ✅ UI remains **smooth** and **responsive** (no lag)

---

## Step 5: Verify Performance

In the **DevTools Console**, paste this:

```javascript
// Test worker performance
TrustWorkerBridge.scan("My name is John Smith, I work at Google, my ID is EMP-12345678")
  .then(result => {
    console.log("✅ Scan completed:");
    console.log("  Findings:", result.findings.length);
    console.log("  Risk level:", result.riskLevel);
    console.log("  Time:", result.elapsedMs + "ms");
  })
  .catch(err => {
    console.error("❌ Scan failed:", err.message);
  });
```

**Expected output:**
```
✅ Scan completed:
  Findings: 3
  Risk level: high
  Time: 95ms
```

**Key metric**: Time should be **80-150ms** (not 400-900ms)

---

## Troubleshooting

### Issue: Still See NetworkError

**Step 1**: Verify bundle file exists
```bash
ls -la worker-data-bundle.js
```

Should show file size around **1,500 KB**.

If missing, regenerate:
```bash
npm run build:worker
```

**Step 2**: Verify manifest configuration
```bash
grep -E "worker-data-bundle|trust-worker" manifest.json
```

Both should appear in `web_accessible_resources`.

**Step 3**: Hard reload the extension
- chrome://extensions/
- Toggle **Developer mode** OFF
- Toggle **Developer mode** ON
- Click reload on TrustPrompt

**Step 4**: Check for errors in worker terminal
- chrome://extensions/
- Find TrustPrompt → Click **Inspect**
- Look at the console output

---

### Issue: Badge Still Not Appearing

**Check 1**: Is worker running?
```javascript
// In DevTools console:
console.log('Worker started:', typeof TrustWorkerBridge !== 'undefined');
console.log('Can call scan:', typeof TrustWorkerBridge.scan === 'function');
```

**Check 2**: Try a simple scan
```javascript
TrustWorkerBridge.scan("hello world")
  .then(r => console.log("Result:", r))
  .catch(e => console.error("Error:", e));
```

**Check 3**: Check DOM script attachment
```javascript
// In DevTools console:
console.log('DOM driver loaded:', typeof TrustUI !== 'undefined');
```

---

### Issue: Performance Still Slow

**Check 1**: Verify worker is actually running
```javascript
// Should show worker time, not main thread fallback
TrustWorkerBridge.scan("test").then(r => {
  console.log("Elapsed:", r.elapsedMs + "ms");
  console.log("Should be 80-150ms, NOT 400-900ms");
});
```

**Check 2**: Check for worker timeouts
```
[TrustPrompt/bridge] Worker timed out after 1500ms — falling back
```

If you see this, the worker is timing out. Main thread fallback is active.

---

## Expected vs Actual

### ✅ Expected Behavior (After Fix)

| Action | Result | Time |
|--------|--------|------|
| User types | Typing continues smoothly | Immediate |
| User pauses | Scan starts in worker | Non-blocking |
| Scan completes | Badge appears | ~100-200ms after pause |
| Click to submit | Form submits (if no high risk) | Immediate |

### ❌ Problem Behavior (Before Fix)

| Action | Result | Time |
|--------|--------|------|
| User types | Typing lags | 200-500ms delay |
| Scan runs | UI freezes | ~500-900ms |
| Badge appears | Very late | 1000-1500ms after pause |
| Click to submit | Form blocked, stalled | 300-500ms delay |

---

## Verification Checklist

- [ ] Extension reloaded
- [ ] Console shows "Web Worker started"
- [ ] Data availability check shows all "ready"
- [ ] Typed test prompt
- [ ] Badge appeared within 200ms
- [ ] Badge showed correct risk level
- [ ] Performance test showed < 150ms
- [ ] UI remained responsive during scan
- [ ] No NetworkError in console

---

## Final Test

If all above pass, run the automated verification:

```bash
npm run build:worker
node scripts/verify-worker-setup.js
```

Should show: **21 passed, 0 failed ✓**

---

## Success Confirmation

When you see this in the console:

```
[TrustPrompt/bridge] Web Worker started (blob trampoline + data injection)
[TrustPrompt/worker] Data availability check: { 
  medical: "ready", 
  financial: "ready", 
  organizations: "ready", 
  gazetteer: "ready", 
  detector: "ready" 
}

[TrustPrompt/Performance] Scan Timeline Summary
Total scan time: 85.32ms
  ├─ Worker call (async): 82.15ms
  └─ Result rendering: 3.17ms
```

### ✅ YOU'RE GOOD TO GO!

The worker is working perfectly. Expected improvement:
- **5x faster scanning** (80ms vs 400ms)
- **Smooth UI** (no typing lag)
- **Professional UX** (badge appears instantly)

---

## Need Help?

1. Check `WORKER_NETWORK_ERROR_FIX.md` for technical details
2. Check `WORKER_TESTING_GUIDE.md` for advanced debugging
3. Check DevTools console for error messages
4. Run `node scripts/verify-worker-setup.js` for automated checks

---

**Status**: Fix applied ✅ Ready to test

**Next**: Go to Claude.ai, test the prompt, verify performance!
