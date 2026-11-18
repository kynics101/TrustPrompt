#!/usr/bin/env node
/**
 * test-group4-speed.js — time normalizePath_C + scan() for one short and one long prompt, repeated.
 *   node test-group4-speed.js [repeats]      (DET=<detector copy> to time another build)
 * Measurement only. Prints every repetition, because the machine state (idle or not) is not known to the script.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log, D = console.debug, W = console.warn;
console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require(process.env.NORM ? path.resolve(process.env.NORM) : './normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const SHORT = 'Please send the notes to Beatriz Quintanilla tomorrow.';
const LONG = ('Please proofread this resume summary. Esteban Miguel Quintanilla III is a senior accountant at Montoya General Hospital in Tarlac City. ' +
  'He previously worked as a payroll officer at Whitfield Holdings Inc and as an auditor for Aldridge and Partners. His references are ' +
  'Dr. Priya Kowalski, the head of the finance department, and Hilario Ferrer, the branch manager. Contact Lourdes Abella at the main office ' +
  'if you need more details about his certifications, his training record and his availability for an interview next week. ').repeat(3);
const time = p => { const t0 = process.hrtime.bigint(); const f = Det.scan(N.normalizePath_C(p)); return [Number(process.hrtime.bigint() - t0) / 1e6, f.filter(x => /^nlp_/.test(x.patternId)).length]; };
const reps = parseInt(process.argv[2] || '3', 10);
console.log = L;
L(`short prompt (${SHORT.length} chars), first call includes warm-up:`);
for (let i = 0; i < reps; i++) { const [ms, n] = time(SHORT); L(`   run ${i + 1}: ${ms.toFixed(0)} ms (${n} findings)`); }
L(`long prompt (${LONG.length} chars):`);
for (let i = 0; i < reps; i++) { const [ms, n] = time(LONG); L(`   run ${i + 1}: ${ms.toFixed(0)} ms (${n} findings)`); }
