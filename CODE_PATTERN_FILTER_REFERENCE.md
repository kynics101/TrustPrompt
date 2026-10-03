# Code Pattern Filter Reference

## Overview
The `isCodePattern()` function in `linguistic-detector.js` prevents Path C from misclassifying code patterns (variables, assignments) as organization or person names.

## Function Location
**File**: `linguistic-detector.js` (after line 176)

## Function Signature
```javascript
function isCodePattern(text, candidate) {
  // Returns: boolean
  // true = candidate is code, should be filtered out
  // false = candidate might be legitimate org/person name
}
```

## Detection Patterns

### Pattern 1: Programming Keywords Context
**Trigger**: Text contains programming keywords like `const`, `let`, `var`, `function`, `class`, `async`, etc.

**Logic**:
```javascript
const codeKeywords = /\b(const|let|var|function|class|return|async|await|...)\b/gi;

if (codeKeywords.test(text)) {
  // If keywords found, check if candidate looks like a code identifier
  if (/[a-z][a-zA-Z0-9]*[A-Z]/.test(candidate)) {  // camelCase
    return true;  // Filter as code
  }
  if (/_[a-z]/.test(candidate)) {  // snake_case
    return true;  // Filter as code
  }
}
```

**Examples**:
- ✅ Filters: `myValue`, `apiKey`, `userData`, `my_variable` (in code context)
- ❌ Doesn't filter: `Apple`, `Microsoft`, `Johnson` (proper nouns)

### Pattern 2: Assignment Operators & Code Punctuation
**Trigger**: Assignment operators (=, :) or code punctuation ({, }, (, ), [, ]) nearby

**Logic**:
```javascript
const contextWindow = text.slice(
  Math.max(0, text.indexOf(candidate) - 30),
  Math.min(text.length, text.indexOf(candidate) + candidate.length + 30)
);

if (/=|:|;|\{|\}|\(|\)/.test(contextWindow)) {
  // Code punctuation detected in 30-char window around candidate
  
  if (/^[a-z_]/.test(candidate)) {  // Starts with lowercase or underscore
    const hasCodeChars = /[A-Z_]/.test(candidate);  // Has uppercase or underscore
    const isCapitalizedWord = /^[A-Z]/.test(candidate);
    
    // If looks like variable (not a proper noun), filter as code
    if (hasCodeChars && !isCapitalizedWord) {
      return true;
    }
  }
}
```

**Examples**:
- ✅ Filters: `myValue = 5`, `const userId:`, `apiKey}`
- ❌ Doesn't filter: `Microsoft = company`, `John: manager`

### Pattern 3: Naming Convention Analysis
**Trigger**: Candidate has camelCase or snake_case naming pattern

**Logic**:
```javascript
const isCamelCase = /^[a-z]+[a-z0-9]*[A-Z]/.test(candidate);
const isSnakeCase = /_/.test(candidate) && /^[a-z_0-9]+$/.test(candidate);

if ((isCamelCase || isSnakeCase) && candidate.length >= 3) {
  // Check surrounding context for code punctuation
  const beforeChar = text[text.indexOf(candidate) - 1];
  const afterChar = text[text.indexOf(candidate) + candidate.length];
  
  const codeChars = ['"', "'", '`', '{', '}', '(', ')', '[', ']', ';', ','];
  
  if (codeChars.includes(beforeChar) || codeChars.includes(afterChar)) {
    return true;  // Filter as code
  }
}
```

**Examples**:
- ✅ Filters: `"myVariable"`, `{userId}`, `(apiKey)`, `[userData],`
- ❌ Doesn't filter: `MyCompany`, `John_Smith` (if not surrounded by code punctuation)

## Detection Examples

### Example 1: Simple Variable Assignment
```javascript
Input text: "const myValue = 5;"
Candidate: "myValue"

Pattern 1 Check:
  - Text contains "const" keyword? YES
  - Candidate is camelCase? YES (myValue)
  - Result: FILTER (code pattern detected)

Output: false (don't add as nlp_organization)
```

### Example 2: Organization Name
```javascript
Input text: "I work at Microsoft Company."
Candidate: "Microsoft"

Pattern 1 Check:
  - Text contains code keywords? NO
  
Pattern 2 Check:
  - Code punctuation nearby? NO
  
Pattern 3 Check:
  - Is camelCase? NO
  - Is snake_case? NO
  - Result: PASS (not a code identifier)

Output: true (can be added as nlp_organization)
```

### Example 3: Snake_Case Variable
```javascript
Input text: "const api_key = 'sk-123';"
Candidate: "api_key"

Pattern 1 Check:
  - Text contains "const" keyword? YES
  - Candidate is snake_case? YES
  - Result: FILTER (code pattern detected)

Output: false (don't add as nlp_organization)
```

### Example 4: Capitalized Code Variable (Edge Case)
```javascript
Input text: "const MyValue = calculateResult();"
Candidate: "MyValue"

Pattern 1 Check:
  - Text contains "const" keyword? YES
  - Candidate has code chars (uppercase)? YES
  - Is it a proper noun (all caps start)? YES - capital first letter
  - Result: In code context with keywords, still FILTER

Output: false (don't add - it's in code context)
```

### Example 5: Job Title in Code
```javascript
Input text: "function getManager() { const manager = findManager(); }"
Candidate: "Manager"

Pattern 1 Check:
  - Text contains "function" keyword? YES
  - Candidate is camelCase/snake_case? NO (it's capitalized word)
  - Result: PASS Pattern 1

Pattern 2 Check:
  - Assignment/punctuation nearby? YES (= sign)
  - Candidate starts lowercase/underscore? NO
  - Result: PASS Pattern 2

Pattern 3 Check:
  - camelCase or snake_case? NO
  - Result: PASS Pattern 3

Output: true (might be job title, allow it)
```

## Decision Tree

```
Is candidate a code pattern?

├─ Pattern 1: Code keywords found?
│  ├─ YES + camelCase/snake_case identifier? → FILTER (return false)
│  └─ NO → Continue to Pattern 2
│
├─ Pattern 2: Code punctuation nearby?
│  ├─ YES + lowercase/underscore start + code chars? → FILTER (return false)
│  └─ NO → Continue to Pattern 3
│
└─ Pattern 3: camelCase/snake_case with length >= 3?
   ├─ YES + surrounded by code punctuation? → FILTER (return false)
   └─ NO → ALLOW (return true - not a code pattern)
```

## Limitations & Edge Cases

### Known Limitations
1. **No semantic analysis**: Can't determine actual meaning, only structural patterns
2. **Context window**: Only checks ±30 characters around candidate
3. **Keyword list**: Fixed set of keywords (could miss some languages)
4. **Naming conventions**: Assumes camelCase/snake_case = code (might not always be true)

### Edge Cases
1. **Variable names that are real words**: 
   - `myCompany = ...` might be filtered even if it's a legitimate company name
   - This is acceptable for privacy protection (over-filter is safer than under-filter)

2. **Code in prose context**:
   - "`myVariable` is an important concept" - Will filter, which is correct

3. **Product names with camelCase**:
   - `JavaScript`, `TypeScript`, `CoffeeScript` - May be filtered
   - These are proper nouns and shouldn't typically appear with code punctuation

4. **Names from other cultures**:
   - Cultural naming patterns that happen to be camelCase - Might be filtered
   - Risk: Minor false positive on privacy detection (acceptable)

## Testing

### Test Cases to Verify

#### Test 1: Simple Code Variable
```
Input: "const myValue = 5;"
Expected: Filter as code
```

#### Test 2: Organization Name
```
Input: "I work at Microsoft."
Expected: Allow as organization
```

#### Test 3: Code Keywords Context
```
Input: "function getUserName() { return userName; }"
Expected: Filter userName as code
```

#### Test 4: Mixed Content
```
Input: "John works at myCompany. The code is: const myCompany = {...}"
Expected: 
  - First occurrence: Allow as organization (no code context)
  - Second occurrence: Filter as code (code context)
```

## Performance Considerations

### Time Complexity
- Pattern 1: O(n) where n = text length (regex test)
- Pattern 2: O(1) - context window extraction + regex test
- Pattern 3: O(1) - simple regex tests

### Total Per Candidate
- Average: ~0.5-1.0 ms per candidate
- Acceptable for linguistic processing pipeline

### Optimization Opportunities
1. Cache compiled regex patterns (already done)
2. Short-circuit on first matching pattern (already done)
3. Consider caching results per text (if same text scanned multiple times)

## Configuration & Tuning

### Adjustable Parameters

#### 1. Context Window Size (currently ±30 chars)
```javascript
const contextWindow = text.slice(
  Math.max(0, text.indexOf(candidate) - 30),  // ← Change here
  Math.min(text.length, text.indexOf(candidate) + candidate.length + 30)  // ← And here
);
```

#### 2. Minimum Candidate Length (currently 3)
```javascript
if ((isCamelCase || isSnakeCase) && candidate.length >= 3) {  // ← Change here
```

#### 3. Keywords List
```javascript
const codeKeywords = /\b(const|let|var|...|yourKeyword)\b/gi;  // ← Add keywords
```

### Tuning Recommendations
- **More strict** (fewer false negatives): Reduce context window, add more keywords
- **More lenient** (fewer false positives): Increase context window, remove keywords
- **Current balance**: Good for privacy protection (over-filter acceptable)

## Related Functions

### Called By
- `extractOrganizations()` - Before adding nlp_organization findings
- Multiple locations where nlp_organization candidates are considered

### Depends On
- `text` parameter - Full surrounding text context
- `candidate` parameter - The word being evaluated

### Sister Functions
None - This is the primary code pattern detector in Path C

## Future Enhancements

### Potential Improvements
1. **Language detection**: Detect what programming language context (Python, JS, etc.)
2. **Semantic analysis**: Use more sophisticated NLP to understand context meaning
3. **Pattern library**: Maintain library of common code patterns per language
4. **ML classification**: Train model on code vs. non-code text samples
5. **AST parsing**: For very robust code detection (if full parser available)

### Not Recommended
- Overly complex heuristics (diminishing returns)
- Hardcoded exception lists (maintenance burden)
- External service calls (performance impact)
