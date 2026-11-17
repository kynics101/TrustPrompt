# Quick Test Reference Card

## 🚀 Fastest Way to Run Tests

### Browser (Recommended for Most Users)
```
1. Open: run-tests.html
2. Click buttons
3. View results
```

### Command Line (Fastest)
```powershell
cd TrustPrompt
node run-tests.js
```

---

## 📋 All Test Options

| Method | File | Speed | Platform | Effort |
|--------|------|-------|----------|--------|
| **Browser (Recommended)** | `run-tests.html` | ⚡⚡ | All | 1 click |
| **Node.js CLI** | `run-tests.js` | ⚡⚡⚡ | Windows/Mac/Linux | 1 command |
| **Individual Tests** | `test-*.html` | ⚡ | All | 1 open |

---

## ✅ All Problems Solved

| Error | Cause | Solution | Status |
|-------|-------|----------|--------|
| CSP inline script violation | Inline `<script>` tags | Extracted to `.js` files | ✅ Fixed |
| localStorage blocked | Browser sandbox | Using local HTML only | ✅ Fixed |
| External resources fail | Network blocking | Using only local deps | ✅ Fixed |
| Module not found | Load order | Dependencies ordered correctly | ✅ Fixed |

---

## 📁 What Was Created

### New Files (5 total)
1. ✅ `run-tests.html` - Complete browser test runner
2. ✅ `run-tests.js` - Node.js CLI test runner
3. ✅ `TEST_RUNNER_GUIDE.md` - Full documentation
4. ✅ `QUICK_TEST_REFERENCE.md` - This file
5. ✅ 4 × external JS files (already created in previous step)

### Updated Files (4 total)
1. ✅ `test-debug.html` - Updated with external script reference
2. ✅ `test-fixes-browser.html` - Updated with external script reference
3. ✅ `test-ner-browser.html` - Updated with external script reference
4. ✅ `test-path-c-semantic-context.html` - Updated with external script reference

---

## 🎯 Quick Decision Tree

```
Want to run tests?
├─ In browser with UI?
│  └─ → Open run-tests.html ✅
├─ From command line?
│  └─ → Run: node run-tests.js ✅
├─ Testing specific feature?
│  └─ → Open corresponding test-*.html file ✅
└─ Integrating with CI/CD?
   └─ → Use run-tests.js with exit codes ✅
```

---

## 🔧 Troubleshooting

| Problem | Quick Fix |
|---------|-----------|
| "Module not found" | Check all .js files exist in project folder |
| Tests don't run | Try alternative runner (browser vs CLI) |
| CSP error still appears | Clear browser cache, reload page |
| Slow performance | Run in Node.js instead of browser |
| Can't find file | Verify path: `c:\Users\Kyleen Nicdao\Documents\TrustPrompt\TrustPrompt\` |

---

## 📊 Test Coverage

### Debug Tests (3 tests)
- ✓ Module availability
- ✓ Basic scanning
- ✓ Source code detection

### Fixes Tests (5 tests)
- ✓ Credit card detection
- ✓ Health trigger (PATH B)
- ✓ Person names (PATH C)
- ✓ Source code
- ✓ Email addresses

### Semantic Tests (4 tests)
- ✓ Person + Organization
- ✓ Job title detection
- ✓ Mixed case handling
- ✓ Complex phrases

**Total: 12 tests**

---

## 🎓 Learning Path

1. **Start here:** Open `run-tests.html` in browser
2. **Click "Debug Tests"** to verify setup works
3. **Click "Fixes Tests"** to test recent improvements
4. **Click "Semantic Tests"** to test complex detection
5. **View results** in real-time
6. **Check console** (F12) for detailed logs

---

## 📝 Commands Reference

```powershell
# Browser test runner
start run-tests.html

# Node.js runner (all tests)
node run-tests.js

# Node.js runner (debug only)
node run-tests.js --debug

# Node.js runner (fixes only)
node run-tests.js --fixes

# Node.js runner (semantic only)
node run-tests.js --semantic

# Direct file opening
start test-debug.html
start test-fixes-browser.html
start test-ner-browser.html
start test-path-c-semantic-context.html
```

---

## ✨ Key Features

### run-tests.html
- 🎨 Beautiful UI with color coding
- 🖱️ Interactive button controls
- 📊 Real-time result display
- 🔍 Console logging for debugging
- ✅ No CSP errors
- ✅ No external dependencies

### run-tests.js
- ⚡ Lightning fast execution
- 🎨 Color-coded terminal output
- ⏱️ Timestamped logs
- 📈 Test summary with pass rate
- 🔄 Exit codes for CI/CD
- ✅ Works on any OS

---

## 🎉 Success Criteria

**All tests pass when:**
- ✓ Module loads without errors
- ✓ Scan function returns results
- ✓ PII is detected correctly
- ✓ Risk levels assigned properly
- ✓ No CSP or security errors
- ✓ Execution completes in <5 seconds

---

## 💡 Pro Tips

1. **Run browser version first** - Easier to see results
2. **Check console logs** - Press F12 to open developer tools
3. **Test individually** - Use specific test files if having issues
4. **Performance baseline** - Note test execution times
5. **Clean cache** - Ctrl+F5 in browser for fresh run

---

## 📞 Need Help?

1. **CSP Error?** → Use `run-tests.html` (already fixed)
2. **Module Error?** → Verify `.js` files exist in folder
3. **Slow Tests?** → Try `node run-tests.js` instead
4. **Still Stuck?** → Check `TEST_RUNNER_GUIDE.md` for detailed help

---

**Last Updated:** November 6, 2026  
**Status:** ✅ Ready to Use
