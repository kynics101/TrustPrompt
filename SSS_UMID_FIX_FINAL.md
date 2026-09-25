# SSS/UMID Pattern Fix - Final Solution

## Problem

UMID "4310-5002134-6" was being detected as both **UMID** and **SSS** when it should only be detected as **UMID**.

## Root Cause

The SSS regex `/\d{2}-\d{7}-\d/g` was matching a 10-digit substring within the 12-digit UMID:
- UMID: "4310-5002134-6" (12 digits total: 4310-5002134-6)
- SSS match: "10-5002134-6" (extracted from middle of UMID)

## Solution

Changed the SSS regex to use **negative lookahead/lookbehind** to ensure it only matches exactly 10 digits:

### Before
```javascript
regex: /\d{2}-\d{7}-\d/g
```

### After
```javascript
regex: /(?<!\d)\d{2}-\d{7}-\d(?!\d)/g
```

This means:
- `(?<!\d)` - Assert NO digit before the first 2 digits (negative lookbehind)
- `\d{2}-\d{7}-\d` - Match exactly the SSS format (10 digits)
- `(?!\d)` - Assert NO digit after the last digit (negative lookahead)

## Test Cases

### UMID: "4310-5002134-6" ✓
- Regex matches: ✓ (12 digits: 4-7-1 format)
- Validator: ✓ (system code 4310, valid UMID)
- **Result: DETECTED AS UMID ONLY**

### SSS: "31-0500213-4" ✓
- Regex matches: ✓ (10 digits: 2-7-1 format, not preceded/followed by digits)
- Validator: ✓ (branch code 31, valid SSS)
- **Result: DETECTED AS SSS ONLY**

### No More Collision
- "4310-5002134-6" → UMID only ✓
- "10-5002134-6" → Does NOT match SSS regex (preceded by "43" from UMID)
- Negative lookahead prevents false matches within larger ID numbers

## Files Modified

- `patterns.js` - Updated SSS regex and added validator

## Key Changes

1. **SSS Regex**: Added negative lookahead/lookbehind to prevent substring matches
2. **SSS Validator**: Wired `structuralValidatePHID_SSS` to validate branch codes and check digits

## Validation Results

✓ Valid UMID "4310-5002134-6" → **UMID** (no SSS false positive)
✓ Valid SSS "31-0500213-4" → **SSS** (correct format)
✓ No double-detection or collisions
