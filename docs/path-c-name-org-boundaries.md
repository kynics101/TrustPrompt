# Path C: person-name and organization boundary fixes

Scope: `linguistic-detector.js` (Path C). Concern: names and organizations are missed, truncated,
split, or over-detected from titles, street names and ordinary words.

Trigger sample (test-set row C-097):

> message from rodel aquino of pldt says the technician will come tomorrow morning, so please
> remind me to be home and to prepare the valid id they asked for

Before: no findings. After: `person_name: rodel aquino`, `organization: PLDT`.

## Root causes

1. **Lowercase names had no extraction path.** Every name pass keys on Title Case. The only
   lowercase path was the self-introduction one ("my name is ..."). A name typed in lowercase after
   "message from", "ask", "thank you" and similar produced no person finding, even when both words
   are in `terms-names.js` / `terms-names-extra.js`.
2. **Two organization cue filters disagreed.** `isAmbiguousSingleWordOrg` (runs first) accepted
   only employment verbs in the same sentence. `hasOrgAffiliationCue` (Group 13, runs later)
   already knew `<Name> of/from <Org>`, `<job title> at/from <Org>` and the lowercase-chat form
   (its own comment cites this exact sample). The early filter dropped `PLDT` before the later
   one could keep it.
3. **A dropped organization left its word free to become a person.** The directive (`from X`) and
   subject-position passes judge only the word's shape, so `Meralco` in `Ramon Dizon of Meralco`
   was reported as a person.
4. **Truncation at a place word.** `Manila Bulletin Publishing Corporation` was reduced to the
   dictionary hit `Manila Bulletin`, because the full METHOD 4 run starts with a place word and is
   discarded before any corporate-suffix logic. A name such as `Ma. Cristina de la cruz` was cut at
   the first lowercase word for the same reason (Title-Case-only passes).

## Changes (all in `linguistic-detector.js`)

| Change | Where | Effect |
|---|---|---|
| `extractLowercaseCuedNames()` | after `extractLowercaseSelfIntros`, called in `scan()` | Reports lowercase / mixed-case name runs that have a person cue **and** dictionary evidence on every word. Extends (replaces) a shorter person finding it contains, which fixes `Ma. Cristina` to `Ma. Cristina de la cruz`. |
| `isAmbiguousSingleWordOrg` now also calls `hasOrgAffiliationCue` | organization filter | One shared definition of an affiliation frame. |
| `dropPersonsThatAreDictionaryOrganizations()` | end of `scan()` | A single word that is a dictionary organization, is not a known personal name and has no person cue (honorific, "my name is", job title) is not a person. |
| `extendOrganizationsToCorporateSuffix()` | before the Group 13 filter | Extends an organization finding over up to three Title-Case words that lead to a Title-Case corporate suffix (Corporation, Inc, Corp, Ltd, Holdings, Group...). |

`extractLowercaseCuedNames` rules:

- Cue (any one): a person-directed verb or `to/for/with/from/by` right before the run (reuses
  `G_B_BEFORE_CUE_RE`, `PERSON_DIRECTED_BEFORE_RE`, `G_B_PREP_CUE_RE`); `thank you`; `my/our/his/her
  <up to 5 words> is/was`; a speech/work verb right after; `of/from/at <known organization>` right
  after; or an existing person finding that the run extends.
- Evidence: first word is a known given name, every following word a known name word, surname
  particles (`de la`, `dela`...) allowed between, 2 to 4 name words, none an ordinary non-name word.
- Not reported: run followed by a street / campus / organization head word (`rosa santos street`),
  run inside an e-mail address or path, run made only of Title-Case words.

## Verification

Harness: `run-path-c-baseline.js` over `PathC_TestSet_for_Kiro.md` (161 rows), before vs after,
compared with `compare-runs.js`. "Before" is the same detector with the four changes switched off.

| Measure | Before | After |
|---|---|---|
| Strict-clean rows | 117 / 161 | 119 / 161 |
| Overall TP / FP / FN (exact match) | 251 / 51 / 27 | 254 / 50 / 24 |
| Organization recall (exact) | 94.2% | 97.1% |
| Hidden set (C-111..161) | unchanged | unchanged |

Row-level diff: 3 rows changed, none worse. C-097 (the sample) fixed, C-133 recovered `concentrix`,
C-093 lost a duplicate organization finding.

False-positive stress: 25 hand-written lowercase negatives (street names, ordinary words, "ask for
grace period", "thanks mark for the update", "i will go to mark street ...") plus the 113 prompts in
`tests/fixtures/dataset.js`, run through both versions. One output changed: `the technician from
meralco will come tomorrow` now reports `Meralco` as an organization (correct). No new person
findings.

Not run: the Jest suites. They fail at load, with or without this change, because
`tests/setup/trustprompt-env.js` does not load the `terms-*.js` data files and `gazetteer.js`
dereferences `MEDICAL_TERMS_DATA` in a debug log line.

## Remaining limitations

- **A lowercase name needs two words, both in the dictionaries.** A single lowercase name
  (`ask for ana at the front desk`) is not reported, and neither is a name whose words are missing
  from `terms-names*.js`.
- **Given name must come first.** `aquino rodel` (surname first) is not reported as a person.
- **Cue required.** `rodel aquino` with no cue before or after, in lowercase, is not reported.
- **Single-word organizations still need an affiliation frame.** `email from meralco about my bill`
  yields no organization (the person misreport is gone, but nothing replaces it). `call globe about
  my plan` and `send a message to jollibee` are likewise not reported.
- **Title-Case ambiguity is unchanged.** `Grace Park is a nice place to visit` is still reported as
  a person; fictional pairs such as `Maria Clara and Ibarra` are still reported.
- **Corporate-suffix extension is narrow.** It needs a Title-Case suffix from the fixed list and at
  most three Title-Case words before it. `Publishing` alone, or an all-lowercase organization, is
  not extended.
- **Dictionary-organization person filter is single-word only.** A two-word dictionary organization
  mis-tagged as a person is handled by the existing Group 1 suppression, not by this change.
- **Cue lists are provisional.** They reuse existing vetted constants but have only been measured
  on the 161-row set, the dataset and the hand-written negatives above. Tune them against a larger
  lowercase / Taglish sample before relying on them.
