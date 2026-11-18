# Phone Number Measurement Context Filter

## Problem

Phone numbers were being flagged as PII even when they appeared in non-PII contexts like unit conversions:

```
Input: "turn 09098340056 grams into tons"
Status: ❌ FLAGGED (false positive)
Problem: Number matches ph_mobile pattern → automatic flag
```

## Solution

Extended the `isMeasurementContext()` function in `scanner.js` to detect when phone-like numbers appear in measurement/conversion contexts and filter them out as safe.

## Implementation

### Modified Files

**scanner.js** - Two changes:

1. **Extended context detection** (lines ~1143-1183)
   - Added conversion action verbs: "convert", "turn", "transform", "change", "into", "to"
   - Expanded lookahead/lookbehind to ±100 characters
   - Added combined context analysis

2. **Extended pattern filtering** (lines ~1909-1912)
   - Now applies measurement context to both `phone_intl` AND `ph_mobile` patterns
   - Before: Only `phone_intl` checked measurement context
   - After: Both international and Philippine mobile numbers checked

### Code Changes

```javascript
// Before:
if (pattern.id === "phone_intl" && isMeasurementContext(raw, normalisedText, matchIndex)) {
  continue;
}

// After:
if ((pattern.id === "phone_intl" || pattern.id === "ph_mobile") && isMeasurementContext(raw, normalisedText, matchIndex)) {
  continue;
}
```

## How It Works

### Step 1: Detect Phone Number Pattern
Scanner finds a number matching `ph_mobile` regex: `/\b(?:\+63|0)9\d{2}[_\-\s]?\d{4}[_\-\s]?\d{3}\b/`

### Step 2: Extract Context
```
contextBefore = text from (number_position - 100 chars) to number_position
contextAfter  = text from number_position to (number_position + 100 chars)
```

### Step 3: Check for Measurement Markers
**Unit Keywords** (checked in context):
- Weight: grams, ounces, pounds, kg, lb, oz
- Volume: milliliters, liters, ml, gallons, cups
- Distance: meters, kilometers, miles, feet, cm, mm, km, mi
- Time: seconds, minutes, hours, days, years, ms, sec, min, hr
- Energy: watts, volts, amperes, hertz, Hz, MHz, GHz
- Temperature: celsius, fahrenheit, degrees, °C, °F
- Data: bytes, kilobytes, megabytes, gb, kb, mb
- Speed: rpm, mph, kph, m/s, km/h

**Conversion Actions** (checked in context):
- convert, turn, transform, change, translate, into, to

### Step 4: Decision
```
if (conversion action found AND unit found)
  → SAFE (don't flag)
else if (unit found after number)
  → SAFE (don't flag)
else
  → RISKY (flag as PII)
```

## Test Results

**12/12 tests passing** ✅

### Safe Contexts (Measurement - NOT flagged)
1. ✅ "turn 09098340056 grams into tons"
2. ✅ "convert 09098340056 kilograms into pounds"
3. ✅ "transform +639098340056 milliliters into liters"
4. ✅ "turn 09098340056 meters into kilometers"
5. ✅ "convert 09098340056 seconds to hours"
6. ✅ "convert 09098340056 celsius to fahrenheit"
7. ✅ "transform 09098340056 megabytes to gigabytes"

### Risky Contexts (Contact - FLAGGED)
8. ✅ "call me at 09098340056" → FLAGGED
9. ✅ "my number is 09098340056 please call back" → FLAGGED
10. ✅ "reach me at +639098340056 anytime" → FLAGGED
11. ✅ "text me at 09098340056" → FLAGGED
12. ✅ "here is my contact 09098340056 for tomorrow" → FLAGGED

## Examples

### Example 1: Now Filtered ✅
```
Input:  "turn 09098340056 grams into tons"
Scan:   Regex matches "09098340056" as ph_mobile
Check:  isMeasurementContext() → true
Result: FILTERED (not flagged) ✅
```

### Example 2: Still Caught ✅
```
Input:  "call me at 09098340056"
Scan:   Regex matches "09098340056" as ph_mobile
Check:  isMeasurementContext() → false (no units/conversion)
Result: FLAGGED as PII ✅
```

### Example 3: Complex Context ✅
```
Input:  "I need help converting 09098340056 meters to feet"
Scan:   Regex matches "09098340056" as ph_mobile
Check:  
  - Conversion action: "converting" ✓
  - Unit pattern: "meters", "feet" ✓
Result: FILTERED (not flagged) ✅
```

## Performance Impact

- **Minimal overhead**: Context analysis only runs when a phone number is detected
- **Fast regex matching**: Uses pre-compiled regex patterns
- **No additional dependencies**: Uses JavaScript regex engine only

## Backwards Compatibility

✅ **Fully backwards compatible**
- No API changes
- No breaking changes
- Only reduces false positives
- Previously flagged measurements are now allowed when appropriate
- Contact contexts are still caught

## Configuration

No configuration needed. Works automatically when:
1. A number matches `ph_mobile` or `phone_intl` pattern
2. The surrounding context is scanned for measurement markers

## Testing

Run the test suite:
```bash
node test-phone-measurement-context.js
```

Expected output:
```
================================================================================
RESULTS: 12 passed, 0 failed out of 12 tests
================================================================================
✅ ALL TESTS PASSED
```

## Files Modified

1. **scanner.js**
   - Enhanced `isMeasurementContext()` function (lines ~1143-1183)
   - Extended pattern filtering to include `ph_mobile` (lines ~1909-1912)

## Files Created

1. **test-phone-measurement-context.js** - Test suite with 12 test cases
2. **PHONE_MEASUREMENT_CONTEXT_FIX.md** - This documentation

## Related Features

- **Gazetteer NLP Context Analysis** - Similar approach for nationality/medical terms
- **Path A Regex Filtering** - Part of the multi-path PII detection architecture
- **TASK-4.7** - Original measurement context detection for phone_intl
