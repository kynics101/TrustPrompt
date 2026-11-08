#!/usr/bin/env node
/**
 * test-groupB-names.js — Cause B held-out evaluation: METHOD 4 requires name evidence for an unanchored 2-3 word Title Case phrase.
 *
 *   node test-groupB-names.js [--json out.json]            DET=<detector copy> runs another build; PREP=1 is read by the detector flag (see below)
 *
 * Written BEFORE the Cause B code. Everything here is invented: the person names are not in terms-names.js (pairs where a word turns out to be in the
 * dictionary are dropped and counted) and include non-Filipino and non-Western names; the benign phrases are Title Case recipes, class names,
 * courses, products, headings. No row of any earlier test set is used.
 *
 * Part A, names, frames (a found name = a nlp_person_name finding that contains both words):
 *   N1 plain      "During the review, <Name> presented the new budget to the team."       (no cue: expected to be LOST by the gate unless anchored)
 *   N2 verb cue   "Please ask <Name> about the schedule."
 *   N3 trailing   "<Name> said the delivery will arrive on Friday."
 *   N4 greeting   "Dear <Name>, thank you for your message."
 *   N5 named      "The new lead is named <Name> and starts on Monday."
 *   N6 prep only  "Please send the notes to <Name> tomorrow."                              (a bare preposition is NOT a cue)
 *   N7 title only "<Name>"                                                                   (prompt is just the name)
 *   N8 appositive "<Name>, a nurse at the clinic, called this morning."
 * Results are split: ANCHORED (Compromise tags a word as a person) vs UNANCHORED (neither dictionary nor Compromise knows the name).
 * Part B, benign (no nlp_person_name allowed): 300+ Title Case phrases in 4 frames:
 *   B1 alone   B2 "Chapter 4: <P>"   B3 "Today we studied <P> in class."   B4 "Please add <P> to the list."
 *   B5 "We bought it from <P> last week."   B6 "A gift for <P> is on sale."   B7 "Nothing goes well with <P> at dinner."   (B5-B7: a bare preposition right before the phrase)
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log; console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require(process.env.NORM ? path.resolve(process.env.NORM) : './normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const persons = raw => Det.scan(N.normalizePath_C(raw)).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);

// ── invented / uncommon names: first + last, many origins ──
const RAW = ('Chidinma Okoro|Tunde Adewale|Folasade Ogunleye|Kwabena Mensah|Ngozi Eze|Amara Nwosu|Zahra Almansoori|Tariq Haddadin|Layla Bensalem|Yusuf Karaman|Elif Yildirim|Emre Kaplan|' +
  'Priyanka Venkataraman|Arjun Chaudhary|Meenakshi Iyer|Rohit Bhattacharya|Anjali Deshpande|Sanjay Kulkarni|Min-jae Seo|Ji-woo Han|Hyun-woo Baek|Xiaoling Fang|Wenhao Liang|Meilin Zhou|' +
  'Haruka Takeda|Daisuke Morimoto|Aiko Fujimura|Thuy Tranh|Quang Dinh|Linh Pham|Katarzyna Wisniewski|Tomasz Kowalczyk|Agnieszka Mazur|Sigrid Halvorsen|Bjorn Ellingsen|Astrid Lindgren-Moe|' +
  'Svetlana Morozova|Dmitri Volkonsky|Ilya Zhuravlev|Tsegaye Bekele|Selam Tadesse|Amani Wekesa|Baraka Mwangi|Imani Kiprotich|Thiago Albuquerque|Camila Barbosa|Rafael Guimaraes|' +
  'Darius Kavousi|Parisa Rahmani|Omid Sharifi|Noa Ben-David|Eitan Shalev|Giorgos Papadakis|Eleni Karagiannis|Matteo Brunelli|Chiara Bellandi|Henrik Solberg|Marit Vangen|' +
  'Brenwick Thalmor|Corvane Aldersey|Peregrin Holmwood|Isolde Varnham|Garrick Pellowe|Thessaly Drummond|Oswin Larkhill|Marguerite Dunmore|Fenwick Trelawny|Wilhelmina Strand|' +
  'Jolibert Tanalgo|Maricielo Dagaraga|Rosendo Bacalangco|Teofanes Libradilla|Jocelynda Marfori|Eusebia Panganiban-Dy|Gaudioso Alimurung|Anatalia Quirimit|Cresencio Daclan|' +
  'Dalisay Lumbrera|Ferdie Macatuno|Gilda Tanglao|Haydee Sanvictores|Ismael Pagsolingan|Jovelyn Cadavona|Kenneth Mallari|Leovigildo Santamaria|Mirasol Tuliao|' +
  'Valtteri Hakkarainen|Sinead Brannigan|Declan Moriarty-Walsh|Niamh Fitzgibbon|Pieter Vandenbroucke|Femke Haverkamp|Lukas Steinmetz|Anneliese Kroeger|Joaquin Echeverria|' +
  'Itzel Cuauhtemoc|Mateus Bragantino|Aylin Demirtas|Cemal Ozturk|Rasa Kazlauskaite|Ondrej Prochazka|Lenka Dvorakova|Zsofia Horvath|Balazs Nemeth|Anahit Sargsyan|Tamar Gelashvili|' +
  'Kofi Boateng|Abena Asante|Sipho Ndlovu|Thandiwe Mkhize|Lwazi Dlamini|Nomvula Zulu|Rangi Parata|Aroha Ngata|Tane Wiremu|Makana Kealoha|Leilani Kahale|Nainoa Akana').split('|');
const strip = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const dictHas = w => { const D = globalThis.NAMES_DATA; return D.firstNames.includes(strip(w)) || D.surnames.includes(strip(w)); };
const nlp = global.window.nlp;
const PERSON = ['Person', 'FirstName', 'LastName', 'MaleName', 'FemaleName'];
const cmpPerson = w => { const j = nlp(w.toLowerCase()).json({ terms: { tags: true } }); const t = (j[0] && j[0].terms[0] && j[0].terms[0].tags) || []; return t.some(x => PERSON.includes(x)); };
const NAMES = []; let dropped = 0;
for (const p of RAW) {
  const [a, b] = p.split('|')[0].split(' ');
  const words = p.split(/[\s-]/);
  if (words.some(dictHas)) { dropped++; continue; }
  NAMES.push({ n: p, anchored: p.split(' ').some(w => cmpPerson(w) || w.split('-').some(cmpPerson)) });
}
const FR = {
  N1: n => `During the review, ${n} presented the new budget to the team.`, N2: n => `Please ask ${n} about the schedule.`, N3: n => `${n} said the delivery will arrive on Friday.`,
  N4: n => `Dear ${n}, thank you for your message.`, N5: n => `The new lead is named ${n} and starts on Monday.`, N6: n => `Please send the notes to ${n} tomorrow.`,
  N7: n => `${n}`, N8: n => `${n}, a nurse at the clinic, called this morning.`,
};
const foundName = (raw, n) => { const ws = n.split(/[\s]/); return persons(raw).some(m => ws.every(w => m.toLowerCase().includes(w.toLowerCase()))); };

// ── benign Title Case phrases (recipes, class names, courses, products, headings) ──
const A1 = 'Garlic Butter Honey Lemon Spicy Crispy Creamy Roasted Baked Stuffed Grilled Smoked Tropical Classic Rustic Summer Winter Autumn Morning Evening Advanced Beginner Intermediate Applied Modern Digital Organic Portable Compact Wireless Premium Deluxe Family Weekend Seasonal Quick Easy Vegan Gluten-Free'.split(' ');
const A2 = 'Shrimp Chicken Pasta Salad Soup Bread Cake Pudding Smoothie Noodles Casserole Tacos Curry Risotto Pancakes Waffles Cookies Brownies Chowder Stew Calculus Algebra Chemistry Biology Statistics Pottery Painting Photography Yoga Pilates Aerobics Gardening Woodworking Embroidery Blender Toaster Backpack Headphones Keyboard Thermos Lantern Planner Notebook Calendar'.split(' ');
const A3 = ['Recipe', 'Class', 'Course', 'Basics', 'Workshop', 'Lessons', 'Guide', 'Set', 'Kit', 'Bundle', 'Schedule', 'Review', 'Menu', 'Edition', 'Series'];
const PHR = [];
for (let i = 0; i < A1.length * A2.length && PHR.length < 330; i += 1) {
  const a = A1[(i * 7) % A1.length], b = A2[Math.floor(i / A1.length) % A2.length], c = A3[(i * 5) % A3.length];
  const p = i % 3 === 0 ? `${a} ${b} ${c}` : (i % 3 === 1 ? `${a} ${b}` : `${b} ${c}`);
  if (!PHR.includes(p)) PHR.push(p);
}
const BF = { B1: p => p, B2: p => `Chapter 4: ${p}`, B3: p => `Today we studied ${p} in class.`, B4: p => `Please add ${p} to the list.`,
  B5: p => `We bought it from ${p} last week.`, B6: p => `A gift for ${p} is on sale.`, B7: p => `Nothing goes well with ${p} at dinner.` };

function run() {
  L(`Part A: ${NAMES.length} invented names (${dropped} pairs dropped: a word is in terms-names.js); anchored by Compromise: ${NAMES.filter(x => x.anchored).length}, unanchored: ${NAMES.filter(x => !x.anchored).length}`);
  const res = {}, rows = [];
  for (const [f, fn] of Object.entries(FR)) {
    const r = res[f] = { all: 0, anch: 0, unanch: 0, nA: 0, nU: 0 };
    for (const x of NAMES) {
      const ok = foundName(fn(x.n), x.n);
      r.all += ok ? 1 : 0; if (x.anchored) { r.nA++; r.anch += ok ? 1 : 0; } else { r.nU++; r.unanch += ok ? 1 : 0; }
      rows.push({ f, n: x.n, ok });
    }
  }
  for (const [f, r] of Object.entries(res)) L(`  ${f}  found ${String(r.all).padStart(3)}/${NAMES.length}   anchored ${r.anch}/${r.nA}   unanchored ${r.unanch}/${r.nU}`);
  L(`  frames: ${Object.entries(FR).map(([k, fn]) => k + '=' + JSON.stringify(fn('<Name>'))).join('  ')}`);
  L(`Part B: ${PHR.length} benign Title Case phrases x ${Object.keys(BF).length} frames = ${PHR.length * Object.keys(BF).length} prompts; person findings:`);
  let tot = 0; const fp = [];
  for (const [f, fn] of Object.entries(BF)) {
    let c = 0, prompts = 0;
    for (const p of PHR) { const m = persons(fn(p)); if (m.length) { c++; fp.push(f + ': ' + fn(p) + ' => ' + m.join(' / ')); } prompts++; }
    tot += c; L(`  ${f}  prompts with a person finding ${c}/${prompts}`);
  }
  L(`  total benign prompts with a person finding: ${tot}/${PHR.length * Object.keys(BF).length}`);
  if (process.argv.includes('--fp')) fp.slice(0, 80).forEach(x => L('   FP ' + x));
  const ji = process.argv.indexOf('--json'); if (ji > 0) fs.writeFileSync(ji ? process.argv[ji + 1] : 'out.json', JSON.stringify({ res, rows, fp }, null, 1));
}
run();
