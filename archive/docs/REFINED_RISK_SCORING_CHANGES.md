# Refined Risk Scoring Model — Implementation Changes

This document records the three refinements made to TrustPrompt's Privacy Disclosure
Risk Assessment Engine. All changes were applied identically to both scoring paths:

- `scanner.js` (main-thread scorer)
- `trust-worker.js` (web-worker scorer)

No base scores, multiplier values, or classification thresholds were changed. The
refinements affect (a) how distinct scoring units are counted and (b) when the
Sensitive-Context Co-occurrence rule (Rule 2) fires.

---

## 1. Scoring-Unit Grouping

### What changed
Closely related detected fields are now collapsed into a single **scoring unit** so
the base total and the distinct-type count are not inflated when several fields
describe the same information category. Detection stays field-specific (each field is
still detected and explained separately); only the risk calculation counts the unit
once.

| Scoring Unit | Included fields (`patternId`) | Base score | Counting |
|---|---|---|---|
| Contact Information | `email`, `ph_mobile`, `phone_intl` | 5 | Count once if any are detected |
| Organizational Affiliation | `trigger_employer`, `nlp_organization`, `nlp_job_title` | 2 | Count once if any are detected |

Any `patternId` not in a group forms its own scoring unit keyed by its own
`patternId`, so all other entity types keep their existing 1:1 behaviour.

### How it works
New lookup tables and helpers:

```js
SCORING_UNIT_GROUPS   // unitKey -> Set of patternIds
SCORING_UNIT_BASE     // unitKey -> fixed base score for the grouped unit
scoringUnitKey(patternId)   // returns the unit key (grouped key or the patternId)
scoringUnitBase(unitKey)    // returns the unit's base (grouped base or BASE_SCORES)
```

`computeRiskScore()` now iterates scorable findings by **scoring-unit key** instead of
raw `patternId`:

```js
const seenUnits = new Set();
let baseTotal = 0;
for (const f of scorable) {
  const unitKey = scoringUnitKey(f.patternId);
  if (!seenUnits.has(unitKey)) {
    seenUnits.add(unitKey);
    baseTotal += scoringUnitBase(unitKey);
  }
}
const distinctTypeCount = seenUnits.size;   // feeds getMultiplier()
```

### Effect on examples
- Email + phone number → **1 unit**, base 5 (previously 2 types, base 10).
- Organization + job title + department → **1 unit**, base 2 (previously 3 types, base 6).

---

## 2. First-Person Self-Attribution Anchor (Rule 2 trigger)

### What changed
Rule 2's first condition ("a scored personal entity is present") now also accepts an
**explicit first-person self-attribution anchor** as an alternative trigger. The
anchor is a *trigger only* — it is never scored and never changes the numeric base
score.

This lets a prompt with no scored entity but a clear self-disclosure plus a sensitive
context term escalate. Example: *"I was diagnosed with diabetes"* keeps a numeric
score of 0.00 and is raised from No Detected Risk → Low.

### How it works
```js
const FIRST_PERSON_ANCHORS = [ /* explicit "I was diagnosed", "my salary is", ... */ ];
function hasFirstPersonAnchor(text) { return FIRST_PERSON_ANCHORS.some(re => re.test(text)); }
```

Rule 2 condition 1 is now:

```js
const hasScoredEntity = findings.some(f => (BASE_SCORES[f.patternId] ?? 0) > 0);
const hasAnchor       = hasFirstPersonAnchor(fullText);
const triggerPresent  = hasScoredEntity || hasAnchor;
```

The anchor list is intentionally narrow (it does **not** treat the bare pronoun "I" as
an anchor) to limit false triggers. It covers explicit medical, financial, and
ethnicity/religion self-attribution phrasings.

---

## 3. Contextual Exclusion Filter (Rule 2)

### What changed
Before Rule 2 raises the preliminary level, a **deterministic exclusion filter** now
checks the sentence linking the identifier/anchor to the sensitive context term. If
the sentence is a non-disclosure reference (academic, informational, general
discussion, or hypothetical) **and** no explicit attribution overrides it, the Rule 2
escalation is **suppressed**.

Only the escalation is suppressed. Detected identifiers, context terms, and the
numeric base score are left unchanged. The filter is conservative: the absence of an
exclusion phrase never suppresses escalation.

### Pattern categories

| Category | Illustrative phrases |
|---|---|
| Research / academic | researching, studying, investigating, thesis, assignment, research on/about |
| Educational / informational | what is, explain, define, how does, causes of, symptoms of |
| General discussion | commonly affects, refers to, is defined as, examples of |
| Hypothetical | imagine if, suppose that, for example, hypothetically |

### Attribution override
A clear personal disclosure in the same sentence overrides any exclusion phrase and
keeps the escalation (e.g. "I have [condition]", "I was diagnosed with [condition]",
"my salary is [amount]", "Carlo was diagnosed with [condition]").

### How it works
```js
EXCLUSION_PATTERNS     // non-disclosure phrase regexes (4 categories)
ATTRIBUTION_PATTERNS   // positive attribution regexes (override exclusion)

splitSentences(text)                 // split on . ! ? and newlines
findSentenceContaining(full, needle) // locate the sentence holding a context term
shouldSuppressContextEscalation(findings, fullText)  // returns true to suppress
```

`shouldSuppressContextEscalation()` inspects every sentence that contains a sensitive
context term. It suppresses only when **all** such sentences are excluded and **none**
carry an attribution override:

```js
for (const sentence of sentences) {
  const excluded   = matchesExclusion(sentence);
  const attributed = matchesAttribution(sentence);
  if (!excluded || attributed) return false;  // escalation stands
}
return true;  // suppress Rule 2 escalation only
```

Rule 2 now applies the filter between its conditions and the escalation:

```js
if (triggerPresent && hasSensitiveContext) {
  const suppress = shouldSuppressContextEscalation(findings, fullText);
  if (!suppress) {
    // raise preliminary by one level (capped at high)
    return { rule: "sensitive_context", result: raised };
  }
  // suppressed → fall through, Rule 2 does not change the level
}
```

---

## Plumbing change: sentence text reaches the governance engine

The anchor and exclusion filter both need the prompt text, so the raw text is now
threaded through the scorer:

- `computeRiskScore(findings, fullText)`
- `evaluateGovernance(findings, preliminary, fullText)`
- Call sites updated to pass the original `rawText`:
  - `scanner.js` — inside `scan()` before returning results.
  - `trust-worker.js` — inside the `onmessage` SCAN handler.

Sentence scoping reuses the existing substring/windowing approach already used by
`shouldFilterByContext()` in `scanner.js`.

---

## Governance decision order (unchanged)

The decision order from the model is preserved. Rule 2's internal logic is the only
rule affected:

1. Strongly Validated Critical-Entity Rule → High
2. Sensitive-Context Co-occurrence Rule → raise one level (now gated by the anchor
   trigger option and the exclusion filter)
3. Low-Impact Entity Cap → cap at Moderate
4. No rule applies → retain preliminary

---

## Verification

Logic was checked against the manuscript's worked examples (Table 17). All pass:

| Prompt | Expected | Result |
|---|---|---|
| Email + phone number | 1 unit, base 5, Moderate | PASS |
| Organization + job title + department | 1 unit, base 2, Low | PASS |
| "My name is Carlo and I have hypertension." | Moderate (attribution) | PASS |
| "Maria is researching cancer for her thesis paper." | Low (exclusion suppresses) | PASS |
| "I am researching diabetes because I was diagnosed with it." | Low (anchor + attribution override) | PASS |
| Financial/medical context only (no entity/anchor) | No Detected Risk | PASS |

Both `scanner.js` and `trust-worker.js` pass editor diagnostics with no errors.

---

## Files modified

- `scanner.js`
- `trust-worker.js`

## Follow-up / open items

The manuscript flags that the anchor and exclusion/attribution phrase lists are
provisional and "must be defined and validated before the filter is considered
implemented." The current lists are a conservative starting set and should be tuned
during system validation against the test dataset.

---

## Post-implementation fixes (found by running the real pipeline)

The first version of the anchor rule did not fire in the live extension. Three
separate causes were found by running the real modules (`normalizer.js`,
`gazetteer.js`, `scanner.js`) in a Node sandbox. None was in Rule 2 itself.

### Fix A. `computeRiskScore` returned before governance ran (`scanner.js`, `trust-worker.js`)
When no entity had a base score above 0, the function returned `none` immediately,
so `evaluateGovernance` never ran for context-only findings. It now evaluates
governance when a first-person anchor and a sensitive-context finding are both
present (the anchor-only path: No Detected Risk to Low).

### Fix B. Common medical terms were missing from the gazetteer (`gazetteer.js`)
`terms-medical.js` (10,364 terms) has no entry for `hypertension`, `cancer`,
`surgery`, `medication` or `insulin`, so no `gazetteer_medical` finding was
produced for them. Added `SUPPLEMENTARY_MEDICAL_TERMS` and
`mergeSupplementaryMedical()`.

`rebuildGazetteers()` rebuilds the term lists from `MEDICAL_TERMS_DATA` and
discards earlier additions, so the merge is called from both the initial load and
`rebuildGazetteers()`.

### Fix C. Gazetteer context filter dropped diagnosis phrasing (`gazetteer.js`)
`analyzeTermContext` treated "I was diagnosed with diabetes" as a safe mention and
filtered the term out, because it only recognised "I am", "I have" and "my".
Added rule 2a: `diagnosed with/as`, `diagnosis of`, `suffering from` and
`treated for` immediately before a medical term count as personal attribution.

### Verified against the real pipeline

| Prompt | Result |
|---|---|
| I have hypertension and take maintenance medication | Low (anchor path) |
| I was diagnosed with diabetes / cancer / hypertension | Low |
| My salary is 45000 and I can barely cover my loan | Low |
| I am researching diabetes because I was diagnosed with it. | Low (attribution overrides exclusion) |
| Maria is researching cancer for her thesis paper. | Low (name only, no escalation) |
| Can you explain the symptoms of diabetes for my assignment? | No Detected Risk |
| Imagine if someone named Carlo had hypertension | No Detected Risk |
| Cancer commonly affects older adults | No Detected Risk |
| Contact me at maria.santos@gmail.com or 0917 555 1234 | Moderate, 1 `contact_information` unit, base 5 |

### Not verified / known gaps

- **Name + medical to Moderate** ("My name is Carlo and I have hypertension.")
  returned Low in the Node sandbox because PATH C (NER) did not detect "Carlo" there.
  Check this in the browser, where PATH C runs normally.
- **PATH C false positives seen in the sandbox:** "What", "Diabetes" and
  "Senior Analyst" were tagged as `nlp_person_name`. These come from PATH C and are
  unrelated to this change. They may differ in the browser.
- **Org + job title + department grouping** was not exercised end to end for the same
  reason; the grouping logic itself is covered by the email + phone case.
- The gazetteer filter already drops many research/educational phrasings before
  Rule 2 runs, so the Rule 2 exclusion filter is only reached when the term survives
  that filter (for example the "I am researching diabetes because I was diagnosed" case).
- `trust-worker.js` uses `worker-data-bundle.js` for its term data. The worker is
  currently disabled in `worker-bridge.js`; if it is re-enabled, the supplementary
  medical terms need to be added to that bundle too.

### Fix D. Sentence-initial "My name is X" was not detected (`linguistic-detector.js`)
Found while investigating why "My name is Carlo and I have hypertension." stayed at
Low instead of Moderate. The PATH C trigger pattern
`/\bmy\s+name\s+is\s+([A-Z]...)/g` was case-sensitive, so it matched "...my name is
Carlo" mid-sentence but not "My name is Carlo" at the start. The path normalizer
capitalises the first character of the prompt, so any prompt that began with the
phrase missed the name. With no name there was no scored entity, so Rule 2 raised
nothing beyond the anchor path (Low). The "my name is" and "call me" trigger words
now accept an upper-case first letter; the captured name stays Title Case only.

This replaces the earlier note that the Node sandbox "did not run PATH C normally".
That was a real detection gap, not a sandbox artifact.

Verified: "My name is Carlo and I have hypertension." now returns Moderate
(`nlp_person_name` + `trigger_health`, Rule 2 raises Low to Moderate). The same prompt
with "researching ... for my thesis" is suppressed by the exclusion filter and stays Low.

Still open: a bare first name after "I am" ("I am Carlo and ...") is not detected,
because the normalizer rewrites it to "I am. Carlo". Left alone on purpose, since
widening the "I am X" pattern would flag phrases such as "I am Filipino".
