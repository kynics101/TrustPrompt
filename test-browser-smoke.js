#!/usr/bin/env node
/**
 * test-browser-smoke.js - browser-like smoke test.
 *
 *   node test-browser-smoke.js
 *
 * Loads the extension scripts (same order as the content scripts) into a vm context that has NO process, NO require,
 * NO module/exports, NO fs and NO Buffer, like a Chrome page. It then runs 20 prompts (public figures, brands, names,
 * organizations, job titles) through the detector alone and through the full TrustScanner.scan, and FAILS when
 *   1. a script throws while loading, or a scan throws;
 *   2. the browser-like findings differ from the Node findings (same files in a context that DOES have process/require,
 *      and the detector loaded with require() as the other test-*.js scripts do);
 *   3. a quick sanity expectation for the prompt does not hold;
 *   4. a browser-run file mentions process / require( / module.exports outside a guard (static check).
 * Exit code 1 on any failure.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = __dirname + '/';
const FILES = ['lib/validator.min.js', 'lib/compromise.min.js', 'ph-address-db.js', 'terms-identity.js', 'normalizer.js', 'patterns.js',
  'terms-medical.js', 'terms-financial.js', 'terms-organizations.js', 'terms-occupations.js', 'terms-names.js', 'terms-names-extra.js',
  'context-attribution.js', 'gazetteer.js', 'organization-loader.js', 'organization-detector-enhanced.js', 'linguistic-detector.js',
  'validator-wrapper.js', 'scanner.js'];

// [prompt, expectation]: expectation = { person|org|job: [words that must appear in a finding of that type] , none: 'person'|'org'|'job'|'*' = no such finding }
const PROMPTS = [
  ['Write a speech about Jose Rizal and Emilio Aguinaldo.', { none: 'person' }],
  ['Compare the policies of Ferdinand Marcos and Corazon Aquino.', { none: 'person' }],
  ['Who founded Microsoft and what is Bill Gates known for?', { none: 'person' }],
  ['Which is better, Amazon or Shopee, for buying a phone?', { none: '*' }],
  ['What is the capital of India and who is its prime minister?', { none: 'person' }],
  ['Is a Visa card or a Mastercard better for travel?', { none: 'org' }],
  ['Please call Juan Dela Cruz about the invoice tomorrow.', { person: ['juan', 'cruz'] }],
  ['My cousin Maria Santos will pick up the package.', { person: ['santos'] }],
  ['Employee list: Magsino, Rosalinda Joy, hired in 2019.', { person: ['magsino'] }],
  ['i am mark villianueva, secuity guard in sm megamall', { person: ['mark'], job: ['guard'] }],
  ['I work at Globe Telecom as a network engineer.', { org: ['globe'] }],
  ['I am a nurse at ST. LUKE\'S and my shift starts at six.', { org: ['luke'] }],
  ['I\'m a student at Mapua Malayan Colleges Laguna.', { org: ['mapua'] }],
  ['The audit was done by sgv and co last year.', { org: ['sgv'] }],
  ['I\'m the barangay captain of a small barangay in Batanes.', { job: ['captain'] }],
  ['customer jenny lim, teacher at ateneo, says the class is full', { person: ['jenny'], job: ['teacher'] }],
  ['Write a news brief about the PNP and the NBI.', { none: 'org' }],
  ['Explain how a call center agent differs from a bank teller.', { none: '*' }],
  ['My uncle is a seaman and my aunt is a call center agent.', { job: ['seaman'] }],
  ['Give me a recipe for garlic shrimp with rice.', { none: '*' }],
];

const ID = { person: 'nlp_person_name', job: 'nlp_job_title', org: 'nlp_organization' };
const fails = [];
const fail = m => fails.push(m);

// ---- 4. static check: no Node-only globals in the browser-run files --------------------------------------------------
const NODE_ONLY = /(^|[^.\w$])(process\.(env|stderr|stdout|argv|exit|cwd|platform|nextTick)|require\s*\(|module\.exports|__dirname)/;
for (const f of FILES) {
  if (f.startsWith('lib/') || f === 'ph-address-db.js') continue;
  const lines = fs.readFileSync(R + f, 'utf8').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const code = ln.replace(/^\s*(\/\/.*|\*.*|\/\*.*)$/, '');
    if (!NODE_ONLY.test(code)) return;
    // allowed only when guarded by typeof (the usual "if (typeof module !== 'undefined')" export)
    const ctx = lines.slice(Math.max(0, i - 6), i + 1).join(' ');
    if (/typeof\s+(module|process|require|exports)\b/.test(ctx)) return;
    fail(`static: ${f}:${i + 1} uses a Node-only global unguarded: ${ln.trim().slice(0, 100)}`);
  });
}

// ---- sandbox builders ---------------------------------------------------------------------------------------------
function makeSandbox(withNode) {
  const quiet = { log() {}, debug() {}, warn() {}, error() {}, info() {} };
  const sb = {
    console: quiet, performance: { now: () => Date.now() }, setTimeout, clearTimeout, setInterval, clearInterval,
    atob: s => Buffer.from(s, 'base64').toString('binary'), btoa: s => Buffer.from(s, 'binary').toString('base64'),
    chrome: { runtime: { getURL: p => R + p, sendMessage() {}, onMessage: { addListener() {} } }, storage: { local: { get: (k, cb) => cb && cb({}), set() {} } } },
    fetch: async () => { throw new Error('nofetch'); },
    document: { title: 't', addEventListener() {}, querySelector() { return null; }, createElement() { return { style: {}, appendChild() {}, setAttribute() {} }; } },
    navigator: { userAgent: 'smoke' }, location: { href: 'https://claude.ai/' }, TextEncoder, TextDecoder, URL, Intl,
  };
  if (withNode) { sb.process = process; sb.require = require; sb.Buffer = Buffer; }
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of FILES) {
    // module/exports appear only after lib/*.min.js: those UMD bundles would otherwise export instead of setting window.nlp
    if (withNode && !sb.module && !f.startsWith('lib/')) { sb.module = { exports: {} }; sb.exports = sb.module.exports; }
    try { vm.runInContext(fs.readFileSync(R + f, 'utf8'), sb, { filename: f }); }
    catch (e) { fail(`${withNode ? 'node' : 'browser'}-sandbox load error in ${f}: ${e.message}`); }
  }
  return sb;
}

const sig = fs_ => (fs_ || []).map(f => `${f.patternId}:${(f.rawMatch || '').toLowerCase()}${f.lowQualifying ? '*' : ''}`).sort().join(' ; ');

(async () => {
  // the sandbox must really be browser-like
  const B = makeSandbox(false);
  for (const g of ['process', 'require', 'fs', 'module', 'Buffer']) if (vm.runInContext(`typeof ${g}`, B) !== 'undefined') fail(`sandbox leak: ${g} is defined`);
  const N = makeSandbox(true);
  if (!B.TrustScanner || !B.TrustLinguisticDetector) { fail('browser sandbox did not define TrustScanner / TrustLinguisticDetector'); return report(); }

  // detector loaded with require() in this Node process, like the other test-*.js scripts
  const L = console.log; console.log = console.debug = console.warn = () => {};
  global.window = {}; global.globalThis = global; global.document = { title: 't' };
  require(R + 'terms-organizations.js'); require(R + 'terms-occupations.js'); require(R + 'terms-names.js'); require(R + 'terms-names-extra.js');
  vm.runInThisContext(fs.readFileSync(R + 'ph-address-db.js', 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
  global.window.nlp = require(R + 'lib/compromise.min.js');
  require(R + 'normalizer.js'); require(R + 'linguistic-detector.js');
  const NodeDet = globalThis.TrustLinguisticDetector, NodeNorm = globalThis.TrustNormalizer;
  global.__L = L;

  for (const [prompt, want] of PROMPTS) {
    const tag = prompt.slice(0, 60);
    let bDet, nDet, bScan, nScan;
    try { bDet = B.TrustLinguisticDetector.scan(B.TrustNormalizer.normalizePath_C(prompt)); } catch (e) { fail(`browser detector threw: ${tag}: ${e.message}`); continue; }
    try { nDet = NodeDet.scan(NodeNorm.normalizePath_C(prompt)); } catch (e) { fail(`node detector threw: ${tag}: ${e.message}`); continue; }
    try { bScan = await B.TrustScanner.scan(prompt); } catch (e) { fail(`browser scanner threw: ${tag}: ${e.message}`); continue; }
    try { nScan = await N.TrustScanner.scan(prompt); } catch (e) { fail(`node scanner threw: ${tag}: ${e.message}`); continue; }
    if (sig(bDet) !== sig(nDet)) fail(`detector differs browser vs node: ${tag}\n     browser: ${sig(bDet)}\n     node:    ${sig(nDet)}`);
    if (sig(bScan.findings) !== sig(nScan.findings) || bScan.riskLevel !== nScan.riskLevel || bScan.score !== nScan.score)
      fail(`scanner differs browser vs node: ${tag}\n     browser: ${bScan.riskLevel}/${bScan.score} ${sig(bScan.findings)}\n     node:    ${nScan.riskLevel}/${nScan.score} ${sig(nScan.findings)}`);
    const fnd = (bScan.findings || []).filter(f => /^nlp_/.test(f.patternId));
    if (want.none) {
      const hit = fnd.filter(f => want.none === '*' || f.patternId === ID[want.none]);
      if (hit.length) fail(`expected no ${want.none} finding: ${tag} => ${hit.map(f => f.patternId + ':' + f.rawMatch).join(' | ')}`);
    }
    for (const t of ['person', 'org', 'job']) for (const w of (want[t] || [])) {
      if (!fnd.some(f => f.patternId === ID[t] && (f.rawMatch || '').toLowerCase().includes(w))) fail(`expected ${t} containing "${w}": ${tag} => ${fnd.map(f => f.patternId.replace('nlp_', '') + ':' + f.rawMatch).join(' | ') || '-'}`);
    }
  }
  report();
})().catch(e => { fail('harness error: ' + e.stack); report(); });

function report() {
  console.log = global.__L || console.log;
  if (fails.length) { console.log(`FAIL ${fails.length} problem(s):`); fails.forEach(x => console.log('  ' + x)); process.exit(1); }
  console.log(`OK browser-like smoke test: ${PROMPTS.length} prompts, no throws, browser == node`);
}
