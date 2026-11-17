#!/usr/bin/env node
/**
 * test-group1-persons.js — Group 1 (D1/D2): organizations and places must not also be
 * reported as person names; real person names must be protected.
 * All entities are fictional or sampled from the dictionaries at run time (no test-row text).
 * Usage:  node test-group1-persons.js            (current detector)
 *         DET=/abs/path/to/old-detector.js node test-group1-persons.js   (compare against another build)
 * Exit code 1 if an asserted check fails.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log, D = console.debug, W = console.warn;
console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js');
// the browser loads ph-address-db.js before the detector; do the same here
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require('./normalizer.js');
require(process.env.DET ? process.env.DET : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const scan = (raw) => {
  console.log = console.debug = console.warn = () => {};
  const f = Det.scan(N.normalizePath_C(raw));
  console.log = L; console.debug = D; console.warn = W;
  return f;
};
const persons = (raw) => scan(raw).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
const cases3 = (s) => [['sentence', s], ['lower', s.toLowerCase()], ['Title', s.replace(/\b([a-z])/g, c => c.toUpperCase())]];
let failed = 0;
const check = (label, ok, detail) => { if (!ok) { failed++; L('   FAIL ' + label + (detail ? ' => ' + detail : '')); } };
// does any person finding overlap the entity text?
const overlaps = (ps, ent) => ps.some(p => ent.toLowerCase().includes(p.toLowerCase()) || p.toLowerCase().includes(ent.toLowerCase()));

// ── 1. Fictional organizations that the structural pass recognises (suffix / head word) ──────────────
const ORGS = ['Halvorsen General Hospital', 'Quillfeather Foundation', 'Dunmere Cooperative', 'Brightmoor Holdings Inc', 'Tavistock Savings Bank',
              'Ostrava Technical University', 'Pelham Community Association', 'Marlowe Logistics Corp', 'Wexford Medical Center', 'Yarrow Hills College'];
const POS = [
  (o) => `${o} announced a new schedule for next week.`,       // start
  (o) => `Please send the forms to ${o} before Friday.`,        // middle, after "to"
  (o) => `We met at the office, ${o} was the host.`,             // after comma
  (o) => `The documents were prepared for ${o}.`,                // end
  (o) => `Contact ${o} for details.`,                            // after directive verb
];
let orgFrames = 0, orgBad = 0, orgNoEvidence = 0; const orgBadList = [], orgNoEvList = [];
for (const o of ORGS) for (const p of POS) for (const [c, t] of cases3(p(o))) {
  if (c === 'lower') continue;                                   // lowercase entities are not detectable at all (documented limitation)
  orgFrames++; const fs_ = scan(t); const ps = fs_.filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
  if (overlaps(ps, o)) {
    // with organization evidence the person finding must go; without it (organization pass found nothing) it is a reported limitation
    if (fs_.some(x => x.patternId === 'nlp_organization' && overlaps([x.rawMatch], o))) { orgBad++; orgBadList.push(`${c}: ${t} => ${JSON.stringify(ps)}`); }
    else { orgNoEvidence++; orgNoEvList.push(`${c}: ${t} => ${JSON.stringify(ps)}`); }
  }
}
L(`TEMPLATE fictional suffix/head-word organizations: ${ORGS.length} orgs x ${POS.length} positions x 2 cases = ${orgFrames}; frames where a person finding overlaps an org that WAS detected = ${orgBad}; org not detected at all by the organization pass and still reported as a person = ${orgNoEvidence}`);
orgBadList.slice(0, 6).forEach(x => L('   ' + x));
orgNoEvList.slice(0, 6).forEach(x => L('   (no org evidence) ' + x));
check('suffix organizations never person names', orgBad === 0, `${orgBad}/${orgFrames}`);

// ── 2. Dictionary organizations without a suffix (sampled at run time) ─────────────────────────────
const dictOrgs = (global.ORGANIZATIONS_DATA || []).filter(o => /^[A-Z][a-z]+(?: [A-Z][a-z]+){1,2}$/.test(o));
const sample = []; for (let i = 0; i < dictOrgs.length && sample.length < 60; i += Math.max(1, Math.floor(dictOrgs.length / 60))) sample.push(dictOrgs[i]);
let dictBad = 0; const dictBadList = [];
for (const o of sample) { const t = `We visited ${o} yesterday and took notes.`; const ps = persons(t); if (overlaps(ps, o)) { dictBad++; dictBadList.push(o + ' => ' + JSON.stringify(ps)); } }
L(`TEMPLATE dictionary organizations (2-3 Title Case words, sampled ${sample.length}): person finding overlapping the org = ${dictBad}`);
dictBadList.slice(0, 8).forEach(x => L('   ' + x));

// ── 3. Streets / campuses / places ─────────────────────────────────────────────────────────────────
const STREETS = ['Maplewood Street', 'Riverbend Avenue', 'Pinecrest Boulevard', 'Eastfield Campus', 'Larkspur Highway', 'Cobalt Road'];
let stBad = 0, stN = 0;
for (const s of STREETS) for (const t of [`Turn left on ${s} and keep going.`, `${s} is closed today.`, `The shop is on ${s}, near the corner.`]) {
  stN++; const ps = persons(t); if (overlaps(ps, s)) { stBad++; check('street ' + t, false, JSON.stringify(ps)); }
}
L(`TEMPLATE streets/campus heads: ${stN} frames; person finding overlapping = ${stBad} (expected 0)`);
const PLACES = ['Paris', 'Manila', 'London', 'Georgia'];
let plBad = 0, plN = 0;
for (const p of PLACES) for (const t of [`I plan to relocate to ${p} next year.`, `She works in ${p} and travels a lot.`, `What is the best way to fly from ${p} to Cebu?`]) {
  plN++; const ps = persons(t); if (ps.some(x => x.toLowerCase() === p.toLowerCase())) { plBad++; check('place ' + t, false, JSON.stringify(ps)); }
}
L(`TEMPLATE places in locative context: ${plN} frames; place reported as a person = ${plBad} (expected 0)`);

// ── 4. Name protection: real people whose names contain organization / place / function words ─────────
const PEOPLE = [
  // org-ish words
  'Jessica Land', 'Hannah Bank', 'Marcus Drug', 'Elena Foundation', 'Tomas Group', 'Nadia Telecom',
  // place words / place-name first names
  'Maria Cebu', 'Andrea Santos', 'Paris Whitlock', 'Georgia Pellew', 'Victoria Hale', 'Manila Reyes', 'Rosario Tan', 'Gloria Angeles',
  // surname particles
  'Juan dela Cruz', 'Juan Dela Cruz', 'Maria de la Cruz', 'Pedro de los Santos', 'Jose Rizal y Mercado', 'Ahmad bin Hassan',
  'Hendrik van Doorne', 'Karl von Meissen', 'Layla al Rashidi', 'Carlos Del Rosario',
];
const NFRAMES = [
  (n) => `My name is ${n}.`,
  (n) => `Please email ${n} about the schedule.`,
  (n) => `${n} said the meeting moved to Monday.`,
  (n) => `I talked to the nurse yesterday, ${n} is back.`,
];
let protLost = 0, protN = 0, protHeadHad = 0; const lostList = [];
// the expectation: whatever the REFERENCE build found, the current build must still find (compare with DET_REF if given)
const refFound = {};
for (const n of PEOPLE) for (let i = 0; i < NFRAMES.length; i++) {
  const t = NFRAMES[i](n); const ps = persons(t); const key = n + '|' + i;
  const key2 = n.split(' ').pop().toLowerCase();
  const found = ps.some(p => p.toLowerCase().includes(key2) || p.toLowerCase().includes(n.split(' ')[0].toLowerCase()));
  refFound[key] = found; protN++; if (!found) { protLost++; lostList.push(t + ' => ' + JSON.stringify(ps)); }
}
L(`NAME PROTECTION: ${PEOPLE.length} fictional names x ${NFRAMES.length} frames = ${protN}; frames where NO part of the name is reported = ${protLost}`);
lostList.slice(0, 12).forEach(x => L('   ' + x));
fs.writeFileSync(path.join(process.env.G1_OUT || __dirname, '.g1-protect-' + (process.env.DET ? 'ref' : 'new') + '.json'), JSON.stringify(refFound));

// cue override: a person-like dictionary entry with a cue stays a person, without a cue it is an organization
const personLikeOrgs = dictOrgs.filter(o => /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(o)).filter((_, i) => i % Math.max(1, Math.floor(dictOrgs.length / 200)) === 0).slice(0, 25);
let cueKept = 0, cueN = 0, noCueDropped = 0, noCueN = 0;
for (const o of personLikeOrgs) {
  for (const t of [`My name is ${o}.`, `Please ask nurse ${o} to call back.`, `${o}, a nurse, called today.`]) { cueN++; if (persons(t).some(p => overlaps([p], o))) cueKept++; }
  const t2 = `We visited ${o} yesterday.`; const hadOrg = scan(t2).some(f => f.patternId === 'nlp_organization' && overlaps([f.rawMatch], o));
  if (hadOrg) { noCueN++; if (!persons(t2).some(p => overlaps([p], o))) noCueDropped++; }
}
L(`CUE override (dictionary entries that look like "First Last", ${personLikeOrgs.length} sampled): person kept with a cue ${cueKept}/${cueN}; without a cue, dropped when the org was also found ${noCueDropped}/${noCueN}`);

// ── 5. Benign set (assistant-written): any nlp_* finding is a false positive ─────────────────────────
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
  'Help me write a thank you note for a birthday gift', 'Describe the water cycle for a grade school class',
  'The meeting is moved to Friday afternoon, please update the calendar', 'Suggest a name for my new bakery that sells sourdough',
  'Fix the off by one error in this loop', 'Compare electric and gas stoves for a small apartment',
  'What should I pack for a week in a cold country?',
];
const bTypes = {}; let bPrompts = 0; const bList = [];
for (const t of BENIGN) for (const [c, v] of cases3(t)) {
  const f = scan(v).filter(x => /^nlp_/.test(x.patternId)); if (f.length) { bPrompts++; bList.push(c + ': ' + v.slice(0, 50) + ' => ' + f.map(x => x.patternId.replace('nlp_', '') + ':' + x.rawMatch).join('; ')); }
  f.forEach(x => bTypes[x.patternId] = (bTypes[x.patternId] || 0) + 1);
}
L(`BENIGN (assistant-written, ${BENIGN.length} prompts x 3 cases = ${BENIGN.length * 3}): prompts with an nlp_* finding = ${bPrompts}; by type ${JSON.stringify(bTypes)}`);
bList.slice(0, 20).forEach(x => L('   ' + x));

L(failed ? `\nRESULT: ${failed} asserted check(s) FAILED` : '\nRESULT: all asserted checks passed');
process.exit(failed ? 1 : 0);
