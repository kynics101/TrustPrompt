# Web Worker Testing & Debugging Guide

## Quick Start Testing

### 1. Extension Installation & Loading

1. Open Chrome
2. Go to `chrome://extensions/`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the TrustPrompt extension folder
6. Pin the extension to toolbar (optional)

### 2. Verify Worker is Running

1. Go to **https://claude.ai** or **https://chatgpt.com**
2. Open **DevTools** (F12)
3. Go to **Console** tab
4. Look for these logs when page loads:

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

✅ If you see `"ready"` for all data → Worker is working!

❌ If you see `"missing"` → Check bundle generation

### 3. Test Scanning Performance

Open DevTools **Console** and type sample prompts:

**Test 1: Name Detection**
```
"My name is John Smith"
```

Expected: Badge shows "Low risk detected" within 100ms

**Test 2: Multiple Sensitive Items**
```
"My name is Maria Santos, I live at 123 Main Street, my phone is 09171234567"
```

Expected: Badge shows "Moderate risk detected" within 150ms

**Test 3: Complex Prompt**
```
"I work at Google as a software engineer, my employee ID is EMP-12345678, 
I earn $120,000 per year, and my health conditions include diabetes and hypertension"
```

Expected: Badge shows "High risk detected" within 200ms

### 4. Check Worker Timing Logs

Enable detailed logging in `worker-bridge.js`:

In DevTools Console:
```javascript
// Check if worker is alive
console.log('Worker alive:', typeof TrustWorkerBridge !== 'undefined');

// Perform a test scan and see detailed timing
TrustWorkerBridge.scan("my name is Alice").then(result => {
  console.log('Result:', result);
  console.log('Scan time:', result.elapsedMs, 'ms');
});
```

Expected output:
```
Result: {
  findings: [...],
  riskLevel: "low",
  score: 2,
  elapsedMs: 85
}
Scan time: 85 ms
```

---

## Troubleshooting

### Problem: Worker Not Starting

**Symptom**: Console shows no worker logs, scanning is slow

**Diagnosis**:
```javascript
// In DevTools Console, check:
console.log('Worker available:', typeof TrustWorkerBridge !== 'undefined');
console.log('Bundle exists:', typeof self.MEDICAL_TERMS_DATA !== 'undefined');
```

**Solution**:
1. Verify `worker-data-bundle.js` exists:
   ```bash
   ls worker-data-bundle.js
   ```

2. Regenerate bundle:
   ```bash
   npm run build:worker
   ```

3. Reload extension:
   - Go to `chrome://extensions/`
   - Find TrustPrompt
   - Click reload button

4. Reload the website

### Problem: Data Shows "missing"

**Symptom**: 
```
[TrustPrompt/worker] Data availability check: {
  medical: "missing",
  ...
}
```

**Cause**: Bundle wasn't imported into Worker

**Solution**:
1. Check manifest.json includes bundle:
   ```bash
   grep "worker-data-bundle" manifest.json
   ```

2. Verify bundle file size is not 0:
   ```bash
   ls -l worker-data-bundle.js
   ```

3. If file is small (<100KB), regenerate:
   ```bash
   npm run build:worker
   ```

4. Check for importScripts errors in Worker:
   - Go to `chrome://extensions/`
   - Click "Inspect" on the service worker
   - Check console for errors

### Problem: Scanning Still Slow

**Symptom**: Badges appear after 500ms+

**Diagnosis**:
```javascript
// Check in console after typing something
performance.getEntriesByName('scan-total').forEach(entry => {
  console.log('Scan duration:', entry.duration, 'ms');
});
```

**Possible Causes**:

1. **Worker timing out** (falls back to main thread)
   - Check for timeout logs:
   ```
   [TrustPrompt/bridge] Worker timed out after 1500ms — falling back
   ```
   - Solution: Increase timeout in worker-bridge.js if needed

2. **Path C (linguistic) slow**
   - First scan loads NER model (~200ms extra)
   - Subsequent scans are fast (<50ms)
   - Solution: This is expected, model caches after first use

3. **Large prompt**
   - Gazetteers are fast, but large text takes longer to process
   - Solution: This is normal behavior

---

## Deep Debugging

### Enable Performance Tracing

Add to `content-script.js` in the `scanText()` function:

```javascript
function scanText(text) {
  console.time('scan-total');
  
  const normalised = normaliseText(text);
  console.time('pattern-match');
  const findings = [];
  
  for (const pattern of TRUSTPROMPT_PATTERNS) {
    const re = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    while ((match = re.exec(normalised)) !== null) {
      // ... existing code ...
    }
  }
  console.timeEnd('pattern-match');
  
  // ... rest of scanning ...
  
  console.timeEnd('scan-total');
  return findings;
}
```

Then in DevTools Console:
```
scan-total: 85.23ms
pattern-match: 30.15ms
```

### Monitor Worker Messages

Add logging to `worker-bridge.js`:

```javascript
function onWorkerMessage(e) {
  console.log('[bridge] Worker returned result in', e.data.elapsedMs, 'ms');
  const entry = pending.get(e.data.scanId);
  // ... rest of handler ...
}
```

### Check Network Tab

1. Open DevTools → **Network** tab
2. Filter: XHR / Fetch
3. Type something in prompt
4. Should see NO network requests (worker runs locally)
5. If you see requests, something is using network

---

## Monitoring in Production

### Key Metrics to Track

1. **Worker uptime**: Percentage of sessions with worker enabled
2. **Scan latency**: Histogram of scan times (should be ~80-200ms)
3. **Fallback rate**: % of scans that timeout and fall back to main thread
4. **Error rate**: % of scans that error completely

### Logging to Analytics

Add to worker-bridge.js after scan completes:

```javascript
function logScanMetrics(result) {
  const metrics = {
    elapsedMs: result.elapsedMs,
    workerUsed: workerAlive,
    findingsCount: result.findings.length,
    riskLevel: result.riskLevel,
    timestamp: new Date().toISOString()
  };
  
  // Send to your analytics backend
  chrome.runtime.sendMessage({
    type: 'LOG_METRICS',
    metrics: metrics
  });
}
```

---

## Performance Benchmarking

### Manual Benchmark

Run this in DevTools Console:

```javascript
async function benchmark() {
  const samples = [
    "My name is John Smith",
    "My email is john@example.com and phone is 09171234567",
    "I work at Google, my ID is 12345678, salary is $150k",
    "I was born on January 15, 1990 in Manila",
    "I have diabetes and depression"
  ];
  
  const results = [];
  
  for (const sample of samples) {
    const start = performance.now();
    const result = await TrustWorkerBridge.scan(sample);
    const duration = performance.now() - start;
    
    results.push({
      text: sample.substring(0, 30) + '...',
      duration: duration.toFixed(2) + 'ms',
      risk: result.riskLevel
    });
  }
  
  console.table(results);
  
  const avgTime = results.reduce((sum, r) => {
    return sum + parseFloat(r.duration);
  }, 0) / results.length;
  
  console.log('\n✅ Average scan time:', avgTime.toFixed(2), 'ms');
}

benchmark();
```

Expected output:
```
┌─────────────────────────────┬────────┬──────────┐
│ text                        │ duration │ risk     │
├─────────────────────────────┼────────┼──────────┤
│ My name is John Smith...    │ 82ms   │ low      │
│ My email is john@example... │ 95ms   │ low      │
│ I work at Google, my ID...  │ 110ms  │ high     │
│ I was born on January 15... │ 105ms  │ low      │
│ I have diabetes and de...   │ 88ms   │ moderate │
└─────────────────────────────┴────────┴──────────┘

✅ Average scan time: 96.00 ms
```

---

## Common Issues & Solutions

### Issue: "Worker started but data is missing"

```
[TrustPrompt/bridge] Web Worker started (blob trampoline + data injection)
[TrustPrompt/worker] Data availability check: { medical: "missing" }
```

**Root cause**: Bundle didn't load before worker code executed

**Fix**:
1. Verify `worker-data-bundle.js` is web-accessible:
   ```bash
   grep -n "worker-data-bundle" manifest.json
   ```
   Should see it in web_accessible_resources

2. Regenerate bundle:
   ```bash
   npm run build:worker
   rm -rf node_modules/.cache  # Clear any caches
   npm run build:worker
   ```

3. Reload extension and page

### Issue: "Worker fails after 5 minutes"

**Root cause**: Worker crashes from memory leak or timeout

**Fix**:
1. Check for console errors in worker
2. Monitor memory usage: DevTools → Memory tab
3. Consider restarting worker:
   ```javascript
   TrustWorkerBridge.restartWorker();
   ```

### Issue: "Works on Claude but not on ChatGPT"

**Root cause**: Different DOM structure, different CSP headers

**Fix**:
1. Check content script is loading:
   ```
   [TrustPrompt] ChatGPT driver loaded
   ```

2. Verify correct DOM selectors in `dom-chatgpt.js`:
   - Look for prompt box manually
   - Update selectors if needed

3. Check CSP headers:
   - DevTools → Network → Response headers
   - If `worker-src` is restricted, worker can't load

---

## Reporting Issues

When reporting worker issues, include:

```javascript
// Copy/paste this in DevTools Console
{
  "browserVersion": navigator.userAgent,
  "workerAvailable": typeof Worker !== 'undefined',
  "blobUrlsSupported": typeof URL.createObjectURL !== 'undefined',
  "logs": [
    // Copy relevant console logs here
  ],
  "metrics": {
    "avgScanTime": "...",
    "timeouts": "...",
    "errors": "..."
  }
}
```

---

## Next Steps

1. ✅ Test worker with sample prompts (see section 3 above)
2. ✅ Verify performance (see section 4 above)
3. ✅ Run benchmark script (see Benchmarking section)
4. ✅ Monitor for 24 hours in normal usage
5. ✅ Commit to production when verified

---

## Support

For issues, check:
- WORKER_OPTIMIZATION_GUIDE.md (architecture details)
- worker-bridge.js (source code with comments)
- trust-worker.js (worker implementation)
- DevTools Console (live debugging)
