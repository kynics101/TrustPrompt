# Group 3b report

Status: nothing committed. Working tree has the modified linguistic-detector.js plus new test and result files.
Compare outputs: `.agents/tasks/cmp-g3-to-g3b.md` (Group 3 -> 3b), `.agents/tasks/cmp-g1-to-g3b.md` (Group 1 re-run -> 3b).

## Summary
- No regressions against Group 1, Group 6 or Group 3. Group 3 suite and Compromise pin test pass.
- R8 dropped 2 of 140 findable frames, so it is kept unrestricted.
- Month rule bug fixed: it never fired for May and March.
- All 14 unambiguous Filipino prefixes are now stripped.

## 1. R8 name-protection test (test-group3b-r8.js)
14 fictional two-word names whose words are both ordinary words (Hazel Grace, Faith Hope, Joy Summers, Hunter Rose,
Taylor Baker, Ruby Rain, Summer Dawn, Amber Wood, Violet Stone, Heather Bell, Ivy Fields, Dean Hill, Grant Wells,
Rose Miller) x 6 frames (3 uncued, 3 cued) x sentence/lower/Title = 252 frames. Compared with a copy of the detector
with R8 disabled.

| | Name reported |
|---|---|
| Without R8 | 140 of 252 |
| With R8 | 138 of 252 |
| Lost because of R8 | 2 (Faith Hope, Ruby Rain; Title Case, uncued) |

All cued frames and all sentence-case frames survived. 112 frames are unfindable in both builds (lowercase, and Title Case
"to/with" frames: existing extractor limit), so R8 protection there is untestable, not proven.
Decision: 2 of 140 is not more than a handful, R8 left unrestricted.

## 2. Compromise pinning (test-compromise-pin.js)
Compromise is vendored (lib/compromise.min.js, v14.12.0, fetched by download-compromise.js from a pinned URL). It is not in
package.json or the lock file, so nothing can be pinned there. The pin is a test: SHA-256 of the vendored file, the version
string, and the tag behaviours R1-R8 depend on. Passes on 14.12.0.
It found a real bug: lowercase "may" is Verb/Modal and "march" is a noun (no Month tag), so the month rule never fired for
them and "from May" was kept as a name. The rule now uses its own name set. My earlier "date uses rejected 18/18" in the
Group 3 report was weaker than it looked, because those frames never reached the extractor.

## 3. Filipino prefixes and leading prepositions (test-group3b-prefixes.js)
Always stripped: Aling, Aleng, Mang, Manong, Manang, Kapitan, Ate, Kuya, Tita, Tito, Lola, Lolo, Ninong, Ninang.
Stripped only when Compromise does not tag the word as a Person: Don, Dona, Ka, Kap.
Leading preposition ("Per", "Via"): stripped when at least two tokens remain ("Per Andersson" is kept).
A span that is only a prefix is re-bounded onto the Title Case tokens that follow (up to two) instead of being dropped.

| | Previous build | New build |
|---|---|---|
| 14 unambiguous prefixes, prefix kept inside finding | 4-10 of 10 | 0 of 10 |
| 14 unambiguous prefixes, exact "First Last" | 0-8 of 10 | 10 of 10 |
| "Per/Via + First Last" | prefix kept | stripped, exact name |
| Month names, name uses kept | 18/18 | 18/18 |
| Month names, date uses rejected | 16/18 | 18/18 |

Names equal to these words: Don Aldridge, Dona Whitfield, Don Carlos Reyes, Per Andersson stay whole (3/3 frames).
Cost: "Ka Dalisay", "Kap Lumbao", "Ate Villacorta" now report only the surname.
Don/Dona used purely as honorifics stay attached (by design). Ka/Kap stayed attached in 4 and 2 of 10 frames.

Test set conflict: C-103 expects "Mang Tonyo" (new build gives "Tonyo"), while C-021 expects "Nena Pascual" without "Aling"
and C-105 expects "Benigno Salonga" without "Kapitan". The expectations are inconsistent with each other.

Trailing-noun case ("Maria Santos Branch"): not implemented. "Branch Coordinator" is a job title the job pass misses, so an
evidence-based rule has nothing to work with. Proposed rule: trim a trailing token with a common-word tag and no Person tag
when it is immediately followed by a Title Case dictionary job title and at least two tokens remain. Not tested on templates.
Risk: a real surname that is a common word followed by a title ("Maria Hope Director"). Alternative (preferred): fix the job
pass so it finds "Branch Coordinator".

## 4. Diff check
Diff since the Group 3 commit: linguistic-detector.js only, 50 insertions, 3 deletions (the 3 lines replaced on purpose).
Line endings consistent (CRLF in the working copy, LF in git). The one early scripted edit is already inside your Group 3
commit as ordinary code; the script was inline and is not saved in the repo. All 3b edits used the Edit tool.

Added beyond the approved plan, in linguistic-detector.js:
- R8 (kept provisionally)
- sign-off cue for the heading guard; exact-capitalization occurrence filter
- quantifier backstop list (many, most, here...) in the indefinite-pronoun list
- verb-tag fallback on the word's own tags, and the subject-use check
- dictionary-title lookahead in the title strip
- R7 generalized to fragments of any length, plus exact-duplicate removal
- month set also contains August, March, Jun
- 3b: bare-prefix re-bounding, preposition strip, unambiguous/ambiguous prefix sets

## 5. Header notes
Added to the header: surname-as-leading-title, Title Case-only prompts (names not found at all, 0 of 16 before and after
Group 3), R6's dependence on Compromise, R8's cost, the month-name limit. R8 and 3b are described there too.

## compare-runs.js output, Group 3 -> 3b (unedited)

```
## compare-runs: after-group3.json  ->  after-group3b.json

### 1. Clean-row counts
| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |
|---|---|---|---|---|---|---|---|
| ALL | 161 | 84 | 84 | 57/104 | 57/104 | 30/57 | 30/57 |
| dev C-001..110 + 133,152,153,154,160 | 115 | 53 | 53 | 35/73 | 35/73 | 21/42 | 21/42 |
| hidden (C-111..161 minus the 5) | 46 | 31 | 31 | 22/31 | 22/31 | 9/15 | 9/15 |

### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)
| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |
|---|---|---|---|---|---|---|---|---|---|
| ALL | 161 | 84 | 84 | 79 | 80 | 49/104 | 50/104 | 9 | 7 |
| dev | 115 | 53 | 53 | 50 | 51 | 29/73 | 30/73 | 6 | 4 |
| hidden | 46 | 31 | 31 | 29 | 29 | 20/31 | 20/31 | 3 | 3 |

Findings the lenient matcher hides (after run; person names listed, other types counted):
- C-030: "Maria Santos Branch" (expected: "Maria Santos")
- C-103: "Tonyo" (expected: "Mang Tonyo")
other types hidden: {"nlp_job_title":5}

### 2. Total nlp_* findings by type
| type | before | after | delta |
|---|---|---|---|
| nlp_person_name | 112 | 112 | 0 |
| nlp_job_title | 80 | 80 | 0 |
| nlp_organization | 92 | 92 | 0 |
| TOTAL | 284 | 284 | 0 |

### 4. Rows whose findings changed
| id | split | shouldFlag | status before -> after | added | removed |
| C-021 | dev | yes | strict-clean -> strict-clean | person_name:"Nena Pascual" | person_name:"Aling Nena Pascual" |
| C-092 | dev | yes | strict-clean -> strict-clean | person_name:"Elena Cruz" | person_name:"Per Elena Cruz" |
| C-103 | dev | yes | strict-clean -> strict-clean | person_name:"Tonyo" | person_name:"Mang Tonyo" |
| C-105 | dev | yes | missing -> missing | person_name:"Benigno Salonga" | person_name:"Kapitan Benigno Salonga" |

### 5. Regressions (strict-clean before, not strict-clean after)
none
```

Against the Group 1 re-run: strict clean 66 -> 84, no regressions.
Dev vs hidden: 3b changes no clean-row counts in either set; exact-span clean moved 50 -> 51 in dev, 29 -> 29 in hidden.
Remaining spurious person findings: 28, unchanged from the Group 3 report (3b only changed the text of 4 findings).
Group 3 suite: same numbers as before, except "Month names: name uses kept" is 12 of 18 (was 13): the "from May" frame is now
rejected on purpose per your rule.
Speed: not comparable in this run. Short prompt 1,852 ms, long 21 s, with two heavy jobs running at once. Previous clean
measurement: about 920 ms and about 26 s. Not re-measured on an idle machine.

## Risks and uncertainty
- Measured: R8 loss count, prefix counts, month counts, compare tables, passing pin and Group 3 suites.
- Not measured: the trailing-noun rule (proposal only); speed on an idle machine.
- Residual cost: a real given name that is Ka, Kap or Ate loses that word.
- Test set: prefix expectations in C-021, C-103, C-105 are inconsistent.
