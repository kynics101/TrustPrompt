#!/usr/bin/env node
/**
 * test-speed-diff.js — differential test for behavior-preserving speed optimizations of linguistic-detector.js.
 *
 *   node test-speed-diff.js gen                                   writes speed-diff-prompts.json (deterministic, seeded)
 *   node test-speed-diff.js run <detector.js> <out.json> [i n]    runs every prompt (shard i of n) and saves the FULL finding objects
 *   node test-speed-diff.js compare <ref.json> <new.json>         exact comparison (every field, order included); prints differences
 *
 * Prompt set (500+): the 161 test rows, the benign sets of Groups 4/4b/4c/4d/8, template prompts (name length x position x case),
 * long concatenations (1.5-2.4k characters), exact dictionary organizations / job titles in three letter cases, deliberately typo'd
 * dictionary entries (exercises the fuzzy passes), word-boundary variants ("x<Org>", "<Org>9", "(<Org>)"...), and non-ASCII
 * case-folding cases (dotless i, capital dotted I, Kelvin sign, long s, fullwidth letters, emoji, accents, combining marks, Greek
 * final sigma, sharp s, entries ending in "A.S" with a cedilla). The non-ASCII cases run in two modes: through normalizePath_C
 * (which applies NFKC and folds some of them) and "raw" (straight into scan(), so the detector itself meets them).
 * Everything is written by the assistant; no real personal data.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = __dirname, PROMPTS = path.join(ROOT, 'speed-diff-prompts.json');
const mode = process.argv[2];

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function extractArray(src, marker, occurrence = 0) {
  let idx = -1; for (let k = 0; k <= occurrence; k++) { idx = src.indexOf(marker, idx + 1); if (idx < 0) throw new Error('marker not found: ' + marker); }
  let i = src.indexOf('[', idx), depth = 0, start = i, q = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === "'" || c === '"' || c === '`') { q = c; continue; }
    if (c === '[') depth++; else if (c === ']') { depth--; if (depth === 0) break; }
  }
  return new Function('return ' + src.slice(start, i + 1))();
}

if (mode === 'gen') {
  const R = rng(20261108);
  const pick = (a) => a[Math.floor(R() * a.length)];
  global.window = {}; require('./terms-organizations.js'); require('./terms-occupations.js');
  const ORGS = globalThis.ORGANIZATIONS_DATA, JOBS = globalThis.OCCUPATIONS_DATA;
  const items = []; const add = (group, text, m = 'norm') => items.push({ id: `${group}-${items.length}`, group, text, mode: m });

  const rows = JSON.parse(fs.readFileSync(path.join(ROOT, 'after-g8.json'), 'utf8')).rows;
  rows.forEach(r => add('row', r.prompt));

  const t4 = fs.readFileSync(path.join(ROOT, 'test-group4-names.js'), 'utf8');
  const t4d = fs.readFileSync(path.join(ROOT, 'test-group4d.js'), 'utf8');
  const bbBase = extractArray(t4, 'const BB_BASE = ');
  const title = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());
  bbBase.forEach(s => { add('benign', s); add('benign', s.toLowerCase().replace(/[.?]$/, '')); add('benign', title(s)); });
  for (const m of ["benign('BH'", "benign('BL'", "benign('BS'"]) extractArray(t4, m, 0).forEach(s => add('benign', s));
  for (const [m, occ] of [['const benign = [', 0], ['const held = [', 0], ['const dep = [', 0]]) extractArray(t4d, m, occ).forEach(s => add('benign', s));
  extractArray(t4d, 'const ph = [', 0).forEach(p => add('benign', `Explain ${p} to a beginner.`));

  // template prompts: name length x position x case
  const G1 = ['Beatriz', 'Hilario', 'Imelda', 'Wilfredo', 'Cynthia', 'Marcus', 'Niño', 'Zoë'], SUR = ['Quintanilla', 'Dalisay', 'Whitfield', 'Peña', 'Muñoz', 'García', 'Santos-Lim', 'Müller'];
  const PART = ['Dela', 'De La', 'Van Der'], MID = ['Mae', 'Jay', 'Marie'];
  const TPL = [n => `${n} called me yesterday about the plan.`, n => `Please thank ${n} for the help with the move.`, n => `I would like to thank ${n}.`, n => `Hello, ${n} is here to see you.`];
  for (let len = 1; len <= 6; len++) for (let t = 0; t < TPL.length; t++) for (let k = 0; k < 3; k++) {
    const g = pick(G1), s = pick(SUR), m = pick(MID), pa = pick(PART);
    const nm = [g, `${g} ${s}`, `${g} ${m} ${s}`, `${g} ${m} ${pa} ${s}`, `${g} ${m} ${pick(G1)} ${pa} ${s}`, `${g} ${m} ${pick(G1)} ${pick(SUR)} ${pa} ${s}`][len - 1];
    add('template', TPL[t](nm)); if (k === 0) { add('template', title(TPL[t](nm))); add('template', TPL[t](nm).toLowerCase()); }
  }

  // exact dictionary entries (ASCII only here; the non-ASCII entries have their own group), three letter cases
  const asciiOrgs = ORGS.filter(x => !/[^\x00-\x7f]/.test(x) && x.length >= 6 && x.length <= 45), asciiJobs = JOBS.filter(x => x.length >= 6 && x.length <= 40);
  const ca = (s, i) => i === 0 ? s : i === 1 ? s.toUpperCase() : s.toLowerCase();
  for (let i = 0; i < 90; i++) add('exact-org', `We signed a contract with ${ca(pick(asciiOrgs), i % 3)} last week.`);
  for (let i = 0; i < 60; i++) add('exact-job', `She works as a ${ca(pick(asciiJobs), i % 3)} at the main office.`);

  // typos of dictionary entries (fuzzy passes): swap / delete / substitute / insert one character
  const mutate = (s, n) => { let a = s.split(''); for (let k = 0; k < n; k++) { const p = 1 + Math.floor(R() * (a.length - 2)), op = Math.floor(R() * 4); if (op === 0) { const t = a[p]; a[p] = a[p + 1] || a[p]; a[p + 1] = t; } else if (op === 1) a.splice(p, 1); else if (op === 2) a[p] = String.fromCharCode(97 + Math.floor(R() * 26)); else a.splice(p, 0, String.fromCharCode(97 + Math.floor(R() * 26))); } return a.join(''); };
  for (let i = 0; i < 70; i++) add('typo-org', `The meeting is hosted by ${mutate(pick(asciiOrgs), 1 + (i % 2))} next month.`);
  for (let i = 0; i < 50; i++) add('typo-job', `He is employed as a ${mutate(pick(asciiJobs), 1)} in the city.`);

  // word-boundary variants of exact entries
  const bnd = [x => `x${x}`, x => `${x}9`, x => `${x}-based`, x => `(${x})`, x => `${x}'s`, x => `${x}.`, x => `the${x}`, x => `${x}_`];
  for (let i = 0; i < 40; i++) { const e = pick(i % 2 ? asciiOrgs : asciiJobs); add('boundary', `Please send it to ${bnd[i % bnd.length](e)} today.`); }
  // dictionary entries that start or end with punctuation, and entries with regex specials
  const punct = ORGS.filter(x => /^\W|\W$/.test(x) && !/[^\x00-\x7f]/.test(x)); for (let i = 0; i < 30; i++) add('punct-entry', `Please send it to ${pick(punct)} today.`);

  // non-ASCII case-folding cases (both modes)
  const nonAscii = [];
  const nOrgs = ORGS.filter(x => /[^\x00-\x7f]/.test(x));
  for (let i = 0; i < 14; i++) nonAscii.push(`We signed a contract with ${pick(nOrgs)} last week.`);
  for (let i = 0; i < 8; i++) nonAscii.push(`The meeting is hosted by ${mutate(pick(nOrgs), 1)} next month.`);
  nonAscii.push(
    'Please contact Mıcrosoft about the invoice.', 'She works at İstanbul Technical University as a senior accountant.', 'MICROSOFT İ CORPORATION signed the deal.',
    'MarK Zuckerberg joined the call with MiKrosoft staff.', 'The Microſoft contract was signed by the ſenior accountant.', 'The ſchool of ſcience hired a nurse.',
    'Ｍｉｃｒｏｓｏｆｔ hired Dr. Ｌｏｒｎａ Ｐｉｎｅｄａ as a nurse.', 'Contact Lorna Pineda 😀 at Microsoft 🚀 about the senior accountant role.',
    'Café Société Générale hired José Peña as a chef.', 'Please thank Zoë Müller and Søren Ångström for the report.', 'José Peña works at the Banco de Oro as a teller.',
    'ΑΒΓ ΣΟΦΟΣ hired a nurse at Accenture.', 'Straße Bank hired a Senior accountant on Straße 5.', 'The nurse at Ålesund Hospital met Dr. Østergaard.',
    'The senior accountant of the Banco de Oro and the Bank of the Philippine Islands signed.', 'The university of the philippines and universty of the philippines are different spellings.',
    '𝐌𝐢𝐜𝐫𝐨𝐬𝐨𝐟𝐭 hired a nurse.', '①②③ Microsoft Corporation ① hired an accountant.',
    'İstanbul Bank hired a senior accountant.', 'The ı̇ bank of the philippine ıslands hired a nurse.', 'Accenture​ Philippines hired an accountant at Globe Telecom.',
    'José Rizal-Santos, a Registered Nurse at the Philippine General Hospital, spoke.', 'SENIOR ACCOUNTANT AT MICROSOFT — CONTACT LORNA PINEDA.', 'senior accountant at microsoft – contact lorna pineda.'
  );
  for (const t of nonAscii) { add('nonascii', t, 'norm'); add('nonascii', t, 'raw'); }
  for (let i = 0; i < 60; i++) { const r = rows[Math.floor(R() * rows.length)]; add('raw-row', r.prompt, 'raw'); }

  // long concatenations of rows (1.5k - 2.4k characters)
  const short = rows.filter(r => r.prompt.length <= 330).map(r => r.prompt);
  for (let i = 0; i < 70; i++) { let s = ''; const target = 1500 + Math.floor(R() * 900); while (s.length < target) s += (s ? ' ' : '') + pick(short); add('long', s); }

  fs.writeFileSync(PROMPTS, JSON.stringify(items, null, 0));
  const by = {}; items.forEach(x => by[x.group] = (by[x.group] || 0) + 1);
  console.log(`wrote ${PROMPTS}: ${items.length} prompts`, JSON.stringify(by));
} else if (mode === 'run') {
  const det = path.resolve(process.argv[3]), out = process.argv[4], si = parseInt(process.argv[5] || '0', 10), sn = parseInt(process.argv[6] || '1', 10);
  global.window = {}; global.globalThis = global; global.document = { title: 't' };
  const L = console.log; console.log = console.debug = console.warn = () => {};
  require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
  global.window.nlp = require('./lib/compromise.min.js');
  require('./normalizer.js'); require(det);
  const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
  const items = JSON.parse(fs.readFileSync(PROMPTS, 'utf8'));
  const res = {}; let ms = 0;
  items.forEach((it, i) => {
    if (i % sn !== si) return;
    const t0 = process.hrtime.bigint();
    try { const f = Det.scan(it.mode === 'raw' ? it.text : N.normalizePath_C(it.text)); res[it.id] = JSON.parse(JSON.stringify(f)); }
    catch (e) { res[it.id] = { error: String(e && e.message) }; }
    ms += Number(process.hrtime.bigint() - t0) / 1e6;
  });
  fs.writeFileSync(out, JSON.stringify({ detector: det, shard: [si, sn], scanMs: ms, results: res }));
  console.log = L; L(`shard ${si}/${sn}: ${Object.keys(res).length} prompts, scan time ${(ms / 1000).toFixed(1)} s -> ${out}`);
} else if (mode === 'compare') {
  const load = f => { const files = f.split(','); const r = {}; let ms = 0; for (const x of files) { const j = JSON.parse(fs.readFileSync(x, 'utf8')); Object.assign(r, j.results); ms += j.scanMs; } return { r, ms }; };
  const A = load(process.argv[3]), B = load(process.argv[4]);
  const items = JSON.parse(fs.readFileSync(PROMPTS, 'utf8')); const byId = new Map(items.map(i => [i.id, i]));
  let same = 0, diff = 0, missing = 0, errs = 0; const diffs = [];
  for (const it of items) {
    const a = A.r[it.id], b = B.r[it.id];
    if (a === undefined || b === undefined) { missing++; continue; }
    if (a && a.error) errs++;
    if (JSON.stringify(a) === JSON.stringify(b)) same++; else { diff++; diffs.push(it.id); }
  }
  console.log(`compared ${items.length} prompts: identical ${same}, DIFFERENT ${diff}, missing ${missing}, reference errors ${errs}; scan time ref ${(A.ms / 1000).toFixed(1)} s, new ${(B.ms / 1000).toFixed(1)} s`);
  for (const id of diffs.slice(0, 15)) { const it = byId.get(id); console.log(`  DIFF ${id} [${it.mode}] ${JSON.stringify(it.text.slice(0, 120))}\n     ref: ${JSON.stringify((A.r[id] || []).map ? A.r[id].map(f => f.patternId + ':' + f.rawMatch) : A.r[id])}\n     new: ${JSON.stringify((B.r[id] || []).map ? B.r[id].map(f => f.patternId + ':' + f.rawMatch) : B.r[id])}`); }
  process.exit(diff || missing ? 1 : 0);
} else { console.error('usage: gen | run <detector> <out> [i n] | compare <ref.json[,..]> <new.json[,..]>'); process.exit(2); }
