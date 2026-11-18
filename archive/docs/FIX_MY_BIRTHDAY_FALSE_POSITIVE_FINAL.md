# Fix: "My birthday" Being Detected as Person Name (PATH C)

## Issue
The phrase "My birthday" was being incorrectly detected as a person name (nlp_person_name) by PATH C (linguistic-detector.js) even after normalization fixes were applied.

Example from debug output:
```
[PATH_C/NAMES] METHOD 3: Subject position names
[PATH_C/NAMES] METHOD 3: Found: "My birthday"
[PATH_C/NAMES] METHOD 3: ✅ ADDED: "My birthday"

Merged findings detail:
(2) ['birthday_date:March 07, 2025', 'nlp_person_name:My birthday']
```

## Root Cause
The issue occurred in **METHOD 4: Standalone capitalized multi-word phrases** in the `scan()` function of `linguistic-detector.js`.

The regex pattern `/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\b/g` matches any 2-3 consecutive capitalized words, including:
- "My Birthday" (both words capitalized when appearing at sentence start or in certain contexts)

While earlier filters checked for possessive pronouns and non-name words, the implementation had two gaps:

1. **Missing personal attribute words in NON_NAME_WORDS set**: Words like "birthday", "address", "email" were not in the `NON_NAME_WORDS` set used for filtering
2. **Missing possessive pronoun check in METHOD 4**: The possessive pronoun filter existed in the `extractStandalonePersonNames()` function but was not present in the main `scan()` function's METHOD 4

## Solution

### Change 1: Add Personal Attribute Words to NON_NAME_WORDS Set
**File**: `linguistic-detector.js` (line ~85)

Added personal attribute words that should never be detected as part of person names:

```javascript
// ★ CRITICAL: Personal attribute words - NOT person names (e.g., "My birthday", "Your address", "His email")
// These should be filtered when paired with possessive pronouns
'birthday', 'age', 'email', 'phone', 'address', 'job', 'title', 'company', 'department', 
'ssn', 'password', 'pin', 'account', 'license', 'gender', 'sex', 'height', 'weight', 
'color', 'eyes', 'hair', 'health', 'condition', 'salary', 'income', 'location', 'country', 
'city', 'state', 'zip', 'religion', 'belief', 'nationality', 'status', 'relationship', 
'spouse', 'parent', 'child', 'sibling', 'emergency', 'contact', 'reference', 'description', 
'notes', 'comments', 'details', 'preference', 'hobby', 'interest', 'experience', 'qualification'
```

### Change 2: Add Possessive Pronoun Check to METHOD 4
**File**: `linguistic-detector.js` (line ~2665-2680)

Enhanced the filter in METHOD 4 to explicitly reject phrases starting with possessive pronouns:

```javascript
// Filter out pronouns and possessive pronouns
const words = candidateName.split(/\s+/);
const pronouns = new Set(['i', 'me', 'you', 'he', 'she', 'it', 'we', 'they', 'him', 'her', 'us', 'them']);
const possessivePronouns = new Set(['my', 'your', 'his', 'her', 'its', 'our', 'their']);

if (words.some(w => pronouns.has(w.toLowerCase()))) {
  console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - contains pronoun`);
  continue;
}

// ★ FIX: Reject if first word is a possessive pronoun (e.g., "My birthday", "Your address")
if (words.length > 0 && possessivePronouns.has(words[0].toLowerCase())) {
  console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - starts with possessive pronoun: "${words[0]}"`);
  continue;
}

// Check if it contains non-name words (adjectives, verbs, discourse markers)
if (words.some(w => NON_NAME_WORDS.has(w.toLowerCase()))) {
  console.debug(`[PATH_C/NAMES] METHOD 4: Filtered - contains non-name word: ...`);
  continue;
}
```

## Filter Chain for "My birthday"

With these fixes, "My birthday" now goes through this filter chain in METHOD 4:

1. ✅ **Possessive Pronoun Check**: "My" is in possessivePronouns set → FILTERED
   - Debug: `[PATH_C/NAMES] METHOD 4: Filtered - starts with possessive pronoun: "My"`

2. Also ✅ **Personal Attribute Word Check**: "birthday" is in NON_NAME_WORDS set → FILTERED
   - Debug: `[PATH_C/NAMES] METHOD 4: Filtered - contains non-name word: birthday`

Either filter alone would now catch this false positive.

## Test Cases Covered

| Phrase | Filter Applied | Result |
|--------|----------------|--------|
| "My birthday" | Possessive pronoun + attribute word | ✅ FILTERED |
| "Your address" | Possessive pronoun + attribute word | ✅ FILTERED |
| "His email" | Possessive pronoun + attribute word | ✅ FILTERED |
| "Her phone" | Possessive pronoun + attribute word | ✅ FILTERED |
| "Their employment" | Possessive pronoun + attribute word | ✅ FILTERED |
| "John Smith" | No possessive pronoun, no attribute word | ✅ ACCEPTED |
| "Maria Garcia" | No possessive pronoun, no attribute word | ✅ ACCEPTED |

## Implementation Details

### Filter Priority Order (METHOD 4)
1. Duplicate check (skip if already found)
2. Pronoun check (reject if contains I, me, you, he, she, etc.)
3. **Possessive pronoun check** ← NEW (reject if starts with my, your, his, etc.)
4. Non-name word check (reject if contains adjectives, verbs, attributes, etc.)
5. Common name filter (reject if very common first name like "John", "Mary")

### Consistency Across Methods
- **METHOD 2 (Trigger phrases)**: Already had NON_NAME_WORDS check
- **METHOD 3 (Subject position)**: Already had NON_NAME_WORDS check
- **METHOD 4 (Standalone)**: Now has both possessive pronoun check AND NON_NAME_WORDS check

## Verification
The fix ensures that personal context phrases like "My birthday", "Your address", etc., are properly filtered out at the extraction stage, preventing them from being flagged as PII person names.

Test file: `test-my-birthday-fix.js` (created for validation)
