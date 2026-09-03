# Tasks: Linguistic PII Detection (PATH C)

## Phase 1: Core Implementation

### 1.1 Create linguistic-detector.js Module

**Objective**: Build the main PATH C detector module with NER and POS tagging support.

**Steps**:
1. Create `linguistic-detector.js` in the TrustPrompt root directory
2. Implement module IIFE with compromise.js availability check
3. Define constants (JOB_TRIGGER_PHRASES, COMMON_FIRST_NAMES, COMMON_JOB_TITLES)
4. Implement `scan(textNLP)` function with error handling and graceful degradation
5. Implement entity extraction functions:
   - `extractPersons(doc)` — PERSON NER + "my name is" trigger
   - `extractJobTitles(doc)` — JOB NER + POS heuristics + trigger phrases
   - `extractOrganizations(doc)` — ORG NER + "work at/for" triggers
6. Implement helper functions:
   - `shouldFilterCommonName(name)`
   - `shouldFilterCommonJobTitle(title)`
   - `deduplicateWithinPath(findings)`
7. Export public API: `{ scan: Function }`

**Acceptance Criteria**:
- [x] Module loads without errors when compromise.js is available
- [x] Module logs debug message and returns empty array when compromise.js is unavailable
- [x] `scan()` accepts string input and returns array of finding objects
- [x] Each finding has required fields: patternId, label, risk, rawMatch, safeVersion, source, validated
- [x] No unhandled exceptions thrown; errors logged to console

### 1.2 Add PATH C to patterns.js

**Objective**: Define the three new pattern types (nlp_person_name, nlp_job_title, nlp_organization) for BASE_SCORES and ENTITY_TIER.

**Steps**:
1. Open `patterns.js`
2. Add linguistic pattern definitions (if patterns.js contains pattern metadata)
3. Add PATH C patterns to BASE_SCORES: `nlp_person_name: 2`, `nlp_job_title: 2`, `nlp_organization: 2`
4. Add PATH C patterns to ENTITY_TIER: all as `contextual`

**Acceptance Criteria**:
- [x] All three pattern IDs are defined in BASE_SCORES with score 2
- [x] All three pattern IDs are defined in ENTITY_TIER as contextual
- [x] No merge conflicts with existing patterns
- [x] Linter passes without errors

### 1.3 Update scanner.js to Invoke PATH C

**Objective**: Integrate PATH C into the main scanner pipeline.

**Steps**:
1. Open `scanner.js`
2. Import TrustLinguisticDetector module (after Gazetteer import)
3. Update `scan(rawText)` function:
   - After normalizing text, invoke `TrustGazetteer.scan(textNLP)` and `TrustLinguisticDetector.scan(textNLP)` in parallel (promise.all or concurrent invocation)
   - Pass both pathBFindings and pathCFindings to `mergeAndDedupe()`
4. Update `mergeAndDedupe()` function signature to accept three paths:
   - `mergeAndDedupe(pathA, pathB, pathC)`
   - Merge using same logic (highest risk wins; dedup by rawMatch)
5. Update console logging to show PATH C finding count

**Acceptance Criteria**:
- [x] Scanner successfully invokes PATH C after PATH A and in parallel with PATH B
- [x] PATH C findings are merged with PATH A and PATH B using deduplication logic
- [x] Console log shows finding counts from all three paths: `(A:X B:Y C:Z)`
- [x] Existing PATH A and PATH B tests continue to pass
- [ ] Linter passes without errors

### 1.4 Update Normalizer Integration (if needed)

**Objective**: Verify that the normalizer provides `textNLP` view to PATH C.

**Steps**:
1. Review `normalizer.js` to confirm `textNLP` is produced and exposed
2. If not already exposed, update `normalize()` return shape to include `textNLP`
3. Verify that `textNLP` is passed to PATH C scanner

**Acceptance Criteria**:
- [x] Normalizer returns object with `textNLP` field
- [x] `textNLP` is passed to `TrustLinguisticDetector.scan()`
- [x] No changes needed to main scan flow

## Phase 2: Testing

### 2.1 Write Property-Based Tests for PATH C Detector

**Objective**: Create comprehensive property-based tests to verify PATH C correctness.

**Steps**:
1. Create test file `test-linguistic-detector.js` (or add to existing test suite)
2. Use hypothesis or fast-check for property generation
3. Implement properties:
   - **Round-trip**: Extracting and re-scanning finds same/equivalent entity
   - **Invariant**: All findings have required fields; no negative finding counts
   - **Idempotence**: Scanning twice returns same findings (order-independent)
   - **Metamorphic**: If A ⊆ B (text), then findings(A) ⊆ findings(B)
   - **Graceful degradation**: No error when compromise.js unavailable
   - **Performance**: Execution time < 50ms for typical input
4. Run tests and fix any failures

**Acceptance Criteria**:
- [x] All property tests pass with 100+ generated examples
- [x] Coverage: Person detection, job detection, organization detection
- [x] Graceful degradation property passes (compromise unavailable)
- [x] Performance property passes (50ms budget)
- [x] No test flakiness (run 3× consecutively passes)

### 2.2 Write Integration Tests for Scanner + PATH C

**Objective**: Verify PATH C integrates correctly with the scanner pipeline.

**Steps**:
1. Create test file `test-scanner-pathc.js` (or add to existing scanner tests)
2. Test basic integration:
   - "My name is Alice Smith" → finds person with patternId nlp_person_name
   - "I work as a Senior Engineer at Acme Corp" → finds job and org
3. Test deduplication:
   - Same entity found by PATH A and PATH C → merged with highest risk
4. Test parallel execution:
   - PATH B and PATH C both process same text; findings merge correctly
5. Test graceful degradation:
   - If compromise.js unavailable, scanner still produces findings from A/B
6. Test edge cases:
   - Empty text, very long text, mixed language
7. Run tests and fix failures

**Acceptance Criteria**:
- [~] Basic integration tests pass (person, job, org detection)
- [~] Deduplication tests pass (highest risk preserved)
- [~] Parallel execution tests pass (no race conditions)
- [~] Graceful degradation tests pass
- [~] Edge case tests pass
- [~] All existing scanner tests continue to pass

### 2.3 Manual Testing with Real Prompts

**Objective**: Verify PATH C works correctly on realistic TrustPrompt use cases.

**Steps**:
1. Test prompts:
   - "Hey ChatGPT, my name is Maria Santos. I live in Manila and work as a Product Manager at TechStartup Inc. My phone is +63-910-123-4567."
   - "I'm John, a Senior Software Engineer working at Google. I have diabetes and I'm on medication."
   - "Please summarize my resume. I'm Alice Cooper, CEO of Acme Solutions."
2. Verify findings detected for names, jobs, organizations
3. Verify findings merged with PATH A/B findings (if overlaps exist)
4. Verify risk score computed correctly
5. Verify UI displays redacted versions

**Acceptance Criteria**:
- [~] Person names detected and redacted correctly
- [~] Job titles detected and redacted correctly
- [~] Organizations detected and redacted correctly
- [~] UI shows safe versions only (no raw text leaked)
- [~] Risk score reflects combination of all paths

## Phase 3: Documentation and Polish

### 3.1 Add JSDoc Comments to linguistic-detector.js

**Objective**: Document the module API and key functions.

**Steps**:
1. Add module-level JSDoc (overview, dependencies, error handling)
2. Document public function `scan(textNLP)`:
   - @param textNLP
   - @returns findings array
   - @throws (or @returns [])
3. Document private functions with @private and brief descriptions

**Acceptance Criteria**:
- [~] All public functions have JSDoc comments
- [~] Comments describe parameters, return types, and error behavior
- [~] Linter passes (no JSDoc warnings)

### 3.2 Update manifest.json (if needed)

**Objective**: Ensure compromise.js is correctly declared as an optional dependency.

**Steps**:
1. Review `manifest.json` to see how external libraries are declared
2. If needed, add a comment or note that compromise.js is expected but optional
3. Verify no build or load errors

**Acceptance Criteria**:
- [~] manifest.json reflects that compromise.js is optional
- [~] Extension loads and functions correctly with/without compromise.js

### 3.3 Add Comment to scanner.js Explaining PATH C

**Objective**: Document the PATH C integration and parallel execution model.

**Steps**:
1. Add comment block above the `scan()` function explaining:
   - Three paths (A: regex, B: gazetteer, C: linguistic)
   - Parallel execution of B and C on textNLP
   - Merging and deduplication strategy
2. Update inline comments to explain new variables (pathCFindings, etc.)

**Acceptance Criteria**:
- [~] Comments are clear and accurate
- [~] Future maintainers can understand the architecture
- [~] Comments are kept up-to-date if code changes

### 3.4 Add Inline Comments Explaining Heuristics

**Objective**: Document decision logic in linguistic-detector.js.

**Steps**:
1. Add comments explaining:
   - Why trigger phrases are used as fallback to NER
   - Why common names/jobs are optional filtered
   - Why risk level is 'low' for linguistic findings
   - Why validated is always false
2. Keep comments concise but informative

**Acceptance Criteria**:
- [~] Heuristic logic is explained and justified
- [~] Comments aid understanding without cluttering code

## Phase 4: Verification and Final Review

### 4.1 Verify Lint and Formatting

**Objective**: Ensure code follows project style.

**Steps**:
1. Run project linter (if available)
2. Fix any lint errors
3. Check code formatting (indentation, spacing)
4. Verify no commented-out code or debug statements remain

**Acceptance Criteria**:
- [~] Linter passes with no errors or warnings
- [~] Code formatting is consistent with project style
- [~] No debug or temporary code left in

### 4.2 Performance Profiling

**Objective**: Verify PATH C stays within 50ms budget.

**Steps**:
1. Use browser DevTools or profiling tools to measure `scan()` execution time
2. Test on representative inputs (100–500 characters)
3. Document average and max execution times
4. If budget exceeded, optimize (caching, heuristic pruning, etc.)

**Acceptance Criteria**:
- [~] Average execution time: 20–30ms
- [~] Maximum execution time: < 50ms
- [~] Profiling results documented

### 4.3 Verify All Tests Pass

**Objective**: Final verification that all tests pass.

**Steps**:
1. Run full test suite (PATH C tests + existing scanner/gazetteer tests)
2. Fix any failures
3. Document test results

**Acceptance Criteria**:
- [~] All property-based tests pass
- [~] All integration tests pass
- [~] All existing tests continue to pass
- [~] No flaky tests

### 4.4 Code Review Checklist

**Objective**: Final review before merge.

**Steps**:
1. Review linguistic-detector.js:
   - [~] Module follows project patterns
   - [~] Error handling is robust
   - [~] Graceful degradation works
   - [~] Performance is acceptable
   - [~] Comments are clear
2. Review scanner.js changes:
   - [~] PATH C integration is correct
   - [~] Parallel execution is safe
   - [~] Merging logic is correct
   - [~] Logging is informative
3. Review test coverage:
   - [~] Tests cover happy path
   - [~] Tests cover edge cases
   - [~] Tests cover error conditions

**Acceptance Criteria**:
- [~] Code review checklist all checked
- [~] No blocking issues identified
- [~] Ready for merge to main branch

## Success Criteria (Overall)

1. ✅ PATH C successfully detects person names, job titles, and organizations
2. ✅ PATH C runs in parallel with PATH B on textNLP view
3. ✅ Findings are merged and deduplicated correctly
4. ✅ Risk scoring includes PATH C findings
5. ✅ Graceful degradation works (no error if compromise.js unavailable)
6. ✅ Performance is within 50ms budget
7. ✅ All tests pass (property-based and integration)
8. ✅ Code is documented and follows project style
9. ✅ Manual testing confirms correct behavior on realistic prompts

