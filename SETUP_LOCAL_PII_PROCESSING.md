# TrustPrompt: 100% Local PII Processing

## Privacy Architecture

TrustPrompt processes **ALL personal information locally in your browser extension**. ZERO data leaves your machine.

### How It Works

```
User Input (Claude/ChatGPT)
        ↓
[Content Script - Compromise.js]  ← Linguistic analysis (local)
        ↓
[Background Service - BERT-NER]   ← ML inference (local)
        ↓
[Detection Results]               ← Blocked/Warning (local)
        ↓
Never reaches Claude/ChatGPT until approved
```

### Components

1. **Content Scripts** (claude.ai / chatgpt.com)
   - Run in page context
   - Compromise.js for linguistic NLP
   - Send suspicious text to background service

2. **Background Service**
   - Runs in extension context (no CSP restrictions)
   - Loads BERT-NER transformer model
   - Performs token classification on text
   - Returns detected entities to content script

3. **Model Cache** (`lib/models/`)
   - Stores BERT model files locally
   - Downloaded ONE TIME during setup
   - Never checked against remote servers

## Setup Instructions

### Step 1: Download BERT Model (First Time Only)

Run this command to cache the BERT model locally:

```bash
node scripts/download-bert-model.js
```

This will:
- Download BERT config, tokenizer, and ONNX model files
- Cache them in `lib/models/`
- Take 2-5 minutes depending on internet speed
- **This is the only time any data leaves your machine**

### Step 2: Reload Extension

1. Go to `chrome://extensions/`
2. Find "TrustPrompt (dev test)"
3. Click the refresh icon
4. Open Claude.ai or ChatGPT.com

### Step 3: Test

Try typing in Claude/ChatGPT:
```
kyleen is a lawyer at apple inc
```

You should see detection for:
- ✅ Person name: "kyleen"
- ✅ Job title: "lawyer"
- ✅ Organization: "apple inc"

## Privacy Verification

### What Gets Cached Locally?

- `config.json` - Model configuration
- `tokenizer.json` - Vocabulary and tokenization rules
- `tokenizer_config.json` - Tokenizer settings
- `model.onnx` - Full BERT model (~400MB)
- `model_quantized.onnx` - Quantized version (~150MB)

### What NEVER Leaves Your Machine?

✅ Your text input
✅ Detection results
✅ Detected entity names
✅ Any PII you type

### When Does Internet Access Happen?

❌ During setup: Downloads model files (ONE TIME)
✅ After setup: ZERO internet access - fully offline

## Technical Details

### BERT Model

- **Model**: Xenova/bert-base-multilingual-cased-ner
- **Size**: ~150MB (quantized)
- **Format**: ONNX (cross-platform)
- **Inference**: Via transformers.js (WebAssembly)
- **Performance**: ~100-500ms per text snippet

### Detection Pipeline

1. **Phase 1 (Compromise.js)**: Linguistic filtering
   - POS tagging (parts of speech)
   - Named entity recognition patterns
   - Fast (~10ms)

2. **Phase 2 (BERT-NER)**: ML inference
   - Token classification with BERT
   - Confidence scoring
   - Medium (~200-500ms)

3. **Phase 3 (Merge)**: Confidence scoring
   - Combine both signals
   - Apply thresholds
   - Generate warnings/blocks

## Troubleshooting

### "Transformers not available"

**Problem**: Background service didn't load transformers.js
**Solution**: Reload the extension

### "Model not found"

**Problem**: BERT model files weren't downloaded
**Solution**: Run `node scripts/download-bert-model.js`

### "Permission denied" or "CSP blocked"

**Problem**: Extension doesn't have permission to access model files
**Solution**: 
1. Clear extension storage: `chrome://apps` → Right-click TrustPrompt → Remove
2. Reload from `chrome://extensions/`

### Very Slow Detection (>5 seconds)

**Problem**: First load of ONNX model is slow
**Solution**: Normal on first use (~2-3s). Subsequent uses are faster (~300-500ms)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│ Claude.ai / ChatGPT.com (Web Page)                      │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────▼───────────────┐
        │  Content Script              │
        │ (Compromise.js NLP)          │
        │ Detects: person, org, job    │
        │ Confidence: 0.5-0.7          │
        └──────────────┬────────────────┘
                       │
     ┌─────────────────▼─────────────────┐
     │  Background Service Worker        │
     │  (BERT-NER ML Model)              │
     │  Runs: Token Classification       │
     │  Confidence: 0.5-0.95             │
     │                                   │
     │  ┌─────────────────────────────┐  │
     │  │ lib/models/                 │  │
     │  │  - config.json              │  │
     │  │  - tokenizer.json           │  │
     │  │  - model_quantized.onnx     │  │
     │  │  (100% LOCAL, NO INTERNET)  │  │
     │  └─────────────────────────────┘  │
     └──────────────┬─────────────────────┘
                    │
     ┌──────────────▼──────────────┐
     │ Detection Results            │
     │ - Entity: text               │
     │ - Confidence: score          │
     │ - Action: block/warn         │
     └──────────────┬───────────────┘
                    │
        ┌───────────▼────────────┐
        │ Display Warning         │
        │ (stays on your PC)      │
        └────────────────────────┘
```

## Legal & Ethical

✅ **GDPR Compliant** - No data transmitted
✅ **CCPA Compliant** - User retains all data
✅ **Fully Privacy-Respecting** - Your machine, your data
✅ **Open Source Ready** - Audit the code

---

**Last Updated**: October 2026
