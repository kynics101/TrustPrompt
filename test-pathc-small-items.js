#!/usr/bin/env node
/**
 * test-pathc-small-items.js — held-out check for the five "small items" of Path C (salutation fragment, hyphenated given names,
 * "this is X" cues, bare first name before "and", appositive "a/an/the <title> from|at|of <Org>").
 *
 *   node test-pathc-small-items.js <test-data/file> [--fail]        DET=<detector copy> runs another build
 *
 * File format, one case per line:  kind|type|text|expect|forbid
 *   kind   pos = the finding of <type> that contains every word of <expect> must exist, and no finding of <type> may contain a word of <forbid>
 *          neg = no finding of <type> at all (type * = any nlp_* finding)
 *   type   person | job | org | *      expect, forbid: words separated by ';' (forbid is matched as whole words, case-insensitive)
 * The sentences are written before the code that they test and are invented; nothing is taken from the 161 rows or from any unseen set.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
const R = __dirname + '/';
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log; console.log = console.debug = console.warn = () => {};
require(R + 'terms-organizations.js'); require(R + 'terms-occupations.js'); require(R + 'terms-names.js'); require(R + 'terms-names-extra.js');
vm.runInThisContext(fs.readFileSync(R + 'ph-address-db.js', 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require(R + 'lib/compromise.min.js');
require(R + 'normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : R + 'linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const ID = { person: 'nlp_person_name', job: 'nlp_job_title', org: 'nlp_organization' };
const lines = fs.readFileSync(path.resolve(process.argv[2]), 'utf8').split(/\r?\n/).filter(l => l && !l.startsWith('#'));
const res = {}; const fails = [];
for (const l of lines) {
  // the sentence itself may contain "|" (a resume / signature separator): kind and type are the first two fields, expect and forbid the last two of a pos line
  const f = l.split('|'), kind = f[0], type = f[1];
  const isPos = kind.startsWith('pos');
  const text = isPos ? f.slice(2, f.length - 2).join('|') : f.slice(2).join('|'), expect = isPos ? f[f.length - 2] : '', forbid = isPos ? f[f.length - 1] : '';
  const fs_ = Det.scan(N.normalizePath_C(text)).filter(x => type === '*' ? /^nlp_/.test(x.patternId) : x.patternId === ID[type]).map(x => x.rawMatch);
  const words = s => s.toLowerCase().split(/[\s]+/).map(w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean);
  let ok;
  if (kind === 'neg') ok = fs_.length === 0;  // kinds pos* (pos, posu, ...) all use the else branch
  else {
    const ex = expect.split(';').filter(Boolean).map(s => s.toLowerCase()), fb = new Set(forbid.split(';').filter(Boolean).map(s => s.toLowerCase()));
    ok = fs_.some(m => { const w = words(m); return ex.every(e => e.split(/\s+/).every(t => w.includes(t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')))); }) && !fs_.some(m => words(m).some(w => fb.has(w)));
  }
  const key = kind + '/' + type; const r = res[key] || (res[key] = { n: 0, ok: 0 }); r.n++; if (ok) r.ok++; else fails.push(`${kind}/${type}: ${text}  => ${fs_.join(' | ') || '-'}`);
}
let N_ = 0, K_ = 0; for (const [k, v] of Object.entries(res)) { N_ += v.n; K_ += v.ok; L(`  ${k.padEnd(12)} ${v.ok}/${v.n}`); }
L(`  TOTAL ${K_}/${N_}`);
if (process.argv.includes('--fail')) fails.forEach(f => L('   FAIL ' + f));
