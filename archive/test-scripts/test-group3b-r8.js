#!/usr/bin/env node
/**
 * test-group3b-r8.js — name-protection test for R8 (phrase-of-ordinary-words rule). Written by the assistant;
 * all names are fictional two-word names whose words are both ordinary English words.
 * Prints, per frame kind and case, how many frames report the name. Run it against two builds
 * (DET=<copy with R8 disabled>) and compare: lost-by-R8 = found without R8 and not found with it.
 * Output: one JSON line per frame to the file given in R8_OUT (default r8-results.json), summary on stdout.
 */
const { L, persons, lc, title, touches } = require('./test-group3b-lib.js');
const fs = require('fs');
const NAMES = ['Hazel Grace', 'Faith Hope', 'Joy Summers', 'Hunter Rose', 'Taylor Baker', 'Ruby Rain', 'Summer Dawn', 'Amber Wood',
  'Violet Stone', 'Heather Bell', 'Ivy Fields', 'Dean Hill', 'Grant Wells', 'Rose Miller'];
const FRAMES = [
  ['uncued subject', n => `${n} will review the draft.`],
  ['uncued after to', n => `Please send the file to ${n} today.`],
  ['uncued after with', n => `I talked with ${n} yesterday.`],
  ['cued self-intro', n => `My name is ${n}.`],
  ['cued honorific', n => `Please email Dr. ${n} about the schedule.`],
  ['cued appositive', n => `${n}, a nurse, called me.`],
];
const CASES = [['sentence', s => s], ['lower', s => lc(s)], ['Title', s => title(s)]];
const res = [];
for (const n of NAMES) for (const [fk, f] of FRAMES) for (const [ck, c] of CASES) {
  const t = c(f(n)); const ps = persons(t);
  res.push({ name: n, frame: fk, case: ck, found: touches(ps, n), out: ps });
}
fs.writeFileSync(process.env.R8_OUT || 'r8-results.json', JSON.stringify(res));
const by = {};
for (const r of res) { const k = r.frame + ' | ' + r.case; by[k] = by[k] || [0, 0]; by[k][1]++; if (r.found) by[k][0]++; }
L(`R8 name protection: ${res.length} frames (${NAMES.length} names x ${FRAMES.length} frames x ${CASES.length} cases); name reported in ${res.filter(r => r.found).length}`);
for (const [k, v] of Object.entries(by)) L('  ' + k.padEnd(28) + v[0] + '/' + v[1]);
