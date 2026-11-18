# Direct Test Instructions for Scanner

Since the scanner runs in the browser, not Node.js, here's how to test it directly:

## 1. Open Chrome DevTools on ChatGPT or Claude

Open the extension in development mode:
- Chrome: Go to `chrome://extensions`
- Enable "Developer mode"  
- Load unpacked: Select the TrustPrompt folder

## 2. Open a Chat Page

Go to https://claude.ai or https://chatgpt.com

## 3. Open the DevTools Console (F12 → Console tab)

## 4. Test Each Path

### PATH A - API Key (Regex + Validator)
```javascript
TrustScanner.scan('My OpenAI API key is sk-proj-abc123def456ghi789jkl012mno34pqr56stu').then(r => console.log('PATH A Result:', r));
```

### PATH B - Gazetteer 
```javascript
TrustScanner.scan('i have diabetes').then(r => console.log('PATH B Result:', r));
```

### PATH C - Linguistic
```javascript
TrustScanner.scan('my name is kyleen').then(r => console.log('PATH C Result:', r));
```

### SOURCE CODE - Code Block
```javascript
TrustScanner.scan(`const apiKey = 'sk-abc123def456ghi789';
async function fetchUser(userId) {
  const res = await fetch('/api/users', {
    headers: { 'Authorization': 'Bearer ' + apiKey }
  });
  return res.json();
}
fetchUser(42);`).then(r => console.log('SOURCE CODE Result:', r));
```

## 5. Check Results

Each should return:
```json
{
  "findings": [...],  // Array of detected items
  "riskLevel": "high" | "moderate" | "low" | "none",
  "score": <number>,
  "governance": <string>,
  "normalisedText": <string>,
  "wasCapsConverted": boolean
}
```

## 6. Verify Module Availability

```javascript
// Check all modules are loaded
console.log('TrustScanner:', typeof TrustScanner);
console.log('TRUSTPROMPT_PATTERNS:', typeof TRUSTPROMPT_PATTERNS);
console.log('TrustGazetteer:', typeof TrustGazetteer);
console.log('TrustLinguisticDetector:', typeof TrustLinguisticDetector);
console.log('TrustNormalizer:', typeof TrustNormalizer);
console.log('TrustValidator:', typeof TrustValidator);
```

All should print `'function'` or `'object'`.

## Expected Issues & Fixes Made

✓ **FIXED**: TRUSTPROMPT_PATTERNS not exported → Added export to patterns.js
✓ **FIXED**: TrustGazetteer not exported → Added export to gazetteer.js
✓ **FIXED**: TrustNormalizer not exported → Added export to normalizer.js  
✓ **FIXED**: TrustLinguisticDetector not exported to globalThis → Added export to linguistic-detector.js
✓ **FIXED**: Source code detection nested in PATH A → Moved to independent runSourceCodeDetection()

All modules now properly export to both `globalThis` and `window` for browser compatibility.
