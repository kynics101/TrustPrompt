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
