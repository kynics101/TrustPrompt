#!/usr/bin/env node
/**
 * test-speed-unit.js — unit-level differential tests for the Group 9 speed optimizations.
 *   node test-speed-unit.js <reference-detector.js> [new-detector.js]      (new defaults to ./linguistic-detector.js)
 *
 *  A. fuzzyFind: the function (with levenshteinDistance / isPrefixSuffixVariation) is cut out of both detector files and run on the same
 *     random inputs: several patterns per text so the per-text cache is exercised, mixed ASCII / accented / folding characters, window sizes
 *     1-4, distance 1 and 2. The returned arrays must be identical (content AND order).
 *  B. levenshteinWithin (only if the new file has it): (levenshteinWithin(a,b,d) === (levenshteinDistance(a,b) <= d)) for random pairs.
 *  C. PASS 1 prefilter: for each test text and EVERY organization / job-title entry, an entry that the prefilter would skip must also fail the
 *     original RegExp (so the prefilter has no false negatives). Texts include case-folding characters and all the "nonascii" prompts.
 * Everything is generated here from a fixed seed. Exit code 1 on any difference.
 */
'use strict';
const fs = require('fs'), path = require('path');
const refFile = path.resolve(process.argv[2] || ''), newFile = path.resolve(process.argv[3] || path.join(__dirname, 'linguistic-detector.js'));
if (!process.argv[2]) { console.error('usage: node test-speed-unit.js <reference-detector.js> [new-detector.js]'); process.exit(2); }
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const R = rng(424242); const pick = a => a[Math.floor(R() * a.length)]; const ri = n => Math.floor(R() * n);

function cut(file) {
  const src = fs.readFileSync(file, 'utf8');
  const a = src.indexOf('function levenshteinDistance('), b = src.indexOf('Escape special regex characters');
  if (a < 0 || b < 0) throw new Error('cannot cut fuzzy functions from ' + file);
  const body = src.slice(a, b).replace(/\/\*\*[\s*]*$/, '');
  const names = ['levenshteinDistance', 'isPrefixSuffixVariation', 'fuzzyFind', 'levenshteinWithin'].filter(n => body.includes('function ' + n + '('));
  return new Function(body + `\n return { ${names.map(n => `${n}: ${n}`).join(', ')} };`)();
}
const REF = cut(refFile), NEW = cut(newFile);
const HAS_FIRSTLAST = fs.readFileSync(newFile, 'utf8').includes('firstLast');
let fails = 0; const report = (label, msg) => { fails++; if (fails <= 12) console.log('  DIFF ' + label + ' ' + msg); };

// ── A. fuzzyFind ──────────────────────────────────────────────────────────────
const ALPHA = 'abcdefghijklmnopqrstuvwxyz'.split('').concat(['é', 'ñ', 'ı', 'ſ', 'K', 'ß', 'ş', 'İ']);
const randWord = () => { let w = ''; const n = 2 + ri(9); for (let i = 0; i < n; i++) w += pick(ALPHA); return w; };
const SEPS = [' ', ' ', ' ', ', ', '. ', '-', ' (', ') ', '; ', '  '];
let calls = 0, nonEmpty = 0;
for (let t = 0; t < 4000; t++) {
  const words = []; const nw = 1 + ri(40); for (let i = 0; i < nw; i++) words.push(randWord());
  let text = ''; words.forEach((w, i) => { text += (i ? pick(SEPS) : '') + (R() < 0.15 ? w.toUpperCase() : w); });
  const patterns = [];
  for (let p = 0; p < 12; p++) {
    const k = 1 + ri(4); let pat;
    if (R() < 0.6 && words.length >= k) {                   // a window of the text with 0-3 edits, so real matches occur
      const s = ri(words.length - k + 1); pat = words.slice(s, s + k).join(' ');
      for (let e = ri(4); e > 0; e--) { const a = pat.split(''), q = ri(a.length), op = ri(3); if (op === 0) a.splice(q, 1); else if (op === 1) a.splice(q, 0, pick(ALPHA)); else a[q] = pick(ALPHA); pat = a.join(''); }
    } else { const a = []; for (let i = 0; i < k; i++) a.push(randWord()); pat = a.join(' '); }
    if (R() < 0.3) pat = pat.replace(/^./, c => c.toUpperCase());
    patterns.push(pat);
  }
  if (R() < 0.05) patterns.push('   ');                    // pattern with no words
  for (const pat of patterns) for (const d of [1, 2]) {
    calls++;
    const a = REF.fuzzyFind(text, pat, d), b = NEW.fuzzyFind(text, pat, d);
    if (a.length) nonEmpty++;
    if (JSON.stringify(a) !== JSON.stringify(b)) report('A fuzzyFind', `text=${JSON.stringify(text)} pattern=${JSON.stringify(pat)} d=${d} ref=${JSON.stringify(a)} new=${JSON.stringify(b)}`);
    if (HAS_FIRSTLAST && d === 1) {   // A2: firstLast=true must equal "reference result, then the caller's first/last-letter rule"
      const pl = pat.toLowerCase(), want = a.filter(m => !(m[0] !== pl[0] || m[m.length - 1] !== pl[pl.length - 1])), got = NEW.fuzzyFind(text, pat, 1, true);
      if (JSON.stringify(want) !== JSON.stringify(got)) report('A2 fuzzyFind firstLast', `text=${JSON.stringify(text)} pattern=${JSON.stringify(pat)} want=${JSON.stringify(want)} got=${JSON.stringify(got)}`);
    }
  }
}
console.log(`A. fuzzyFind: ${calls} calls on 4000 random texts (${nonEmpty} calls returned matches): ${fails === 0 ? 'identical' : 'DIFFERENT'}`);

// ── B. levenshteinWithin ──────────────────────────────────────────────────────
if (NEW.levenshteinWithin) {
  const before = fails; let n = 0, within = 0;
  for (let i = 0; i < 300000; i++) {
    const a = randWord() + (R() < 0.5 ? ' ' + randWord() : '');
    let b = a; for (let e = ri(5); e > 0; e--) { const x = b.split(''), q = ri(x.length + 1), op = ri(3); if (op === 0) x.splice(q, 1); else if (op === 1) x.splice(q, 0, pick(ALPHA)); else if (q < x.length) x[q] = pick(ALPHA); b = x.join(''); }
    if (R() < 0.1) b = randWord();
    for (const d of [1, 2]) { n++; const e = REF.levenshteinDistance(a, b) <= d; if (e) within++; if (e !== NEW.levenshteinWithin(a, b, d)) report('B levenshteinWithin', `a=${JSON.stringify(a)} b=${JSON.stringify(b)} d=${d} expected ${e}`); }
  }
  console.log(`B. levenshteinWithin: ${n} (a, b, d) cases, ${within} within the limit: ${fails === before ? 'identical' : 'DIFFERENT'}`);
} else console.log('B. levenshteinWithin: not present in the new detector (skipped)');

// ── C. PASS 1 prefilter has no false negatives ────────────────────────────────
{
  global.window = {}; require('./terms-organizations.js'); require('./terms-occupations.js');
  const ORGS = globalThis.ORGANIZATIONS_DATA, JOBS = globalThis.OCCUPATIONS_DATA.map(x => x.toLowerCase());
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ASCII = /^[\x00-\x7f]*$/;
  const prompts = JSON.parse(fs.readFileSync(path.join(__dirname, 'speed-diff-prompts.json'), 'utf8'));
  const texts = prompts.filter(p => p.group === 'nonascii').map(p => p.text);
  for (let i = 0; i < 25; i++) texts.push(pick(prompts).text);
  texts.push('MICROSOFT CORPORATION, MiKrosoft, Microſoft, Mıcrosoft, İBM, ACCENTURE, accenture inc., Globe Telecom, SENIOR ACCOUNTANT, senior accountant, Registered Nurse');
  texts.push('SGV & Co. and Ali & Patel Real Estate A.Ş and "Abad Outsourcing Co., Ltd." and (Banco de Oro) and 7-Eleven');
  const before = fails; let skipped = 0, tested = 0;
  for (const text of texts) {
    const tl = text.toLowerCase();
    for (const org of ORGS) {
      const ol = org.toLowerCase();
      if (!(ASCII.test(ol) && tl.indexOf(ol) === -1)) continue;     // would NOT be skipped by the prefilter
      skipped++;
      const nonWord = /\W$/.test(ol), tb = nonWord ? '(?=[\\s,;:.!?\'"\\)]|$)' : '\\b';
      if (new RegExp(`\\b${esc(ol)}${tb}`, 'gi').test(text)) report('C org prefilter false negative', `${JSON.stringify(ol)} in ${JSON.stringify(text.slice(0, 80))}`);
    }
    for (const title of JOBS) {
      if (!(ASCII.test(title) && tl.indexOf(title.toLowerCase()) === -1)) continue;
      skipped++;
      if (new RegExp(`\\b${esc(title)}\\b`, 'gi').test(text)) report('C job prefilter false negative', `${JSON.stringify(title)} in ${JSON.stringify(text.slice(0, 80))}`);
    }
    tested++;
  }
  console.log(`C. PASS 1 prefilter: ${tested} texts x ${ORGS.length + JOBS.length} entries, ${skipped} entry/text pairs skipped by the prefilter, every one also fails the original RegExp: ${fails === before ? 'OK' : 'FALSE NEGATIVES FOUND'}`);
}
console.log(fails ? `\nTOTAL DIFFERENCES: ${fails}` : '\nno differences');
process.exit(fails ? 1 : 0);
