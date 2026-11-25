# Data sources for the name dictionary (terms-names-extra.js)

Only aggregate frequency tables of names are used. No individual record, no full name, no account or contact data.
Built by `scripts/build-names-extra.js`; the header of `terms-names-extra.js` states the thresholds and counts.

## 1. US Census Bureau, "Frequently Occurring Surnames from the 2010 Census"
- Page: https://www.census.gov/topics/population/genealogy/data/2010_surnames.html (fetched 2026-11-08)
- File used: https://www2.census.gov/topics/genealogy/2010surnames/names.zip -> `Names_2010Census.csv`
  (162,253 surnames that occur 100 or more times; columns: name, rank, count, prop100k, cum_prop100k, pctwhite, pctblack, pctapi, pctaian, pct2prace, pcthispanic).
  Documentation: https://www2.census.gov/topics/genealogy/2010surnames/surnames.pdf
- Licence text: **the page contains no licence, terms-of-use or copyright statement.** The only data statement on it is: "the data do not in any way
  identify any specific individuals." The Census Bureau open-data page (https://www.census.gov/about/policies/open-gov/open-data.html) says: "The U.S. Census
  Bureau is committed to open government by sharing its public data as open data." and gives no reuse terms either. The legal basis for reuse is
  therefore an inference, not a quoted licence: works of the US federal government are not subject to US copyright (17 U.S.C. 105). Confirm with
  the data owner / your institution before publication if a quoted licence is required.
- Use: single-word surnames with count >= 1000 only, after the filters in the build script.

## 2. US Social Security Administration, "Baby Names from Social Security Card Applications - National Data"  (NOT YET USED)
- Dataset record: https://catalog.data.gov/dataset/baby-names-from-social-security-card-applications-national-data
  Licence field of that record (verbatim): "https://creativecommons.org/publicdomain/zero/1.0/" (CC0 1.0); accessRights: "public"; publisher: Social Security Administration.
- Download: https://www.ssa.gov/oact/babynames/names.zip (yobYYYY.txt: name, sex, count). Content: given-name counts per year; names with fewer than 5 occurrences are omitted by the publisher.
- Status: ssa.gov answered HTTP 403 "Access Denied" to scripted clients (curl and the fetch tool). No workaround was attempted. Download the zip in a browser, unzip it
  into an empty folder, and run `node scripts/build-names-extra.js --census <csv> --ssa <folder>`.

## 3. SCOWL (Spell Checker Oriented Word Lists), English word list  (BUILD-TIME FILTER ONLY, NOT SHIPPED)
- Project: http://wordlist.aspell.net/ ; source: https://github.com/en-wl/wordlist ; file used: `scowl-2020.12.07.zip`
  (https://sourceforge.net/projects/wordlist/files/SCOWL/2020.12.07/scowl-2020.12.07.zip) -> `final/english-words.{10..60}` and `final/american-words.{10..60}`
  (lower-case dictionary words, 77,008 distinct 3-20 letter words at size <= 60; proper names live in separate `*-proper-names.*` files that are not read).
- Licence text, quoted from the `Copyright` file inside the zip: "Copyright 2000-2018 by Kevin Atkinson. Permission to use, copy, modify, distribute and sell these word lists,
  the associated scripts, the output created from the scripts, and its documentation for any purpose is hereby granted without fee, provided that the above copyright notice appears in all copies
  and that both that copyright notice and this permission notice appear in supporting documentation. Kevin Atkinson makes no representations about the suitability of this array for any purpose.
  It is provided "as is" without express or implied warranty." (The same file lists third-party notes: Moby words are public domain; the notice for the UK Advanced Cryptics Dictionary applies to the
  larger generated lists; COCA-derived data is not redistributable. None of the word list is copied into the extension: it is only used to decide which Census surnames to drop.)
- Use: `scripts/build-names-extra.js --wordlist <final dir> --wordlist-max 60`. A surname that is in the list is removed from terms-names-extra.js (1,391 of 22,362 candidates).

## 4. Authored Filipino name vocabulary  (AUTHORED, NOT DOWNLOADED)
- File: `terms-names-ph-proposed.js` (170 given names and 285 surnames of nicknames, Muslim / Mindanao, indigenous and regional, Chinese-Filipino and Spanish-catalogue names).
- Written by hand from general knowledge of Filipino naming practice; vocabulary only (single words); no individual, record, document or third-party list was copied. It is a separate source in the
  build (`--ph`) and passes the same word filters; it has no frequency floor. After the filters 88 given names and 78 surnames are new (56 + 196 were already in terms-names.js; 11 dropped as ordinary words).

## 5. Place, dish, festival, disease and religion word lists  (AUTHORED, NOT DOWNLOADED)
- Where: constants `G_PLACES_PH`, `G_PLACES_WORLD`, `G_FOOD_EVENT`, `G_DISEASE`, `G_RELIGION` in `linguistic-detector.js` (Phase 2 type vetoes). Closed lists of single names; no individual, record or third-party file was copied.
- Places: Philippine cities, municipalities, Metro Manila districts and regions written from general knowledge (the official PSGC, https://psa.gov.ph/classification/psgc, was **not downloaded**, so municipalities missing from the list are not vetoed; the 82 provinces already in `ph-address-db.js` are used as well), the sovereign states, continents, major world cities, US states and Canadian / Australian states written from general knowledge (ISO 3166-1 country names).
- Dishes and festivals: Filipino dishes, festivals and religious holidays, plus the seven weekdays.
- Diseases: common conditions and disease-name suffixes (-itis, -osis, -emia, -pathy, -tension).
- Religion words: names of religions and denominations. Nationality and language words reuse `G_LANG_NAT`.
- Use: a person finding that is entirely one of these words is dropped unless a person cue stands with it (see "PHASE 2" in the detector).

## 6. Public figures  (AUTHORED, NOT DOWNLOADED)
- Where: constant `G4_PUBLIC` in `linguistic-detector.js` (Phase 4 rule `public`).
- Content: full names of Filipino national heroes and presidents (the proclaimed heroes of the National Historical Commission of the Philippines and the list of presidents of the Philippines, written from general knowledge; neither list was downloaded, so the list is incomplete) and about 50 historical figures of world history (scientists, rulers, writers, artists, civil-rights leaders; all deceased). Public record only: no living private person, no contact data.
- Use: a person finding that equals one of these names is not reported unless the sentence is about the user's own circle ("my name is ...", "my classmate ... named ...").


## 7. Own-credential organizations  (AUTHORED, NOT DOWNLOADED; `OB_CRED_ORGS` in linguistic-detector.js)

An organization is normally reported only when a sentence says something about it. One narrow exception: an organization whose name appears
together with the user's own credential for that organization. The pair says which account the credential opens, which is what an attacker needs.

| Category | Organizations | Why it qualifies |
|---|---|---|
| payment networks | Visa, Mastercard, American Express (Amex), JCB | a card number plus the network it belongs to identifies the payment instrument |
| developer and cloud platforms | GitHub, GitLab, Bitbucket, AWS, Azure, Google Cloud | a token or key plus the platform tells where the key can be used |
| health insurers | PhilHealth and private HMOs (Maxicare, Intellicare, Medicard, PhilCare, Pacific Cross, Avega, Cocolife, Insular Health Care, Caritas Health Shield, ValuCare, EastWest Healthcare) | a membership or ID number plus the insurer links a person to a health record |

Rule (a): "my / our `<Org>` `<credential word>`" (card, number, ID, account, token, key, password, membership, record, workflow), and the prompt
contains a credential-like value (a run of 9 or more digits, a card-style group, an ID with dashes, or an API-key / token pattern such as `sk-`,
`ghp_`, `AKIA`). Rule (b), health insurers only: "`<Insurer>` number / ID / membership / transcription" with such a value, with or without "my".
The organization is reported at Low. Nothing is reported without the value, so "how does GitHub pricing work" and "my Visa application" stay silent.

Excluded on purpose: SSS, GSIS, Pag-IBIG, BIR and other employment-contribution or tax agencies. Their numbers are government identifiers that
Path A already handles; naming the agency adds no information and would flag every ordinary question about contributions or taxes.
Recorded in `.agents/tasks/known-limitations.md`.
