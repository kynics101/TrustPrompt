# Organization CSV Integration — Next Steps

## What Was Delivered

Four production-ready files plus documentation:

1. **organization-loader.js** — 22,151 orgs loaded with O(1) exact lookups + fuzzy matching
2. **organization-detector-enhanced.js** — Validation + extraction + confidence scoring
3. **test-organization-csv.js** — Comprehensive test suite
4. **ORGANIZATION_CSV_INTEGRATION_GUIDE.md** — Full documentation
5. **ORGANIZATION_CSV_QUICKSTART.md** — 5-minute setup guide

## Implementation Roadmap

### Phase 1: Integration (1-2 hours)

**Goal**: Wire up the new modules and verify they load correctly.

**Steps**:

1. **Update manifest.json**
   - Add `organization-loader.js` before `linguistic-detector-refactored.js`
   - Add `organization-detector-enhanced.js` after loader
   - Verify file order in `content_scripts` section

2. **Initialize detector in scanner.js**
   - Add `ensureOrgDetectorInitialized()` function
   - Call it on first scan to load CSV
   - Verify in browser DevTools: `TrustOrganizationLoader.getInstance().getStats()`

3. **Test CSV loading**
   - Open browser console
   - Run: `TrustOrganizationLoader.getInstance().getStats()`
   - Verify output shows: `totalOrganizations: 22151`

4. **Verify detector API**
   - In console:
     ```javascript
     const detector = TrustOrganizationDetectorEnhanced.getInstance();
     await detector.initialize();
     detector.validateOrganization('Apple Inc.');
     // Should return: { isKnown: true, confidence: 1.0 }
     ```

**Verification Checklist**:
- [ ] manifest.json updated with new files
- [ ] No console errors on extension load
- [ ] CSV loads without fetch errors
- [ ] Loader reports 22,151 organizations
- [ ] validateOrganization() returns expected results
- [ ] fuzzyMatch works: "Appl Inc" → "Apple Inc."

### Phase 2: Detector Integration (1-2 hours)

**Goal**: Replace pattern-only org extraction with enhanced validation.

**Steps**:

1. **Locate extractOrganizations() in linguistic-detector-refactored.js**
   - Find the function that returns organization findings
   - Keep existing pattern extraction
   - Add validation layer

2. **Add detector call in extractOrganizations()**
   ```javascript
   async function extractOrganizations(doc, fullText) {
     const findings = [];
     const detector = TrustOrganizationDetectorEnhanced.getInstance();

     // Extract via patterns (existing code)
     const extractedOrgs = extractOrganizationContexts(fullText);

     // NEW: Validate each extraction
     for (const org of extractedOrgs) {
       const validation = detector.validateOrganization(org);
       findings.push({
         // ... existing fields ...
         confidence: validation.confidence,       // NEW
         validationType: validation.reason,       // NEW
         validated: validation.isKnown            // NEW
       });
     }

     return findings;
   }
   ```

3. **Test with real text**
   - Input: "I work at Acccenture in Philippines"
   - Expected: "Acccenture" → fuzzy match to "Accenture" (confidence: 0.75)

4. **Test with typos and abbreviations**
   - Input: "I'm an AAPL employee at Microsft"
   - Expected: 
     - "AAPL" → matched to "Apple Inc." (via abbreviation)
     - "Microsft" → fuzzy match to "Microsoft" (distance: 1)

**Verification Checklist**:
- [ ] extractOrganizations() is async
- [ ] Detector is called for each extracted org
- [ ] Confidence scores are populated
- [ ] Validation types are recorded
- [ ] Fuzzy matches work correctly
- [ ] Abbreviations are validated

### Phase 3: Tuning (1-2 hours)

**Goal**: Adjust thresholds to minimize false positives while maintaining recall.

**Steps**:

1. **Test current detection rate**
   - Run test-organization-csv.js
   - Review test results: pass rate should be >95%

2. **Tune fuzzy matching threshold**
   - Current: `fuzzyDistanceThreshold: 2` (default)
   - If too many false positives: increase to 3 (stricter)
   - If missing real typos: decrease to 1 (looser)
   - Test with real user data

3. **Adjust confidence threshold for filtering**
   - Current: `filterFindings(findings, 0.50)` keeps confidence >= 0.50
   - For high precision (fewer false positives): raise to 0.75
   - For high recall (catch more orgs): lower to 0.25

4. **Test false-positive rate**
   - Create test text with common words: "The management department reports to the board"
   - Verify: no false-positive org matches
   - If failures exist, increase `minOrgLength` or adjust patterns

5. **Benchmark performance**
   - Scan 10KB text: should complete in <100ms
   - If slow: disable fuzzy matching for large texts
   - If very slow: check for regex backtracking in patterns

**Configuration Template**:
```javascript
// Save these settings if tuning succeeds
detector.updateConfig({
  enableFuzzyMatch: true,          // ← Adjust based on results
  fuzzyDistanceThreshold: 2,       // ← 1-3 range
  minOrgLength: 3,                 // ← 2-4 range
  confidenceScores: {
    exactMatch: 1.0,
    fuzzyMatch: 0.75,
    contextualPattern: 0.50        // ← Minimum confidence to include
  }
});
```

**Verification Checklist**:
- [ ] False-positive rate < 5% on test text
- [ ] True-positive rate > 90% on known orgs
- [ ] Performance < 100ms for typical prompts
- [ ] Fuzzy matching catches common typos
- [ ] Abbreviations are validated correctly

### Phase 4: Downstream Integration (2-3 hours)

**Goal**: Use confidence scores in risk scoring and findings processing.

**Steps**:

1. **Locate risk scoring logic in scanner.js**
   - Find where organization findings are scored
   - Look for `nlp_organization` pattern ID

2. **Use confidence scores in scoring**
   ```javascript
   if (finding.patternId === 'nlp_organization') {
     // Exact match in CSV → lower risk (verified org)
     if (finding.confidence >= 0.95) {
       baseScore *= 0.90;  // -10% for verified known org
     }
     // Fuzzy match → medium confidence
     else if (finding.confidence >= 0.70) {
       baseScore *= 0.95;  // -5% for fuzzy match
     }
     // Contextual extraction → low confidence
     else if (finding.confidence >= 0.40) {
       baseScore *= 0.98;  // -2% (might be false positive)
     }
   }
   ```

3. **Add validation status to output**
   - Include `validated` flag in final findings
   - Use in UI: show checkmark for verified orgs, question mark for uncertain
   - Help users distinguish certain from uncertain detections

4. **Test risk score changes**
   - Same text, before/after: risk scores should be similar
   - Known orgs should have slightly lower scores
   - Unknown orgs shouldn't change (still flagged as org)

**Verification Checklist**:
- [ ] Risk scores use confidence information
- [ ] Findings include validation status
- [ ] UI correctly displays verification status
- [ ] Risk scores remain reasonable (not inverted)

### Phase 5: Documentation & Testing (1 hour)

**Goal**: Ensure maintainability and correct behavior.

**Steps**:

1. **Run full test suite**
   ```javascript
   // In browser console
   window.runOrganizationCsvTests()
   ```
   - Should see pass rate > 95%
   - Review any failures

2. **Document any customizations**
   - If you modified thresholds, document why
   - Add comments in scanner.js for detector initialization
   - Update team wiki/documentation

3. **Create usage example**
   - Add comment block in linguistic-detector-refactored.js explaining new fields
   - Show downstream code how to use `confidence` and `validated` flags

4. **Performance monitoring**
   - Add console logs for first run:
     ```javascript
     console.log('[TrustPrompt] Org detector loaded CSV in', elapsed, 'ms');
     ```
   - Track CSV load time in production to identify issues

**Verification Checklist**:
- [ ] Test suite passes >95%
- [ ] No console errors on first use
- [ ] CSV loads successfully (DevTools Network tab)
- [ ] Performance logs are recorded
- [ ] Team documentation is updated

## Quick Reference: What Changed

### Files Added
- organization-loader.js — CSV indexing
- organization-detector-enhanced.js — Validation logic
- test-organization-csv.js — Tests
- Documentation files (3)

### Files Modified (conceptually, you do this)
- manifest.json — add loader & detector scripts
- scanner.js — initialize detector on first scan
- linguistic-detector-refactored.js — use enhanced validation
- (optional) scanner.js risk scoring — use confidence scores

### No Breaking Changes
- All existing functionality preserved
- New fields optional (findings work with or without them)
- Gradual fallback if CSV fails to load

## Estimated Timeline

| Phase | Duration | Effort | Complexity |
|-------|----------|--------|------------|
| 1. Integration | 1-2 hours | Low | Easy |
| 2. Detector Integration | 1-2 hours | Low | Easy |
| 3. Tuning | 1-2 hours | Medium | Medium |
| 4. Downstream Integration | 2-3 hours | Medium | Medium |
| 5. Testing & Docs | 1 hour | Low | Easy |
| **TOTAL** | **6-10 hours** | **Medium** | **Easy to Medium** |

## Success Criteria

- [ ] CSV loads without errors (22,151 orgs)
- [ ] Exact match works: "Apple Inc." → confidence 1.0
- [ ] Fuzzy match works: "Appl Inc" → confidence 0.75, distance=1
- [ ] Abbreviations work: "AAPL" → validated as "Apple Inc."
- [ ] False-positive rate < 5% on test text
- [ ] True-positive rate > 90% on known orgs
- [ ] Performance < 100ms for typical prompts (<10KB)
- [ ] No console errors or warnings
- [ ] Test suite passes > 95%

## Rollback Plan

If issues arise during implementation:

1. **CSV loading fails**
   - Detector gracefully handles: all validations return `isKnown: false`
   - Falls back to pattern-only extraction
   - No breaking changes to existing findings

2. **Performance degradation**
   - Disable fuzzy matching: `enableFuzzyMatch: false`
   - Increase `minOrgLength` to skip short names
   - Disable contextual extraction: `enableContextExtraction: false`

3. **Too many false positives**
   - Increase `fuzzyDistanceThreshold` (2 → 3)
   - Increase minimum confidence in filtering (0.50 → 0.75)
   - Reduce org extraction patterns

4. **Complete rollback**
   - Remove loader & detector from manifest.json
   - Revert linguistic-detector-refactored.js changes
   - System returns to pattern-only detection

## Getting Help

### If CSV doesn't load:
1. Check path: should be `/csv/organizations.csv`
2. Check file exists: `curl http://localhost:port/csv/organizations.csv`
3. Check encoding: must be UTF-8 (not UTF-16 or Latin-1)
4. Check CORS: if loading from extension, no CORS issues

### If fuzzy matching is slow:
1. Increase `fuzzyDistanceThreshold` (reduces search space)
2. Disable for large texts (> 5000 chars)
3. Use prefix search instead of fuzzy

### If many false positives:
1. Increase `minOrgLength` to 4 or 5
2. Disable acronym pattern matching
3. Increase filtering confidence threshold

### If test suite fails:
1. Check CSV is loaded: `TrustOrganizationLoader.getInstance().getStats()`
2. Check detector is initialized: `await detector.initialize()`
3. Run individual tests for debugging

## Next Immediate Step

**Start with Phase 1: Integration**

1. Copy 2 files: organization-loader.js, organization-detector-enhanced.js
2. Update manifest.json (add 2 lines)
3. Test in console: `TrustOrganizationLoader.getInstance().getStats()`
4. Verify: shows `totalOrganizations: 22151`

That's it! Once Phase 1 works, move to Phase 2.

---

## Support Resources

- **Quick Start**: ORGANIZATION_CSV_QUICKSTART.md
- **Full Guide**: ORGANIZATION_CSV_INTEGRATION_GUIDE.md
- **Test Suite**: test-organization-csv.js
- **API Reference**: organization-loader.js & organization-detector-enhanced.js (comments)

All files include inline documentation for specific functions and configuration options.
