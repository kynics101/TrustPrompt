# Patterns Removed from TrustPrompt

## Summary

Removed the following patterns from `patterns.js`:
- ✗ `phone_intl` - International phone numbers
- ✗ `ph_id_gsis` - GSIS (Government Service Insurance System)

## Patterns KEPT (Active)

The following Philippine identification and credential patterns remain active:

### Government IDs & Credentials
- ✓ `ph_id_philid` - National ID
- ✓ `ph_id_umid` - UMID (Unified Multi-Purpose ID)
- ✓ `ph_id_passport` - Philippine Passport
- ✓ `ph_id_prc` - PRC (Professional Regulation Commission)
- ✓ `ph_id_postal` - Postal ID
- ✓ `ph_id_pwd` - PWD ID (Persons with Disability)
- ✓ `ph_id_senior_citizen` - Digital National Senior Citizen ID

### Social Security & Insurance
- ✓ `ph_id_sss` - SSS (Social Security System)
- ✓ `ph_id_philhealth` - PhilHealth (Health Insurance)

### Other IDs
- ✓ `ph_id_drivers_license` - Driver's License (LTO)

## Other Patterns Still Active

- ✓ API keys (OpenAI, GitHub, AWS, etc.)
- ✓ Credentials (passwords, JWT tokens, etc.)
- ✓ Email addresses
- ✓ Philippine mobile numbers
- ✓ IP addresses (IPv4, IPv6)
- ✓ MAC addresses
- ✓ Source code blocks
- And many more credential/PII patterns

## What Was Removed

### `phone_intl` (International Phone Numbers)
- Pattern: `/^\+?[1-9]\d{6,8}$/gm`
- Reason: User only wants Philippine mobile number detection
- Impact: International phone numbers no longer flagged

### `ph_id_gsis` (GSIS)
- Pattern: `/\b\d{4}[_\-\s]?\d{7}[_\-\s]?\d\b/g`
- Reason: Per user request to remove GSIS detection
- Impact: Government employee GSIS numbers no longer flagged
- Note: SSS and PhilHealth (similar social security IDs) remain active

## Files Modified

- `patterns.js` - Removed 2 pattern definitions

## Testing

After these changes:
1. "09098340056" (mobile number) - ✓ DETECTED as `ph_mobile`
2. "000-000-000-0123456789" (PhilID) - ✓ DETECTED as `ph_id_philid`
3. "+1-555-123-4567" (international phone) - ✗ NOT detected (removed)
4. International GSIS-like patterns - ✗ NOT detected (removed)
