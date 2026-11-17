#!/usr/bin/env node
/**
 * test-structural-orgs.js — Benign-phrase test for findOrganizationsStructural (Group 2b)
 *
 * Tests that common title-case phrases that happen to contain org head words or
 * capitalized sequences are NOT misclassified as nlp_organization findings after
 * the Group 2b fixes.
 *
 * Because findOrganizationsStructural is a private function inside the IIFE, we
 * invoke it indirectly through TrustLinguisticDetector.scan() and filter for
 * nlp_organization findings.
 *
 * Usage:  node test-structural-orgs.js
 */
'use strict';

// ── Browser-environment globals ───────────────────────────────────────────────
global.window = {};
global.globalThis = global;
global.document = { title: 'Structural Org Test' };

// ── Suppress init noise ───────────────────────────────────────────────────────
const _logs = [];
const _origLog = console.log;
const _origDebug = console.debug;
const _origWarn = console.warn;
console.log   = (...a) => _logs.push(a.join(' '));
console.debug = (...a) => {};  // suppress debug noise entirely
console.warn  = (...a) => _logs.push(['[warn]', ...a].join(' '));

// ── Load stack ────────────────────────────────────────────────────────────────
require('./terms-organizations.js');
require('./terms-occupations.js');
const _nlp = require('./lib/compromise.min.js');
if (typeof global.window.nlp === 'undefined') global.window.nlp = _nlp;
require('./normalizer.js');
require('./linguistic-detector.js');

// Restore console
console.log   = _origLog;
console.debug = _origDebug;
console.warn  = _origWarn;

const D = globalThis.TrustLinguisticDetector;
const N = globalThis.TrustNormalizer;

// ── Test phrases ──────────────────────────────────────────────────────────────
// Each entry: { phrase, expectFlagged, note }
//   expectFlagged = false → should NOT produce nlp_organization
//   expectFlagged = true  → IS a legitimate org (expected true positive — document only)
const TEST_PHRASES = [
  // ── Explicit phrases from the user's Group 2b request ──
  { phrase: 'Unit Testing Basics',        expectFlagged: false, note: 'head word at start without preposition' },
  { phrase: 'School Year Planner',        expectFlagged: false, note: 'head word at start without preposition' },
  { phrase: 'Office Hours Schedule',      expectFlagged: false, note: 'head word at start without preposition' },
  { phrase: 'Center Stage Tickets',       expectFlagged: false, note: 'head word at start without preposition' },
  { phrase: 'Agency Workers Policy',      expectFlagged: false, note: 'head word at start without preposition' },

  // ── Course and academic names (benign) ──
  { phrase: 'Foundation of Mathematics',  expectFlagged: false, note: 'course name — "Foundation of" is idiomatic, not a preposition-gated org head' },
  { phrase: 'Association of Ideas',       expectFlagged: false, note: 'philosophy concept — "Association" is head-suffix pattern but "Ideas" is lowercase in normal usage; may flag as capitalized — document if so' },
  { phrase: 'Office of Dreams',           expectFlagged: false, note: 'creative phrase — "Office of" matches HEAD_PREPOSITION but "Dreams" is not a proper place name; ideally not flagged' },
  { phrase: 'Society Column',             expectFlagged: false, note: 'newspaper column name — no preceding capitalized name fragment' },
  { phrase: 'School of Hard Knocks',      expectFlagged: false, note: 'common idiom — not an org even though it matches pattern' },
  { phrase: 'Center of Gravity',          expectFlagged: false, note: 'physics term — not an org' },
  { phrase: 'Agency Problem',             expectFlagged: false, note: 'economics term — not an org' },
  { phrase: 'Council Tax Advice',         expectFlagged: false, note: 'UK tax phrase — not an org (no proper noun follows "Council")' },
  { phrase: 'Commission Junction',        expectFlagged: true,  note: 'REAL company (affiliate network) — EXPECTED to flag as a true positive; OK to flag' },
  { phrase: 'Department Store Hours',     expectFlagged: false, note: '"Department Store" is a generic noun phrase, not an org; "Hours" is not a proper name following "of"' },

  // ── Product / brand names that share head words (benign) ──
  { phrase: 'Office Depot',              expectFlagged: false, note: 'real company but "Depot" is a common word; if CSV has it, CSV will detect it; structural should not flag spuriously' },
  { phrase: 'Center Parcs',              expectFlagged: false, note: 'proper noun but not a PH-relevant org; if not in CSV, structural should not flag (no preposition after "Center")' },
  { phrase: 'School Daze',               expectFlagged: false, note: 'movie title — not an org' },
  { phrase: 'Authority Figures',         expectFlagged: false, note: 'generic phrase — head word without preposition' },
  { phrase: 'Commission Report',         expectFlagged: false, note: 'generic phrase — head word without preposition' },
  { phrase: 'Council Bluffs Iowa',       expectFlagged: false, note: 'place name — Council Bluffs is a city, not an org name' },

  // ── Section / event headings ──
  { phrase: 'Foundation Year Programme', expectFlagged: false, note: 'academic programme name — not an org' },
  { phrase: 'Society for Creative Ideas', expectFlagged: false, note: 'borderline — "Society for" matches no head-suffix pattern, and no HEAD_PREPOSITION pattern matches "Society"; should be benign' },
  { phrase: 'Center Stage Performance',  expectFlagged: false, note: 'event heading — no preposition gate' },
  { phrase: 'Agency Newsletter July',    expectFlagged: false, note: 'newsletter heading — not an org' },

  // ── Expected TRUE POSITIVES (document only — these SHOULD flag) ──
  { phrase: 'Federal Bureau of Investigation', expectFlagged: true, note: 'CORRECT: major US gov org, preposition-gated pattern matches' },
  { phrase: 'Bureau of Fire Protection',       expectFlagged: true, note: 'CORRECT: PH gov org, preposition-gated pattern matches' },
  { phrase: 'Bureau of Standards',             expectFlagged: true, note: 'CORRECT: gov standards body, preposition-gated pattern matches' },
  { phrase: 'Office of the Ombudsman',         expectFlagged: true, note: 'CORRECT: PH gov office, preposition-gated with "the"' },
  { phrase: 'Commission on Audit',             expectFlagged: true, note: 'CORRECT: PH gov commission, matches "Commission on"' },
  { phrase: 'Department of Education',         expectFlagged: true, note: 'CORRECT: gov dept, DEPT_RE matches' },

  // ── "School of Thought" — borderline decision ──
  // This phrase contains a legitimate preposition after "School", so the
  // HEAD_PREPOSITION_RE will match it. "Thought" is a single capitalised word
  // but is clearly not an org. Decision: acceptable to flag given the pattern
  // purity trade-off; document as a known low-value match rather than a bug.
  { phrase: 'School of Thought',   expectFlagged: null, note: 'BORDERLINE: "School of Thought" matches HEAD_PREPOSITION_RE; flagging is a known acceptable false positive given the preposition gate. Not a blocking issue.' },

  // ── Suffix-pattern benign cases ──
  { phrase: 'The Inc.',            expectFlagged: false, note: 'stop-word-only fragment — Fix 3 should block this' },
  { phrase: 'A Corporation',       expectFlagged: false, note: 'stop-word-only fragment — Fix 3 should block this' },

  // ── Suffix-pattern TRUE POSITIVES ──
  { phrase: 'Santos-Lim Trading Corporation',  expectFlagged: true, note: 'CORRECT: hyphenated token — Fix 1 should capture full name' },
  { phrase: 'Southpoint Supplies, Inc.',       expectFlagged: true, note: 'CORRECT: comma before suffix — Fix 1 should capture full name' },
  { phrase: "O'Brien & Associates",            expectFlagged: false, note: 'No suffix word — HEAD_SUFFIX_RE does not match "Associates" (not in list); should not flag unless CSV has it' },
  { phrase: "St. Luke's Medical Center",       expectFlagged: true,  note: 'CORRECT: abbreviated prefix, apostrophe — captured via HEAD_PREPOSITION_RE if "Medical Center" is treated properly; OR via CSV if present. Structural may or may not fire depending on tokenisation.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Group 2c TEST PHRASES — benign lowercase/sentence-case/in-sentence contexts
// and institution-ending / leading-modifier true positives.
// ─────────────────────────────────────────────────────────────────────────────
const TEST_PHRASES_2C = [
  // ── Lowercase — must NOT fire ──
  { phrase: 'the center of gravity',                             expectFlagged: false, note: 'all lowercase — no org' },
  { phrase: 'a school of thought',                              expectFlagged: false, note: 'all lowercase — idiom, not org' },
  { phrase: 'office hours',                                     expectFlagged: false, note: 'all lowercase — not an org' },
  { phrase: 'the unit test',                                    expectFlagged: false, note: 'all lowercase — not an org' },
  { phrase: 'bureau of standards',                              expectFlagged: false, note: 'all lowercase — not a capitalized org reference' },

  // ── Sentence-case (first word only capitalized) — must NOT fire ──
  { phrase: 'The center of gravity is a concept in physics.',   expectFlagged: false, note: 'sentence-case: "The center" — lowercase center, not org' },
  { phrase: 'A school of thought holds that ...',              expectFlagged: false, note: 'sentence-case: "A school" — lowercase school, not org' },

  // ── Sentence-case borderline: first word capitalized only because it starts the sentence ──
  { phrase: 'Commission on time management is crucial.',        expectFlagged: null,  note: 'BORDERLINE: "Commission" is capitalized only because it is the first word; document whether HEAD_PREPOSITION_RE fires' },

  // ── In-sentence benign contexts — must NOT fire ──
  { phrase: 'Our school of design has a new director.',         expectFlagged: false, note: '"school" is lowercase mid-sentence — should not fire' },
  { phrase: 'The agency problem is discussed in economics.',    expectFlagged: false, note: '"agency" is lowercase — not an org' },
  { phrase: 'Visit the foundation office for details.',         expectFlagged: false, note: '"foundation" is lowercase — not an org' },
  { phrase: 'She went to the university last Monday.',          expectFlagged: false, note: '"university" is lowercase — not an org' },

  // ── In-sentence TRUE POSITIVES — SHOULD fire ──
  { phrase: "He works at St. Luke's Medical Center in Quezon City.", expectFlagged: true, note: "CORRECT: INSTITUTION_RE should capture \"St. Luke's Medical Center\"" },
  { phrase: 'She is a nurse at Philippine General Hospital.',   expectFlagged: true,  note: 'CORRECT: INSTITUTION_RE should capture "Philippine General Hospital"' },
  { phrase: 'He studied at De La Salle University.',           expectFlagged: null,  note: 'BORDERLINE: "De" is lowercase; "La Salle University" (starting from "La") may match; document actual result' },
  { phrase: 'My cousin works at Tarlac State University.',     expectFlagged: true,  note: 'CORRECT: INSTITUTION_RE should capture "Tarlac State University"' },
  { phrase: 'The Bureau of Internal Revenue sent a notice.',   expectFlagged: true,  note: 'CORRECT: HEAD_PREPOSITION_RE should capture "Bureau of Internal Revenue"' },
  { phrase: 'I am enrolled at Mapua Institute of Technology.', expectFlagged: true,  note: 'CORRECT: CSV or structural should capture "Mapua Institute of Technology"' },

  // ── Leading-modifier Fix A — TRUE POSITIVES ──
  { phrase: 'Federal Bureau of Investigation',                  expectFlagged: true,  note: 'CORRECT: Fix A — "Federal" should now be included in the match' },
  { phrase: 'National Commission on Indigenous Peoples',        expectFlagged: true,  note: 'CORRECT: Fix A — "National" should be captured as leading modifier' },
  { phrase: 'Philippine Statistics Authority',                  expectFlagged: null,  note: 'BORDERLINE: No preposition — HEAD_PREPOSITION_RE does not apply; but CSV exact match fires because this is a real PH gov agency in the CSV' },
];

// ── Run scans ─────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('test-structural-orgs.js — Group 2b benign-phrase test');
console.log('='.repeat(80));
console.log('');

let totalPhrases = 0;
let falsePositives = 0;    // expectFlagged=false but got nlp_organization
let falseNegatives = 0;    // expectFlagged=true but got no nlp_organization
let truePositives  = 0;
let trueNegatives  = 0;
let borderlines    = 0;

const results = [];

for (const { phrase, expectFlagged, note } of TEST_PHRASES) {
  totalPhrases++;
  // Normalize through Path C normalizer (same as the harness)
  const normalized = N.normalizePath_C(phrase);
  // Suppress scan debug output
  const saved = console.debug;
  console.debug = () => {};
  const findings = D.scan(normalized);
  console.debug = saved;

  const orgFindings = findings.filter(f => f.patternId === 'nlp_organization');
  const fired = orgFindings.length > 0;

  let status;
  if (expectFlagged === null) {
    status = 'BORDERLINE';
    borderlines++;
  } else if (expectFlagged === false && !fired) {
    status = 'PASS (correct negative)';
    trueNegatives++;
  } else if (expectFlagged === false && fired) {
    status = '⚠ FALSE POSITIVE';
    falsePositives++;
  } else if (expectFlagged === true && fired) {
    status = '✓ TRUE POSITIVE';
    truePositives++;
  } else {
    status = '✗ FALSE NEGATIVE (expected to flag)';
    falseNegatives++;
  }

  results.push({ phrase, expectFlagged, fired, orgFindings, status, note });
}

// ── Print results table ───────────────────────────────────────────────────────
console.log('Results per phrase:');
console.log('-'.repeat(80));

for (const r of results) {
  const orgText = r.orgFindings.length > 0
    ? r.orgFindings.map(f => `"${f.rawMatch}"`).join(', ')
    : '(none)';
  console.log(`${r.status}`);
  console.log(`  Phrase:   "${r.phrase}"`);
  console.log(`  Orgs:     ${orgText}`);
  console.log(`  Note:     ${r.note}`);
  console.log('');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('='.repeat(80));
console.log('SUMMARY');
console.log('='.repeat(80));
console.log(`Total phrases tested : ${totalPhrases}`);
console.log(`True negatives (PASS): ${trueNegatives}  (benign phrases correctly not flagged)`);
console.log(`True positives       : ${truePositives}  (org phrases correctly flagged)`);
console.log(`FALSE POSITIVES      : ${falsePositives}  (benign phrases incorrectly flagged — should be 0)`);
console.log(`False negatives      : ${falseNegatives}  (org phrases missed)`);
console.log(`Borderline           : ${borderlines}  (see notes)`);
console.log('');
if (falsePositives === 0) {
  console.log('✅ All benign phrases are correctly not flagged as organizations.');
} else {
  console.log(`⚠ ${falsePositives} benign phrase(s) were incorrectly flagged. Review above.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP 2c TEST RUN
// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('='.repeat(80));
console.log('GROUP 2c — lowercase / sentence-case / in-sentence / institution / leading-modifier');
console.log('='.repeat(80));
console.log('');

let c_total = 0, c_fp = 0, c_fn = 0, c_tp = 0, c_tn = 0, c_border = 0;
const c_results = [];

for (const { phrase, expectFlagged, note } of TEST_PHRASES_2C) {
  c_total++;
  const normalized = N.normalizePath_C(phrase);
  const savedDbg = console.debug;
  console.debug = () => {};
  const findings = D.scan(normalized);
  console.debug = savedDbg;

  const orgFindings = findings.filter(f => f.patternId === 'nlp_organization');
  const fired = orgFindings.length > 0;

  let status;
  if (expectFlagged === null) {
    status = 'BORDERLINE';
    c_border++;
  } else if (expectFlagged === false && !fired) {
    status = 'PASS (correct negative)';
    c_tn++;
  } else if (expectFlagged === false && fired) {
    status = '⚠ FALSE POSITIVE';
    c_fp++;
  } else if (expectFlagged === true && fired) {
    status = '✓ TRUE POSITIVE';
    c_tp++;
  } else {
    status = '✗ FALSE NEGATIVE (expected to flag)';
    c_fn++;
  }

  c_results.push({ phrase, normalized, expectFlagged, fired, orgFindings, status, note });
}

console.log('Results per phrase:');
console.log('-'.repeat(80));
for (const r of c_results) {
  const orgText = r.orgFindings.length > 0
    ? r.orgFindings.map(f => `"${f.rawMatch}"`).join(', ')
    : '(none)';
  console.log(`${r.status}`);
  console.log(`  Phrase:      "${r.phrase}"`);
  console.log(`  Normalized:  "${r.normalized}"`);
  console.log(`  nlp_org:     ${orgText}`);
  console.log(`  Note:        ${r.note}`);
  console.log('');
}

console.log('='.repeat(80));
console.log('GROUP 2c SUMMARY');
console.log('='.repeat(80));
console.log(`Total phrases tested : ${c_total}`);
console.log(`True negatives (PASS): ${c_tn}`);
console.log(`True positives       : ${c_tp}`);
console.log(`FALSE POSITIVES      : ${c_fp}  ← should be 0`);
console.log(`False negatives      : ${c_fn}`);
console.log(`Borderline           : ${c_border}`);
console.log('');
if (c_fp === 0) {
  console.log('✅ Group 2c: No false positives on benign phrases.');
} else {
  console.log(`⚠ Group 2c: ${c_fp} false positive(s) detected — review above.`);
}
