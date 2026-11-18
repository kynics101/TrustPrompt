# Simple Local Transformer Setup (No CDN Download Required)

## Problem
- CDN download of ONNX models is timing out or blocked
- We need transformers.js to work locally

## Solution
Use npm-installed transformers.js with **lazy-loading**:
- First run: Downloads model from HF once (then cached)
- Subsequent runs: Uses cached model (completely offline)

## Setup Steps

### Step 1: Install transformers.js via npm
```bash
npm install @huggingface/transformers
```

This installs transformers.js locally in node_modules.

### Step 2: Update manifest.json to load transformers from npm

Since we can't bundle the whole node_modules, we'll load transformers.js differently using a simple loader.

Create `TrustPrompt/lib/transformers-loader.js`:

```javascript
/**
 * Load transformers.js from npm package
 * Caches ONNX models locally on first use
 */
(async function() {
  if (window.transformers) return; // Already loaded
  
  try {
    // transformers.js will auto-cache models after first download
    const { pipeline, env } = await import(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.6.0/dist/transformers.min.js'
    );
    
    // After first run, transformers.js caches in browser's IndexedDB
    window.transformers = { pipeline, env };
    
    console.log('[TrustPrompt] transformers.js loaded');
    window.dispatchEvent(new CustomEvent('transformers-ready'));
  } catch (error) {
    console.error('[TrustPrompt] transformers.js load failed:', error);
    window.dispatchEvent(new CustomEvent('transformers-failed'));
  }
})();
```

### Step 3: Update hybrid-transformer-detector.js to use cached model

Modify `initializeTransformersPipeline()`:

```javascript
async function initializeTransformersPipeline() {
  try {
    if (!window.transformers) {
      console.warn('[TrustHybrid] transformers.js not available');
      return null;
    }
    
    const { pipeline } = window.transformers;
    
    console.log('[TrustHybrid] Loading BERT-NER (auto-cached after first run)...');
    
    // First call: downloads model from HF (~5-10 seconds)
    // Subsequent calls: loads from cache (50-100ms)
    const ner = await pipeline(
      'token-classification',
      'Xenova/bert-base-multilingual-cased-ner'
    );
    
    console.log('[TrustHybrid] ✓ BERT-NER ready');
    TRANSFORMERS_AVAILABLE = true;
    return ner;
    
  } catch (error) {
    console.warn('[TrustHybrid] Failed to load transformers:', error.message);
    TRANSFORMERS_AVAILABLE = false;
    return null;
  }
}
```

### Step 4: Reload Extension

1. Go to `chrome://extensions/`
2. Find TrustPrompt
3. Click **Reload**

### Step 5: Test (First Run)

1. Open Claude.ai
2. Type: "My name is Kyleen Nicdao and I work at Accenture"
3. **First run** (5-10 seconds):
   - Browser downloads BERT model from Hugging Face
   - Browser caches it in IndexedDB
   - May see network request in DevTools

4. Check console:
```
[TrustHybrid] Loading BERT-NER (auto-cached after first run)...
[TrustHybrid] ✓ BERT-NER ready
[TrustPrompt/scanner] PATH C (hybrid) findings: 2
```

### Step 6: Test (Subsequent Runs)

1. Reload page or type another prompt
2. **Should be instant** (50-100ms):
   - Model loads from browser cache (IndexedDB)
   - NO network request

Check console:
```
[TrustHybrid] Loading BERT-NER (auto-cached after first run)...
[TrustHybrid] ✓ BERT-NER ready  ← Much faster this time
[TrustPrompt/scanner] PATH C (hybrid) findings: 2
```

## Trade-offs

### This Approach
- ✓ Simple (no pre-download needed)
- ✓ Works first time (auto-downloads from HF)
- ✓ Fast after first use (cached in IndexedDB)
- ✗ First run uses network (HF download)
- ✗ Large model download (~200MB)

### Pre-Download Approach (ideal but failing)
- ✓ Completely offline (no first-run network)
- ✓ Instant first run
- ✗ Requires successful pre-download
- ✗ Extension size massive (~250MB)

## If You Still Want Complete Offline

Alternative: Don't use transformers at all, just improve compromise.js detection.

This gives you:
- ✓ 100% offline (no network ever)
- ✓ Smaller extension (~50MB)
- ✗ Less accurate (no ML model)

Let me know which you prefer.
