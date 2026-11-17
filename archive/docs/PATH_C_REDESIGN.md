# PATH C Redesign: Context-Driven Name/Organization/Job Detection

## Current Problem

The current approach tries to:
1. Match ANY capitalized word/phrase
2. Filter out false positives using word lists

**Why this fails:**
- Too many capitalized words in normal text (sentence starts, acronyms, proper adjectives)
- Word lists are incomplete and will always miss edge cases
- Context is ignored - "apple pie" vs "Apple Inc" both get matched initially then filtered

## Better Approach: Context-First Detection

Instead of "match everything then filter", use: **"match only with strong contextual signals"**

### Core Principle

**A name/organization/job title is PII only when it appears with context that proves it's a name/org/job, not just any capitalized word.**

---

## PERSON NAMES - Detection Strategy

### Signal 1: Explicit Cues (HIGH CONFIDENCE)
These are 99% accurate when they appear:

```
Pattern: [CUE] [Name]
Examples:
  - "my name is Maria"
  - "i am John"
  - "call me Sarah"
  - "Mr. Smith said"
  - "Dr. Johnson works"
  - "dear Alex"
  
Implementation:
  - Cue: /(?:my name is|i am|i'm|call me|dear|hello|hi)/gi
  - Followed by: 1-2 capitalized words (not 3)
  - Stop at: punctuation, sentence end, next verb
```

### Signal 2: Subject-Predicate Construction (HIGH CONFIDENCE)
When a capitalized word appears as subject of a sentence with a descriptor:

```
Pattern: [Name] [VERB] [DESCRIPTOR]
Examples:
  - "Maria works in accounting"
  - "John is a software engineer"
  - "Sarah manages the team"
  
Implementation:
  - Capture: capitalized word before verb
  - Require: following verb from {is, works, manages, leads, heads, etc.}
  - Validation: must be followed by occupation/organization context
  - Stop: reject if descriptor is just an adjective (e.g., "John is good")
```

### Signal 3: Honorific Markers (HIGH CONFIDENCE)
Titles that precede names are strong signals:

```
Pattern: [HONORIFIC] [Name]
Examples:
  - "Ms. padua"
  - "Dr. Smith"
  - "Mr. Johnson"
  - "Prof. Garcia"
  
Implementation:
  - Match: /(?:Mr|Ms|Mrs|Dr|Prof|Rev|Engr)\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi
  - Extract: everything after honorific (1-2 words)
```

### Signal 4: Quote/Reference Context (MEDIUM CONFIDENCE)
When a name appears in attribution or quoted speech:

```
Pattern: [Quote] [ATTRIBUTION] [Name]
Examples:
  - "I said John"
  - "according to Maria"
  - "contact Sarah about"
  - "ask Alice for"
  
Implementation:
  - Match: common verbs + prepositions + capitalized words
  - Verbs: {said, told, asked, according, contact, call, email, message}
  - Prepositions: {about, for, with, to}
  - Extract: 1-2 capitalized words after preposition
```

### Signal 5: Multiple Mentions (LOW CONFIDENCE)
Same capitalized name appears multiple times in short text:

```
Pattern: [Name] ... [Name]
Examples:
  - "Maria told me. Maria works in IT."
  
Implementation:
  - Track capitalized words appearing 2+ times
  - Only if NOT a common word (from common word list)
  - Score increases with frequency
  - Threshold: appears 2+ times
```

---

## ORGANIZATION NAMES - Detection Strategy

### Signal 1: Employment Context (HIGH CONFIDENCE)
Words that indicate employment relationship:

```
Pattern: [EMPLOYMENT_VERB] [PREP] [ORG]
Examples:
  - "works at Google"
  - "employed by Microsoft"
  - "works in Accenture"
  - "is part of IBM"
  
Implementation:
  - Verbs: {works, work, employed, employ, works_at, works_for, working}
  - Preps: {at, by, for, in, with}
  - Extract: capitalized words after prep (stop at punctuation/sentence end)
  - Validation: must be 3+ characters (filters out "in it", "at it")
```

### Signal 2: Organization Descriptors (HIGH CONFIDENCE)
Words that identify something as an organization:

```
Pattern: [ORG_NAME] [ORG_MARKER]
Examples:
  - "Google Inc"
  - "Microsoft Corporation"
  - "University of Santo Tomas"
  - "Department of IT"
  
Implementation:
  - Markers: {Inc, Corp, Ltd, LLC, Company, University, Department, Division, Agency, Foundation}
  - Pattern: [Capitalized Words]+ [MARKER]
  - Extract: all capitalized words before marker
```

### Signal 3: Acronym Context (MEDIUM CONFIDENCE)
All-caps sequences in work/employment contexts:

```
Pattern: [CONTEXT] [ACRONYM]
Examples:
  - "works at IBM"
  - "head of OICT"
  - "part of NASA"
  
Implementation:
  - Context verbs: {at, for, in, of, with, part, head, member}
  - Acronym: 2-5 ALL CAPS letters
  - Whitelist check: against known acronyms
  - Fallback: allow if appears 2+ times in text
```

### Signal 4: Known Organizations (LOW CONFIDENCE)
Direct dictionary of major companies/organizations:

```
Pattern: [KNOWN_ORG]
Examples:
  - "Google"
  - "Microsoft"
  - "Stanford"
  
Implementation:
  - Only use for well-known organizations
  - Must be 5+ characters (avoid "Love", "Hope", etc.)
  - Require surrounding context validation
  - Check: is it in work/employment context?
```

---

## JOB TITLES - Detection Strategy

### Signal 1: Predicate Position (HIGH CONFIDENCE)
After "is a/an/the" with descriptive phrase:

```
Pattern: [Name] is a/an/the [TITLE_WORDS]
Examples:
  - "Maria is a software engineer"
  - "John is the head of IT"
  - "Sarah is an accountant"
  
Implementation:
  - Pattern: [Capitalized] is a/an/the [words]+
  - Extract: all words until: {at, in, for, of, with, by, and, or, .}
  - Validation: must be 2+ words OR match known job indicator
  - Known indicators: {manager, engineer, developer, analyst, director, coordinator, specialist}
```

### Signal 2: Role Descriptors (HIGH CONFIDENCE)
Explicit role words in context:

```
Pattern: [NAME] [ROLE_DESCRIPTOR]
Examples:
  - "as the manager of HR"
  - "serve as director"
  - "head of operations"
  - "chief information officer"
  
Implementation:
  - Descriptors: {manager of, head of, chief, director of, coordinator of, responsible for}
  - Extract: everything after descriptor until context end
  - Pattern: /(?:as the|serve as|head of|chief|director of|coordinator of)\s+([a-z\s]+?)(?:\s+(?:of|at|in)|\.|\,|$)/gi
```

### Signal 3: Role Indicators with Names (MEDIUM CONFIDENCE)
Names paired with role descriptions:

```
Pattern: [ROLE_INDICATOR] [NAME]
Examples:
  - "3 professors as my panelist"
  - "my advisor John"
  - "team lead Maria"
  
Implementation:
  - Indicators: {professor, manager, director, analyst, engineer, coordinator, supervisor, specialist, consultant}
  - Pattern: [INDICATOR_PLURAL] ... [CAPITALIZED_NAME]
  - Extract: the capitalized name
  - Context: must be close to indicator (same sentence)
```

---

## Implementation Strategy

### Phase 1: Rewrite Detection Functions
1. `extractPersonNames()` - Use 5 signals above
2. `extractOrganizations()` - Use 4 signals above  
3. `extractJobTitles()` - Use 3 signals above

Each returns array of `{text, confidence, signal_type, signal_details}`

### Phase 2: Scoring System
Instead of binary yes/no, use confidence scores:

```
HIGH_CONFIDENCE = 0.85-1.0  (Display immediately)
MEDIUM_CONFIDENCE = 0.60-0.84 (Flag for review)
LOW_CONFIDENCE = 0.40-0.59  (Log for analysis)
```

### Phase 3: No Word Lists for Filtering
Instead of "is it in a word list", ask:
1. **Does it have a strong context signal?** (HIGH)
2. **Does it appear multiple times?** (MEDIUM)
3. **Is it a known entity?** (LOW)

### Phase 4: Veto Only When Certain
Only reject if:
- It's in explicit NON-PII list (e.g., "I", "the", "hello")
- It's demonstrably NOT in employment/name context
- It's a clearly wrong classification (code variable in code context)

---

## Benefits of This Approach

| Issue | Old Approach | New Approach |
|-------|-------------|-------------|
| False positives on common words | Match then filter | Only match in context |
| Missing unique names | Dictionary-based | Context-based (works for any name) |
| "Hello this" false positive | Weak filters | No match - no context signal |
| "trust prompt sample" false positive | Weak filters | No match - not in employment context |
| Single-word names missed | Requires 2+ words | Context determines validity |
| Organizations missed | Weak classifier | Employment verbs are strong signal |

---

## Examples: Before vs After

### Example 1: "Kyleen works in Accenture"
**Before:** Name:"Kyleen Works In", Org: maybe "Accenture" (broken)
**After:** 
- Name: "Kyleen" (Signal 2: subject-predicate construction)
- Org: "Accenture" (Signal 1: employment context "works in")
- ✅ BOTH CORRECT

### Example 2: "Hello this is important"
**Before:** Name: "Hello This" (false positive)
**After:** 
- Name: None (Signal 1 cue "hello this" not in cue list, Signal 2 failed)
- ✅ CORRECT (no false positive)

### Example 3: "Maria"
**Before:** Missed (requires 2+ words)
**After:**
- Check Signal 5 (multiple mentions) + context
- Or if appears as "I met Maria" → Signal 4 (reference context)
- ✅ BETTER DETECTION

### Example 4: "I met Maria, she works at Google"
**Before:** Partial detection (may miss org)
**After:**
- Name: "Maria" (Signal 4: "met Maria")
- Org: "Google" (Signal 1: "works at Google")
- ✅ BOTH CAPTURED

---

## Questions for Implementation

1. Should we use NLP tags (POS, NER) from compromise.js as additional signals?
2. Should occupation words be checked against a job title list for validation?
3. What confidence threshold do we use for redaction vs review?
4. Should we track context across sentence boundaries (multi-sentence analysis)?
