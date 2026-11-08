#!/usr/bin/env node
/**
 * run-path-c-baseline.js — Path C measurement harness (STEP 1)
 *
 * MEASUREMENT ONLY. Does NOT edit any application source.
 * Loads the browser-faithful Path C pipeline (terms -> compromise -> normalizer
 * -> linguistic-detector) in Node, runs every row of PathC_TestSet_for_Kiro.md
 * through normalizePath_C + TrustLinguisticDetector.scan, keeps only the
 * nlp_person_name / nlp_job_title / nlp_organization findings, and writes a
 * per-row baseline to baseline.json plus a summary report.
 *
 * Usage:  node run-path-c-baseline.js
 */

'use strict';

// ── 1. Browser-environment globals (set BEFORE any require) ──────────────────
global.window = {};
global.globalThis = global;
global.document = { title: 'Path C Baseline Harness' };

// ── 2. Capture init logs (detector is verbose), keep errors visible ──────────
const _initLogs = [];
const _origLog = console.log;
const _origDebug = console.debug;
const _origWarn = console.warn;
console.log = (...a) => _initLogs.push(a.map(x => typeof x === 'string' ? x : String(x)).join(' '));
console.debug = (...a) => _initLogs.push(['[debug]', ...a].map(x => typeof x === 'string' ? x : String(x)).join(' '));
console.warn = (...a) => _initLogs.push(['[warn]', ...a].map(x => typeof x === 'string' ? x : String(x)).join(' '));

// ── 3. Load terms data FIRST (detector reads these globals at init time) ─────
require('./terms-organizations.js');   // defines globalThis.ORGANIZATIONS_DATA
require('./terms-occupations.js');     // defines globalThis.OCCUPATIONS_DATA
require('./terms-names.js');           // defines globalThis.NAMES_DATA (manifest.json loads it before the detector; the detector's name anchor needs it)
// The browser loads ph-address-db.js before the detector (it declares a top-level const, so plain require() would not expose it).
require('vm').runInThisContext(require('fs').readFileSync(require('path').join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');

// ── 4. Load compromise.js and wire it onto window.nlp ────────────────────────
// compromise.min.js is UMD: in Node it takes the CommonJS branch
// (module.exports = t()) and does NOT touch window.nlp. The detector's
// COMPROMISE_AVAILABLE flag and STAGE-3 validation gate both read window.nlp,
// so we must assign it ourselves for browser-faithful behaviour.
const _nlpExport = require('./lib/compromise.min.js');
if (typeof global.window.nlp === 'undefined') {
  global.window.nlp = _nlpExport;
}

// ── 5. Normalizer + detector (detector reads window.nlp at load time) ───────
require(process.env.NORM ? require('path').resolve(process.env.NORM) : './normalizer.js');   // defines globalThis.TrustNormalizer (NORM=<file> runs a scratch copy)
require(process.env.DET ? require('path').resolve(process.env.DET) : './linguistic-detector.js');   // DET=<path> runs an older detector copy for before/after comparisons

const D = globalThis.TrustLinguisticDetector;
const N = globalThis.TrustNormalizer;

// ── 6. CRITICAL CHECK: compromise availability ──────────────────────────────
const compromiseLoaded = typeof global.window.nlp !== 'undefined';
const compromiseType = typeof global.window.nlp;
console.log = _origLog; // restore briefly to print the check
console.debug = _origDebug;
console.warn = _origWarn;
console.log('========================================================');
console.log('[PATH C BASELINE] compromiseLoaded:', compromiseLoaded,
  '| typeof global.window.nlp:', compromiseType);
console.log('[PATH C BASELINE] TrustLinguisticDetector:', typeof D,
  '| TrustNormalizer:', typeof N);
// Print filtered init summary
const keyInit = _initLogs.filter(l => /Successfully loaded|Failed|✅|❌|Loaded \d+/.test(l));
keyInit.slice(0, 30).forEach(l => console.log('  init:', l));
if (!compromiseLoaded || compromiseType !== 'function') {
  console.error('[PATH C BASELINE] FATAL: compromise.min.js did not expose a callable nlp on window. Aborting to avoid a non-faithful baseline.');
  process.exit(1);
}
if (typeof D !== 'object' || typeof D.scan !== 'function') {
  console.error('[PATH C BASELINE] FATAL: TrustLinguisticDetector.scan unavailable.');
  process.exit(1);
}
if (typeof N !== 'object' || typeof N.normalizePath_C !== 'function') {
  console.error('[PATH C BASELINE] FATAL: TrustNormalizer.normalizePath_C unavailable.');
  process.exit(1);
}

const fs = require('fs');

// ── 8. Parse the 161-row markdown test set ──────────────────────────────────
const TEST_FILE = 'PathC_TestSet_for_Kiro.md';
const raw = fs.readFileSync(TEST_FILE, 'utf8').replace(/\r\n/g, '\n');
const allLines = raw.split('\n');

const DATA_ROW_RE = /^\|\s*C-\d{3}\s*\|/;
const PH = '\u0001';             // placeholder for an escaped pipe inside a cell
const TYPE_TO_PATTERN = { Name: 'nlp_person_name', Job: 'nlp_job_title', Org: 'nlp_organization' };

function parseRow(line) {
  // 1) protect escaped pipes (\|) so only real table delimiters remain,
  // 2) split on '|', 3) drop the two structural empties outside the outer
  //    pipes (every data row starts and ends with '|'), 4) trim + restore pipes.
  let l = line.replace(/\\\|/g, PH);
  let parts = l.split('|');
  if (parts.length >= 2) parts = parts.slice(1, -1); // drop boundary tokens
  return parts.map(p => p.replace(new RegExp(PH, 'g'), '|').trim());
}

function parseExpectedFindings(cell) {
  const trimmed = cell.trim();
  if (!trimmed || /^none$/i.test(trimmed)) return [];
  const out = [];
  for (const item of trimmed.split(';')) {
    const m = item.trim().match(/^(Name|Job|Org)\s*:\s*(.+)$/i);
    if (!m) continue;
    const type = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase(); // Name/Job/Org
    out.push({ type, patternId: TYPE_TO_PATTERN[type], text: m[2].trim() });
  }
  return out;
}

const rows = [];
for (const line of allLines) {
  if (!DATA_ROW_RE.test(line)) continue;
  const cells = parseRow(line);
  if (cells.length !== 6) {
    console.error('[PATH C BASELINE] WARN: row did not yield 6 cells (' + cells.length + '): ' + line.slice(0, 80));
  }
  const [id, promptCell, shouldFlag, expectedRisk, expectedFindingsCell, note] = cells;
  const noteStr = note !== undefined ? note : '';
  const hadLineBreak = (promptCell || '').includes('\u23CE');
  const prompt = (promptCell || '').replace(/\u23CE/g, '\n'); // ⏎ -> real newline
  rows.push({
    id,
    prompt,
    shouldFlag: (shouldFlag || '').trim().toLowerCase(),
    expectedRisk: (expectedRisk || '').trim(),
    expectedFindings: parseExpectedFindings(expectedFindingsCell || ''),
    note: noteStr.trim(),
    hadLineBreak
  });
}

if (rows.length !== 161) {
  console.error = console.error || (() => {}); // safety
  // Re-enable error printing
  process.stdout.write('[PATH C BASELINE] FATAL: parsed ' + rows.length + ' rows, expected 161. Aborting.\n');
  process.stdout.write('  first id: ' + (rows[0] && rows[0].id) + '\n');
  process.stdout.write('  last id: ' + (rows[rows.length - 1] && rows[rows.length - 1].id) + '\n');
  process.exit(1);
}
console.log = _origLog; // restore for our own reporting

console.log('[PATH C BASELINE] Parsed rows: ' + rows.length +
  ' | first: ' + rows[0].id + ' | last: ' + rows[rows.length - 1].id);

// ── Silence the detector's per-row noise for the scan loop (keep error) ────
console.log = () => {};
console.debug = () => {};
console.warn = () => {};

// ── 9. Loose comparison helpers (case-insensitive, honorific-stripping) ─────
function normalizeForCompare(s) {
  let n = String(s).toLowerCase().trim();
  n = n.replace(/^(?:dr|mr|mrs|ms|engr|atty|kapitan|kap|mang|ate|kuya)\.?\s+/, '');
  n = n.replace(/[.,;:!?]+$/, '').trim();
  return n;
}

function buildComparison(expected, actuals) {
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
      matched.push({ type: e.type, patternId: e.patternId, text: e.text, rawMatch: actuals[foundIdx].rawMatch });
    } else {
      missing.push({ type: e.type, patternId: e.patternId, text: e.text });
    }
  }
  const spurious = [];
  for (let i = 0; i < actuals.length; i++) {
    if (!used[i]) spurious.push({ patternId: actuals[i].patternId, rawMatch: actuals[i].rawMatch });
  }
  return { matched, missing, spurious };
}

// ── 10. Run every row through the faithful Path C pipeline ───────────────────
const NLP_IDS = new Set(['nlp_person_name', 'nlp_job_title', 'nlp_organization']);
const outRows = [];
const summary = {
  totalRows: rows.length,
  shouldFlagYes: 0,
  shouldFlagNo: 0,
  rowsWithNlpFindings: 0,
  rowsWithNoNlpFindings: 0,
  totalNlpFindings: 0,
  byType: { nlp_person_name: 0, nlp_job_title: 0, nlp_organization: 0 },
  shouldFlagYes_allExpectedMatched: 0,
  shouldFlagYes_missingSome: 0,
  shouldFlagYes_spuriousExtras: 0,
  shouldFlagNo_correctlyEmpty: 0,
  shouldFlagNo_spuriousFindings: 0
};
const falsePositiveIds = []; // shouldFlagNo rows that produced nlp findings
const falseNegativeIds = []; // shouldFlagYes rows missing expected findings

for (const r of rows) {
  if (r.shouldFlag === 'yes') summary.shouldFlagYes++; else summary.shouldFlagNo++;
  const textNLP = N.normalizePath_C(r.prompt);
  let findings = [];
  try {
    findings = D.scan(textNLP) || [];
  } catch (err) {
    console.error('[PATH C BASELINE] scan error on ' + r.id + ': ' + err.message);
    findings = [];
  }
  const nlpFindings = findings.filter(f => NLP_IDS.has(f.patternId));
  const actualNlpFindings = nlpFindings.map(f => ({
    patternId: f.patternId,
    rawMatch: f.rawMatch,
    safeVersion: f.safeVersion,
    source: f.source,
    extractionMethod: f.extractionMethod
  }));

  const counts = { nlp_person_name: 0, nlp_job_title: 0, nlp_organization: 0 };
  for (const f of nlpFindings) counts[f.patternId]++;
  summary.totalNlpFindings += nlpFindings.length;
  summary.byType.nlp_person_name += counts.nlp_person_name;
  summary.byType.nlp_job_title += counts.nlp_job_title;
  summary.byType.nlp_organization += counts.nlp_organization;
  if (nlpFindings.length > 0) summary.rowsWithNlpFindings++; else summary.rowsWithNoNlpFindings++;

  const comparison = buildComparison(r.expectedFindings, actualNlpFindings);

  if (r.shouldFlag === 'yes') {
    if (comparison.missing.length === 0) summary.shouldFlagYes_allExpectedMatched++;
    if (comparison.missing.length > 0) { summary.shouldFlagYes_missingSome++; falseNegativeIds.push(r.id); }
    if (comparison.spurious.length > 0) summary.shouldFlagYes_spuriousExtras++;
  } else {
    if (nlpFindings.length === 0) summary.shouldFlagNo_correctlyEmpty++;
    else { summary.shouldFlagNo_spuriousFindings++; falsePositiveIds.push(r.id); }
  }

  outRows.push({
    id: r.id,
    prompt: r.prompt,
    shouldFlag: r.shouldFlag,
    expectedRisk: r.expectedRisk,
    expectedFindings: r.expectedFindings,
    actualNlpFindings,
    counts,
    comparison
  });
}

// ── 11. Discrepancy analysis (reasoned, no browser available) ────────────────
const discrepancyFlags = [];

// (a) compromise load — primary divergence source; checked above
discrepancyFlags.push({
  id: 'check-compromise',
  reason: 'compromise loaded on window.nlp (' + compromiseType + '); STAGE-3 validation gate runs as in browser — NOT a divergence source.'
});

// (b) line-break (⏎) rows — Path C collapses all whitespace to single spaces,
//     so real newlines (browser) and the harness \n both collapse identically.
//     Flag any ⏎ row whose comparison is not a clean pass.
const lineBreakRows = rows.filter(r => r.hadLineBreak).map(r => r.id);
const lineBreakSuspect = outRows.filter(o => o.id && lineBreakRows.includes(o.id) &&
  (o.comparison.missing.length > 0 || o.comparison.spurious.length > 0)).map(o => o.id);
discrepancyFlags.push({
  ids: lineBreakRows,
  reason: '⏎ prompts (' + lineBreakRows.length + ' rows). normalizePath_C collapses all whitespace to single spaces, so browser (real newlines) and harness (\\n) collapse identically — no structural divergence. Suspect-result rows (missing/spurious): ' +
    (lineBreakSuspect.length ? lineBreakSuspect.join(', ') : 'none')
});

// (c) zero-width space — C-031. sharedLayer() strips U+200B via INVISIBLE_RE.
const c031 = outRows.find(o => o.id === 'C-031');
if (c031) {
  discrepancyFlags.push({
    id: 'C-031',
    reason: 'Zero-width space inside name. normalizePath_C -> sharedLayer strips U+200B (same in browser and harness, so consistent). ' +
      'Result: ' + (c031.comparison.missing.length === 0 ? 'name matched (' + (c031.actualNlpFindings.map(f => f.rawMatch).join('; ') || 'none') + ')' : 'MISSING expected name')
  });
}

// (d) ALL-CAPS — C-008. normalizePath_C capsGuard sentence-cases >70% caps text.
const c008 = outRows.find(o => o.id === 'C-008');
if (c008) {
  const detected = c008.actualNlpFindings.filter(f => f.patternId === 'nlp_person_name').map(f => f.rawMatch).join('; ');
  discrepancyFlags.push({
    id: 'C-008',
    reason: 'ALL-CAPS prompt. normalizePath_C capsGuard sentence-cases it before scan. Detected name(s): ' + (detected || 'NONE') +
      (c008.comparison.missing.length === 0 ? ' — matches expected (case-insensitive).' : ' — MISSING expected name.')
  });
}

// (e) rows whose result looks environment-dependent — none expected beyond the
//     items above, because the gate and NLP are pure JS and run identically.
discrepancyFlags.push({
  id: 'check-other',
  reason: 'No other known browser-vs-node divergence source identified (compromise is pure JS; Path C whitespace handling is identical once normalised).'
});

// ── 12. Assemble baseline.json ───────────────────────────────────────────────
const baseline = {
  generatedAt: new Date().toISOString(),
  harnessConfig: {
    compromiseLoaded,
    compromiseType,
    normalizer: 'TrustNormalizer.normalizePath_C',
    scanFunction: 'TrustLinguisticDetector.scan',
    totalRowsParsed: rows.length,
    testFile: TEST_FILE
  },
  summary,
  rows: outRows,
  report: {
    compromiseLoaded,
    counts: {
      rowsParsed: rows.length,
      shouldFlagYes: summary.shouldFlagYes,
      shouldFlagNo: summary.shouldFlagNo,
      rowsWithNlpFindings: summary.rowsWithNlpFindings,
      rowsWithNoNlpFindings: summary.rowsWithNoNlpFindings,
      totalNlpFindings: summary.totalNlpFindings,
      byType: summary.byType,
      shouldFlagYes_allExpectedMatched: summary.shouldFlagYes_allExpectedMatched,
      shouldFlagYes_missingSome: summary.shouldFlagYes_missingSome,
      shouldFlagYes_spuriousExtras: summary.shouldFlagYes_spuriousExtras,
      shouldFlagNo_correctlyEmpty: summary.shouldFlagNo_correctlyEmpty,
      shouldFlagNo_spuriousFindings: summary.shouldFlagNo_spuriousFindings
    },
    falsePositiveIds,   // shouldFlagNo rows that produced nlp findings
    falseNegativeIds,   // shouldFlagYes rows missing expected findings
    lineBreakRows,
    discrepancyFlags
  }
};

const OUT_PATH = process.argv[2] || 'baseline.json';
fs.writeFileSync(OUT_PATH, JSON.stringify(baseline, null, 2), 'utf8');

// ── 13. Print summary to stdout ─────────────────────────────────────────────
console.log = _origLog;
console.log('========================================================');
console.log('[PATH C BASELINE] ' + OUT_PATH + ' written (' + rows.length + ' rows).');
console.log('--- COUNTS ---');
console.log('Rows parsed:                ' + rows.length + ' (first ' + rows[0].id + ', last ' + rows[rows.length-1].id + ')');
console.log('compromise loaded:          ' + compromiseLoaded + ' (typeof window.nlp = ' + compromiseType + ')');
console.log('shouldFlag yes / no:        ' + summary.shouldFlagYes + ' / ' + summary.shouldFlagNo);
console.log('rows with nlp findings:     ' + summary.rowsWithNlpFindings + ' | rows with none: ' + summary.rowsWithNoNlpFindings);
console.log('total nlp findings:         ' + summary.totalNlpFindings);
console.log('  nlp_person_name:           ' + summary.byType.nlp_person_name);
console.log('  nlp_job_title:             ' + summary.byType.nlp_job_title);
console.log('  nlp_organization:           ' + summary.byType.nlp_organization);
console.log('--- COMPARISON (shouldFlag=yes) ---');
console.log('all expected matched:       ' + summary.shouldFlagYes_allExpectedMatched);
console.log('missing some:               ' + summary.shouldFlagYes_missingSome + (falseNegativeIds.length ? '  -> ' + falseNegativeIds.join(', ') : ''));
console.log('spurious extras:            ' + summary.shouldFlagYes_spuriousExtras);
console.log('--- COMPARISON (shouldFlag=no) ---');
console.log('correctly empty:            ' + summary.shouldFlagNo_correctlyEmpty);
console.log('spurious findings (FP):     ' + summary.shouldFlagNo_spuriousFindings + (falsePositiveIds.length ? '  -> ' + falsePositiveIds.join(', ') : ''));
console.log('--- LINE-BREAK ROWS (' + lineBreakRows.length + ') ---');
console.log(lineBreakRows.join(', '));
console.log('--- DISCREPANCY FLAGS ---');
for (const f of discrepancyFlags) {
  const tag = f.id ? f.id : (f.ids ? f.ids.length + ' rows' : 'other');
  console.log('[' + tag + '] ' + f.reason);
}
console.log('========================================================');
