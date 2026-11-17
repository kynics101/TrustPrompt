#!/usr/bin/env node
// test-job-low.js <test-data/file>  DET=<detector copy>  kind|text ; low = some nlp_job_title finding has lowQualifying; nolow = none has it
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
let ok = 0, n = 0; const fails = [];
for (const l of fs.readFileSync(path.resolve(process.argv[2]), 'utf8').split(/\r?\n/).filter(x => x && !x.startsWith('#'))) {
  const i = l.indexOf('|'); let kind = l.slice(0, i), text = l.slice(i + 1), want = [];
  if (kind === 'roles') { const p = text.split('|'); text = p[0]; want = p[1].split(';'); }   // roles|text|role1;role2: every role must be a flagged title
  const f = Det.scan(N.normalizePath_C(text)).filter(x => x.patternId === 'nlp_job_title');
  const low = f.some(x => x.lowQualifying === true);
  const flagged = f.filter(x => x.lowQualifying).map(x => x.rawMatch.toLowerCase());
  const good = kind === 'roles' ? want.every(w => flagged.includes(w)) : kind === 'low' ? low : !low; n++; if (good) ok++; else fails.push(`${kind}: ${text}  => ${f.map(x => x.rawMatch + (x.lowQualifying ? '*' : '')).join(' | ') || '-'}`);
}
L(`  TOTAL ${ok}/${n}`); if (process.argv.includes('--fail')) fails.forEach(x => L('   FAIL ' + x));
