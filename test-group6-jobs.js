#!/usr/bin/env node
/**
 * test-group6-jobs.js — Group 6 (D11): ordinary words must not become job titles.
 * Covers: fuzzy gate (first+last letter, title >= 9 letters), kinship regression,
 * cue 5 function-word rule, possessive-only extension restriction.
 * All names/orgs are fictional. Usage: node test-group6-jobs.js
 * Exit code 1 if any asserted check fails.
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
const cases3 = (s) => [['sentence', s], ['lower', s.toLowerCase()], ['Title', s.replace(/\b([a-z])/g, c => c.toUpperCase())]];
let failed = 0;
const check = (label, ok, detail) => { if (!ok) { failed++; L('   FAIL ' + label + (detail ? ' => ' + detail : '')); } };

// ── 1. Kinship regression (asserted) ────────────────────────────────────────
const KIN = 'sister brother mother father aunt uncle cousin son daughter wife husband ate kuya lola lolo tita tito nanay tatay mama papa ninong ninang'.split(' ');
let kinBad = 0, kinN = 0;
for (const t of KIN) {
  const C = t[0].toUpperCase() + t.slice(1);
  const frames = [`My ${t} cooked dinner for us last night.`, `I asked my ${t} to help me move.`,
                  `${C} Maria Santos prayed with us.`, `Please thank ${C} for the help.`];
  for (const fr of frames) { kinN++; const f = jobs(fr); if (f.length) { kinBad++; check('kinship ' + fr, false, JSON.stringify(f)); } }
}
L(`KINSHIP regression: ${KIN.length} terms x 4 frames = ${kinN}; frames with a job_title finding = ${kinBad}`);
const clergy = jobs('Sister Maria Santos led the mass.');
check('Sister Maria Santos keeps current result (no job finding)', clergy.length === 0, JSON.stringify(clergy));
L(`KINSHIP "Sister Maria Santos led the mass." => ${JSON.stringify(clergy)} (current result before Group 6: [])`);

// ── 2. Ordinary words one letter from a title (sentence / lower / Title) ────
const ORD = ['schedule', 'service', 'master', 'sister', 'reminder', 'stronger', 'creator', 'stranger', 'clearer', 'dinner', 'cooked', 'called'];
let ordBad = 0, ordN = 0;
for (const w of ORD) {
  for (const fr of [`I think my ${w} is ready for the new plan.`, `She is a very good ${w} for this.`]) {
    for (const [c, t] of cases3(fr)) { ordN++; const f = jobs(t); if (f.length) { ordBad++; check(`ordinary ${c}: ${t}`, false, JSON.stringify(f)); } }
  }
}
L(`ORDINARY one-letter-from-title words: ${ORD.length} words x 2 frames x 3 cases = ${ordN}; with a job_title finding = ${ordBad}`);

// ── 3. Typo templates: tolerance only for titles of 9+ letters (middle typo) ──
// fictional frames; "is a" trigger so the context gate passes
const LONG = ['pharmacist', 'electrician', 'accountant', 'carpenter', 'technician', 'supervisor', 'bookkeeper', 'pathologist', 'receptionist', 'veterinarian'];
const SHORT = ['teacher', 'plumber', 'mechanic', 'cashier', 'lawyer', 'welder', 'barista', 'janitor', 'dentist', 'surgeon'];
const typo = (w) => { const m = Math.floor(w.length / 2); return w.slice(0, m) + w.slice(m + 1); };   // middle deletion
let longOk = 0, shortCaught = 0, exactOk = 0;
for (const w of LONG) { const f = jobs(`Veronika Halden is a ${typo(w)} at Kestrel Dynamics.`); if (f.length) longOk++; }
for (const w of SHORT) { const f = jobs(`Veronika Halden is a ${typo(w)} at Kestrel Dynamics.`); if (f.length) shortCaught++; }
for (const w of [...LONG, ...SHORT]) { const f = jobs(`Veronika Halden is a ${w} at Kestrel Dynamics.`); if (f.length) exactOk++; }
L(`TYPO templates (middle-letter deletion): titles >= 9 letters still caught ${longOk}/${LONG.length}; titles < 9 letters caught ${shortCaught}/${SHORT.length} (expected 0); correct spelling caught ${exactOk}/${LONG.length + SHORT.length}`);
check('long-title typos tolerated', longOk >= LONG.length - 1, `${longOk}/${LONG.length}`);
check('short-title typos not tolerated', shortCaught === 0, `${shortCaught}/${SHORT.length}`);
check('exact spelling unaffected', exactOk === LONG.length + SHORT.length, `${exactOk}`);

// ── 4. Cue 5 function-word rule ─────────────────────────────────────────────
// (a) a sentence-initial determiner/pronoun/preposition after a bare noun is NOT a name
const FW = ['The Bureau of Fire Protection', 'A Fire Marshal', 'This Safety Office', 'He Said Goodbye', 'In Case Of Fire', 'And Then Some', 'Please Call Back'];
let fwBad = 0;
for (const fw of FW) {
  for (const [c, t] of cases3(`The crew shut down the main breaker. ${fw} arrived soon after.`)) {
    const f = jobs(t); if (f.some(x => /breaker/i.test(x))) { fwBad++; check(`cue5 function word (${c}): ${t}`, false, JSON.stringify(f)); }
  }
}
L(`CUE 5 function-word starts: ${FW.length} openers x 3 cases; "breaker" tagged = ${fwBad} (expected 0)`);
// (b) a real capitalised person name after the title still counts ("nurse. Grace Cruz")
const NAMES = ['Grace Cruz', 'Veronika Halden', 'Tomas Ilagan', 'Lorna Quizon'];
// Sentence case is asserted. Lower / Title case are reported only: cue 5 needs real capitalisation, and
// all-Title-Case text is disabled by the Group 5 heading guard (capitalisation carries no information).
for (const c of ['sentence', 'lower', 'Title']) {
  let ok = 0;
  for (const nm of NAMES) {
    let t = `We hired nurse ${nm} yesterday.`;
    if (c === 'lower') t = t.toLowerCase(); else if (c === 'Title') t = t.replace(/\b([a-z])/g, x => x.toUpperCase());
    if (jobs(t).some(x => /nurse/i.test(x))) ok++;
  }
  L(`CUE 5 title followed by a real name (${c}): "nurse" kept ${ok}/${NAMES.length}` + (c === 'sentence' ? '' : ' (reported only; no capital cue by design)'));
  if (c === 'sentence') check('nurse + real name kept (sentence case)', ok === NAMES.length, ok + '/' + NAMES.length);
}
check('nurse. Grace Cruz still works (sentence case)', jobs('We hired nurse Grace Cruz yesterday.').some(x => /nurse/i.test(x)));
check('C-154-style breaker not tagged', !jobs('Electrician Wilfredo Samonte shut down the main breaker. The Bureau of Fire Protection arrived.').some(x => /breaker/i.test(x)));

// ── 5. Extension restriction ────────────────────────────────────────────────
const E = [
  ['Why does my sourdough starter smell like vinegar?', ['starter'], 'possessive-only: no noun-modifier growth'],
  ['I asked my jeepney driver to wait.', ['driver'], 'possessive-only: no noun-modifier growth'],
  ['She is a jeepney driver in Cebu.', ['jeepney driver'], 'copular trigger: extends'],
  ['He works as a public school teacher.', ['public school teacher'], 'copular trigger: extends'],
  ['My registered nurse called me back.', ['registered nurse'], 'possessive but qualification adjective: extends'],
  ['I talked to my senior accountant today.', ['senior accountant'], 'possessive but qualification adjective: extends'],
];
for (const [t, exp, why] of E) {
  const f = jobs(t); const ok = exp.every(x => f.some(y => y.toLowerCase() === x)) && !f.some(y => y.toLowerCase().includes('sourdough'));
  check(`extension: ${t}`, ok, `got ${JSON.stringify(f)} want ${JSON.stringify(exp)} (${why})`);
}
L(`EXTENSION restriction: ${E.length} cases checked`);

L(failed ? `\nRESULT: ${failed} asserted check(s) FAILED` : '\nRESULT: all asserted checks passed');
process.exit(failed ? 1 : 0);
