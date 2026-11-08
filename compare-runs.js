#!/usr/bin/env node
/**
 * compare-runs.js — compare two run-path-c-baseline.js result files.
 * Usage: node compare-runs.js <before.json> <after.json> [--detail <out.md>]
 * Measurement only; reads the two JSON files, prints tables.
 *
 * Definitions (per row, using each file's own `comparison`):
 *   yes rows: strict clean = nothing missing AND nothing spurious
 *             loose clean  = nothing missing
 *   no rows:  clean = zero nlp_* findings
 * Dev = C-001..C-110 + C-133, C-152, C-153, C-154, C-160 (no longer hidden); Hidden = remaining C-111..C-161.
 */
'use strict';
const fs = require('fs');

// ── Finding-level precision / recall / F1 ───────────────────────────────────────────────────────────────────────────────────
// Every EXPECTED finding of a row (type + text) and every ACTUAL nlp_* finding is matched one-to-one, per type:
//   TP (correct)  = an expected finding that is matched by an actual finding of the same type
//   FN (missed)   = an expected finding with no matching actual finding
//   FP (spurious) = an actual finding that matches no expected finding (every finding of a "should not flag" row is spurious)
//   precision = TP / (TP + FP), recall = TP / (TP + FN), F1 = 2PR / (P + R); "overall" sums the counts of the three types (micro average).
// Two ways to decide "matches":
//   exact   : patternId equal AND text equal after lower-casing, whitespace folding, removing leading honorifics (Dr., Mr., Atty...), leading and
//             trailing punctuation (diacritics are kept). The expected finding takes the first unused actual finding that fits.
//   lenient : the matcher stored in each result file (row.comparison): patternId equal AND the actual text equals or CONTAINS the expected text
//             (after lower-casing, removing a leading honorific / Filipino title and trailing punctuation). Same one-to-one use of actual findings.
const PRF_TYPES = [['person', 'nlp_person_name'], ['job', 'nlp_job_title'], ['org', 'nlp_organization']];
const prfHON = /^(?:(?:mr|mrs|ms|miss|mx|dr|prof|atty|engr|arch|sir|madam|hon|fr|rev|sen|gov)\.?\s+)+/i;
const prfNrm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(prfHON, '').replace(/[\s.,;:!?'"”’)\]]+$/g, '').replace(/^["'“‘(\[]+/, '').trim();
const prfSplit = id => { const n = parseInt(id.replace(/\D/g, ''), 10); return (n <= 110 || ['C-160', 'C-133', 'C-152', 'C-153', 'C-154'].includes(id)) ? 'dev' : 'hidden'; };
function prfCounts(rows, pred, mode) {
  const c = {}; for (const [, id] of PRF_TYPES) c[id] = { tp: 0, fp: 0, fn: 0 };
  const bump = (id, k) => { (c[id] = c[id] || { tp: 0, fp: 0, fn: 0 })[k]++; };
  for (const r of rows.filter(pred)) {
    if (mode === 'lenient') {
      r.comparison.matched.forEach(m => bump(m.patternId, 'tp')); r.comparison.missing.forEach(m => bump(m.patternId, 'fn')); r.comparison.spurious.forEach(s => bump(s.patternId, 'fp'));
    } else {
      const act = r.actualNlpFindings.map(f => ({ id: f.patternId, t: prfNrm(f.rawMatch) })), used = act.map(() => false);
      for (const e of r.expectedFindings) {
        const en = prfNrm(e.text), i = act.findIndex((a, k) => !used[k] && a.id === e.patternId && a.t === en);
        if (i >= 0) { used[i] = true; bump(e.patternId, 'tp'); } else bump(e.patternId, 'fn');
      }
      act.forEach((a, k) => { if (!used[k]) bump(a.id, 'fp'); });
    }
  }
  return c;
}
function prfCell(x) {
  const P = x.tp + x.fp ? x.tp / (x.tp + x.fp) : 0, Rc = x.tp + x.fn ? x.tp / (x.tp + x.fn) : 0, F = P + Rc ? 2 * P * Rc / (P + Rc) : 0;
  return `${(100 * P).toFixed(1)} / ${(100 * Rc).toFixed(1)} / ${(100 * F).toFixed(1)}`;
}
function prfLines(label, rows) {
  const L = [`**${label}** (each cell: precision / recall / F1, %)`, '| rows | match | person | job | organization | OVERALL | overall TP / FP / FN |', '|---|---|---|---|---|---|---|'];
  for (const [name, pred] of [['ALL 161', () => true], ['dev', r => prfSplit(r.id) === 'dev'], ['hidden', r => prfSplit(r.id) === 'hidden']]) {
    for (const mode of ['exact', 'lenient']) {
      const c = prfCounts(rows, pred, mode), tot = { tp: 0, fp: 0, fn: 0 };
      Object.values(c).forEach(x => { tot.tp += x.tp; tot.fp += x.fp; tot.fn += x.fn; });
      L.push(`| ${name} | ${mode} | ${PRF_TYPES.map(([, id]) => prfCell(c[id])).join(' | ')} | ${prfCell(tot)} | ${tot.tp} / ${tot.fp} / ${tot.fn} |`);
    }
  }
  return L;
}

const args = process.argv.slice(2);
if (args.includes('--prf')) {   // node compare-runs.js --prf a.json [b.json ...]  : only the finding-level table, one block per file
  const fl = args.filter(a => !a.startsWith('--'));
  if (!fl.length) { console.error('usage: node compare-runs.js --prf result1.json [result2.json ...]'); process.exit(1); }
  fl.forEach(f => { console.log(prfLines(f, JSON.parse(fs.readFileSync(f, 'utf8')).rows).join('\n') + '\n'); });
  process.exit(0);
}
const detailIdx = args.indexOf('--detail');
const detailOut = detailIdx >= 0 ? args[detailIdx + 1] : null;
const files = args.filter((a, i) => !a.startsWith('--') && (detailIdx < 0 || i !== detailIdx + 1));
if (files.length < 2) { console.error('usage: node compare-runs.js before.json after.json [--detail out.md]   |   node compare-runs.js --prf result.json [...]'); process.exit(1); }

const load = f => JSON.parse(fs.readFileSync(f, 'utf8')).rows;
const A = load(files[0]), B = load(files[1]);
const mapA = new Map(A.map(r => [r.id, r]));
const num = id => parseInt(id.replace(/\D/g, ''), 10);
// Rows promoted from hidden to dev (no longer hidden): used for tuning in Group 5.
const UNHIDDEN = new Set(['C-160', 'C-133', 'C-152', 'C-153', 'C-154']);
const split = id => (num(id) <= 110 || UNHIDDEN.has(id) ? 'dev' : 'hidden');

function status(r) {
  const c = r.comparison, n = r.actualNlpFindings.length;
  if (r.shouldFlag === 'yes') {
    const strict = c.missing.length === 0 && c.spurious.length === 0;
    const loose = c.missing.length === 0;
    return { strict, loose, label: strict ? 'strict-clean' : loose ? 'loose-only(extras)' : 'missing' };
  }
  const clean = n === 0;
  return { strict: clean, loose: clean, label: clean ? 'clean' : 'false-positive' };
}
const fmt = f => `${f.patternId.replace('nlp_', '')}:"${f.rawMatch}"`;

function tally(rows, pred) {
  const t = { yesN: 0, yesStrict: 0, yesLoose: 0, noN: 0, noClean: 0, fp: 0, byType: {}, total: 0 };
  for (const r of rows.filter(pred)) {
    const s = status(r);
    if (r.shouldFlag === 'yes') { t.yesN++; if (s.strict) t.yesStrict++; if (s.loose) t.yesLoose++; }
    else { t.noN++; if (s.strict) t.noClean++; else t.fp++; }
    for (const f of r.actualNlpFindings) { t.byType[f.patternId] = (t.byType[f.patternId] || 0) + 1; t.total++; }
  }
  t.strictAll = t.yesStrict + t.noClean; t.n = t.yesN + t.noN;
  return t;
}

const out = [];
const p = s => out.push(s);
p(`## compare-runs: ${files[0]}  ->  ${files[1]}\n`);

p('### 1. Clean-row counts');
p('| set | rows | strict clean before | strict clean after | yes loose before | yes loose after | no-rows clean before | no-rows clean after |');
p('|---|---|---|---|---|---|---|---|');
for (const [name, pred] of [['ALL', () => true], ['dev C-001..110 + 133,152,153,154,160', r => split(r.id) === 'dev'], ['hidden (C-111..161 minus the 5)', r => split(r.id) === 'hidden']]) {
  const a = tally(A, pred), b = tally(B, pred);
  p(`| ${name} | ${b.n} | ${a.strictAll} | ${b.strictAll} | ${a.yesLoose}/${a.yesN} | ${b.yesLoose}/${b.yesN} | ${a.noClean}/${a.noN} | ${b.noClean}/${b.noN} |`);
}

// ── Strict-span metric ─────────────────────────────────────────────────────
// The lenient matcher in each result file (row.comparison) accepts a finding that merely overlaps or
// contains an expected text. The strict-span metric requires an EXACT match of patternId and text after
// normalising case, whitespace, trailing punctuation and leading honorifics (diacritics are kept).
const HON = /^(?:(?:mr|mrs|ms|miss|mx|dr|prof|atty|engr|arch|sir|madam|hon|fr|rev|sen|gov)\.?\s+)+/i;
const nrm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(HON, '').replace(/[\s.,;:!?'"”’)\]]+$/g, '').replace(/^["'“‘(\[]+/, '').trim();
function strictRow(r) {
  const exp = r.expectedFindings.map(e => e.patternId + '|' + nrm(e.text));
  const act = r.actualNlpFindings.map(f => f.patternId + '|' + nrm(f.rawMatch));
  const missing = exp.filter(e => !act.includes(e));
  const spurious = r.actualNlpFindings.filter(f => !exp.includes(f.patternId + '|' + nrm(f.rawMatch)));
  const lenientSpur = (r.comparison.spurious || []).map(s => s.patternId + '|' + s.rawMatch);
  // findings the lenient matcher counted as fine although the span is not an exact match
  const hidden = spurious.filter(f => !lenientSpur.includes(f.patternId + '|' + f.rawMatch));
  const clean = r.shouldFlag === 'yes' ? (!missing.length && !spurious.length) : r.actualNlpFindings.length === 0;
  return { missing, spurious, hidden, clean };
}
function strictTally(rows, pred) {
  const t = { n: 0, clean: 0, yesN: 0, yesClean: 0, hidden: 0 };
  for (const r of rows.filter(pred)) { const s = strictRow(r); t.n++; if (s.clean) t.clean++; if (r.shouldFlag === 'yes') { t.yesN++; if (s.clean) t.yesClean++; t.hidden += s.hidden.length; } }
  return t;
}
p('\n### 1b. Strict-span vs lenient clean rows (exact text after normalising case, trailing punctuation, honorifics)');
p('| set | rows | lenient strict-clean before | lenient strict-clean after | exact-span clean before | exact-span clean after | yes rows exact-span clean before | after | non-exact findings hidden by lenient matcher, before | after |');
p('|---|---|---|---|---|---|---|---|---|---|');
for (const [name, pred] of [['ALL', () => true], ['dev', r => split(r.id) === 'dev'], ['hidden', r => split(r.id) === 'hidden']]) {
  const a = tally(A, pred), b = tally(B, pred), sa = strictTally(A, pred), sb = strictTally(B, pred);
  p(`| ${name} | ${b.n} | ${a.strictAll} | ${b.strictAll} | ${sa.clean} | ${sb.clean} | ${sa.yesClean}/${sa.yesN} | ${sb.yesClean}/${sb.yesN} | ${sa.hidden} | ${sb.hidden} |`);
}
p('\nFindings the lenient matcher hides (after run; person names listed, other types counted):');
{
  const rows = [], other = {};
  for (const r of B) for (const f of strictRow(r).hidden) {
    if (f.patternId === 'nlp_person_name') rows.push(`${r.id}: "${f.rawMatch}" (expected: ${r.expectedFindings.filter(e => e.patternId === 'nlp_person_name' && (nrm(e.text).includes(nrm(f.rawMatch)) || nrm(f.rawMatch).includes(nrm(e.text)))).map(e => '"' + e.text + '"').join(', ') || 'n/a'})`);
    else other[f.patternId] = (other[f.patternId] || 0) + 1;
  }
  p(rows.length ? rows.map(x => '- ' + x).join('\n') : '- none');
  p('other types hidden: ' + (Object.keys(other).length ? JSON.stringify(other) : 'none'));
}

p('\n### 1c. Finding-level precision / recall / F1 (definitions in the header of this file)');
p(prfLines('before: ' + files[0], A).join('\n')); p('');
p(prfLines('after: ' + files[1], B).join('\n'));

p('\n### 2. Total nlp_* findings by type');
const ta = tally(A, () => true), tb = tally(B, () => true);
p('| type | before | after | delta |\n|---|---|---|---|');
for (const k of ['nlp_person_name', 'nlp_job_title', 'nlp_organization']) {
  p(`| ${k} | ${ta.byType[k] || 0} | ${tb.byType[k] || 0} | ${(tb.byType[k] || 0) - (ta.byType[k] || 0)} |`);
}
p(`| TOTAL | ${ta.total} | ${tb.total} | ${tb.total - ta.total} |`);

p('\n### 3. should-not-flag rows that have findings (before -> after)');
const fpRows = B.filter(r => r.shouldFlag === 'no').map(r => ({ a: mapA.get(r.id), b: r })).filter(x => x.a.actualNlpFindings.length || x.b.actualNlpFindings.length);
p(`before: ${A.filter(r => r.shouldFlag === 'no' && r.actualNlpFindings.length).length} rows, after: ${B.filter(r => r.shouldFlag === 'no' && r.actualNlpFindings.length).length} rows`);
p('| id | split | before | after |\n|---|---|---|---|');
for (const { a, b } of fpRows) p(`| ${b.id} | ${split(b.id)} | ${a.actualNlpFindings.map(fmt).join('; ') || '-'} | ${b.actualNlpFindings.map(fmt).join('; ') || '-'} |`);

p('\n### 4. Rows whose findings changed');
p('| id | split | shouldFlag | status before -> after | added | removed |\n|---|---|---|---|---|---|');
const reg = [];
for (const b of B) {
  const a = mapA.get(b.id);
  const ka = a.actualNlpFindings.map(fmt), kb = b.actualNlpFindings.map(fmt);
  const added = kb.filter(x => !ka.includes(x)), removed = ka.filter(x => !kb.includes(x));
  if (!added.length && !removed.length) continue;
  const sa = status(a), sb = status(b);
  p(`| ${b.id} | ${split(b.id)} | ${b.shouldFlag} | ${sa.label} -> ${sb.label} | ${added.join('; ') || '-'} | ${removed.join('; ') || '-'} |`);
  if (sa.strict && !sb.strict) reg.push(b.id);
}

p('\n### 5. Regressions (strict-clean before, not strict-clean after)');
p(reg.length ? reg.join(', ') : 'none');

const text = out.join('\n');
if (detailOut) { fs.writeFileSync(detailOut, text); console.log(text.split('\n### 3.')[0]); console.log(`\n(full output incl. per-row tables written to ${detailOut})`); }
else console.log(text);
