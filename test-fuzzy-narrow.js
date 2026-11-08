#!/usr/bin/env node
/**
 * test-fuzzy-narrow.js — held-out evaluation of the Group 10 narrowing of the fuzzy ORGANIZATION match (and removal of the org keyword-proximity pass).
 *
 *   node test-fuzzy-narrow.js gen                              writes fuzzy-narrow-prompts.json (seeded; nothing from the 161 rows or the speed-diff set is reused)
 *   node test-fuzzy-narrow.js run <detector.js> <out.json> [i n]   scans every prompt (shard i of n); records [patternId, rawMatch] of every nlp_* finding
 *   node test-fuzzy-narrow.js report <old.json> <new.json> <nofuzzy.json>
 *
 * Sets (all dictionary entries are picked by a seeded shuffle and exclude any entry that occurs in the 161 test rows or the speed-diff prompts):
 *   A   300 multi-word organizations (>= 12 chars, a word of >= 6 letters)  x 4 edit types (substitute / insert / delete / adjacent transposition,
 *       one slip inside a long word)  x 3 sentence templates  x 3 cases (as in the dictionary, UPPER, lower)  = 10,800 prompts. Found = an
 *       nlp_organization finding equal (case-insensitive) to the typo'd phrase.
 *   B   expected-loss sets (the narrow rule is EXPECTED to lose some of these): B1 two edits in one word, B2 one edit in each of two words, B3 one word
 *       missing, B4 words in reversed order, B5 200 single-word brands with one edit, B6 short multi-word names (< 10 chars) with one edit,
 *       B7 one edit in a word of 3-5 letters of a long multi-word name.
 *   C   300 benign sentences (ordinary phrases that sit close to short brand names, in lower and Title Case, in 5 templates). Any nlp_* finding that the
 *       NEW build has and the OLD build does not have is reported: that is the stop condition.
 *   D   50 fictional multi-word organizations with corporate suffixes (not in the dictionary): OLD and NEW must find the same ones.
 * Everything here is generated; no real personal data.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const ROOT = __dirname, FILE = path.join(ROOT, 'fuzzy-narrow-prompts.json');
const mode = process.argv[2];
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

if (mode === 'gen') {
  const R = rng(20261109), ri = n => Math.floor(R() * n), pick = a => a[ri(a.length)];
  global.window = {}; require('./terms-organizations.js'); require('./terms-occupations.js');
  const ORGS = globalThis.ORGANIZATIONS_DATA;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = ri(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // texts whose entries must not be reused
  let used = JSON.parse(fs.readFileSync(path.join(ROOT, 'speed-diff-prompts.json'), 'utf8')).map(p => p.text).join(' \n ');
  used += ' \n ' + JSON.parse(fs.readFileSync(path.join(ROOT, 'after-g8.json'), 'utf8')).rows.map(r => r.prompt).join(' \n ');
  used = used.toLowerCase();
  const clean = ORGS.filter(o => /^[A-Za-z0-9 ]+$/.test(o) && !/ {2}/.test(o));
  const fresh = e => used.indexOf(e.toLowerCase()) === -1;
  const words = e => e.split(' ');
  const longWords = e => words(e).filter(w => /^[A-Za-z]{6,}$/.test(w));
  const poolA = shuffle(clean.filter(e => words(e).length >= 2 && e.length >= 12 && e.length <= 40 && longWords(e).length >= 1 && fresh(e)));
  const L = 'abcdefghijklmnopqrstuvwxyz';
  const otherLetter = c => { let x; do { x = L[ri(26)]; } while (x === c.toLowerCase()); return x; };
  const edit = (w, type) => {                       // one slip inside the word (never the first or last letter)
    const lo = 1, hi = w.length - 2; let p = lo + ri(hi - lo + 1);
    if (type === 'sub') return w.slice(0, p) + otherLetter(w[p]) + w.slice(p + 1);
    if (type === 'ins') return w.slice(0, p) + L[ri(26)] + w.slice(p);
    if (type === 'del') return w.slice(0, p) + w.slice(p + 1);
    for (let k = 0; k < 12; k++) { p = lo + ri(hi - lo); if (w[p] !== w[p + 1]) return w.slice(0, p) + w[p + 1] + w[p] + w.slice(p + 2); }
    return w.slice(0, 1) + w[2] + w[1] + w.slice(3);
  };
  const replaceWord = (e, idx, nw) => words(e).map((w, i) => i === idx ? nw : w).join(' ');
  const items = []; const add = (set, text, meta) => items.push(Object.assign({ id: `${set}-${items.length}`, set, text }, meta));
  const TPL = [x => `The contract was signed by ${x} last week.`, x => `Please send the invoice to ${x}, thank you.`, x => `${x} announced a new office in Cebu.`];
  const CASES = [s => s, s => s.toUpperCase(), s => s.toLowerCase()];

  // A
  const A = poolA.slice(0, 300), usedA = new Set(A);
  for (const org of A) for (const type of ['sub', 'ins', 'del', 'trans']) {
    const lw = longWords(org), target = pick(lw), idx = words(org).indexOf(target), typo = replaceWord(org, idx, edit(target, type));
    for (let t = 0; t < 3; t++) for (let c = 0; c < 3; c++) add('A', TPL[t](CASES[c](typo)), { org, typo, type, expect: typo.toLowerCase() });
  }
  const rest = poolA.slice(300).filter(e => !usedA.has(e));
  // B1 two edits in one word, B2 one edit in each of two words, B3 missing word, B4 reversed order, B7 slip in a short word
  const take = (pred, n) => rest.filter(pred).splice(0, n);
  const b1 = take(e => longWords(e).length >= 1, 100).map(e => { const w = pick(longWords(e)), i = words(e).indexOf(w); let n = edit(w, 'sub'); const w2 = n.length >= 6 ? edit(n, pick(['ins', 'del', 'sub'])) : n + 'x'; return [e, replaceWord(e, i, w2)]; });
  b1.forEach(([e, t]) => add('B1', TPL[0](t), { org: e, typo: t, expect: t.toLowerCase() }));
  take(e => longWords(e).length >= 2, 100).forEach(e => { const lw = longWords(e); let t = e; for (const w of lw.slice(0, 2)) t = replaceWord(t, words(t).indexOf(w), edit(w, 'sub')); add('B2', TPL[0](t), { org: e, typo: t, expect: t.toLowerCase() }); });
  take(e => words(e).length >= 3, 100).forEach(e => { const w = words(e), k = 1 + ri(w.length - 1), t = w.filter((_, i) => i !== k).join(' '); add('B3', TPL[0](t), { org: e, typo: t, expect: t.toLowerCase() }); });
  take(e => words(e).length >= 3 && words(e).length <= 4, 100).forEach(e => { const t = words(e).reverse().join(' '); add('B4', TPL[0](t), { org: e, typo: t, expect: e.toLowerCase(), canonical: true }); });
  take(e => longWords(e).length >= 1 && words(e).some(w => /^[A-Za-z]{4,5}$/.test(w)), 100).forEach(e => { const w = words(e).find(x => /^[A-Za-z]{4,5}$/.test(x)); if (!w) return; const t = replaceWord(e, words(e).indexOf(w), edit(w, 'sub')); add('B7', TPL[0](t), { org: e, typo: t, expect: t.toLowerCase() }); });
  const single = shuffle(clean.filter(e => /^[A-Za-z]{8,}$/.test(e) && fresh(e))).slice(0, 200);
  single.forEach((e, i) => { const t = edit(e, ['sub', 'ins', 'del', 'trans'][i % 4]); add('B5', TPL[0](t), { org: e, typo: t, expect: t.toLowerCase() }); });
  const shortMulti = shuffle(clean.filter(e => words(e).length >= 2 && e.length >= 7 && e.length < 10 && fresh(e) && words(e).some(w => w.length >= 4))).slice(0, 100);
  shortMulti.forEach(e => { const w = words(e).reduce((a, b) => b.length > a.length ? b : a), t = replaceWord(e, words(e).indexOf(w), edit(w, 'sub')); add('B6', TPL[0](t), { org: e, typo: t, expect: t.toLowerCase() }); });

  // C benign sentences
  const phrases = ['make it', 'move into', 'best way', 'the philippines', 'a university', 'to store', 'take it', 'make up', 'move on', 'best wishes', 'east side', 'the islands', 'a hospital', 'the bank',
    'a company', 'the store', 'big data', 'good morning', 'open source', 'real estate', 'high school', 'city hall', 'student council', 'the department', 'our office', 'the library', 'fresh start',
    'home base', 'city center', 'main street'];
  const title = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());
  const CT = [p => `Can you explain ${p} in simple terms?`, p => `I was thinking about ${p} on my way home.`, p => `${p.charAt(0).toUpperCase() + p.slice(1)} is what the teacher asked us to discuss.`,
    p => `We talked about ${p} and then went to lunch.`, p => `What do you think about ${p}?`];
  for (const p of phrases.concat(phrases.map(title))) for (const t of CT) add('C', t(p), { phrase: p });

  // D fictional organizations with suffixes (not in the dictionary)
  const FIRST = ['Quintanilla', 'Dalisay', 'Whitfield', 'Aldridge', 'Montoya', 'Kowalski', 'Abella', 'Thorne', 'Villacorta', 'Ferrer', 'Brightwater', 'Stonebridge', 'Larkspur', 'Hollowell', 'Marigold'];
  const SECOND = ['Medical Supplies', 'Food Products', 'Steel Works', 'Cargo Services', 'Learning Center', 'Power Systems', 'Textile Mills', 'Seafood Traders', 'Printing Press', 'Farm Equipment'];
  const SUFFIX = ['Inc', 'Corporation', 'Ltd', 'Holdings', 'Enterprises', 'Industries', 'Ventures', 'Pharmaceuticals', 'Airlines', 'Motors', 'Foundation', 'Association', 'Cooperative', 'LLC'];
  const seen = new Set(); let guard = 0;
  while (seen.size < 50 && guard++ < 2000) { const n = `${pick(FIRST)} ${pick(SECOND)} ${pick(SUFFIX)}`; if (seen.has(n) || ORGS.some(o => o.toLowerCase() === n.toLowerCase())) continue; seen.add(n); add('D', `Please send the contract to ${n} today.`, { org: n, expect: n.toLowerCase() }); }

  fs.writeFileSync(FILE, JSON.stringify(items));
  const by = {}; items.forEach(x => by[x.set] = (by[x.set] || 0) + 1);
  console.log(`wrote ${FILE}: ${items.length} prompts`, JSON.stringify(by));
} else if (mode === 'run') {
  const det = path.resolve(process.argv[3]), out = process.argv[4], si = parseInt(process.argv[5] || '0', 10), sn = parseInt(process.argv[6] || '1', 10);
  global.window = {}; global.globalThis = global; global.document = { title: 't' };
  const L = console.log; console.log = console.debug = console.warn = () => {};
  require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
  vm.runInThisContext(fs.readFileSync(path.join(ROOT, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
  global.window.nlp = require('./lib/compromise.min.js');
  require('./normalizer.js'); require(det);
  const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
  const items = JSON.parse(fs.readFileSync(FILE, 'utf8')); const res = {}; const t0 = Date.now();
  items.forEach((it, i) => { if (i % sn !== si) return; try { res[it.id] = Det.scan(N.normalizePath_C(it.text)).filter(f => /^nlp_/.test(f.patternId)).map(f => [f.patternId, f.rawMatch]); } catch (e) { res[it.id] = { error: String(e.message) }; } });
  fs.writeFileSync(out, JSON.stringify({ detector: det, results: res }));
  console.log = L; L(`shard ${si}/${sn}: ${Object.keys(res).length} prompts in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
} else if (mode === 'report') {
  const load = list => { const r = {}; for (const f of list.split(',')) Object.assign(r, JSON.parse(fs.readFileSync(f, 'utf8')).results); return r; };
  const OLD = load(process.argv[3]), NEW = load(process.argv[4]), NOF = load(process.argv[5]);
  const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const norm = s => String(s).toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:!?'")]+$/, '').trim();
  const orgs = r => (r || []).filter(f => f[0] === 'nlp_organization').map(f => norm(f[1]));
  const found = (r, it) => orgs(r[it.id]).includes(it.expect);
  const bySet = {}; items.forEach(it => (bySet[it.set] = bySet[it.set] || []).push(it));
  const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '-';
  console.log('A. held-out typo recall: ' + bySet.A.length + ' prompts (300 organizations x 4 edit types x 3 templates x 3 cases)');
  console.log('   | slice | prompts | no fuzzy | OLD rule | NEW (narrow) | lost (old found, new not) | gained |');
  const rowA = (label, pred) => { const s = bySet.A.filter(pred); const n = s.filter(it => found(NOF, it)).length, o = s.filter(it => found(OLD, it)).length, w = s.filter(it => found(NEW, it)).length, lost = s.filter(it => found(OLD, it) && !found(NEW, it)), gain = s.filter(it => !found(OLD, it) && found(NEW, it)).length; console.log(`   | ${label} | ${s.length} | ${n} (${pct(n, s.length)}) | ${o} (${pct(o, s.length)}) | ${w} (${pct(w, s.length)}) | ${lost.length} | ${gain} |`); return lost; };
  const lostAll = rowA('ALL', () => true);
  for (const t of ['sub', 'ins', 'del', 'trans']) rowA('edit: ' + t, it => it.type === t);
  ['as in dictionary', 'UPPER', 'lower'].forEach((c, k) => rowA('case: ' + c, it => { const i = bySet.A.indexOf(it) % 9; return Math.floor(i % 3) === k; }));
  console.log('   entries whose typo the OLD rule found but the NEW rule did not (first 12):');
  lostAll.slice(0, 12).forEach(it => console.log(`     ${JSON.stringify(it.typo)}  (dictionary: ${JSON.stringify(it.org)}, ${it.type})`));
  console.log('\nB. expected-loss sets (found = organization finding equal to the modified phrase; B4: equal to the canonical name)');
  console.log('   | set | prompts | no fuzzy | OLD | NEW | lost |');
  const desc = { B1: 'two edits in one word', B2: 'one edit in each of two words', B3: 'one word missing', B4: 'words reversed', B5: 'single-word brand, one edit', B6: 'short multi-word name (< 10 chars), one edit', B7: 'edit in a 3-5 letter word of a long name' };
  for (const k of Object.keys(desc)) { const s = bySet[k] || []; const f = r => s.filter(it => found(r, it)).length; const lost = s.filter(it => found(OLD, it) && !found(NEW, it)).length; console.log(`   | ${k} ${desc[k]} | ${s.length} | ${f(NOF)} | ${f(OLD)} | ${f(NEW)} | ${lost} |`); }
  console.log('\nC. benign sentences: ' + bySet.C.length);
  const key = r => (r || []).map(f => f[0] + ':' + norm(f[1]));
  const oc = bySet.C.filter(it => key(OLD[it.id]).length), nc = bySet.C.filter(it => key(NEW[it.id]).length);
  const orgOld = bySet.C.filter(it => orgs(OLD[it.id]).length).length, orgNew = bySet.C.filter(it => orgs(NEW[it.id]).length).length;
  console.log(`   prompts with ANY nlp finding: OLD ${oc.length}, NEW ${nc.length}; with an organization finding: OLD ${orgOld}, NEW ${orgNew}`);
  const fresh = items.filter(it => it.set === 'C' || it.set === 'D' ? false : false);
  const newFindings = bySet.C.map(it => [it, key(NEW[it.id]).filter(k => !key(OLD[it.id]).includes(k))]).filter(([, a]) => a.length);
  console.log(`   findings the NEW build has and the OLD build does not (STOP condition): ${newFindings.length}` + newFindings.slice(0, 10).map(([it, a]) => `\n     ${JSON.stringify(it.text)} -> ${JSON.stringify(a)}`).join(''));
  const stillOld = bySet.C.filter(it => orgs(OLD[it.id]).length && orgs(NEW[it.id]).length).length;
  console.log(`   organization false positives that remain after narrowing: ${stillOld} prompts`);
  console.log('\nD. fictional organizations with suffixes: ' + bySet.D.length);
  const dOld = bySet.D.filter(it => found(OLD, it)), dNew = bySet.D.filter(it => found(NEW, it));
  console.log(`   found as that exact organization: OLD ${dOld.length}, NEW ${dNew.length}; different between OLD and NEW: ${bySet.D.filter(it => found(OLD, it) !== found(NEW, it)).length}`);
  const dMiss = bySet.D.filter(it => !found(NEW, it)); console.log(`   not found by either build (suffix not in the structural list), e.g.: ${dMiss.slice(0, 6).map(it => JSON.stringify(it.org)).join(', ')}`);
} else { console.error('usage: gen | run <detector> <out> [i n] | report <old> <new> <nofuzzy>'); process.exit(2); }
