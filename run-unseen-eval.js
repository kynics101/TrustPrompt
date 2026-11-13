#!/usr/bin/env node
/**
 * run-unseen-eval.js — Unseen-set evaluation harness
 *
 * Evaluates the current detector against an external JSON test set
 * (unseen_set.json format: [{id, prompt, should_flag, persons, jobs, orgs, tag}]).
 *
 * Usage:  node run-unseen-eval.js <input_path> [output_path]
 *   input_path  : path to the unseen JSON file (outside repo)
 *   output_path : optional; defaults to results/unseen-eval.json
 *
 * NO CODE CHANGES PERMITTED — measurement only.
 */

'use strict';

// ── 1. Browser-environment globals (BEFORE any require) ──────────────────────
global.window = {};
global.globalThis = global;
global.document = { title: 'Unseen Eval Harness' };

// ── 2. Suppress detector init noise ─────────────────────────────────────────
const _initLogs = [];
const _origLog   = console.log;
const _origDebug = console.debug;
const _origWarn  = console.warn;
const _origError = console.error;
console.log   = (...a) => _initLogs.push(['log',   ...a]);
console.debug = (...a) => _initLogs.push(['debug', ...a]);
console.warn  = (...a) => _initLogs.push(['warn',  ...a]);

// ── 3. Load term data FIRST ──────────────────────────────────────────────────
require('./terms-organizations.js');
require('./terms-occupations.js');
require('./terms-names.js');           // as manifest.json: the detector's name anchor needs NAMES_DATA
require('./terms-names-extra.js');     // as manifest.json: the extra names (NAMES_EXTRA_DATA), loaded before the detector
require('vm').runInThisContext(
  require('fs').readFileSync(require('path').join(__dirname, 'ph-address-db.js'), 'utf8') +
  ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;'
);

// ── 4. Wire compromise.min.js onto window.nlp ────────────────────────────────
const _nlpExport = require('./lib/compromise.min.js');
if (typeof global.window.nlp === 'undefined') {
  global.window.nlp = _nlpExport;
}

// ── 5. Normalizer + detector ─────────────────────────────────────────────────
require('./normalizer.js');
require('./linguistic-detector.js');

const D = globalThis.TrustLinguisticDetector;
const N = globalThis.TrustNormalizer;

// ── 6. Restore console for our own output ────────────────────────────────────
console.log   = _origLog;
console.debug = _origDebug;
console.warn  = _origWarn;

const compromiseLoaded = typeof global.window.nlp === 'function';
console.log('========================================================');
console.log('[UNSEEN EVAL] compromiseLoaded:', compromiseLoaded,
  '| typeof window.nlp:', typeof global.window.nlp);
console.log('[UNSEEN EVAL] TrustLinguisticDetector:', typeof D,
  '| TrustNormalizer:', typeof N);

if (!compromiseLoaded) {
  console.error('[UNSEEN EVAL] FATAL: window.nlp is not a function. Aborting.');
  process.exit(1);
}
if (typeof D !== 'object' || typeof D.scan !== 'function') {
  console.error('[UNSEEN EVAL] FATAL: TrustLinguisticDetector.scan unavailable.');
  process.exit(1);
}
if (typeof N !== 'object' || typeof N.normalizePath_C !== 'function') {
  console.error('[UNSEEN EVAL] FATAL: TrustNormalizer.normalizePath_C unavailable.');
  process.exit(1);
}

const fs   = require('fs');
const path = require('path');

const INPUT_PATH  = process.argv[2];
const OUTPUT_PATH = process.argv[3] || path.join(__dirname, 'results', 'unseen-eval.json');

if (!INPUT_PATH) {
  console.error('[UNSEEN EVAL] Usage: node run-unseen-eval.js <input_path> [output_path]');
  process.exit(1);
}

// ── 7. Load unseen set ───────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
console.log('[UNSEEN EVAL] Loaded', raw.length, 'rows from', INPUT_PATH);

// ── 8. NLP finding filter ────────────────────────────────────────────────────
const NLP_IDS = new Set(['nlp_person_name', 'nlp_job_title', 'nlp_organization']);
const PATTERN_TO_TYPE = {
  nlp_person_name:  'person',
  nlp_job_title:    'job',
  nlp_organization: 'org'
};
const EXPECTED_FIELDS = { person: 'persons', job: 'jobs', org: 'orgs' };

// ── 9. Comparison helpers ─────────────────────────────────────────────────────
function normalizeForCompare(s) {
  let n = String(s).toLowerCase().trim();
  n = n.replace(/^(?:dr|mr|mrs|ms|engr|atty|kapitan|kap|mang|ate|kuya)\.?\s+/, '');
  n = n.replace(/[.,;:!?]+$/, '').trim();
  return n;
}

/**
 * Exact match: normalized(actual) === normalized(expected)
 * Lenient match: normalized(actual) contains normalized(expected)
 *                OR normalized(expected) contains normalized(actual)
 */
function matchExact(actualRaw, expectedText) {
  return normalizeForCompare(actualRaw) === normalizeForCompare(expectedText);
}

function matchLenient(actualRaw, expectedText) {
  const na = normalizeForCompare(actualRaw);
  const ne = normalizeForCompare(expectedText);
  return na.length > 0 && ne.length > 0 && (na === ne || na.includes(ne) || ne.includes(na));
}

/**
 * Build per-type comparison: for each expected text, find the best unused actual.
 * Returns { matched_exact, matched_lenient, missing, spurious } for one type.
 */
function compareType(expectedTexts, actualFindings) {
  const usedExact    = new Array(actualFindings.length).fill(false);
  const usedLenient  = new Array(actualFindings.length).fill(false);
  const matchedExact   = [];
  const matchedLenient = [];
  const missingExact   = [];
  const missingLenient = [];

  // --- Exact pass ---
  for (const e of expectedTexts) {
    let fi = -1;
    for (let i = 0; i < actualFindings.length; i++) {
      if (usedExact[i]) continue;
      if (matchExact(actualFindings[i].rawMatch, e)) { fi = i; break; }
    }
    if (fi >= 0) { usedExact[fi] = true; matchedExact.push({ expected: e, actual: actualFindings[fi].rawMatch }); }
    else missingExact.push(e);
  }

  // --- Lenient pass (independent of exact) ---
  for (const e of expectedTexts) {
    let fi = -1;
    for (let i = 0; i < actualFindings.length; i++) {
      if (usedLenient[i]) continue;
      if (matchLenient(actualFindings[i].rawMatch, e)) { fi = i; break; }
    }
    if (fi >= 0) { usedLenient[fi] = true; matchedLenient.push({ expected: e, actual: actualFindings[fi].rawMatch }); }
    else missingLenient.push(e);
  }

  // Spurious = actuals not consumed by ANY lenient match
  const spurious = actualFindings.filter((_, i) => !usedLenient[i]).map(f => f.rawMatch);

  return { matchedExact, matchedLenient, missingExact, missingLenient, spurious };
}

// ── 10. Scan all rows ─────────────────────────────────────────────────────────
// Silence per-row noise
console.log = () => {};
console.debug = () => {};
console.warn  = () => {};

const outRows = [];

for (const r of raw) {
  const textNLP = N.normalizePath_C(r.prompt);
  let findings = [];
  try { findings = D.scan(textNLP) || []; }
  catch (err) { findings = []; }

  const nlpFindings = findings.filter(f => NLP_IDS.has(f.patternId));
  const byType = {
    person: nlpFindings.filter(f => f.patternId === 'nlp_person_name'),
    job:    nlpFindings.filter(f => f.patternId === 'nlp_job_title'),
    org:    nlpFindings.filter(f => f.patternId === 'nlp_organization')
  };

  const cmp = {};
  if (r.should_flag) {
    for (const t of ['person', 'job', 'org']) {
      cmp[t] = compareType(r[EXPECTED_FIELDS[t]] || [], byType[t]);
    }
  }

  outRows.push({
    id: r.id,
    prompt: r.prompt,
    should_flag: r.should_flag,
    tag: r.tag || '',
    expected: { persons: r.persons || [], jobs: r.jobs || [], orgs: r.orgs || [] },
    actual: {
      persons: byType.person.map(f => f.rawMatch),
      jobs:    byType.job.map(f => f.rawMatch),
      orgs:    byType.org.map(f => f.rawMatch)
    },
    allNlpFindings: nlpFindings.map(f => ({ patternId: f.patternId, rawMatch: f.rawMatch })),
    cmp: r.should_flag ? cmp : null
  });
}

console.log = _origLog;
console.warn  = _origWarn;

// ── 11. Aggregate metrics ─────────────────────────────────────────────────────

const benignRows   = outRows.filter(r => !r.should_flag);
const positiveRows = outRows.filter(r => r.should_flag);

// Per-type and overall TP/FP/FN counters (exact and lenient)
const TYPES = ['person', 'job', 'org'];
const stats = {};
for (const t of TYPES) {
  stats[t] = { tp_e: 0, fp_e: 0, fn_e: 0, tp_l: 0, fp_l: 0, fn_l: 0 };
}
const overall = { tp_e: 0, fp_e: 0, fn_e: 0, tp_l: 0, fp_l: 0, fn_l: 0 };

for (const r of positiveRows) {
  for (const t of TYPES) {
    const c = r.cmp[t];
    const tp_e = c.matchedExact.length;
    const fn_e = c.missingExact.length;
    // FP for exact: actuals not used by exact match
    const usedByExact = new Set(c.matchedExact.map(m => m.actual));
    const fp_e = r.actual[t === 'person' ? 'persons' : t === 'job' ? 'jobs' : 'orgs']
                   .filter(a => !usedByExact.has(a)).length;

    const tp_l = c.matchedLenient.length;
    const fn_l = c.missingLenient.length;
    const fp_l = c.spurious.length;

    stats[t].tp_e += tp_e; stats[t].fn_e += fn_e; stats[t].fp_e += fp_e;
    stats[t].tp_l += tp_l; stats[t].fn_l += fn_l; stats[t].fp_l += fp_l;
    overall.tp_e += tp_e; overall.fn_e += fn_e; overall.fp_e += fp_e;
    overall.tp_l += tp_l; overall.fn_l += fn_l; overall.fp_l += fp_l;
  }
}

// Also count spurious findings on benign rows (type-level FP from benign)
const benignWithNlp = benignRows.filter(r => r.allNlpFindings.length > 0);

function prf(tp, fp, fn) {
  const p = tp + fp > 0 ? tp / (tp + fp) : 0;
  const r = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f = p + r > 0 ? 2 * p * r / (p + r) : 0;
  return { precision: +p.toFixed(4), recall: +r.toFixed(4), f1: +f.toFixed(4),
           tp, fp, fn };
}

const metrics = {
  exact: {
    person: prf(stats.person.tp_e, stats.person.fp_e, stats.person.fn_e),
    job:    prf(stats.job.tp_e,    stats.job.fp_e,    stats.job.fn_e),
    org:    prf(stats.org.tp_e,    stats.org.fp_e,    stats.org.fn_e),
    overall: prf(overall.tp_e, overall.fp_e, overall.fn_e)
  },
  lenient: {
    person: prf(stats.person.tp_l, stats.person.fp_l, stats.person.fn_l),
    job:    prf(stats.job.tp_l,    stats.job.fp_l,    stats.job.fn_l),
    org:    prf(stats.org.tp_l,    stats.org.fp_l,    stats.org.fn_l),
    overall: prf(overall.tp_l, overall.fp_l, overall.fn_l)
  }
};

// ── 12. Benign false positives ────────────────────────────────────────────────
const benignFP = benignWithNlp.map(r => ({
  id: r.id,
  findings: r.allNlpFindings,
  prompt: r.prompt
}));

// ── 13. Positive row issues ───────────────────────────────────────────────────
const positiveIssues = positiveRows
  .filter(r => {
    const any_missing = TYPES.some(t => r.cmp[t].missingLenient.length > 0);
    const any_spurious = TYPES.some(t => r.cmp[t].spurious.length > 0);
    return any_missing || any_spurious;
  })
  .map(r => {
    const missing = {};
    const spurious = {};
    for (const t of TYPES) {
      if (r.cmp[t].missingLenient.length) missing[t]   = r.cmp[t].missingLenient;
      if (r.cmp[t].spurious.length)       spurious[t]  = r.cmp[t].spurious;
    }
    return { id: r.id, tag: r.tag, prompt: r.prompt, missing, spurious };
  });

// ── 14. Hard rows ─────────────────────────────────────────────────────────────
const hardRows = outRows.filter(r => r.id === 'U-P014' || r.id === 'U-P040');

// ── 15. Write output JSON ─────────────────────────────────────────────────────
const output = {
  generatedAt: new Date().toISOString(),
  inputFile: INPUT_PATH,
  totalRows: raw.length,
  benignCount: benignRows.length,
  positiveCount: positiveRows.length,
  metrics,
  benignFP: {
    count: benignFP.length,
    rows: benignFP
  },
  positiveIssues,
  hardRows: hardRows.map(r => ({
    id: r.id, tag: r.tag, prompt: r.prompt,
    expected: r.expected,
    actual: r.actual,
    allNlpFindings: r.allNlpFindings,
    cmp: r.cmp
  })),
  allRows: outRows
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');

// ── 16. Print concise report ─────────────────────────────────────────────────
console.log('========================================================');
console.log('[UNSEEN EVAL] Written to', OUTPUT_PATH);
console.log('Total rows:', raw.length, '| Benign:', benignRows.length, '| Positive:', positiveRows.length);
console.log('');
console.log('=== METRICS — EXACT ===');
console.log('Type     P       R       F1      TP  FP  FN');
for (const t of TYPES) {
  const m = metrics.exact[t];
  console.log(t.padEnd(8), String(m.precision).padEnd(7), String(m.recall).padEnd(7), String(m.f1).padEnd(7),
    String(m.tp).padEnd(4), String(m.fp).padEnd(4), m.fn);
}
const mo_e = metrics.exact.overall;
console.log('OVERALL ', String(mo_e.precision).padEnd(7), String(mo_e.recall).padEnd(7), String(mo_e.f1).padEnd(7),
  String(mo_e.tp).padEnd(4), String(mo_e.fp).padEnd(4), mo_e.fn);
console.log('');
console.log('=== METRICS — LENIENT ===');
console.log('Type     P       R       F1      TP  FP  FN');
for (const t of TYPES) {
  const m = metrics.lenient[t];
  console.log(t.padEnd(8), String(m.precision).padEnd(7), String(m.recall).padEnd(7), String(m.f1).padEnd(7),
    String(m.tp).padEnd(4), String(m.fp).padEnd(4), m.fn);
}
const mo_l = metrics.lenient.overall;
console.log('OVERALL ', String(mo_l.precision).padEnd(7), String(mo_l.recall).padEnd(7), String(mo_l.f1).padEnd(7),
  String(mo_l.tp).padEnd(4), String(mo_l.fp).padEnd(4), mo_l.fn);
console.log('');
console.log('=== BENIGN FALSE POSITIVES ===');
console.log('Count:', benignFP.length);
for (const b of benignFP) {
  const fStr = b.findings.map(f => PATTERN_TO_TYPE[f.patternId] + ':' + f.rawMatch).join('; ');
  console.log('  ' + b.id + ' | ' + fStr);
}
console.log('');
console.log('=== POSITIVE ROW ISSUES ===');
console.log('Rows with missing or spurious findings:', positiveIssues.length);
for (const pi of positiveIssues) {
  const missParts = TYPES.filter(t => pi.missing[t]).map(t => 'MISS ' + t + ': [' + pi.missing[t].join(', ') + ']');
  const spurParts = TYPES.filter(t => pi.spurious[t]).map(t => 'SPUR ' + t + ': [' + pi.spurious[t].join(', ') + ']');
  console.log('  ' + pi.id + (pi.tag ? ' [' + pi.tag + ']' : '') + ' | ' + [...missParts, ...spurParts].join(' | '));
}
console.log('');
console.log('=== HARD ROWS ===');
for (const hr of hardRows) {
  console.log('  ' + hr.id + ' [' + hr.tag + ']');
  console.log('    Prompt:', hr.prompt);
  console.log('    Expected persons:', hr.expected.persons.join(', ') || 'none');
  console.log('    Expected jobs:   ', hr.expected.jobs.join(', ')    || 'none');
  console.log('    Expected orgs:   ', hr.expected.orgs.join(', ')    || 'none');
  console.log('    Actual   persons:', hr.actual.persons.join(', ') || 'none');
  console.log('    Actual   jobs:   ', hr.actual.jobs.join(', ')    || 'none');
  console.log('    Actual   orgs:   ', hr.actual.orgs.join(', ')    || 'none');
}
console.log('========================================================');
