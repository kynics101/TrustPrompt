#!/usr/bin/env node
/**
 * test-group5-jobs.js — benign set + metamorphic template tests for Group 5
 * (job-title context gate loosening + head-noun extension).
 * Everything here is written by the assistant; names/orgs are fictional.
 * Usage: node test-group5-jobs.js
 */
'use strict';
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log, D = console.debug, W = console.warn;
console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js');
global.window.nlp = require('./lib/compromise.min.js');
require('./normalizer.js'); require('./linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const jobs = (raw) => {
  console.log = console.debug = console.warn = () => {};
  const f = Det.scan(N.normalizePath_C(raw)).filter(x => x.patternId === 'nlp_job_title').map(x => x.rawMatch);
  console.log = L; console.debug = D; console.warn = W;
  return f;
};

// ── A. Benign: job words used as ordinary nouns / no personal job claim ────
const BENIGN = [
  'How do I cook rice without it sticking to the pot?',
  'Write a function that returns the host name of a url',
  'What is the best way to clean a driver for my printer?',
  'Please move this folder to the archive and rename the header file',
  'Explain what a manager class does in the observer pattern',
  'The page header should stay fixed when scrolling',
  'Give me a recipe that a baker would be proud of',
  'What time does the pharmacy open on Sundays?',
  'Can you explain how a nurse log differs from a stump in forest ecology?',
  'Tell me about the history of the guard tower at the old fort',
  'Write a story where a pilot episode introduces the main characters',
  'How does an operator overload work in c plus plus?',
  'My laptop driver keeps crashing after the update',
  'Is it better to be an owner or a renter of a home?',
  'Describe the role of a director in a play for school',
  'The officer class in this game has strong armor',
  'Summarize the plot of the movie about a secretary and a clerk',
  'Create a worker thread pool example in javascript',
  'What does an assistant method do in this codebase?',
  'List five tips for a good partner dance at a wedding',
  'Explain the difference between a teacher forcing and a student model in distillation',
  'Fix the associate array in this php snippet',
  'Plan a pep talk for the team leader of a hiking club',
  'The attendant message was not delivered by the queue',
  'Which scientist discovered penicillin and when?',
  'Write a limerick about a plumber who lost a wrench',
  'What is the origin of the word president?',
  'The chairman of the board in monopoly is a card, how does it work?',
  'Explain what a trainer in machine learning frameworks does',
  'How many reporter classes should my logging module have?',
];
let bn = 0; const bd = [];
for (const t of BENIGN) { const f = jobs(t); if (f.length) { bn++; bd.push(t.slice(0, 55) + ' => ' + JSON.stringify(f)); } }
L(`BENIGN job words (assistant-written, ${BENIGN.length}): prompts with a job_title finding = ${bn}`);
bd.forEach(x => L('   ' + x));

// ── B. Template tests: same fictional person/org/title across frames ──────
const TITLES = ['electrician', 'accountant', 'pharmacist', 'welder', 'cashier', 'lawyer', 'plumber', 'engineer', 'surgeon', 'mechanic', 'auditor', 'cook'];
const PEOPLE = ['Veronika Halden', 'Tomas Albright', 'Mirela Ostrand'];
const ORGS = ['Kestrel Dynamics Corp.', 'Brightfield Foundation', 'Norvane Trading Inc.'];
const FRAMES = {
  'employer-at':   (t, p, o) => `Please draft a note for ${p}, ${t} at ${o}, about the schedule.`,
  'title-name':    (t, p, o) => `Thank ${t} ${p} for the help last week.`,
  'appositive':    (t, p, o) => `${p}, a ${t}, will join the call.`,
  'as-a':          (t, p, o) => `${p} has worked as a ${t} for ten years.`,
  'label':         (t, p, o) => `Name: ${p} | Occupation: ${t}`,
  'of-org':        (t, p, o) => `I spoke with the ${t} of ${o} yesterday.`,
  'resume-pipe':   (t, p, o) => `${p} | ${t} | ${o}`,
};
const NEG_FRAMES = {   // no personal cue: must stay silent
  'generic-q':     (t) => `What does a ${t} do in a typical day?`,
  'abstract':      (t) => `Write a poem that mentions the ${t} once.`,
  'object-noun':   (t) => `Is ${t} a common word in english?`,
};
let pos = 0, posOk = 0; const posFail = {};
for (const [name, fr] of Object.entries(FRAMES)) for (const t of TITLES) for (let i = 0; i < PEOPLE.length; i++) {
  const txt = fr(t, PEOPLE[i], ORGS[i]); pos++;
  if (jobs(txt).some(x => x.toLowerCase().includes(t))) posOk++; else (posFail[name] = posFail[name] || []).push(txt.slice(0, 70));
}
L(`TEMPLATE positive cues: ${posOk}/${pos} frames report the title`);
for (const [k, v] of Object.entries(posFail)) L(`   frame ${k}: ${v.length} missed e.g. ${v[0]}`);

let neg = 0, negOk = 0; const negFail = [];
for (const [name, fr] of Object.entries(NEG_FRAMES)) for (const t of TITLES) {
  const txt = fr(t); neg++;
  if (!jobs(txt).length) negOk++; else negFail.push(txt + ' => ' + JSON.stringify(jobs(txt)));
}
L(`TEMPLATE negative frames (no personal cue, expected silent): ${negOk}/${neg}`);
negFail.slice(0, 8).forEach(x => L('   FLAGGED ' + x));

// case variants of the strongest frame
let cv = 0, cvOk = 0; const cvFail = [];
for (const t of TITLES) for (const f of [s => s, s => s.toLowerCase(), s => s.toUpperCase()]) {
  const txt = f(`Please draft a note for ${PEOPLE[0]}, ${t} at ${ORGS[0]}, about the schedule.`); cv++;
  if (jobs(txt).some(x => x.toLowerCase().includes(t))) cvOk++; else cvFail.push(txt.slice(0, 70));
}
L(`TEMPLATE case variants (sentence/lower/UPPER) of employer-at: ${cvOk}/${cv}`);
cvFail.slice(0, 6).forEach(x => L('   MISS ' + x));

// D10 head-noun extension with fictional modifiers
const MODS = ['registered', 'certified', 'senior', 'public school', 'warehouse', 'jeepney', 'guidance'];
const HEADS = ['nurse', 'accountant', 'teacher', 'driver', 'supervisor', 'counselor'];
let ex = 0, exOk = 0; const exFail = [];
for (const m of MODS) for (const h of HEADS) {
  const txt = `${PEOPLE[1]} works as a ${m} ${h} at ${ORGS[1]}.`; ex++;
  if (jobs(txt).some(x => x.toLowerCase() === `${m} ${h}`)) exOk++; else exFail.push(`${m} ${h} => ${JSON.stringify(jobs(txt))}`);
}
L(`TEMPLATE head extension (modifier+head reported whole): ${exOk}/${ex}`);
exFail.slice(0, 10).forEach(x => L('   MISS ' + x));

// Extension must not swallow ordinary adjectives / determiners
let nx = 0, nxOk = 0; const nxFail = [];
for (const adj of ['new', 'good', 'friendly', 'tall', 'my', 'the', 'our', 'best']) for (const h of ['nurse', 'accountant', 'teacher']) {
  const txt = `${PEOPLE[2]} works as a ${adj} ${h} at ${ORGS[2]}.`; nx++;
  if (!jobs(txt).some(x => x.toLowerCase().includes(adj + ' '))) nxOk++; else nxFail.push(`${adj} ${h} => ${JSON.stringify(jobs(txt))}`);
}
L(`TEMPLATE extension does not absorb ordinary adjectives/determiners: ${nxOk}/${nx}`);
nxFail.slice(0, 8).forEach(x => L('   ABSORBED ' + x));

// Title Case / heading frames: capitalisation carries no information, so job words
// inside headings must stay silent (fictional headings written by the assistant).
const HEADINGS = [
  'How To Cook Lentil Soup With Fresh Herbs For A Large Family Dinner',
  'Guide For Pilot Projects In Small Community Gardens Across The Region',
  'Why Every Teacher Resource Library Needs A Better Index Page',
  'The Plumber Wrench Collection Catalog Of Vintage Garden Tools',
  'Welcome To The Director Cut Edition Of Our Annual Film Festival',
  'Mechanic Shop Appointment Form Template For Weekend Bookings',
];
let hn = 0; const hd = [];
for (const h of HEADINGS) { const f = jobs(h); if (f.length) { hn++; hd.push(h.slice(0, 50) + ' => ' + JSON.stringify(f)); } }
L(`HEADINGS (Title Case, assistant-written, ${HEADINGS.length}): with a job_title finding = ${hn}`);
hd.forEach(x => L('   ' + x));
