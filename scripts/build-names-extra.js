#!/usr/bin/env node
/**
 * build-names-extra.js — builds terms-names-extra.js (extra given names and surnames, aggregate frequency lists only).
 *
 *   node scripts/build-names-extra.js --census <Names_2010Census.csv> [--ssa <dir with yobYYYY.txt>] [--out terms-names-extra.js]
 *        [--surname-floor N] [--surname-cap N] [--first-floor N] [--first-cap N]
 *        [--wordlist <SCOWL final/ dir>] [--wordlist-max N]   build-time English word list; words in it are removed (never shipped)
 *        [--ph <terms-names-ph-proposed.js>]                    authored Filipino vocabulary, merged as a separate source
 *
 * Inputs (aggregate counts only, no individual records):
 *   --census  US Census Bureau 2010 surnames file (Names_2010Census.csv: name, rank, count, ...)
 *   --ssa     US Social Security Administration national baby-name files (yobYYYY.txt: name,sex,count)
 * Filters, applied in this order to every candidate word:
 *   1. letters a-z only, length 3-20 (accents are stripped by the detector, the sources are ASCII anyway)
 *   2. count (surnames: 2010 count; given names: total over all years) >= floor
 *   3. not already in terms-names.js
 *   4. not a common word: Compromise's own lexicon lists it with a tag that is not a name tag (verb, noun, adjective, determiner...)
 *   5. not a word of the detector's organization head / sector / generic-modifier lists, and not a one-word job title or organization
 *      in terms-occupations.js / terms-organizations.js
 *   5b. not an ordinary English word: the word is not in the SCOWL lists english-words.* and american-words.* of size <= --wordlist-max (lower-case
 *       dictionary words only; proper names are in separate SCOWL files that are not read). Build-time input only.
 *   6. cap: the N most frequent survivors
 * The authored Filipino vocabulary (--ph) is merged after the counted sources and passes steps 3-5b (it is exempt from the frequency floor).
 * The output is two space-separated strings (compact: about one byte of overhead per word) and a header with counts and sources.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..');
const census = arg('census'), ssa = arg('ssa'), out = path.resolve(arg('out', path.join(ROOT, 'terms-names-extra.js')));
const sFloor = +arg('surname-floor', 1000), sCap = +arg('surname-cap', 40000), fFloor = +arg('first-floor', 1000), fCap = +arg('first-cap', 20000);
if (!census && !ssa) { console.error('need --census and/or --ssa'); process.exit(1); }

global.window = {}; global.globalThis = global;
require(path.join(ROOT, 'terms-names.js')); require(path.join(ROOT, 'terms-occupations.js')); require(path.join(ROOT, 'terms-organizations.js'));
const stats = { census: {}, ssa: {}, ph: {} };
const nlp = require(path.join(ROOT, 'lib', 'compromise.min.js'));
const base = new Set([...globalThis.NAMES_DATA.firstNames, ...globalThis.NAMES_DATA.surnames]);
const NAME_TAGS = ['FirstName', 'LastName', 'MaleName', 'FemaleName', 'Person'];
const lex = nlp.world().model.one.lexicon;
const common = w => { let t = lex[w]; if (!t) return false; t = Array.isArray(t) ? t : [t]; return !t.some(x => NAME_TAGS.includes(x)); };

// word lists of the detector (read from its source so they cannot drift)
const dsrc = fs.readFileSync(path.join(ROOT, 'linguistic-detector.js'), 'utf8');
const block = (re) => { const m = dsrc.match(re); return m ? m[1] : ''; };
const sets = new Set();
const addWords = s => s.split(/[^a-z]+/i).filter(Boolean).forEach(w => sets.add(w.toLowerCase()));
addWords(block(/const CA_HEADS_BY_CATEGORY = (\{[\s\S]*?\n  \});/).replace(/\/\/.*$/gm, '').replace(/[a-z0-9]+:\s*'/gi, "'"));
addWords(block(/const CA_COMMON_MODS = new Set\(\(([\s\S]*?)\)\.split/));
addWords(block(/const G7_SECTOR_WORDS = new Set\(\(([\s\S]*?)\)\.split/));
addWords(block(/const G7_GENERIC_MODS = new Set\(\(([\s\S]*?)\)\.split/));
addWords(block(/const STRONG_ORG_HEAD_WORDS = new Set\((\[[\s\S]*?\])\);/));
addWords(block(/const RUN_ORG_HEAD_WORDS = new Set\((\[[\s\S]*?\])\);/));
const oneWord = a => (a || []).filter(x => /^[A-Za-z]+$/.test(x)).forEach(x => sets.add(x.toLowerCase()));
oneWord(globalThis.OCCUPATIONS_DATA); oneWord(globalThis.ORGANIZATIONS_DATA);

// ordinary English words (build-time only)
const wlDir = arg('wordlist'), wlMax = +arg('wordlist-max', 60);
const ENG = new Set();
if (wlDir) for (const f of fs.readdirSync(wlDir)) {
  const m = f.match(/^(?:english|american)-words\.(\d+)$/); if (!m || +m[1] > wlMax) continue;
  for (const l of fs.readFileSync(path.join(wlDir, f), 'latin1').split(/\r?\n/)) { const w = l.trim().toLowerCase().replace(/'s$/, ''); if (/^[a-z]{3,20}$/.test(w)) ENG.add(w); }
}
stats.englishWords = ENG.size;
const ok = w => /^[a-z]{3,20}$/.test(w) && !base.has(w) && !common(w) && !sets.has(w);

let surnames = [];
if (census) {
  const rows = fs.readFileSync(census, 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split(','));
  stats.census.rows = rows.length;
  const cand = rows.map(r => ({ w: r[0].toLowerCase(), c: parseInt(r[2], 10) })).filter(x => Number.isFinite(x.c));
  stats.census.floor = cand.filter(x => x.c >= sFloor).length;
  const f1 = cand.filter(x => x.c >= sFloor && /^[a-z]{3,20}$/.test(x.w));
  stats.census.afterLetters = f1.length;
  const f2 = f1.filter(x => !base.has(x.w)); stats.census.afterBase = f2.length;
  const f3 = f2.filter(x => !common(x.w)); stats.census.afterCommonWord = f3.length;
  const f3b = f3.filter(x => !sets.has(x.w)); stats.census.afterHeadSectorJob = f3b.length;
  const f4 = f3b.filter(x => !ENG.has(x.w)); stats.census.afterEnglishWord = f4.length;
  const rem = f3b.filter(x => ENG.has(x.w)).sort((a, b) => b.c - a.c); stats.census.removedAsEnglish = rem.length;
  stats.census.removedSample20 = rem.length ? Array.from({ length: Math.min(20, rem.length) }, (_, i) => rem[Math.floor(i * rem.length / 20)]).map(x => x.w + ':' + x.c) : [];
  surnames = f4.sort((a, b) => b.c - a.c).slice(0, sCap); stats.census.final = surnames.length; stats.census.minCount = surnames.length ? surnames[surnames.length - 1].c : 0;
  stats.census.droppedCommon = f2.filter(x => common(x.w)).slice(0, 25).map(x => x.w);
}
let firsts = [];
if (ssa) {
  const tot = new Map();
  for (const f of fs.readdirSync(ssa).filter(f => /^yob\d{4}\.txt$/.test(f))) for (const l of fs.readFileSync(path.join(ssa, f), 'utf8').split(/\r?\n/)) {
    const p = l.split(','); if (p.length < 3) continue; const w = p[0].toLowerCase(), c = parseInt(p[2], 10); tot.set(w, (tot.get(w) || 0) + c);
  }
  const cand = [...tot].map(([w, c]) => ({ w, c })); stats.ssa.names = cand.length;
  const f1 = cand.filter(x => x.c >= fFloor && /^[a-z]{3,20}$/.test(x.w)); stats.ssa.afterFloorLetters = f1.length;
  const f2 = f1.filter(x => !base.has(x.w)); stats.ssa.afterBase = f2.length;
  const f3 = f2.filter(x => !common(x.w)); stats.ssa.afterCommonWord = f3.length;
  const f3b = f3.filter(x => !sets.has(x.w)); stats.ssa.afterHeadSectorJob = f3b.length;
  const f4 = f3b.filter(x => !ENG.has(x.w)); stats.ssa.afterEnglishWord = f4.length;
  const rem = f3b.filter(x => ENG.has(x.w)).sort((a, b) => b.c - a.c); stats.ssa.removedAsEnglish = rem.length;
  stats.ssa.removedSample20 = Array.from({ length: Math.min(20, rem.length) }, (_, i) => rem[Math.floor(i * rem.length / 20)]).map(x => x.w + ':' + x.c);
  firsts = f4.sort((a, b) => b.c - a.c).slice(0, fCap); stats.ssa.final = firsts.length; stats.ssa.minCount = firsts.length ? firsts[firsts.length - 1].c : 0;
  stats.ssa.droppedCommon = f2.filter(x => common(x.w)).slice(0, 25).map(x => x.w);
}
const phPath = arg('ph');
if (phPath) {
  const ph = require(path.resolve(phPath)), have = new Set([...firsts, ...surnames].map(x => x.w));
  const take = (list, dst, key) => { let kept = 0, inBase = 0, dropped = []; for (const w of list) { const k = w.toLowerCase(); if (base.has(k)) { inBase++; continue; } if (have.has(k)) continue; if (!/^[a-z]{3,20}$/.test(k) || common(k) || sets.has(k) || ENG.has(k)) { dropped.push(k); continue; } have.add(k); dst.push({ w: k, c: 0 }); kept++; } stats.ph[key] = { given: list.length, kept, alreadyInBase: inBase, droppedAsCommonOrShort: dropped }; };
  take(ph.firstNames, firsts, 'firstNames'); take(ph.surnames, surnames, 'surnames');
}
const wrap = ws => { const lines = []; let cur = ''; for (const w of ws) { if (cur.length + w.length > 150) { lines.push(cur); cur = ''; } cur += (cur ? ' ' : '') + w; } if (cur) lines.push(cur); return lines.join('\n'); };
const text = `// terms-names-extra.js  (generated by scripts/build-names-extra.js; do not edit by hand)
// Extra given names and surnames, used by linguistic-detector.js (Path C) ONLY as an ANCHOR, exactly like terms-names.js: it never creates a finding.
// Aggregate frequency lists only: every entry is a single word that occurs in a published count table; no individual record, no full name.
// Sources: ${census ? 'US Census Bureau, "Frequently Occurring Surnames from the 2010 Census" (names occurring >= 100 times; here count >= ' + sFloor + ')' : ''}${census && ssa ? '; ' : ''}${ssa ? 'US Social Security Administration, "Baby Names from Social Security Card Applications - National Data" (total count over all years >= ' + fFloor + ')' : ''}. Licenses and URLs: docs/data-sources.md.
// Filters: letters only (3-20), not in terms-names.js, not a common word in Compromise's lexicon, not an organization head / sector / generic-modifier word,
// not a one-word job title or organization of the detector's dictionaries; most frequent first, capped.
// ${phPath ? 'Also merged: an AUTHORED Filipino name vocabulary (nicknames, Muslim / Mindanao, indigenous and regional, Chinese-Filipino, Spanish-catalogue names), written by hand, not downloaded; same filters, no frequency floor. ' : ''}English-word filter: SCOWL lists (size <= ${wlMax}) used at build time only, ${ENG.size} words, not shipped.
// Counts: ${firsts.length} given names, ${surnames.length} surnames.

const NAMES_EXTRA_FIRST_TEXT = \`
${wrap(firsts.map(x => x.w))}
\`;
const NAMES_EXTRA_SURNAMES_TEXT = \`
${wrap(surnames.map(x => x.w))}
\`;

const NAMES_EXTRA_DATA = {
  firstNames: NAMES_EXTRA_FIRST_TEXT.split(/\\s+/).filter(Boolean),
  surnames: NAMES_EXTRA_SURNAMES_TEXT.split(/\\s+/).filter(Boolean)
};

if (typeof module !== 'undefined' && module.exports) { module.exports = NAMES_EXTRA_DATA; }
if (typeof window !== 'undefined') { window.NAMES_EXTRA_DATA = NAMES_EXTRA_DATA; }
if (typeof globalThis !== 'undefined') { globalThis.NAMES_EXTRA_DATA = NAMES_EXTRA_DATA; }
`;
fs.writeFileSync(out, text);
console.log(JSON.stringify(stats, null, 1));
console.log(`wrote ${out}: ${firsts.length} given names, ${surnames.length} surnames, ${(fs.statSync(out).size / 1024).toFixed(1)} KB`);
