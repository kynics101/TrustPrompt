#!/usr/bin/env node
/**
 * test-names-extra.js — held-out evaluation of extra name data (terms-names-extra.js) and of Filipino name coverage.
 *
 *   node test-names-extra.js [--json out.json] [--fp] [--uncovered]     EXTRA=1 loads terms-names-extra.js; DET=<detector copy>
 *
 * Part A  multi-origin held-out names (test-data/names-heldout-multiorigin.txt, written before the data): found-name rate in the NO-CUE frames
 *         N1 plain sentence, N6 bare preposition, N7 the name alone (and N2 "Please ask <Name>..." as the cue control), split by group
 *         (cov / oth) and by anchoring (anchored = a word is in the name dictionary, or Compromise tags a person; unanchored = neither).
 * Part B  Filipino audit (test-data/names-heldout-filipino.txt, written before terms-names.js was opened): words / names with no dictionary entry;
 *         the same frames as Part A.
 * Part C  benign: 330 Title Case phrases x 7 frames (the Cause B set, taken from test-groupB-names.js), person findings.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log; console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
if (process.env.EXTRA) require(path.resolve(process.env.EXTRA === '1' ? './terms-names-extra.js' : process.env.EXTRA));
if (process.env.PHPROP) {   // PHPROP=1: merge the proposed Filipino vocabulary into NAMES_EXTRA_DATA (the detector reads that object when it loads)
  const p = require('./terms-names-ph-proposed.js'), e = globalThis.NAMES_EXTRA_DATA || (globalThis.NAMES_EXTRA_DATA = { firstNames: [], surnames: [] });
  e.firstNames = e.firstNames.concat(p.firstNames); e.surnames = e.surnames.concat(p.surnames);
}
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require(process.env.NORM ? path.resolve(process.env.NORM) : './normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const persons = raw => Det.scan(N.normalizePath_C(raw)).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
const strip = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.]/g, '');
// dictionary membership is measured against terms-names.js ONLY (the base file), so the audit does not change when the extra file is loaded
const base = require('./terms-names.js') || globalThis.NAMES_DATA;
const BASE = globalThis.__BASE_NAMES || (globalThis.__BASE_NAMES = { f: new Set(globalThis.NAMES_DATA.firstNames), s: new Set(globalThis.NAMES_DATA.surnames) });
const inBase = w => BASE.f.has(strip(w)) || BASE.s.has(strip(w));
const nlp = global.window.nlp, PERSON = ['Person', 'FirstName', 'LastName', 'MaleName', 'FemaleName'];
const cmpPerson = w => { const j = nlp(w.toLowerCase()).json({ terms: { tags: true } }); const t = (j[0] && j[0].terms[0] && j[0].terms[0].tags) || []; return t.some(x => PERSON.includes(x)); };
const words = n => n.split(/[\s-]+/).filter(Boolean);
const load = f => fs.readFileSync(path.join(__dirname, 'test-data', f), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => { const i = l.indexOf('|'); return { g: l.slice(0, i), n: l.slice(i + 1) }; });
const FR = { N1: n => `During the review, ${n} presented the new budget to the team.`, N6: n => `Please send the notes to ${n} tomorrow.`, N7: n => `${n}`, N2: n => `Please ask ${n} about the schedule.` };
const foundName = (raw, n) => { const ws = words(n.replace(/\./g, '')); return persons(raw).some(m => ws.every(w => m.toLowerCase().replace(/\./g, '').includes(w.toLowerCase()))); };
const measure = (list) => {
  const out = {};
  for (const x of list) {
    x.anch = words(x.n).some(w => inBase(w) || cmpPerson(w));
    for (const [f, fn] of Object.entries(FR)) {
      const ok = foundName(fn(x.n), x.n);
      for (const key of ['ALL', x.g, x.anch ? 'anchored' : 'unanchored', x.g + '/' + (x.anch ? 'anch' : 'unanch')]) {
        const o = out[key] || (out[key] = { n: new Set() }); o.n.add(x.n); o[f] = (o[f] || 0) + (ok ? 1 : 0);
      }
    }
  }
  return out;
};
const show = (title, out) => {
  L(title);
  for (const key of Object.keys(out).sort()) { const o = out[key], n = o.n.size; L(`  ${key.padEnd(18)} n=${String(n).padStart(3)}   ` + Object.keys(FR).map(f => `${f} ${String(o[f] || 0).padStart(3)} (${(100 * (o[f] || 0) / n).toFixed(0)}%)`).join('   ')); }
};
const multi = load('names-heldout-multiorigin.txt'), fil = load(process.env.FIL || 'names-heldout-filipino.txt');
if (process.env.PHPROP) { const p = require('./terms-names-ph-proposed.js'), P = new Set([...p.firstNames, ...p.surnames]); const W = new Set(fil.flatMap(x => words(x.n)).map(strip)); L(`proposed PH words: ${p.firstNames.length} given + ${p.surnames.length} surnames; words that also occur in this held-out list: ${[...W].filter(w => P.has(w)).length}`); }
const mo = measure(multi); show(`Part A: ${multi.length} multi-origin names (frames ${Object.entries(FR).map(([k, fn]) => k + '=' + JSON.stringify(fn('<Name>'))).join('  ')})`, mo);
// Part B: Filipino audit
const noWord = fil.filter(x => !words(x.n).some(inBase)), allW = [...new Set(fil.flatMap(x => words(x.n)).map(strip))];
const missingW = allW.filter(w => !inBase(w));
L(`Part B: ${fil.length} Filipino names; names with NO word in terms-names.js: ${noWord.length}; distinct words ${allW.length}, not in terms-names.js ${missingW.length}`);
const byCat = {}; fil.forEach(x => { const c = byCat[x.g] || (byCat[x.g] = { n: 0, none: 0 }); c.n++; if (!words(x.n).some(inBase)) c.none++; });
L('  by category (names with no word in the base dictionary): ' + Object.entries(byCat).map(([k, v]) => `${k} ${v.none}/${v.n}`).join(', '));
if (process.argv.includes('--uncovered')) L('  words not in base: ' + missingW.join(' '));
const fo = measure(fil); show('  Filipino held-out, found-name rate:', fo);
// Part C: benign
const gsrc = fs.readFileSync(path.join(__dirname, 'test-groupB-names.js'), 'utf8');
const take = name => gsrc.match(new RegExp('const ' + name + ' = (.*);\\n'))[1];
const A1 = eval(take('A1')), A2 = eval(take('A2')), A3 = eval(take('A3'));
const PHR = []; for (let i = 0; i < A1.length * A2.length && PHR.length < 330; i++) { const a = A1[(i * 7) % A1.length], b = A2[Math.floor(i / A1.length) % A2.length], c = A3[(i * 5) % A3.length]; const p = i % 3 === 0 ? `${a} ${b} ${c}` : (i % 3 === 1 ? `${a} ${b}` : `${b} ${c}`); if (!PHR.includes(p)) PHR.push(p); }
const BF = { B1: p => p, B2: p => `Chapter 4: ${p}`, B3: p => `Today we studied ${p} in class.`, B4: p => `Please add ${p} to the list.`, B5: p => `We bought it from ${p} last week.`, B6: p => `A gift for ${p} is on sale.`, B7: p => `Nothing goes well with ${p} at dinner.` };
let tot = 0; const fp = [], per = {};
for (const [f, fn] of Object.entries(BF)) { let c = 0; for (const p of PHR) { const m = persons(fn(p)); if (m.length) { c++; fp.push(f + ': ' + fn(p) + ' => ' + m.join(' / ')); } } per[f] = c; tot += c; }
L(`Part C: ${PHR.length} benign phrases x 7 frames: person findings ${tot}/${PHR.length * 7}  (${Object.entries(per).map(([k, v]) => k + ' ' + v).join(', ')})`);
if (process.argv.includes('--fp')) fp.slice(0, 60).forEach(x => L('   FP ' + x));
const ji = process.argv.indexOf('--json'); if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ multi: Object.fromEntries(Object.entries(mo).map(([k, v]) => [k, Object.assign({}, v, { n: v.n.size })])), fil: Object.fromEntries(Object.entries(fo).map(([k, v]) => [k, Object.assign({}, v, { n: v.n.size })])), tot, per, missingW, fp }, null, 1));
