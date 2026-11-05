# TrustPrompt Path C: debugging brief

Read this whole file before doing anything. Do not edit any file until you
have told me your plan for the current step and I have said OK.

## 1. The project
TrustPrompt is a Chromium MV3 extension that screens prompts typed into
ChatGPT/Claude for sensitive personal data. It has three detection paths:
- Path A: regex + validators (cards, emails, phones, IDs, API keys, code).
- Path B: gazetteer + fuzzy matching (medical, financial, nationality, religion,
  PH address, eye color, etc.). tags: gazetteer_*, trigger_*, ph_address.
- Path C (OUR SCOPE): names, job titles, organizations (departments fold into
  organizations). Tags: nlp_person_name, nlp_job_title, nlp_organization.
  Code: linguistic-detector.js, scan() at about line 2716. Data:
  terms-organizations.js (~22k orgs) and terms-occupations.js (~18k titles),
  both inline arrays. Do NOT open these two files whole. Search them with
  grep/rg or a small script.
A risk engine scores findings afterwards (name, job, org each low risk). Paths
A and B must not change. scanner.js drops any name/org/job finding from Path B,
so these fixes belong only in linguistic-detector.js (plus data-only additions
to the terms files).

## 2. The problem
The Path C detector produces many false positives and false negatives on real
prompts. A user can type anything, so the goal is to fix the LOGIC IN GENERAL.
The 161 rows in the test set (PathC_TestSet_for_Kiro.md) and the 38 benign
phrases are only SAMPLES of failures, not the target. A change that makes the
161 rows pass but would fail on new input is a failed change.

Known failure families (symptoms, not a to-do list of strings):
- Organizations tagged as person names (the org/person decision is made only
  in METHOD 4; METHOD 2/3/4.5 have no guards; the classifier defaults to
  "name" for ambiguous 2-3 word Title Case phrases).
- Organizations missed (dictionary-only detection, plus a place-word filter
  that drops real orgs).
- Names with extra words attached (verbs, titles), titles tagged as names
  (Mr/Ms/Dr), names cut at 3 words or at non-ASCII letters (Pena with enye).
- Job titles missed (the Compromise context gate drops exact dictionary hits
  that lack a trigger phrase; some titles missing), and ordinary words tagged
  as job titles through fuzzy matching (edit distance 1).
- Ordinary phrases tagged as organizations (single-keyword substring match in
  PASS 3).
- Speed: scans must approach 700 ms (currently seconds).

## 3. State so far
Done and verified identical or improved against baseline.json:
- Group 0: speed pre-check in fuzzyFind (identical results, 5.4x faster).
- Group 2: structural org pass (suffixes, head words), place-filter exception,
  trailing-period boundary.
- Group 2b: hyphen/comma/apostrophe handling, of/on/for gate on head-first
  words.
- Group 2c: leading-modifier extension, institution endings (Hospital,
  University, College, School, Bank, Clinic, Institute, Academy, Medical
  Center), "St." prefixes. [check the latest report for its status]
Remaining, in this order: Group 5, Group 6, Group 1, Group 3, Group 4, Group 7
(definitions in .agents/tasks/path-c-investigation-report.md, Part D:
G5 = D9/D10, G6 = D11, G1 = D1/D2, G3 = D6, G4 = D7/D8, G7 = D12/D13).
Then a last speed step (candidate-index filter for the org fuzzy pass).
Known limitations to document, not fix: lowercase/all-caps names without a
trigger, trade words inside names, departments without their own tag.
Open GROUP decisions, do not "fix" them in code: whether general questions
that mention a real org or profession (e.g. "What does a pharmacist do...")
should be flagged, and how negation is handled. Rows marked "policy" in the
test set depend on this.

## 4. Rules for every change
1. Fix the general rule, never the example. State, in one or two sentences,
   the rule you are implementing and what OTHER kinds of input it will change,
   including any new false positives it could create.
2. Prefer structural rules (sentence position, capitalization, part of speech
   from Compromise, suffix/head-word patterns, edit-distance bounds) over word
   lists. Use a word list only when no rule works, and keep it small and
   generic (language-level, not copied from test rows).
3. Never put test-row text, test names or test organizations in code, word
   lists, comments or tests. Never special-case an ID.
4. Only edit linguistic-detector.js, and data-only additions to the terms
   files. Anything else needs my approval first. After each step show
   git diff --stat.
5. One group per session. Stop after each group and wait for my OK.
6. Be honest about uncertainty. If something is only a hypothesis, say so. If
   you find an earlier statement of yours was wrong, say so.

## 5. How to test, so we know it generalizes
- Run-and-compare script: keep run-path-c-baseline.js and add compare-runs.js
  (two result files in, tables out). Never write the comparison by hand.
  Report: strict clean rows (nothing missing AND nothing spurious) as the
  main number, loose clean (nothing missing) separately; the list of
  should-not-flag rows with findings, before and after; every row whose status
  changed, with findings added/removed; total nlp_* findings by type.
- Dev / hidden split: rows C-001..C-110 are for development. C-111..C-161 are
  a hidden set. Report them separately and do not tune to them.
- Benign set: ordinary prompts with no personal data (recipes, homework, code,
  planning, general questions, headings, product/course/event names, sentence
  case AND lowercase AND Title Case). Any nlp_* finding there is a false
  positive. Report that count for every group. I will supply an unseen set;
  until then build your own, and label it as yours.
- Template (metamorphic) tests: for each rule you change, write fictional
  sentence templates and substitute many different fictional entities into
  them. Also vary case (sentence, lower, Title), position (start, middle, end,
  after a comma), punctuation (comma before Inc, hyphens, apostrophes, titles),
  and neighboring words. The rule should behave the same for all
  substitutions. Report any inconsistency.
- Regression: any row that was clean and is no longer clean blocks the change
  until explained.
- Speed: report scan time for one short and one long prompt after each group.

## 6. Efficiency rules (tokens)
- Do not read entire large files. Use rg/grep and read only the lines you
  need (the detector is about 3,500 lines; the terms files are huge).
- Do not paste long outputs back to me. Write them to files in .agents/tasks/
  and give me a summary with file names.
- Do not re-investigate what the investigation report already answers.

## 7. Report format after each group
1. What rule you implemented (plain words) and what it generalizes to.
2. compare-runs.js output, pasted unedited.
3. Benign-set and template-test results.
4. Dev vs hidden results.
5. git diff --stat.
6. Risks, new false positives you can foresee, and anything uncertain.
Then stop and wait.

## 8. Current task
Check the status of Group 2c in the last report. If it is incomplete or has
unverified claims, tell me what is missing. If it is complete, summarize it and
propose the plan for Group 5 (not code yet). Group 5 loosens the job-title
context gate, so tell me exactly how you will stop that from flooding ordinary
sentences with job-title findings, and how you will test it.
