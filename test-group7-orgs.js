#!/usr/bin/env node
/**
 * test-group7-orgs.js — Group 7 held-out evaluation (organizations). Stage 1: (a) law/audit firm names, (b) "<institution head> of <Place>"
 * and "<known brand> <descriptor> [<Place>]".
 *
 *   node test-group7-orgs.js [stage]                 DET=<detector copy> runs another build
 *   node test-group7-orgs.js 1 --json out.json       also saves every finding (for old/new diffs)
 *
 * The organization lists below were written BEFORE the Stage 1 code and are not taken from the 161 rows (no real person is involved; firm names are
 * made from common surnames, so a coincidence with a real firm is possible but unintended). Three frames per organization:
 *   F1 affiliated      "<person> works at <Org> as ..."          expected: the Org is found (text overlap)
 *   F2 plain mention   "Please summarize the notice from <Org>."  expected: the Org is found
 *   F3 common-word     the same words in an ordinary sense        expected: NO nlp_organization finding
 * Benign phrases (Part B) must produce no nlp_organization finding.
 * Measurement only; never fails.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log; console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js');
if (fs.existsSync(path.join(__dirname, 'terms-names.js'))) require('./terms-names.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require(process.env.NORM ? path.resolve(process.env.NORM) : './normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const scan = raw => Det.scan(N.normalizePath_C(raw)).filter(x => /^nlp_/.test(x.patternId));
const orgsOf = raw => scan(raw).filter(x => x.patternId === 'nlp_organization').map(x => x.rawMatch);

// ───────────── Part A: held-out organizations ─────────────
// (a) law / audit firms: [name, kind]  kind: S = firm suffix, A = "& Associates", C = "& Co", Q = no suffix (affiliation cue only)
const SUR = 'Villanueva Mercado Tolentino Pascual Aguirre Bautista Castañeda Dizon Escudero Fajardo Gonzales Hidalgo Ilagan Jimenez Kalaw Lacson Magsaysay Natividad Ocampo Pangan Quizon Rivera Salcedo Tuazon Urbano Valdez Yap Zamora Abella Borromeo Cojuangco Dimaculangan Enriquez Florentino Galang Hizon Isidro Javier Katigbak Lorenzo Manalang Nepomuceno Olivares Padilla Ramirez Soriano Trinidad Unson Vergara Wong Ybañez Zulueta Anderson Brennan Caldwell Donovan Ellison Fitzgerald Gallagher Hartwell Ingram Jacobsen Kensington Lindqvist Montgomery Nakamura Okafor Prescott Quinlan Radcliffe Sinclair Thornton Underwood Whitaker Yamamoto'.split(' ');
const FIRMS = [];
const kinds = ['S', 'A', 'C', 'Q', 'S', 'A'];
for (let i = 0; i < 100; i++) {
  const a = SUR[(i * 7) % SUR.length], b = SUR[(i * 11 + 3) % SUR.length], c = SUR[(i * 13 + 5) % SUR.length];
  if (a === b || b === c || a === c) continue;
  const k = kinds[i % kinds.length], j = ['and', '&'][i % 2];
  if (k === 'S') FIRMS.push([`${a} ${j === '&' ? '&' : 'and'} ${b} ${['Law Offices', 'Law Firm', 'Law Office', 'Law Offices'][i % 4]}`, k, [a, b]]);
  if (k === 'A') FIRMS.push([`${a} & Associates`, k, [a]]);
  if (k === 'A' && i % 3 === 0) FIRMS.pop(), FIRMS.push([`${a} ${b} & Associates`, k, [a, b]]);
  if (k === 'C') FIRMS.push([`${a} ${b} & Co.`, k, [a, b]]);
  if (k === 'Q') FIRMS.push([`${a}, ${b} and ${c}`, k, [a, b, c]]);
}
// (b1) institution head of Place
const HEADS = ['Archdiocese', 'Diocese', 'Province', 'Municipality', 'Prelature', 'Vicariate'];
const PLACES = 'Cebu|Lipa|Davao|Capiz|Tuguegarao|Iloilo|Zamboanga|Bacolod|Cagayan de Oro|Cotabato|Antipolo|Pasig|Novaliches|Malolos|Baguio|San Fernando|Kidapawan|Marbel|Laoag|Legazpi|Naga|Palo|Borongan|Calbayog|Masbate|Romblon|Pateros|Taguig|Bulacan|Pampanga|Batangas|Laguna|Quezon|Rizal|Cavite|Bohol|Leyte|Samar|Palawan|Mindoro|Aklan|Albay|Benguet|Isabela|Nueva Ecija|Zambales|Tarlac|Bataan|Sorsogon|Surigao'.split('|');
const INST = [];
for (let i = 0; i < 110; i++) INST.push([`${HEADS[i % HEADS.length]} of ${PLACES[(i * 3 + 1) % PLACES.length]}`, 'I']);
// (b2) known brand + descriptor [+ place]
const BR = 'SM|BDO|Robinsons|Ayala|Puregold|Metrobank|Landers|Shakeys|Jollibee|Greenwich|Mercury|Rustans|Gaisano|Citimart|Waltermart|Vista|Megamall|PNB|UCPB|Security|Chinabank|Eastwest|Maybank|Unionbank|Rcbc|Pacific|Starbucks|Nestle|Toyota|Honda|Ford|Samsung|Hyundai|Ikea|Walmart|Costco|Tesco|Carrefour|Lotte|Aeon|Mitsukoshi|Takashimaya|Uniqlo|Marks'.split('|');
const DESC = [['City', true], ['Mall', true], ['Unibank', false], ['Malls', true], ['City', true]];
const BRAND = [];
for (let i = 0; i < 100; i++) {
  const b = BR[i % BR.length], [d, needPlace] = DESC[(i * 3 + Math.floor(i / BR.length)) % DESC.length];
  BRAND.push([needPlace ? `${b} ${d} ${PLACES[(i * 5 + 2) % PLACES.length]}` : `${b} ${d}`, 'B', [b]]);
}
const ALL = FIRMS.map(f => [f[0], 'law-firm', f[1]]).concat(INST.map(f => [f[0], 'institution-of-place', 'I'])).concat(BRAND.map(f => [f[0], 'brand-descriptor', 'B']));

const F1 = o => `My cousin works at ${o} as a clerk.`;
const F2 = o => `Please summarize the latest notice from ${o} for the group chat.`;
// F3: the SAME words in an ordinary sense (no organization)
function F3(entry) {
  const [o, type] = entry;
  if (type === 'law-firm') {
    const parts = o.replace(/ (?:Law Offices?|Law Firm|& Associates|& Co\.?)$/i, '').split(/,? (?:and|&) |, | /).filter(Boolean);
    return `${parts[0]} was late, so we ate first and then talked about the lease.`;   // surname alone, no pair, no suffix
  }
  if (type === 'institution-of-place') { const [h, p] = o.split(' of '); return `Our ${h.toLowerCase()} trip was long, and the road of ${p.toLowerCase()} was closed that day.`; }
  const w = o.split(' ');
  return `The ${w[1].toLowerCase()} near ${w[0].toLowerCase()} street was busy and I bought a ${w[0].toLowerCase()}-style shirt.`;
}

// ───────────── Part B: benign phrases (no nlp_organization finding allowed) ─────────────
const BENIGN = [
  // the user's list
  'The age group of ten to twelve years is the most active one.', 'Our focus group met on Tuesday.', 'She joined a support group last month.', 'The travel agency opened early.',
  'A news agency reported the storm.', 'Group Discussion Topics for Class', 'Agency and Structure in Sociology', 'I need a unit conversion table for the lab.', 'The division of labor is an old idea.',
  'Please read section 3 before class.', 'The history of Rome is long.', 'The mayor of Cebu was on the radio.', 'I love the city of Manila in the rain.', 'The people of Laguna are friendly.',
  'The end of Tuesday is near.', 'The province of Laguna is far from here.', 'What is the capital of Cebu province?', 'The map of Pampanga shows many rivers.', 'The weather of Baguio is cold.',
  // more Stage 1 benign
  'Tom and Jerry is my favorite cartoon.', 'Romeo and Juliet is a play.', 'Salt and Pepper are on the table.', 'Sense and Sensibility is a novel.', 'Mr. Reyes and Ms. Cruz will arrive soon.',
  'Reyes and Santos are the two finalists in the quiz.', 'Pride and Prejudice was assigned for class.', 'Law and Order is on tonight.', 'Pros and Cons of Remote Work', 'Rock and Roll History Notes',
  'Fish and Chips Recipe', 'Black and White Photography Tips', 'Bread and Butter Pudding', 'Ladies and Gentlemen, welcome.', 'Research and Development Plan for the Team',
  'The Mall of Wonders is a fictional place in the story.', 'Visit the old city of Rome and the Colosseum.', 'Wait at the city bus stop near the mall.', 'The unibrow trend is back.', 'The mall opens at ten.',
  'My city is small and the mall is far.', 'Take the city bus to the mall in the morning.', 'A Municipality of Interests is a phrase in the poem.', 'Province of Origin: please fill this field.', 'Archdiocese of Heaven is a joke title.',
  'Province of Residence', 'Diocese of Nowhere is not a place I know.', 'He is the lord of Rings in the movie.', 'The Lord of the Rings is a film.', 'The Duke of York is a pub name in the song.',
  'Bank of Ideas is a made-up name in the poem.', 'Date of Birth: please type it in the form.', 'City of Stars is a song.', 'Place of Birth', 'Statement of Purpose Tips for Applicants',
  'She was born in the Province of Cebu and moved away.', 'Lake City Utah is a small town.', 'Sun City Arizona has many retirees.', 'Ocean City Maryland has a boardwalk.', 'Salt Lake City Utah is cold.', 'Garden City Kansas is on the map.', 'Mexico City Mall tours are popular.', 'Kansas City Missouri hosts the game.', 'New York City Hall is downtown.', 'Quezon City Hall is closed today.', 'Best Law Firm Ranking for 2024', 'Family Law Firm Tips', 'Smith and Jones were in the lobby.', 'Some provinces of Luzon get typhoons.', 'The municipality of the town has a plan.', 'The diocese of the region held a meeting.', 'a city mall',
  'Saint Joseph and Mary prayed together.', 'Please call Jones and Smith about the meeting at noon.', 'We met Garcia and Lopez at the gym.', 'Brown and Williams were the top scorers.', 'Harris and Clark stood by the door.',
];

function run() {
  const rows = [];
  let tot = { F1: 0, F2: 0, F3: 0 }, hit = { F1: 0, F2: 0, F3fp: 0 };
  const byType = {};
  const miss = [];
  for (const entry of ALL) {
    const [o, type] = entry;
    const key = o.toLowerCase().replace(/[.,]/g, '');
    const t = byType[type] || (byType[type] = { n: 0, F1: 0, F2: 0, F3fp: 0 });
    t.n++;
    const found = raw => orgsOf(raw).some(m => { const mm = m.toLowerCase().replace(/[.,]/g, ''); return mm === key || mm.includes(key) || key.includes(mm) && mm.split(' ').length >= 2; });
    const f1 = found(F1(o)), f2 = found(F2(o)), f3 = orgsOf(F3(entry));
    if (f1) { t.F1++; hit.F1++; } if (f2) { t.F2++; hit.F2++; } if (f3.length) { t.F3fp++; hit.F3fp++; }
    tot.F1++; tot.F2++; tot.F3++;
    rows.push({ o, type, f1, f2, f3 });
    if (!f1 || !f2) miss.push(o + (f1 ? '' : ' [F1]') + (f2 ? '' : ' [F2]'));
  }
  const benign = BENIGN.map(s => ({ s, orgs: orgsOf(s) }));
  const bFp = benign.filter(b => b.orgs.length);
  L(`Part A: ${ALL.length} held-out organizations x 3 frames`);
  for (const [k, v] of Object.entries(byType)) L(`  ${k.padEnd(22)} n=${v.n}  F1 affiliated found ${v.F1}  F2 plain found ${v.F2}  F3 common-word false positives ${v.F3fp}`);
  L(`  ALL  n=${ALL.length}  F1 ${hit.F1} (${(100 * hit.F1 / ALL.length).toFixed(1)}%)  F2 ${hit.F2} (${(100 * hit.F2 / ALL.length).toFixed(1)}%)  F3 false positives ${hit.F3fp}`);
  L(`Part B: ${BENIGN.length} benign phrases; with an nlp_organization finding: ${bFp.length}`);
  bFp.forEach(b => L(`  FP: ${JSON.stringify(b.s)} => ${JSON.stringify(b.orgs)}`));
  const out = { rows, benign, miss };
  const ji = process.argv.indexOf('--json');
  if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(out, null, 1));
  if (process.argv.includes('--misses')) miss.slice(0, 400).forEach(m => L('  miss: ' + m));
  // speed
  const prompts = [F1(ALL[0][0]), F2(ALL[5][0]), BENIGN.join(' ') + ' ' + BENIGN.join(' ')];
  prompts.forEach((p, i) => { Det.scan(N.normalizePath_C(p)); const t0 = process.hrtime.bigint(); for (let k = 0; k < 3; k++) Det.scan(N.normalizePath_C(p)); L(`speed prompt ${i + 1} (${p.length} chars): ${(Number(process.hrtime.bigint() - t0) / 3e6).toFixed(0)} ms/scan`); });
}
run();
