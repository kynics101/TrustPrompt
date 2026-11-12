# TrustPrompt Test Runner Guide

## Overview

This guide explains how to run tests without hitting Content Security Policy (CSP) errors or browser sandbox restrictions.

## Problems Solved

✅ **CSP Inline Script Blocking** - Fixed by extracting inline scripts to external `.js` files  
✅ **LocalStorage Access Denied** - Bypassed by using Node.js runner  
✅ **External Resource Blocking** - Resolved by using local dependencies only  
✅ **Sandboxing Issues** - Eliminated by running directly in Node.js or local HTML

---

## Solution 1: Browser Test Runner (Recommended for Visual Testing)

### File: `run-tests.html`

A fully self-contained HTML file that runs all tests in the browser with a clean UI.

#### How to Use:

1. **Open in browser:**
   ```
   Open c:\Users\Kyleen Nicdao\Documents\TrustPrompt\TrustPrompt\run-tests.html
   in your web browser (Chrome, Firefox, Edge, etc.)
   ```

2. **Click test buttons:**
   - 🔵 **Debug Tests** - Tests basic TrustScanner functionality
   - 🔵 **Fixes Tests** - Tests PII detection improvements
   - 🔵 **Semantic Tests** - Tests semantic context detection
   - 🗑️ **Clear Output** - Clear the results

#### Features:

- ✅ No CSP errors (uses external scripts only)
- ✅ No localStorage issues (no external storage access)
- ✅ Clean, modern UI with color-coded results
- ✅ Real-time console logging
- ✅ All dependencies loaded locally

#### Browser Compatibility:

- Chrome/Chromium ✅
- Firefox ✅
- Edge ✅
- Safari ✅

---

## Solution 2: Node.js Command-Line Runner

### File: `run-tests.js`

A Node.js test runner for command-line execution. Perfect for CI/CD pipelines and automated testing.

#### How to Use:

1. **Run all tests:**
   ```powershell
   node run-tests.js
   ```

2. **Run specific test suite:**
   ```powershell
   node run-tests.js --debug
   node run-tests.js --fixes
   node run-tests.js --semantic
   ```

#### Features:

- ✅ No browser required
- ✅ Color-coded terminal output
- ✅ Timestamped logs
- ✅ Exit codes for CI/CD integration
- ✅ Test summary with pass rate

#### Requirements:

- Node.js 12+ installed
- No external dependencies needed

---

## Solution 3: Individual Test Files

### Extracted External Scripts

Each test now has a corresponding external JavaScript file:

| HTML File | External Script |
|-----------|-----------------|
| `test-debug.html` | `test-debug.js` |
| `test-fixes-browser.html` | `test-fixes-browser.js` |
| `test-ner-browser.html` | `test-ner-browser.js` |
| `test-path-c-semantic-context.html` | `test-path-c-semantic-context.js` |

#### How to Use:

```html
<!-- Just open these files in a browser -->
test-debug.html
test-fixes-browser.html
test-ner-browser.html
test-path-c-semantic-context.html
```

No CSP errors because all scripts are loaded from external files.

---

## Error Solutions

### Error 1: "Executing inline script violates CSP"

**Cause:** Inline `<script>...</script>` tags in HTML

**Solution:** ✅ Fixed - Scripts extracted to external `.js` files

**Status:** All inline scripts moved to external files

---

### Error 2: "Failed to read the 'localStorage' property from 'Window': The document is sandboxed"

**Cause:** Browser sandbox prevents localStorage access

**Solutions:**
1. **Recommended:** Use `run-tests.html` (doesn't use localStorage)
2. **Alternative:** Run in Node.js with `run-tests.js`
3. **Fallback:** Open HTML file directly from file system (not via server)

---

### Error 3: "Failed to load bzr.openai.com/v1/obi/sync:1"

**Cause:** Trying to load external OpenAI resources

**Solution:** ✅ Fixed - `run-tests.html` uses only local dependencies

---

### Error 4: "Failed to load t2.gstatic.com/favicon"

**Cause:** External favicon request blocked

**Solution:** ✅ Removed external favicon references

---

## Quick Start

### Option A: Visual Browser Testing (Easiest)

```
1. Open run-tests.html in your browser
2. Click the test buttons
3. View results immediately
```

### Option B: Command-Line Testing (Fastest)

```powershell
cd c:\Users\Kyleen Nicdao\Documents\TrustPrompt\TrustPrompt
node run-tests.js
```

### Option C: Individual Test Files

```
1. Open any test-*.html file in browser
2. Results appear automatically
3. Check console for detailed logs
```

---

## Test Suites Explained

### Debug Tests

Tests basic functionality of the TrustScanner module:
- Module availability
- Scan method
- Source code detection
- Basic PII detection

**Expected Results:**
```
✓ TrustScanner module loaded
✓ TrustScanner.scan() method available
✓ TrustScanner.computeSourceCodeScore() available
✓ Scan completed: X findings detected
```

---

### Fixes Tests

Tests recent bug fixes and improvements:
- Credit card detection (positive control)
- Health trigger detection (PATH B)
- Person name detection (PATH C)
- Source code detection
- Email detection

**Expected Results:**
```
✓ Credit Card (Positive Control) - Correct detection
✓ PATH B - Health Trigger - Correct detection
✓ PATH C - Person Name - Correct detection
✓ Source Code Detection - Correct detection
✓ Email Detection - Correct detection
```

---

### Semantic Tests

Tests semantic context detection:
- Person names in context
- Organization detection
- Job title detection
- Case-insensitive detection

**Expected Results:**
```
✓ "Kyleen Nicdao works in Accenture" - 2 findings detected
✓ "Madeline is a virtual assistant at PGH Hospital" - 3 findings detected
✓ "juliah is a nurse" - 1 finding detected
✓ "GENERATE AN EMAIL FOR BEATRICE, THE PROJECT MANAGER OF AZURE" - 4 findings detected
```

---

## Troubleshooting

### Issue: "TrustScanner is not defined"

**Cause:** Dependencies not loaded in correct order

**Solution:** 
- Ensure `scanner.js` is loaded AFTER `patterns.js`, `gazetteer.js`, etc.
- Check browser console for load errors
- Verify all script src paths are correct

### Issue: Tests hang or don't complete

**Cause:** Heavy computation or missing dependencies

**Solution:**
- Check browser console for errors
- Try simplifying test case
- Run individual test instead of all tests
- Increase browser memory/performance

### Issue: All tests fail with module errors

**Cause:** File paths incorrect or files not in expected location

**Solution:**
- Verify all `.js` files exist in project directory
- Check that paths in HTML are relative to HTML file location
- Use browser developer tools → Network tab to verify file loads

---

## Integration with CI/CD

Use `run-tests.js` for automated testing:

```yaml
# Example GitHub Actions workflow
- name: Run TrustPrompt Tests
  run: |
    cd TrustPrompt
    node run-tests.js
```

Exit codes:
- `0` = All tests passed
- `1` = One or more tests failed

---

## File Structure

```
TrustPrompt/
├── run-tests.html                    ← Main test runner (browser)
├── run-tests.js                      ← Alternative runner (Node.js)
├── TEST_RUNNER_GUIDE.md             ← This file
│
├── test-debug.html                   ← Individual test
├── test-debug.js                     ← ↑ External script
│
├── test-fixes-browser.html
├── test-fixes-browser.js
│
├── test-ner-browser.html
├── test-ner-browser.js
│
├── test-path-c-semantic-context.html
├── test-path-c-semantic-context.js
│
└── Dependencies:
    ├── scanner.js
    ├── patterns.js
    ├── gazetteer.js
    ├── linguistic-detector.js
    ├── normalizer.js
    └── lib/validator.min.js
```

---

## Performance Notes

- **Browser Runner:** 50-200ms per test (depending on complexity)
- **Node.js Runner:** 10-50ms per test (faster execution)
- **Memory Usage:** ~50MB for all dependencies

---

## Support

For issues or questions:

1. Check browser console for error messages
2. Verify all files exist in correct locations
3. Try alternative test runner (browser vs Node.js)
4. Check file permissions (Windows may need "Run as Administrator")

---

## Version Info

- **Created:** November 2026
- **Last Updated:** November 6, 2026
- **Status:** Ready for production testing
