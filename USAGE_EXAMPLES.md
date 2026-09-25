# NLP Context Analysis - Usage Examples

## Quick Reference

This document shows real examples of how the new NLP context analysis layer distinguishes between safe and risky uses of sensitive terms.

---

## Category: Nationality/Religion

### Safe Examples (✅ NOT flagged)

```
USER: "What is the Filipino term for beautiful?"
→ Context: Question about language
→ Analysis: "what" question marker detected
→ Result: ✅ ALLOWED
```

```
USER: "I want to learn the Filipino language this year"
→ Context: Educational intent
→ Analysis: "language" + "learn" educational markers
→ Result: ✅ ALLOWED
```

```
USER: "Have you tried Filipino food at that new restaurant?"
→ Context: Food/cuisine reference
→ Analysis: "food" + "restaurant" cuisine markers
→ Result: ✅ ALLOWED
```

```
USER: "The Filipino culture has rich traditions and history"
→ Context: Cultural/historical discussion
→ Analysis: "culture", "history" education markers
→ Result: ✅ ALLOWED
```

### Risky Examples (❌ FLAGGED)

```
USER: "I'm Filipino and proud of my heritage"
→ Context: Personal identification
→ Analysis: "I'm" personal disclosure marker
→ Result: ❌ FLAGGED as PII
→ Risk: Direct nationality disclosure
```

```
USER: "A friend of mine is Filipino, I want to understand her language and culture"
→ Context: Personal relationship + relationship intent
→ Analysis: "friend is" + "understand" relationship markers
→ Result: ❌ FLAGGED as PII
→ Risk: Third-party personal information + intimate intent
```

```
USER: "My girlfriend is Filipino and I want to learn her traditions"
→ Context: Personal relationship
→ Analysis: "my girlfriend" possessive marker
→ Result: ❌ FLAGGED as PII
→ Risk: Personal relationship disclosure
```

```
USER: "As a Filipino woman, I face unique challenges in tech"
→ Context: Self-identification with vulnerability
→ Analysis: "as a Filipino" + "face challenges" self-identity markers
→ Result: ❌ FLAGGED as PII
→ Risk: Demographic self-disclosure
```

---

## Category: Medical Conditions

### Safe Examples (✅ NOT flagged)

```
USER: "What is diabetes and how is it diagnosed?"
→ Context: Medical information-seeking
→ Analysis: "what" question marker, no personal context
→ Result: ✅ ALLOWED
```

```
USER: "Can you explain the symptoms of depression?"
→ Context: Educational health query
→ Analysis: "explain" educational marker, information-seeking
→ Result: ✅ ALLOWED
```

### Risky Examples (❌ FLAGGED)

```
USER: "I have diabetes and need to monitor my blood sugar"
→ Context: Personal medical disclosure
→ Analysis: "I have" + category=medical personal marker
→ Result: ❌ FLAGGED as PII
→ Risk: Personal medical condition disclosure
```

```
USER: "My mother has asthma and I'm worried about her health"
→ Context: Personal family medical information
→ Analysis: "my mother" possessive + medical condition
→ Result: ❌ FLAGGED as PII
→ Risk: Family member health information
```

---

## Category: Financial Information

### Safe Examples (✅ NOT flagged)

```
USER: "How do I apply for a mortgage?"
→ Context: Financial process inquiry
→ Analysis: No personal markers, generic financial question
→ Result: ✅ ALLOWED
```

### Risky Examples (❌ FLAGGED)

```
USER: "Please create an email that includes the contact details 09098340056"
→ Context: Contact information in sensitive context
→ Analysis: "create email" + "contact details" request markers
→ Result: ❌ FLAGGED as PII
→ Risk: Actual contact information sharing intent
```

```
USER: "My account number is 1234567890 and I need to update it"
→ Context: Personal account information
→ Analysis: "my account" possessive financial marker
→ Result: ❌ FLAGGED as PII
→ Risk: Financial account disclosure
```

---

## Category: Location/Address

### Safe Examples (✅ NOT flagged)

```
USER: "Can you tell me about visiting Manila?"
→ Context: Tourism/travel information
→ Analysis: No personal markers, general location inquiry
→ Result: ✅ ALLOWED
```

### Risky Examples (❌ FLAGGED)

```
USER: "My home address is 123 Main Street, Manila"
→ Context: Direct address disclosure
→ Analysis: "my home address" possessive + location
→ Result: ❌ FLAGGED as PII
→ Risk: Direct home address disclosure
```

---

## Edge Cases

### Case 1: Number in Different Contexts

```
Context A: "Turn 09098340056 grams into tons"
→ Context Analysis: "grams" + "tons" measurement markers
→ Result: ✅ ALLOWED (mathematical context)

Context B: "Call me at 09098340056"
→ Context Analysis: "call me" contact marker
→ Result: ❌ FLAGGED (phone number context)
```

### Case 2: Same Term, Different Context

```
Context A: "What does Filipino mean?"
→ Result: ✅ ALLOWED (informational)

Context B: "I'm Filipino"
→ Result: ❌ FLAGGED (personal identification)

Context C: "Filipino restaurant"
→ Result: ✅ ALLOWED (generic reference)
```

### Case 3: Implied Personal Information

```
Input: "A friend of mine needs help understanding Filipino customs"
→ Context Analysis: "friend" + no personal marker for pain
→ Result: ✅ ALLOWED

BUT

Input: "A friend of mine is Filipino, I want to understand her language"
→ Context Analysis: "friend is Filipino" + "understand" relationship marker
→ Result: ❌ FLAGGED (relationship + intimacy intent)
```

---

## Decision Tree

```
┌─ Term Detected (e.g., "Filipino", "diabetes", phone number)
│
├─ Check RISKY Patterns (immediate flag if found)
│  ├─ Personal pronouns: "I'm X", "I am X" → FLAG
│  ├─ Possession: "My X", "Our X" → FLAG
│  ├─ Medical possession: "I have [condition]" → FLAG
│  ├─ Contact intent: "create email with X" → FLAG
│  ├─ Relationship: "friend is X" + "understand" → FLAG
│  └─ Self-identify: "As a X, I face challenges" → FLAG
│
├─ Check SAFE Patterns (allow if found)
│  ├─ Questions: "What is...", "How..." → ALLOW
│  ├─ Education: "language", "term", "grammar" → ALLOW
│  ├─ Food/culture: "cuisine", "restaurant", "history" → ALLOW
│  ├─ Measurement: "grams", "tons", "convert" → ALLOW
│  └─ Information-seeking: "explain", "describe" → ALLOW
│
└─ No Patterns Matched → ALLOW (default to safe)
```

---

## Implementation Details

**File**: `gazetteer.js` (lines ~730-870)
**Function**: `analyzeTermContext(fullText, matchIndex, matchLength, category)`
**Parameters**:
- `fullText` - complete text being scanned
- `matchIndex` - character position where term was found
- `matchLength` - length of matched term
- `category` - "nationality_religion", "medical", "financial", etc.

**Returns**:
- `true` - context is risky, flag as PII
- `false` - context is safe, don't flag

---

## Performance Notes

- Context analysis runs **only when a term is detected** (on match, not on entire text)
- Uses fast regex patterns (no heavy NLP library dependency)
- Negligible performance overhead
- Fully backwards compatible

---

## Configuration

No configuration needed. The feature is automatically integrated and works with all gazetteer term categories:
- `nationality_religion`
- `medical`
- `financial`
- All others in the GAZETTEER object

To see what's being filtered:
- Check browser console logs
- Look for `[TrustPrompt/PATH_B/B1] Filtered safe context:` messages
