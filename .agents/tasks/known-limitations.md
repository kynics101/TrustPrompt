# Path C — known limitations (recorded by decision, not bugs to fix next)

1. **Confidence is not used by the risk engine.** The detector sets `confidence` ('high' for exact dictionary hits, 'medium' for fuzzy)
   internally, but it is not on the finding that reaches `scanner.js`; `computeRiskScore` scores by patternId only
   (`BASE_SCORES`, one "organizational affiliation" unit for organization + job title + employer). A hard affiliation gate was
   rejected (it would remove 15 of 23 spurious organizations but lose 17 of 60 true ones).
2. **"@mail.brand.org" splitting by the normalizer.** `normalizePath_C` splits an address into "@mail. Brand. Org", so a brand written as a
   subdomain/label after the first dot is no longer in the same token as the "@". Rule (a) of Group 13 handles the first label and the
   local part only. The normalizer was deliberately not changed.
3. **"guide"-type ambiguity.** A dictionary job title that is also an ordinary noun ("guide", "monitor", "scanner") is reported after a
   structural cue even when the sentence is not about a person ("the guide, Ms. Navarro asked for it"; "Use it as a school scanner").
4. **C-036** (accepted earlier): known limitation of the name rules.
5. **Hannah Bank** (a person whose surname is an organization head word) is dropped; rule deferred. If revived, the possessive is not a cue.
6. **Hyphenated modifiers**: Compromise already tags most hyphenated words as nouns, so adjectives such as "on-site", "self-employed",
   "world-class" before a job head are accepted as part of the title (pre-existing).
7. **"store" before a job head** is tagged Verb in isolation, so "store owner" is not extended (C-055 "sari-sari store owner" stays "owner").
8. **Lowercase ordinary-word brands (N1).** A lowercase single-word organization with no affiliation cue is dropped only if Compromise's own
   lexicon lists it as a verb/adjective-class word ("target", "wise", "slack"). "an apple", "a shell collection", "a work visa" are therefore
   reported as organizations again (C-071, C-153): no general signal separates them from "my gcash account" without an English word list.
9. **"use ... as a <cleaner>"** still yields a job when the head is a plausible person's job ("designed as a hospital cleaner"); only the
   verb-of-use exclusion (Group 15 a) removes the clear cases.
