#!/usr/bin/env node
/**
 * test-compromise-pin.js — fails when the Compromise build or the tag behaviour that Path C depends on changes.
 * Compromise is VENDORED (lib/compromise.min.js, v14.12.0; download-compromise.js fetches that exact version), it is not an
 * npm dependency, so there is nothing to pin in package.json / package-lock.json. The pin is this file: a SHA-256 of the
 * vendored build, plus the behaviours the Group 3 rules rely on (R2, R3, R4, R6, R8). If you upgrade Compromise on purpose,
 * update EXPECTED_SHA256 and re-run the Group 3 tests before trusting the new tags.
 * Usage: node test-compromise-pin.js   (fast, no detector scan)
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const EXPECTED_VERSION = '14.12.0';
const EXPECTED_SHA256 = '59bbc63bdde7d389259180fe9b2114f8010562e40ad7cac25916d512cea04b40';
const file = path.join(__dirname, 'lib', 'compromise.min.js');
const buf = fs.readFileSync(file);
const nlp = require(file);
let failed = 0;
const check = (label, ok, detail) => { if (!ok) { failed++; console.log('FAIL ' + label + (detail ? ' => ' + detail : '')); } };

check('vendored build hash', crypto.createHash('sha256').update(buf).digest('hex') === EXPECTED_SHA256, 'lib/compromise.min.js changed');
check('version string', buf.toString('utf8').includes('version="' + EXPECTED_VERSION + '"'), 'expected ' + EXPECTED_VERSION);

const iso = w => (nlp(w).json({ terms: { tags: true } })[0].terms[0].tags || []);
const ctx = (s, word) => { const t = nlp(s).json({ terms: { tags: true } }).reduce((a, x) => a.concat(x.terms), []).find(x => x.text === word); return (t && t.tags) || []; };
const has = (tags, ...want) => want.every(w => tags.includes(w));
const person = tags => ['Person', 'FirstName', 'LastName'].some(t => tags.includes(t));

// R2: closed-class / date words (lowercased lookup)
for (const [w, tag] of [['what', 'QuestionWord'], ['which', 'QuestionWord'], ['thursday', 'WeekDay'], ['january', 'Month'], ['tomorrow', 'Date'], ['without', 'Preposition'], ['per', 'Preposition']])
  check(`R2 iso(${w}) has ${tag}`, has(iso(w), tag), iso(w).join('/'));
// month names that are also first names: the detector uses its own name set (may/march are NOT Month-tagged by Compromise);
// april/june/august/jun being Month-tagged is documented here so a change is noticed
for (const w of ['april', 'june', 'august', 'jun']) check(`R2 iso(${w}) has Month`, has(iso(w), 'Month'), iso(w).join('/'));
for (const w of ['may', 'march']) check(`R2 iso(${w}) has NO Month tag (documented limitation)`, !has(iso(w), 'Month'), iso(w).join('/'));
// R2: ordinary nouns are NOT closed-class (so names/nouns are not rejected by mistake)
for (const w of ['grade', 'clearance', 'employment', 'hazel', 'grace', 'will']) check(`R2 iso(${w}) has no closed-class tag`, !['QuestionWord', 'Determiner', 'Pronoun', 'Preposition', 'Conjunction', 'Adverb', 'Expression', 'Value', 'Negative', 'Date', 'WeekDay', 'Month', 'Time'].some(t => iso(w).includes(t)), iso(w).join('/'));
// R3: imperative verbs are Verb and not Person; first names that are verbs are Person in context
for (const [s, w] of [['Tell Nathaniel Ocampo that it arrived.', 'Tell'], ['Thank Nurse Karen Tiongson for the help.', 'Thank'], ['Introduce Joshua Pangilinan to the team.', 'Introduce']])
  check(`R3 "${w}" is a Verb and not a Person in context`, has(ctx(s, w), 'Verb') && !person(ctx(s, w)), ctx(s, w).join('/'));
for (const [s, w] of [['Mark Santos approved the budget.', 'Mark'], ['Grace Reyes approved the budget.', 'Grace'], ['Will Santos approved the budget.', 'Will'], ['Hazel Cruz approved the budget.', 'Hazel']])
  check(`R3 "${w}" stays a Person in context`, person(ctx(s, w)), ctx(s, w).join('/'));
// R4: job-title words that are also surnames/given names
for (const w of ['mason', 'miller', 'taylor', 'cooper', 'fisher', 'turner']) check(`R4 iso(${w}) is Person-tagged (protected from title strip)`, person(iso(w)), iso(w).join('/'));
// R6: Person evidence for the heading guard
for (const [s, w] of [['Please email Maria Santos today.', 'Maria'], ['Please email Maria Santos today.', 'Santos'], ['Thank Nurse Karen Tiongson for it.', 'Karen']])
  check(`R6 "${w}" is Person-tagged`, person(ctx(s, w)), ctx(s, w).join('/'));
// R8: unknown names get only Noun/Singular; ordinary words carry an extra lexicon tag
const COMMON = ['Verb', 'Adjective', 'Adverb', 'Preposition', 'Uncountable', 'Gerund', 'Conjunction', 'Determiner', 'Pronoun', 'Modal', 'Auxiliary'];
for (const w of ['maricel', 'pacheco', 'dionisio', 'villacorta', 'dalisay', 'tiongson', 'ocampo']) check(`R8 iso(${w}) has no Person and no common-word tag`, !person(iso(w)) && !COMMON.some(t => iso(w).includes(t)), iso(w).join('/'));
for (const w of ['report', 'quarterly', 'volunteer', 'annual', 'fair', 'water', 'outline', 'learning']) check(`R8 iso(${w}) has a common-word tag`, COMMON.some(t => iso(w).includes(t)), iso(w).join('/'));
// honorific tags (R1 uses its own list; these document what Compromise does)
for (const w of ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof']) check(`honorific ${w} is Honorific-tagged`, has(ctx(`Please write to ${w}. Lopez today.`, w), 'Honorific'), ctx(`Please write to ${w}. Lopez today.`, w).join('/'));

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall Compromise behaviour checks passed (' + EXPECTED_VERSION + ')');
process.exit(failed ? 1 : 0);
