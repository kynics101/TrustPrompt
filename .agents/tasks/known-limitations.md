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
7. **Modifier before a job head** is now judged together with the head (Group 15 b), so "store owner" extends and C-055 "sari-sari store owner" is fixed (was: "store" is tagged Verb in isolation). Modifiers that stay verb/adjective in context (drive, dance, watch, light, paint, ride, shop, park, guard, train) still do not extend.
8. **Lowercase ordinary-word brands (N1).** A lowercase single-word organization with no affiliation cue is dropped only if Compromise's own
   lexicon lists it as a verb/adjective-class word ("target", "wise", "slack"). "an apple", "a shell collection", "a work visa" are therefore
   reported as organizations again (C-071, C-153): no general signal separates them from "my gcash account" without an English word list.
9. **"use ... as a <cleaner>"** still yields a job when the head is a plausible person's job ("designed as a hospital cleaner"); only the
   verb-of-use exclusion (Group 15 a) removes the clear cases.
10. **A verb before a job title can be swallowed into the span.** In the 248 generated sentences "<subject> will <verb> <title> training/interviews/
    meetings", 26 produce a finding that contains the verb ("plant manager", "stock supervisor", "stock clerk", and "cook" reported as a separate
    title). Most of these verbs are also real title modifiers or titles (plant manager, stock clerk), so they cannot be told apart without
    sentence-level parsing. Group 15 (b) did not change this count (26 before and after).
11. **Group 17 (cause E) plurals** ("welders", "call center agents", "secretaries") are matched when the singular is a dictionary title, but only
    the cues that do not depend on the plural's context apply: possessive triggers (my/our/...), the "multi-word title" cue, the "directly
    followed by a name" cues and the "<Name>, the <title>" appositive are switched off for a plural ("our partners", "Doctors Without Borders",
    "Associates Law Offices" are not jobs). A plural is therefore found after "hired as", "work as", "are the", "<title> at <Org>" and in
    coordination, not in "Mentored three junior auditors, including <Name>" (C-155 "auditors" stays missed).
12. **Group 17 (cause D) titles added by category** (terms-occupations.js, OCCUPATIONS_EXTRA, 304 entries not previously in the dictionary):
    multi-word additions are accepted like other multi-word titles, except from a generic sentence (question / definition / comparison) or a
    Title Case heading (Group 17b: a run of 3+ Title Case words with no anchored person name, or a heading ending such as List / Guide /
    Schedule / Checklist / Menu / Plan / Report / Directory right after the title; in a heading the capitalisation cues are off too).
    They still produce findings in non-generic prose that is not about a person: C-122 "medical technologist" (job-post paragraph, an
    accepted policy row). `student`, `volunteer` and other status
    roles are deliberately not in the dictionary (C-059 is expected to be corrected in the test set).
13. **"the city engineer"**: a multi-word title preceded by "the" is not accepted by the multi-word cue (bare definite description), so
    C-124 "city engineer" stays missed although "City Engineer" is now in the dictionary.
14. After the housekeeping move, `worker-data-bundle.js` is built from `terms-occupations.js`: run `node scripts/build-worker-bundle.js` after
    this change so the extension's worker sees the 304 additions (not run here).
15. **Group 7 stage 1, brand + descriptor** ("<known brand> City / Mall / Malls <Place>"): a brand is any one-word dictionary entry or the first word of 2+ entries, so an ordinary word that begins two entries is accepted. "Sun City Arizona" is reported as an organization (Sun begins 2 dictionary entries); no tag or list separates it from "SM City Tarlac".
16. **Group 7 stage 1, religious head + unknown place**: Archdiocese / Diocese / Prelature / Vicariate / Eparchy "of" a capitalised word that is not a common word is accepted even when the word is not a known place, so "Archdiocese of Heaven" (a joke title) is reported. Province / Municipality require a place known to the PH address data, so places missing from it (Calbayog, Borongan, Novaliches) are missed.
17. **Group 7 stage 1, lowercase heads**: the institution head must be capitalised, so lowercase chat such as "archdiocese of tarlac" is not detected (a lowercase "province of laguna" must stay a place, and no signal separates the two cases for the religious heads).
18. **Group 7 stage 2 (Group / Agency / Unit / Division / Section)**: a head is taken only after capitalised words that include a sector word (small language-level list, G7_SECTOR_WORDS) or, for Group / Agency, a known place or an affiliation cue. Missed by design: a name-only "Group" / "Agency" with no cue, a head followed by another capitalised word ("Finance Division Head", "Medical Group Practice"), a head followed by "of the <lower-case noun>", a name Compromise guesses to be an adjective ("Fairhaven Group", "Eastgate Agency" with a cue are missed), a bare Title Case heading line of 4+ words. "Sun City"-style ordinary uses in running Title Case prose ("our Finance Section") are reported.
19. **Pre-existing, not changed by Group 7**: in a Title Case heading, a dictionary/fuzzy pass already reports phrases such as "Ironbridge Health Group Policies and Procedures" and "Cardiology Unit Policies and Procedures" as one organization (about half of the 256 heading probes in test-group7-orgs-s2.js, the same before and after Stage 2).
20. **Cause B (METHOD 4 name evidence)**: an unanchored 2-3 word Title Case phrase (no dictionary name, no Compromise person tag, no cue, no initials) is no longer reported as a person. Cost, measured on 103 invented names (69 unanchored): lost when the only context is a comma or sentence position (68 of 69 plain-sentence frame), when the prompt is just the name (Title-Case-only frame), and when the only cue is a bare preposition ("send the notes to <Name>", G_B_PREP_CUES = false). The gate is off when the name dictionary is not loaded.
21. **Preposition + Title Case phrase is still reported as a person by the directive-context pass (METHOD 4.5)**, outside Cause B: "bought it from <Phrase>", "a gift for <Phrase>", "goes well with <Phrase>" give a person finding for ordinary Title Case phrases (about 96% of 330 phrases per frame), before and after Cause B.
