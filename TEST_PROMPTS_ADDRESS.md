# Street-Level Address Detection — Dev Test Set

Feature: `feature/street-level-address-detection`
Entity: `ph_address` (Moderate, base 5). A city/municipality name alone is NOT an address.

One case per line. Expected = whether exactly one validated `ph_address` entity fires.

## Positive (expect exactly ONE ph_address)
I live at 123 Rizal St., Manila
Blk 5 Lot 12 Mabini Ave., Antipolo
Address: 45 Del Pilar Street
Brgy. San Roque, Cainta
Unit 4B, Sunrise Tower
I live at 45 Mabini St., Brgy. San Roque, Cainta and the rent is overdue.

## Multi-part address = ONE entity (no aggregation)
# The full "house/street, barangay, city" chain must be a SINGLE ph_address,
# and its street/barangay tokens must NOT also appear as nlp_person_name /
# nlp_organization. Expect exactly one ph_address and zero name/org fragments
# like "Mabini St" or "San Roque".
Please proofread this letter to my landlord. I live at 45 Mabini St., Brgy. San Roque, Cainta and the rent is overdue.

## Negative (expect NO ph_address)
I'm a public school teacher in Antipolo handling Grade 6 with 48 students and my salary grade is 11.
How do I get to Rizal Avenue?
Manila is the capital
5 Main Street is a song title
Antipolo salary grade 11

## Edge (documented behavior)
rizal street                      -> no match (street name + type, no number, no cue = Low reliability, dropped)
123 rizal st                      -> match (number + street-type, case-insensitive, no punctuation)
Blk. 5 Lot 12                     -> match (unit/block marker anchor)
Address spread across lines       -> match if number + street-type remain adjacent across the newline

## Notes
- The "song title" / directions suppression for a NUMBERED street (e.g. "5 Main Street is a song title")
  is applied by the main-thread context filter (shouldFilterByContext), matching the existing
  phone-number context-check style. The worker path does not run that filter (same limitation as
  the existing phone/email context filtering), so a bare numbered street with a title cue may still
  surface there. "How do I get to Rizal Avenue?" is suppressed in BOTH paths because it has no
  number/cue and therefore never matches the regex.
