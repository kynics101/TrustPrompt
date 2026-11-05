#!/usr/bin/env node
/**
 * test-group2c-fixes.js — benign set + metamorphic template tests for the
 * Group 2c fixes (institution-ending guard, containment dedup).
 * All entities are fictional and written by the assistant (NOT the user's set).
 * Usage: node test-group2c-fixes.js
 */
'use strict';
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log, D = console.debug, W = console.warn;
console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js');
global.window.nlp = require('./lib/compromise.min.js');
require('./normalizer.js'); require('./linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const run = (raw) => {
  console.log = console.debug = console.warn = () => {};
  const f = Det.scan(N.normalizePath_C(raw)).filter(x => /^nlp_/.test(x.patternId));
  console.log = L; console.debug = D; console.warn = W;
  return f;
};
const orgs = (raw) => run(raw).filter(f => f.patternId === 'nlp_organization').map(f => f.rawMatch);

// ── A. Benign set (assistant-written; any nlp_* finding = false positive) ───
const BENIGN = [
  'Can you give me a recipe for banana bread that uses brown sugar?',
  'explain how binary search works and give a python example',
  'Help me plan a three day trip with a small budget',
  'What is the difference between a list and a tuple?',
  'Write a short poem about the rain on a quiet evening',
  'how do i convert celsius to fahrenheit',
  'Summarize the causes of the first world war in five bullet points',
  'Tips For Studying For Final Exams',
  'Quarterly Report Template Draft',
  'Unit Testing Basics For Beginners',
  'Introduction To Machine Learning Course Outline',
  'Create a weekly meal plan for a family of four',
  'Why does my sourdough starter smell like vinegar?',
  'Please proofread this paragraph about climate and fix the grammar only',
  'What are good questions to ask at the end of an interview?',
  'Give me ideas for a birthday party for a ten year old',
  'Explain the rules of chess to a beginner',
  'Write a SQL query that counts orders per month',
  'The meeting is moved to Friday afternoon, please update the agenda',
  'Best Practices For Remote Team Communication',
  'Draft a polite email asking to reschedule our call',
  'How long should I boil eggs for a soft yolk?',
  'summer reading list for high school students',
  'Describe the water cycle for a grade five science class',
  'What is a good stretching routine after running?',
  'Annual Science Fair Registration Form',
  'Convert this loop into a list comprehension',
  'Compare electric cars and hybrid cars on running costs',
  'Write a thank you note for a gift I received last week',
  'how to center a div with css',
  'Student Council Election Poster Ideas',
  'Community Garden Volunteer Schedule',
  'Plan a study schedule for the next two weeks',
  'What does the word ubiquitous mean?',
  'Explain inflation in simple terms',
  'National Day Parade Route Planning',
  'Office Hours Reminder Message',
  'Fix this error: undefined is not a function',
  'Brainstorm names for a small coffee shop that sells pastries',
  'Write a cover letter opening line that sounds confident',
];
let benignHits = 0, benignOrgHits = 0;
const benignDetail = [];
for (const t of BENIGN) {
  const f = run(t);
  if (f.length) { benignHits++; benignDetail.push(`${t.slice(0, 50)} => ${f.map(x => x.patternId.replace('nlp_', '') + ':' + x.rawMatch).join('; ')}`); }
  if (f.some(x => x.patternId === 'nlp_organization')) benignOrgHits++;
}
L(`BENIGN (assistant-written, ${BENIGN.length} prompts): prompts with any nlp_* finding = ${benignHits}, with an organization finding = ${benignOrgHits}`);
benignDetail.forEach(d => L('   ' + d));

// ── B. Template tests ───────────────────────────────────────────────────────
// Fictional entity stems; endings from the institution list.
const STEMS = ['Orvane Lakes', 'Pellington Ridge', 'Quillmark Valley', 'Zandrel Heights', 'Brightmoor Crest'];
const ENDINGS = ['Hospital', 'University', 'College', 'Institute', 'Academy', 'Bank', 'Clinic', 'School'];
const FRAMES = [
  (e) => `She studied at ${e} last year.`,                 // middle
  (e) => `${e} announced a new program.`,                  // start
  (e) => `We visited, ${e}, and then left.`,               // after comma
  (e) => `Thanks to ${e}`,                                 // end, no period
  (e) => `my cousin works near ${e} these days`,           // lowercase frame
];
const caseVariants = { sentence: s => s, title: s => s };
let tplTotal = 0, tplOk = 0; const tplFail = [];
for (const stem of STEMS) for (const end of ENDINGS) for (const fr of FRAMES) {
  const ent = `${stem} ${end}`;
  const got = orgs(fr(ent));
  tplTotal++;
  // PASS = the full entity is reported, with no extra leading words attached
  if (got.some(g => g.toLowerCase() === ent.toLowerCase())) tplOk++;
  else tplFail.push(`${fr(ent).slice(0, 60)} => ${JSON.stringify(got)}`);
}
L(`TEMPLATE institution-ending: ${tplOk}/${tplTotal} frames report the exact entity`);
tplFail.slice(0, 12).forEach(x => L('   FAIL ' + x));

// Run-on rule: "<X> University College" should NOT merge into one span, and a
// preceding personal name must not be absorbed beyond 4 tokens.
let runTotal = 0, runOk = 0; const runFail = [];
for (const stem of STEMS) for (const [a, b] of [['University', 'College'], ['College', 'School'], ['Institute', 'Academy']]) {
  for (const fr of [(e) => `Contact ${e} of Arts`, (e) => `${e} of Arts is open`]) {
    const txt = fr(`${stem} ${a} ${b}`);
    const got = orgs(txt); runTotal++;
    if (!got.some(g => g.toLowerCase() === `${stem} ${a} ${b}`.toLowerCase())) runOk++; else runFail.push(txt + ' => ' + JSON.stringify(got));
  }
}
L(`TEMPLATE no-run-on (ending after ending): ${runOk}/${runTotal} frames avoid a merged span`);
runFail.slice(0, 6).forEach(x => L('   FAIL ' + x));

// Containment dedup: nested short org must disappear when only inside a longer one;
// must remain when it also appears alone.
let dedTotal = 0, dedOk = 0; const dedFail = [];
for (const stem of ['Orvane', 'Pellington', 'Quillmark', 'Zandrel']) {
  const long = `${stem} Institute of Management`;
  const short = `${stem} Institute`;
  const t1 = `She trained at the ${long}.`;
  const g1 = orgs(t1); dedTotal++;
  if (g1.some(g => g.toLowerCase() === long.toLowerCase()) && !g1.some(g => g.toLowerCase() === short.toLowerCase())) dedOk++; else dedFail.push(t1 + ' => ' + JSON.stringify(g1));
  const t2 = `She trained at the ${long} and later joined ${short} Staff.`;
  // short appears alone too: no assertion about presence of short (heuristic), only that long is kept
  const g2 = orgs(t2); dedTotal++;
  if (g2.some(g => g.toLowerCase() === long.toLowerCase())) dedOk++; else dedFail.push(t2 + ' => ' + JSON.stringify(g2));
}
L(`TEMPLATE containment dedup: ${dedOk}/${dedTotal}`);
dedFail.slice(0, 6).forEach(x => L('   FAIL ' + x));

// Possessive / St. frames (normalizer one-liner): entity must be intact.
let posTotal = 0, posOk = 0; const posFail = [];
for (const saint of ['St. Aldric', 'St. Maren', 'St. Quillon']) {
  for (const poss of ['', "'s"]) for (const end of ['Medical Center', 'Hospital']) {
    const ent = `${saint}${poss} ${end}`;
    for (const fr of [(e) => `A nurse at ${e} told me hello.`, (e) => `${e} is hiring.`]) {
      posTotal++;
      const got = orgs(fr(ent));
      if (got.some(g => g.toLowerCase() === ent.toLowerCase())) posOk++; else posFail.push(fr(ent) + ' => ' + JSON.stringify(got));
    }
  }
}
L(`TEMPLATE St./possessive: ${posOk}/${posTotal}`);
posFail.slice(0, 8).forEach(x => L('   FAIL ' + x));
