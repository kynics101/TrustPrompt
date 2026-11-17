#!/usr/bin/env node
/**
 * test-group4c.js — Group 4c checks (all prompts and names are fictional and written by the assistant):
 *   1 placeholder filter   2 "y" rule   3 places in lists / cued frames   4 single words after ordinary verbs, names equal to ordinary words
 *   5 corporate suffix words (positives + 20 benign phrases using the same words as ordinary words)
 * node test-group4c.js            DET=<copy> for another build.  Prints measured results; exit code 1 on any FAIL line.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log; console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require(process.env.NORM ? path.resolve(process.env.NORM) : './normalizer.js'); require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const scan = raw => Det.scan(N.normalizePath_C(raw)).filter(x => /^nlp_/.test(x.patternId));
const P = raw => scan(raw).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
const O = raw => scan(raw).filter(x => x.patternId === 'nlp_organization').map(x => x.rawMatch);
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
let fails = 0; const out = [];
const check = (sec, label, got, exp) => { const ok = same(got, exp); if (!ok) fails++; out.push(`${ok ? 'ok  ' : 'FAIL'} [${sec}] ${label} -> ${JSON.stringify(got)}${ok ? '' : '  expected ' + JSON.stringify(exp)}`); };

// 2: y
check('y', 'Ana Santos y Ben Cruz arrived yesterday.', P('Ana Santos y Ben Cruz arrived yesterday.'), ['Ana Santos', 'Ben Cruz']);
check('y', 'Maria y Jose went to the market.', P('Maria y Jose went to the market.'), ['Maria', 'Jose']);
check('y', 'Please thank Jose Rizal y Mercado for the help.', P('Please thank Jose Rizal y Mercado for the help.'), ['Jose Rizal y Mercado']);
check('y', 'Please thank Maria Santos y Ben Cruz for the help.', P('Please thank Maria Santos y Ben Cruz for the help.'), ['Maria Santos', 'Ben Cruz']);

// 3: places
const places = [
  ['Please thank Victoria for the help.', ['Victoria']], ['Contact Georgia about the schedule.', ['Georgia']],
  ['Please email Concepcion about the schedule.', ['Concepcion']], ['Tell Victoria to call me.', ['Victoria']],
  ['I will meet Concepcion tomorrow.', ['Concepcion']], ['Please remind Georgia to sign.', ['Georgia']],
  ['Ask Concepcion to bring the files.', ['Concepcion']], ['Invite Victoria to the party.', ['Victoria']],
  ['Dr. Concepcion presented the results.', ['Concepcion']], ['My name is Victoria and I need help.', ['Victoria']],
  ['Visit Baguio, Sagada and Banaue next month.', []], ['Compare Tarlac, Pampanga and Bulacan for farming.', []],
  ['Please visit Nueva Ecija this summer.', []], ['We will travel to Concepcion next week.', []],
  ['Tarlac City, Capas, and Concepcion are all in Central Luzon.', []], ['Go to Baguio for the weekend.', []],
  ['Concepcion called me yesterday about the plan.', ['Concepcion']], ['Victoria is here to see you.', ['Victoria']],
];
for (const [p, e] of places) check('place', p, P(p), e);

// 4: single words after ordinary verbs; names equal to ordinary words
const ords = [
  ['Install Python, Node, Docker and Git before the workshop.', []], ['Order Burger, Fries, Salad and Soda for the party.', []],
  ['Thank Grace for the help.', ['Grace']], ['Please thank Hazel for the help.', ['Hazel']], ['Contact Hope about the schedule.', ['Hope']],
  ['Please thank Joy for the help.', ['Joy']], ['Please thank Mason for the help.', ['Mason']], ['Please email Rose about the schedule.', ['Rose']],
  ['Ask Faith to bring the files.', ['Faith']], ['Hope Santiago will review it.', ['Hope Santiago']], ['Grace Cruz will review it.', ['Grace Cruz']],
];
for (const [p, e] of ords) check('word', p, P(p), e);

// 5: suffix words
const sfx = ['Holdings', 'Enterprises', 'Industries', 'Ventures', 'Trading', 'Logistics', 'Technologies', 'Manufacturing', 'Realty', 'Properties', 'Laboratories', 'Pharmaceuticals', 'Insurance', 'Airlines', 'Motors'];
const nm = ['Whitfield', 'Aldridge', 'Quintanilla', 'Dalisay', 'Montoya'];
const pos = [];
sfx.forEach((s, i) => pos.push([`Please send the contract with ${nm[i % 5]} ${s} today.`, `${nm[i % 5]} ${s}`]));
let gotPos = 0; const missPos = [];
for (const [p, e] of pos) { const o = O(p), person = P(p); if (o.some(x => x.toLowerCase() === e.toLowerCase())) gotPos++; else missPos.push(`${e}: org=${JSON.stringify(o)} person=${JSON.stringify(person)}`); }
out.push(`[suffix] "with <Name> <Suffix>" detected as that exact organization: ${gotPos}/${pos.length}` + (missPos.length ? '\n        ' + missPos.join('\n        ') : ''));
const noPersonLeak = pos.filter(([p]) => P(p).length);
out.push(`[suffix] positives that still leak a person finding: ${noPersonLeak.length}` + (noPersonLeak.length ? ' ' + JSON.stringify(noPersonLeak.map(([p]) => P(p))) : ''));
const benign = [
  'The trading of stocks is regulated in most countries.', 'Heavy industries need a lot of electricity.', 'Please buy car insurance before the trip.',
  'Health Insurance covers part of the cost.', 'The airlines cancelled many flights because of the storm.', 'Motors and engines are covered in chapter four.',
  'Learn about holdings and assets in this accounting lesson.', 'Small enterprises create many jobs in the province.', 'Explain how ventures raise capital.',
  'Logistics is the study of moving goods efficiently.', 'New Technologies change how we study.', 'Manufacturing jobs are moving overseas.',
  'Realty and properties are taxed differently in this city.', 'Laboratories must follow safety rules.', 'Pharmaceuticals are tested in three phases.',
  'Write an essay about Modern Manufacturing in the Philippines.', 'Compare Life Insurance and Health Insurance for a young family.',
  'Why do Airlines overbook flights during the Christmas Season?', 'Describe the Trading Floor at a large stock exchange.', 'Summarize Public Properties law for my class.',
];
const fp = benign.map(p => [p, scan(p).filter(x => x.patternId === 'nlp_organization').map(x => x.rawMatch)]).filter(([, o]) => o.length);
out.push(`[suffix] benign phrases with these words as ordinary words: ${benign.length}, organization false positives = ${fp.length}` + (fp.length ? '\n        ' + fp.map(([p, o]) => `${JSON.stringify(p)} -> ${JSON.stringify(o)}`).join('\n        ') : ''));
console.log = L;
out.forEach(l => L(l));
L(`\nFAIL lines: ${fails}`);
process.exit(fails ? 1 : 0);
