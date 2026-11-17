// Shared loader for the Group 3b tests (assistant-written). DET=<path> loads another detector copy.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log, D = console.debug, W = console.warn;
console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require('./normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const scan = (raw) => { console.log = console.debug = console.warn = () => {}; const f = Det.scan(N.normalizePath_C(raw)); console.log = L; return f; };
const persons = (raw) => scan(raw).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
const lc = s => s.toLowerCase();
const title = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());
const exact = (ps, name) => ps.some(p => lc(p) === lc(name));
const touches = (ps, name) => ps.some(p => lc(name).includes(lc(p)) || lc(p).includes(lc(name)));
module.exports = { L, scan, persons, lc, title, exact, touches };
