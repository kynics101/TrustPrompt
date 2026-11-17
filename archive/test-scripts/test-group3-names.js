#!/usr/bin/env node
/**
 * test-group3-names.js — benign set + metamorphic template tests for Group 3
 * (names that are not names). Everything here is written by the assistant; names are fictional.
 * Run it twice to compare builds:  node test-group3-names.js   and   DET=<old detector copy> node test-group3-names.js
 * Prints measured numbers; it only exits non-zero for the asserted "must be zero" checks.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log, D = console.debug, W = console.warn;
console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require('./normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const scan = (raw) => { console.log = console.debug = console.warn = () => {}; const f = Det.scan(N.normalizePath_C(raw)); console.log = L; console.debug = D; console.warn = W; return f; };
const persons = (raw) => scan(raw).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
const lc = s => s.toLowerCase();
const title = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());
let failed = 0;
const check = (label, ok, detail) => { if (!ok) { failed++; L('   FAIL ' + label + (detail ? ' => ' + detail : '')); } };
const show = (arr, n = 6) => arr.slice(0, n).forEach(x => L('     ' + x));

const FIRST = ['Maricel', 'Rodrigo', 'Nathaniel', 'Joshua', 'Karen', 'Armando', 'Imelda', 'Wilfredo', 'Cynthia', 'Dionisio', 'Oliver', 'Amelia', 'Marcus', 'Priya', 'Fatima', 'Brandon'];
const LAST = ['Santiago', 'Villacorta', 'Lumbao', 'Pacheco', 'Dalisay', 'Ferrer', 'Montoya', 'Whitfield', 'Aldridge', 'Hargrove', 'Ellison', 'Thorne', 'Navarro', 'Quintos', 'Abella', 'Kowalski'];
const pair = i => `${FIRST[i % FIRST.length]} ${LAST[(i * 5 + 3) % LAST.length]}`;
const PAIRS = FIRST.map((_, i) => pair(i));
const found = (ps, name) => ps.some(p => lc(p) === lc(name));                 // exact
const touches = (ps, name) => ps.some(p => lc(name).includes(lc(p)) || lc(p).includes(lc(name)));

// ── A. honorific + name: no bare honorific, name still found ──────────────────────────────────────
const HON = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Atty', 'Engr', 'Sir'];
const AF = [n => `Please write to ${n} about the schedule.`, n => `${n} will review the draft.`, n => `I spoke with ${n} yesterday.`, n => `Send the file to ${n}, please.`];
let aN = 0, aBare = 0, aMiss = 0, aExact = 0; const aList = [];
for (const h of HON) for (const [i, nm] of PAIRS.entries()) { if (i !== 0) continue; for (const f of AF) for (const dot of ['.', '']) {
  const t = f(`${h}${dot} ${nm}`); const ps = persons(t); aN++;
  if (ps.some(p => NAME_HON(p))) { aBare++; aList.push('bare: ' + t + ' => ' + JSON.stringify(ps)); }
  if (!touches(ps, nm)) { aMiss++; aList.push('missed: ' + t + ' => ' + JSON.stringify(ps)); }
  if (found(ps, nm)) aExact++;
} }
function NAME_HON(p) { return /^(mr|mrs|ms|dr|prof|atty|engr|sir|miss)\.?$/i.test(p.trim()); }
L(`A. HONORIFIC + NAME: ${aN} frames; bare honorific reported = ${aBare}; name not touched at all = ${aMiss}; exact full name reported = ${aExact}`);
show(aList); check('honorific bare', aBare === 0, aBare);

// ── B. leading verb / title attached to a name ───────────────────────────────────────────────────────
const VERBS = ['Tell', 'Thank', 'Introduce', 'Congratulate', 'Greet'];
const TITLES = ['', 'Nurse', 'Engineer', 'Principal', 'Captain', 'Teacher'];
let bN = 0, bAttached = 0, bExact = 0, bMiss = 0; const bList = [];
for (const v of VERBS) for (const tt of TITLES) for (const [i, nm] of PAIRS.entries()) { if (i !== 1) continue; for (const mk of [(x) => `${x} about the report.`, (x) => `He said, "${x} that it arrived."`]) {
  const t = mk(`${v} ${tt ? tt + ' ' : ''}${nm}`); const ps = persons(t); bN++;
  const bad = ps.filter(p => new RegExp('^(' + VERBS.join('|') + '|' + TITLES.filter(Boolean).join('|') + ')\\b', 'i').test(p));
  if (bad.length) { bAttached++; bList.push('attached: ' + t + ' => ' + JSON.stringify(ps)); }
  if (found(ps, nm)) bExact++; else if (!touches(ps, nm)) { bMiss++; bList.push('missed: ' + t + ' => ' + JSON.stringify(ps)); }
} }
L(`B. VERB/TITLE + NAME: ${bN} frames; a finding starting with the verb or title = ${bAttached}; exact "First Last" = ${bExact}; name not touched = ${bMiss}`);
show(bList, 8);

// ── C. question / function / indefinite / date words as subject and as object ────────────────────────
const WORDS = ['What', 'Which', 'Who', 'Why', 'How', 'Someone', 'Everyone', 'Everybody', 'Nobody', 'Something', 'Nothing', 'Thursday', 'Monday', 'Saturday', 'January', 'October', 'December', 'Today', 'Tomorrow', 'However', 'Maybe', 'Many', 'Most', 'Here', 'Please'];
const CF = [w => `${w} said the deadline is tight.`, w => `${w} was asked to resubmit the form.`, w => `Please send the file to ${w} by noon.`, w => `I got a note from ${w} this morning.`];
let cN = 0, cBad = 0; const cList = [], cByWord = {};
for (const w of WORDS) for (const f of CF) for (const c of ['sentence']) {
  const t0 = f(w); const t = c === 'Title' ? title(t0) : t0; const ps = persons(t); cN++;
  if (ps.some(p => lc(p) === lc(w))) { cBad++; cByWord[w] = (cByWord[w] || 0) + 1; cList.push(t + ' => ' + JSON.stringify(ps)); }
}
L(`C. QUESTION/FUNCTION/DATE WORDS reported as a name: ${cBad}/${cN} frames; by word ${JSON.stringify(cByWord)}`);
show(cList, 8);

// ── D. months that are also names ───────────────────────────────────────────────────────────────────
const MN = ['May', 'April', 'Jun'];
const NAMEUSE = [m => `Please write to ${m} about the schedule.`, m => `Contact ${m} tomorrow.`, m => `Send the notes to ${m} before noon.`, m => `Ask ${m} to call me back.`, m => `I got an email from ${m} yesterday.`, m => `Thank ${m} for the help.`];
const DATEUSE = [m => `The event is in ${m}.`, m => `Submit it by ${m} 5.`, m => `The class starts on ${m} 12 at eight.`, m => `It has been closed since ${m}.`, m => `We met last ${m} at the park.`, m => `The form is due until ${m} 30.`];
let dK = 0, dKN = 0, dDrop = 0, dDN = 0; const dList = [];
for (const m of MN) { for (const f of NAMEUSE) { dKN++; const ps = persons(f(m)); if (ps.some(p => lc(p) === lc(m))) dK++; else dList.push('name-use lost: ' + f(m) + ' => ' + JSON.stringify(ps)); }
  for (const f of DATEUSE) { dDN++; const ps = persons(f(m)); if (!ps.some(p => lc(p) === lc(m))) dDrop++; else dList.push('date-use kept: ' + f(m) + ' => ' + JSON.stringify(ps)); } }
L(`D. MONTH NAMES: name uses kept ${dK}/${dKN}; date uses rejected ${dDrop}/${dDN}`);
show(dList, 14);

// ── E. surnames that are also job titles, with and without a cue ──────────────────────────────────────
const SUR = ['Baker', 'Cook', 'Mason', 'Miller', 'Taylor', 'Porter'];
const EF = [
  { n: 'trailing, no cue', f: (s) => `Please email Oliver ${s} about the schedule.` },
  { n: 'trailing, subject', f: (s) => `Oliver ${s} said the report is ready.` },
  { n: 'trailing, honorific', f: (s) => `Please email Mr. Oliver ${s} about the schedule.` },
  { n: 'trailing, self-intro', f: (s) => `My name is Oliver ${s}.` },
  { n: 'leading, no cue', f: (s) => `${s} Reyes approved the budget.` },
  { n: 'leading 3-token', f: (s) => `${s} Anne Reyes approved the budget.` },
  { n: 'Title Case only', f: (s) => `Please Email Oliver ${s} About The Schedule.` },
];
L('E. SURNAME/GIVEN NAME THAT IS ALSO A JOB TITLE (exact full name reported):');
const eFail = [];
for (const e of EF) { let ok = 0; for (const s of SUR) { const t = e.f(s); const full = t.match(/(?:Oliver )?[A-Z][a-z]+(?: Anne)?(?: Reyes| ?)/) ; const nm = e.n.startsWith('leading') ? (e.n.includes('3') ? `${s} Anne Reyes` : `${s} Reyes`) : `Oliver ${s}`; const ps = persons(t); if (found(ps, nm)) ok++; else eFail.push(`${e.n}: ${t} => ${JSON.stringify(ps)}`); }
  L(`   ${e.n.padEnd(22)} ${ok}/${SUR.length}`); }
show(eFail, 16);

// ── F. Title-Case-only prompts containing a name (recall cost of the heading guard) ───────────────────
const FF = [n => `Please write an email to ${n} about the meeting tomorrow.`, n => `Draft a thank you note for ${n} who helped us last week.`, n => `Can you summarize the report that ${n} sent yesterday?`, n => `Contact ${n} to confirm the delivery schedule for next month.`];
const knownF = ['Maria Santos', 'John Smith', 'Oliver Thorne', 'Karen Cruz'];
let fN = 0, fHit = 0, fSentHit = 0, fSentN = 0; const fMiss = [], fByGroup = { known: [0, 0], unknown: [0, 0] };
for (const nm of [...PAIRS.slice(0, 4), ...knownF.slice(0, 2), PAIRS[9], PAIRS[12]]) for (const f of FF.slice(0, 2)) {
  const g = knownF.includes(nm) ? 'known' : 'unknown';
  fSentN++; if (touches(persons(f(nm)), nm)) fSentHit++;
  fN++; fByGroup[g][1]++; const t = title(f(nm)); const ps = persons(t); if (touches(ps, nm)) { fHit++; fByGroup[g][0]++; } else fMiss.push(t + ' => ' + JSON.stringify(ps));
}
L(`F. NAME IN A TITLE-CASE-ONLY PROMPT: reported ${fHit}/${fN} (sentence-case control ${fSentHit}/${fSentN}); names Compromise knows ${fByGroup.known[0]}/${fByGroup.known[1]}, other fictional names ${fByGroup.unknown[0]}/${fByGroup.unknown[1]}`);
show(fMiss, 6);

// ── G. Title-Case headings with no name: nothing may be reported as a person ──────────────────────────
const HEADINGS = [
  'How To Cook Sauteed Mushrooms With Fresh Garlic And Herbs For A Family Dinner That Everybody Will Enjoy',
  'Quarterly Budget Review And Planning Meeting Agenda For The Finance Department',
  'Subject: Request for Parking Clearance Good day.', 'Subject: Request for Employment Verification Good day,',
  'Introduction To Machine Learning Course Outline And Reading List', 'Community Garden Volunteer Schedule For The Summer Season',
  'Annual Science Fair Registration Form And Judging Criteria', 'Ten Easy Weeknight Dinners For Busy Parents',
];
let gBad = 0; const gList = [];
for (const h of HEADINGS) { const ps = persons(h); if (ps.length) { gBad++; gList.push(h.slice(0, 60) + ' => ' + JSON.stringify(ps)); } }
L(`G. TITLE-CASE HEADINGS with no name: ${gBad}/${HEADINGS.length} produced a person finding`);
show(gList);

// ── H. duplicate fragments: a single word inside a longer name must not be reported separately ─────────
const HF = [n => `Congratulations to ${n} for passing the exam!`, n => `Write a note for ${n} about the schedule.`, n => `I will send it to ${n} later.`, n => `Please contact ${n} from the office.`];
const THREE = ['Hazel Anne Villaruel', 'Mark Anthony Delgado', 'Teresa Marie Quintos'];
let hN = 0, hFrag = 0; const hList = [];
for (const nm of THREE) for (const f of HF) { const ps = persons(f(nm)); hN++; const parts = nm.split(' '); if (ps.some(p => !p.includes(' ') && parts.includes(p))) { hFrag++; hList.push(f(nm) + ' => ' + JSON.stringify(ps)); } }
L(`H. FRAGMENT DUPLICATES: ${hFrag}/${hN} frames report a lone single word that is part of the full name`);
show(hList);

// ── I. names that are ordinary words, with no cue, in sentence position ───────────────────────────────
const AMB = ['Hazel', 'Joy', 'Grace', 'Mason', 'Will', 'Hope', 'Dawn', 'Mark'];
const IF = [n => `Please write to ${n} Santiago about the schedule.`, n => `${n} Santiago will review the draft.`, n => `Thank ${n} Santiago for the help.`];
let iN = 0, iOk = 0; const iList = [];
for (const n of AMB) for (const f of IF) { const t = f(n); const ps = persons(t); iN++; if (touches(ps, n)) iOk++; else iList.push(t + ' => ' + JSON.stringify(ps)); }
L(`I. NAMES THAT ARE ORDINARY WORDS (verbs/nouns): name still reported ${iOk}/${iN}`);
show(iList, 10);

// ── J. benign set ──────────────────────────────────────────────────────────────────────────────────
const BENIGN = [
  'How do I cook rice without it sticking to the pot?', 'Write a function that returns the host name of a url',
  'Explain the difference between a list and a tuple in python', 'Plan a three day trip with a small budget',
  'Give me ideas for a science fair project about plants', 'Summarize the causes of the industrial revolution',
  'What is a good stretching routine after running?', 'Draft a polite reminder about an unpaid invoice',
  'Quarterly Report Template Draft', 'Community Garden Volunteer Schedule', 'Student Council Election Poster Ideas',
  'Annual Science Fair Registration Form', 'Introduction To Machine Learning Course Outline',
  'Turn left on the main road and keep going until the second light', 'The campus library opens at eight on weekdays',
  'Which laptop is better for video editing, the thin one or the heavy one?', 'Write a limerick about a cat who loves the rain',
  'What are good questions to ask at the end of an interview?', 'Create a weekly meal plan for a family of four',
  'Explain how compound interest works with an example', 'List the planets in order from the sun',
  'Translate good morning into three languages', 'How long should I boil an egg for a soft yolk?',
  'Help me write a thank you note for a birthday gift', 'Describe the water cycle for a grade 6 class',
  'The meeting is moved to Friday afternoon, please update the calendar', 'Suggest a name for my new bakery that sells sourdough',
  'Fix the off by one error in this loop', 'Compare electric and gas stoves for a small apartment',
  'What should I pack for a week in a cold country?', 'Someone told me that May is the hottest month. Is that true?',
  'Everybody in the class passed. What should we do to celebrate in June?', 'Which month is better for a beach trip, April or May?',
  'Thursday is the deadline for Section 4 of the lab report', 'Write a lesson plan for Grade 6 science about the water cycle',
];
const jTypes = {}; let jP = 0; const jList = [];
for (const t of BENIGN) for (const [c, v] of [['sentence', t], ['Title', title(t)]]) {
  const f = scan(v).filter(x => /^nlp_/.test(x.patternId)); if (f.length) { jP++; jList.push(c + ': ' + v.slice(0, 55) + ' => ' + f.map(x => x.patternId.replace('nlp_', '') + ':' + x.rawMatch).join('; ')); }
  f.forEach(x => jTypes[x.patternId] = (jTypes[x.patternId] || 0) + 1);
}
L(`J. BENIGN (assistant-written, ${BENIGN.length} prompts x 2 cases (sentence, Title) = ${BENIGN.length * 2}): prompts with an nlp_* finding = ${jP}; by type ${JSON.stringify(jTypes)}`);
show(jList, 24);

// ── K. speed ───────────────────────────────────────────────────────────────────────────────────────
const SHORT = 'Please write a thank you note to Ms. Karen Santiago and Dr. Armando Villacorta for the help.';
const LONG = Array.from({ length: 12 }, (_, i) => `${pair(i)} works as a nurse at Halvorsen General Hospital. Contact ${pair(i + 3)} about Section ${i + 1} on Thursday, and tell ${pair(i + 5)} that the report is ready.`).join(' ');
const time = (t, n) => { scan(t); const s = process.hrtime.bigint(); for (let i = 0; i < n; i++) scan(t); return Number(process.hrtime.bigint() - s) / 1e6 / n; };
L(`K. SPEED: short prompt ${time(SHORT, 5).toFixed(0)} ms, long prompt (${LONG.length} chars) ${time(LONG, 3).toFixed(0)} ms (average per scan)`);

L(failed ? `\nRESULT: ${failed} asserted check(s) FAILED` : '\nRESULT: all asserted checks passed');
process.exit(failed ? 1 : 0);
