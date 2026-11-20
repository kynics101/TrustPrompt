#!/usr/bin/env node
/**
 * run-excel-eval.js — runs every prompt in the curated Excel sheet through the
 * Path C pipeline and compares the findings with the sheet's Expected columns.
 *
 * Source: csv/[FINAL] TrustPrompt_Curated_Dataset.xlsx, sheet "Path C Tests".
 *   - Names and organizations are compared by text (loose match, same rule as
 *     run-path-c-baseline.js).
 *   - Occupations (nlp_job_title) have only a count column in the sheet, so they
 *     are compared by count.
 *
 * Usage:
 *   node run-excel-eval.js                 # all rows, summary + per-row lines
 *   node run-excel-eval.js C-093 C-094    # only the listed Test IDs
 *   node run-excel-eval.js --failures     # only failing rows
 *
 * Writes excel-eval-results.json next to this file.
 */

'use strict';

const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

// ── 1. Browser-environment globals (same setup as run-path-c-baseline.js) ───
global.window = {};
global.globalThis = global;
global.document = { title: 'Excel Eval Harness' };

const _origLog = console.log;
const _origDebug = console.debug;
const _origWarn = console.warn;
console.log = () => {};
console.debug = () => {};
console.warn = () => {};

// ── 2. Load terms data, compromise, normalizer, detector ────────────────────
require('./terms-organizations.js');
require('./terms-occupations.js');
require('./terms-names.js');
require('vm').runInThisContext(
  fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') +
  ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;'
);
const _nlpExport = require('./lib/compromise.min.js');
if (typeof global.window.nlp === 'undefined') {
  global.window.nlp = _nlpExport;
}
require('./normalizer.js');
require('./linguistic-detector.js');

const D = globalThis.TrustLinguisticDetector;
const N = globalThis.TrustNormalizer;

console.log = _origLog;
console.debug = _origDebug;
console.warn = _origWarn;

if (typeof global.window.nlp !== 'function') {
  console.error('[EXCEL EVAL] FATAL: compromise did not load; results would not match the browser.');
  process.exit(1);
}
if (!D || typeof D.scan !== 'function' || !N || typeof N.normalizePath_C !== 'function') {
  console.error('[EXCEL EVAL] FATAL: detector or normalizer missing.');
  process.exit(1);
}

// ── 3. Read the Excel sheet ──────────────────────────────────────────────────
const XLSX_PATH = path.join(__dirname, 'csv', '[FINAL] TrustPrompt_Curated_Dataset.xlsx');
const SHEET_NAME = 'Path C Tests';

const wb = XLSX.readFile(XLSX_PATH);
const sheet = wb.Sheets[SHEET_NAME];
if (!sheet) {
  console.error(`[EXCEL EVAL] FATAL: sheet "${SHEET_NAME}" not found. Sheets: ${wb.SheetNames.join(', ')}`);
  process.exit(1);
}
const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

function parseList(cell) {
  return String(cell ?? '')
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !/^none$/i.test(s));
}

const rows = sheetRows
  .filter(r => String(r['Test ID'] ?? '').trim())
  .map(r => ({
    id: String(r['Test ID']).trim(),
    category: String(r['Category'] ?? ''),
    label: String(r['Label'] ?? ''),
    prompt: String(r['Prompt'] ?? '').replace(/\u23CE/g, '\n'),
    expNames: parseList(r['Expected Names']),
    expOrgs: parseList(r['Expected Organizations']),
    expOccCount: Number(r['Expected Occupations Count']) || 0,
  }));

// ── 4. Options ───────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const onlyFailures = argv.includes('--failures');
const idFilter = argv.filter(a => !a.startsWith('--')).map(a => a.toUpperCase());
const selected = idFilter.length
  ? rows.filter(r => idFilter.includes(r.id.toUpperCase()))
  : rows;

// ── 5. Comparison helpers (same rules as run-path-c-baseline.js) ─────────────
const NLP_TEXT_IDS = new Set(['nlp_person_name', 'nlp_organization']);

function normalizeForCompare(s) {
  let n = String(s).toLowerCase().trim();
  n = n.replace(/^(?:dr|mr|mrs|ms|engr|atty|kapitan|kap|mang|ate|kuya)\.?\s+/, '');
  n = n.replace(/[.,;:!?]+$/, '').trim();
  return n;
}

function compareText(expected, actuals) {
  const used = new Array(actuals.length).fill(false);
  const matched = [];
  const missing = [];
  for (const e of expected) {
    let foundIdx = -1;
    for (let i = 0; i < actuals.length; i++) {
      if (used[i] || actuals[i].patternId !== e.patternId) continue;
      const na = normalizeForCompare(actuals[i].rawMatch);
      const ne = normalizeForCompare(e.text);
      if (na.length && ne.length && (na === ne || na.includes(ne))) { foundIdx = i; break; }
    }
    if (foundIdx >= 0) {
      used[foundIdx] = true;
      matched.push(e);
    } else {
      missing.push(e);
    }
  }
  const spurious = actuals.filter((_, i) => !used[i]);
  return { matched, missing, spurious };
}

// ── 6. Run ───────────────────────────────────────────────────────────────────
const totals = {
  nlp_person_name: { expected: 0, correct: 0, missing: 0, spurious: 0 },
  nlp_organization: { expected: 0, correct: 0, missing: 0, spurious: 0 },
  nlp_job_title: { expectedCount: 0, detectedCount: 0, rowsCountMismatch: 0 },
};
const results = [];

console.log = () => {};
console.debug = () => {};
console.warn = () => {};

for (const r of selected) {
  let findings = [];
  let error = null;
  try {
    findings = D.scan(N.normalizePath_C(r.prompt)) || [];
  } catch (err) {
    error = err.message;
  }

  const actual = findings
    .filter(f => ['nlp_person_name', 'nlp_organization', 'nlp_job_title'].includes(f.patternId))
    .map(f => ({ patternId: f.patternId, rawMatch: f.rawMatch }));

  const expected = [
    ...r.expNames.map(t => ({ patternId: 'nlp_person_name', text: t })),
    ...r.expOrgs.map(t => ({ patternId: 'nlp_organization', text: t })),
  ];
  const textActuals = actual.filter(a => NLP_TEXT_IDS.has(a.patternId));
  const cmp = compareText(expected, textActuals);

  const detectedOcc = actual.filter(a => a.patternId === 'nlp_job_title').length;
  const occOk = detectedOcc === r.expOccCount;

  for (const e of expected) {
    totals[e.patternId].expected++;
  }
  for (const m of cmp.matched) totals[m.patternId].correct++;
  for (const m of cmp.missing) totals[m.patternId].missing++;
  for (const s of cmp.spurious) totals[s.patternId].spurious++;

  totals.nlp_job_title.expectedCount += r.expOccCount;
  totals.nlp_job_title.detectedCount += detectedOcc;
  if (!occOk) totals.nlp_job_title.rowsCountMismatch++;

  const pass = !error && cmp.missing.length === 0 && cmp.spurious.length === 0 && occOk;

  results.push({
    id: r.id,
    category: r.category,
    label: r.label,
    pass,
    error,
    expectedNames: r.expNames,
    expectedOrganizations: r.expOrgs,
    expectedOccupationCount: r.expOccCount,
    matched: cmp.matched.map(m => ({ type: m.patternId, text: m.text })),
    missing: cmp.missing.map(m => ({ type: m.patternId, text: m.text })),
    spurious: cmp.spurious.map(s => ({ type: s.patternId, rawMatch: s.rawMatch })),
    detectedOccupationCount: detectedOcc,
    prompt: r.prompt,
  });
}

console.log = _origLog;

// ── 7. Report ────────────────────────────────────────────────────────────────
const shown = onlyFailures ? results.filter(r => !r.pass) : results;
for (const r of shown) {
  const status = r.pass ? 'PASS' : 'FAIL';
  const miss = r.missing.map(m => `${m.type === 'nlp_person_name' ? 'name' : 'org'}:"${m.text}"`).join(', ');
  const spur = r.spurious.map(s => `${s.type === 'nlp_person_name' ? 'name' : (s.type === 'nlp_organization' ? 'org' : 'job')}:"${s.rawMatch}"`).join(', ');
  const occ = r.expectedOccupationCount !== r.detectedOccupationCount
    ? ` occ expected=${r.expectedOccupationCount} detected=${r.detectedOccupationCount}` : '';
  const err = r.error ? ` ERROR: ${r.error}` : '';
  _origLog(`${r.id.padEnd(7)} ${r.label.padEnd(5)} ${status}${occ}${err}` +
    (miss ? `\n        missing:  ${miss}` : '') +
    (spur ? `\n        spurious: ${spur}` : ''));
}

const passCount = results.filter(r => r.pass).length;
const tn = totals.nlp_person_name;
const to = totals.nlp_organization;
const textExpected = tn.expected + to.expected;
const textCorrect = tn.correct + to.correct;
const textSpurious = tn.spurious + to.spurious;
const precision = textCorrect + textSpurious ? textCorrect / (textCorrect + textSpurious) : 0;
const recall = textExpected ? textCorrect / textExpected : 0;
const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;

_origLog('');
_origLog('==================== SUMMARY ====================');
_origLog(`Rows run:            ${results.length}  (sheet has ${rows.length})`);
_origLog(`Rows passing:        ${passCount} / ${results.length}`);
_origLog(`Names   expected/correct/missing/spurious: ${tn.expected} / ${tn.correct} / ${tn.missing} / ${tn.spurious}`);
_origLog(`Orgs    expected/correct/missing/spurious: ${to.expected} / ${to.correct} / ${to.missing} / ${to.spurious}`);
_origLog(`Occupations expected/detected count: ${totals.nlp_job_title.expectedCount} / ${totals.nlp_job_title.detectedCount}  (rows with count mismatch: ${totals.nlp_job_title.rowsCountMismatch})`);
_origLog(`Name+Org precision: ${(precision * 100).toFixed(1)}%   recall: ${(recall * 100).toFixed(1)}%   F1: ${(f1 * 100).toFixed(1)}%`);
_origLog('=================================================');

const outPath = path.join(__dirname, 'excel-eval-results.json');
fs.writeFileSync(outPath, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: { file: XLSX_PATH, sheet: SHEET_NAME },
  summary: { rowsRun: results.length, rowsPassing: passCount, totals, precision, recall, f1 },
  results,
}, null, 2), 'utf8');
_origLog(`Wrote ${outPath}`);
