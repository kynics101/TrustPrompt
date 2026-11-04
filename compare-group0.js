#!/usr/bin/env node
/**
 * compare-group0.js — Group 0 verification
 *
 * Deep-compares the immutable Step-1 baseline (baseline-step1.json) against the
 * post-optimization run (after-group0.json) to prove the length lower-bound
 * pre-check in fuzzyFind is behavior-preserving.
 *
 * For each of the 161 rows:
 *   - Compare the NLP findings as SORTED arrays of {patternId, rawMatch}
 *     (sort by patternId, then rawMatch, case-sensitive).
 *   - Compare the per-row `counts` object.
 *   - Also (airtightness) compare the full finding objects including
 *     safeVersion / source / extractionMethod.
 * Also deep-compares the aggregate `summary` and `harnessConfig` (generatedAt
 * is top-level and intentionally ignored — it is a timestamp, not a finding).
 *
 * Pass criterion: 161/161 identical rows AND summary identical.
 */
'use strict';
const fs = require('fs');

const A_PATH = process.argv[2] || 'baseline-step1.json';   // immutable reference
const B_PATH = process.argv[3] || 'after-group0.json';     // post-change run

const A = JSON.parse(fs.readFileSync(A_PATH, 'utf8'));
const B = JSON.parse(fs.readFileSync(B_PATH, 'utf8'));

function findingSig(rows) {
  return rows.actualNlpFindings
    .map(f => ({ patternId: f.patternId, rawMatch: f.rawMatch }))
    .sort((x, y) => {
      if (x.patternId !== y.patternId) return x.patternId < y.patternId ? -1 : 1;
      // case-sensitive rawMatch
      return x.rawMatch < y.rawMatch ? -1 : (x.rawMatch > y.rawMatch ? 1 : 0);
    });
}

function fullFindingSig(rows) {
  // Stable deep signature of every finding field the harness records.
  return rows.actualNlpFindings
    .map(f => ({
      patternId: f.patternId,
      rawMatch: f.rawMatch,
      safeVersion: f.safeVersion,
      source: f.source,
      extractionMethod: f.extractionMethod
    }))
    .sort((x, y) => {
      if (x.patternId !== y.patternId) return x.patternId < y.patternId ? -1 : 1;
      return x.rawMatch < y.rawMatch ? -1 : (x.rawMatch > y.rawMatch ? 1 : 0);
    });
}

function stable(o) { return JSON.stringify(o); }

function deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const aRows = A.rows || [];
const bRows = B.rows || [];
const bById = new Map(bRows.map(r => [r.id, r]));

let identicalRows = 0;
const diffs = [];

for (const ra of aRows) {
  const rb = bById.get(ra.id);
  if (!rb) {
    diffs.push({ id: ra.id, kind: 'MISSING_IN_AFTER' });
    continue;
  }
  const sigA = stable(findingSig(ra));
  const sigB = stable(findingSig(rb));
  const countsEq = deepEqual(ra.counts, rb.counts);
  const fullEq = deepEqual(fullFindingSig(ra), fullFindingSig(rb));
  if (sigA === sigB && countsEq && fullEq) {
    identicalRows++;
  } else {
    const d = { id: ra.id };
    if (sigA !== sigB) {
      const setA = findingSig(ra);
      const setB = findingSig(rb);
      d.findingsDiff = {
        before: setA,
        after: setB,
        onlyInBefore: setA.filter(x => !setB.some(y => y.patternId === x.patternId && y.rawMatch === x.rawMatch)),
        onlyInAfter: setB.filter(x => !setA.some(y => y.patternId === x.patternId && y.rawMatch === x.rawMatch))
      };
    }
    if (!countsEq) d.countsDiff = { before: ra.counts, after: rb.counts };
    if (!fullEq) d.fullFindingFieldDiff = true; // extra detail only if non-sig fields differ
    diffs.push(d);
  }
}

// Extra checks for any finding whose non-sig fields differ (airtightness)
const fieldDiffs = [];
for (const ra of aRows) {
  const rb = bById.get(ra.id);
  if (!rb) continue;
  if (!deepEqual(fullFindingSig(ra), fullFindingSig(rb))) {
    const fa = fullFindingSig(ra), fb = fullFindingSig(rb);
    const m = new Map(fa.map(f => [f.patternId + '\u0000' + f.rawMatch, f]));
    const diffs2 = [];
    fb.forEach(f => {
      const key = f.patternId + '\u0000' + f.rawMatch;
      const o = m.get(key);
      if (o && (o.safeVersion !== f.safeVersion || o.source !== f.source || o.extractionMethod !== f.extractionMethod)) {
        diffs2.push({ patternId: f.patternId, rawMatch: f.rawMatch,
          before: { safeVersion: o.safeVersion, source: o.source, extractionMethod: o.extractionMethod },
          after:  { safeVersion: f.safeVersion, source: f.source, extractionMethod: f.extractionMethod } });
      }
    });
    if (diffs2.length) fieldDiffs.push({ id: ra.id, diffs: diffs2 });
  }
}

const summaryEq = deepEqual(A.summary, B.summary);
const harnessConfigEq = deepEqual(A.harnessConfig, B.harnessConfig);

console.log('========================================================');
console.log('[GROUP 0 COMPARE] baseline ref : ' + A_PATH);
console.log('[GROUP 0 COMPARE] after change : ' + B_PATH);
console.log('[GROUP 0 COMPARE] rows in ref  : ' + aRows.length);
console.log('[GROUP 0 COMPARE] rows in after: ' + bRows.length);
console.log('[GROUP 0 COMPARE] IDENTICAL ROWS (sig + counts + full): ' + identicalRows + ' / ' + aRows.length);
console.log('[GROUP 0 COMPARE] summary identical  : ' + summaryEq);
console.log('[GROUP 0 COMPARE] harnessConfig identical: ' + harnessConfigEq);
if (fieldDiffs.length) {
  console.log('[GROUP 0 COMPARE] non-sig field diffs present in ' + fieldDiffs.length + ' rows (DETAIL):');
  console.log(JSON.stringify(fieldDiffs, null, 2));
} else {
  console.log('[GROUP 0 COMPARE] non-sig finding fields (safeVersion/source/extractionMethod): all identical');
}

if (diffs.length) {
  console.log('--- ROW DIFFS (' + diffs.length + ') ---');
  for (const d of diffs) {
    console.log('  [' + d.id + '] ' + (d.kind || JSON.stringify({ findingsDiff: !!d.findingsDiff, countsDiff: d.countsDiff || null })));
    if (d.findingsDiff) {
      console.log('    onlyInBefore: ' + JSON.stringify(d.findingsDiff.onlyInBefore));
      console.log('    onlyInAfter : ' + JSON.stringify(d.findingsDiff.onlyInAfter));
    }
    if (d.countsDiff) console.log('    counts: before=' + JSON.stringify(d.countsDiff.before) + ' after=' + JSON.stringify(d.countsDiff.after));
  }
}

const success = (identicalRows === aRows.length) && summaryEq && (aRows.length === 161);
console.log('========================================================');
console.log('[GROUP 0 COMPARE] VERDICT: ' + (success ? 'SUCCESS — 161/161 identical, summary identical' : 'FAILURE — findings changed'));
process.exit(success ? 0 : 1);
