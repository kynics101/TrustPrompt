#!/usr/bin/env node
/**
 * test-group8-heldout.js — Group 8 held-out evaluation of the name dictionary used as an anchor.
 *
 * The two name lists below were written BEFORE terms-names.js was built and were not looked at while building it:
 *   COMMON  : 100 "first + surname" pairs of ordinary Filipino and Western names, written from memory. They measure the dictionary's
 *             COVERAGE of names a user is likely to type (this is held-out data, not a by-construction check).
 *   UNKNOWN : 100 first + surname pairs meant to be outside the dictionary: 60 invented words and 40 rare real names. Pairs whose first
 *             name AND surname turn out to be in the dictionary are dropped and counted, so the remaining recall is the recall for names
 *             the dictionary does not know. (Compromise may still know some of them: that is part of the measurement.)
 * Frames: (T) Title-Case-only sentence, (L) list of four first names, (I) lowercase "hi im first last ...",
 *         (V) single first name after "Please thank", (S) ordinary sentence "Please send the notes to First Last tomorrow."
 *
 *   node test-group8-heldout.js            DET=<detector copy> for another build (the dictionary file is loaded if it exists)
 * Measurement only. Prints held-out numbers; never fails.
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
const persons = raw => Det.scan(N.normalizePath_C(raw)).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);

const COMMON = ('Jericho Villanueva|Marites Castillo|Rolando Pascual|Imelda Navarro|Ronaldo Aquino|Maricar Domingo|Ernesto Bautista|Divina Salazar|Rodrigo Mercado|Luzviminda Ramos|' +
  'Arnel Soriano|Cherry Gonzales|Reynaldo Tolentino|Jocelyn Dizon|Nestor Magno|Corazon Evangelista|Allan Santiago|Rosalinda Manalo|Bernardo Pineda|Teresita Salvador|' +
  'Jonathan Mendoza|Gloria Jimenez|Eduardo Lacson|Melanie Padilla|Renato Francisco|Cecilia Rosales|Dennis Valdez|Liza Hernandez|Mario Fernandez|Lorna Alvarez|' +
  'Benjamin Cortez|Aileen Robles|Joselito Cabrera|Evelyn Marquez|Armando Delos Reyes|Sheila Panganiban|Alfredo Concepcion|Marilou Estrada|Rommel Gutierrez|Jasmine Aguilar|' +
  'Crisanto Villareal|Nerissa Bernardo|Felix Ocampo|Katrina Vargas|Leonardo Serrano|Annabelle Herrera|Gilbert Medina|Rowena Lopez|Edgardo Morales|Michelle Santos|' +
  'Jennifer Walker|Matthew Collins|Samantha Reed|Andrew Thompson|Emily Carter|Joshua Bennett|Olivia Parker|Daniel Murphy|Ashley Rogers|Christopher Foster|' +
  'Megan Hughes|Nicholas Price|Rachel Bell|Brian Cooper|Lauren Ward|Kevin Richardson|Stephanie Howard|Timothy Brooks|Rebecca Sanders|Jason Morgan|' +
  'Amanda Gray|Eric Watson|Nicole Kelly|Steven Barnes|Katherine Russell|Gregory Hamilton|Heather Fisher|Patrick Ellis|Danielle Stewart|Justin Hayes|' +
  'Melissa Webb|Adam Hunt|Christine Palmer|Scott Lawrence|Kimberly Dixon|Aaron Burns|Victoria Mason|George Fleming|Laura Stone|Henry Grant|' +
  'Sophia Marshall|Edward Knight|Hannah Cole|Peter Hudson|Natalie Ford|Raymond Shaw|Brenda Wells|Franklin Boyd|Tiffany Hart|Walter Gibson').split('|').map(s => s.split(' ')).map(a => [a[0], a.slice(1).join(' ')]);

// 60 invented pairs from syllables (deterministic) + 40 rare real pairs
const SY1 = ['Kar', 'Vel', 'Dor', 'Mir', 'Tal', 'Ven', 'Sor', 'Nal', 'Bren', 'Jor', 'Lun', 'Fen', 'Gal', 'Hal', 'Ker', 'Lor', 'Mon', 'Nor', 'Pal', 'Qui', 'Ral', 'Sal', 'Tor', 'Val', 'Wen', 'Xan', 'Yor', 'Zel', 'Bal', 'Cor'];
const SY2 = ['mira', 'tavio', 'lena', 'brio', 'dano', 'vela', 'rissa', 'mondo', 'zira', 'tello', 'nika', 'fario', 'seba', 'lunda', 'garo'];
const SY3 = ['voren', 'maldo', 'tesh', 'quira', 'dalen', 'bruno', 'kessel', 'ovar', 'thane', 'lund', 'morra', 'vash', 'drel', 'pesko', 'zander'];
const SY4 = ['Hol', 'Brast', 'Quen', 'Mar', 'Del', 'Fosk', 'Tran', 'Vass', 'Gren', 'Ost'];
const invented = [];
for (let i = 0; i < 60; i++) invented.push([SY1[i % SY1.length] + SY2[(i * 7) % SY2.length], SY4[(i * 3) % SY4.length] + SY3[(i * 5 + 1) % SY3.length]]);
const RARE = ('Teofisto Dimagiba|Casimiro Panganiban|Eufemio Balagtas|Ildefonso Catapang|Gaudencio Maglaya|Pantaleon Dumlao|Epifanio Lumbao|Anacleto Barredo|Valeriano Sinag|Primitivo Ladines|' +
  'Hermogenes Ponce|Cirilo Bagtas|Zenaida Pagaduan|Fructuosa Maglalang|Perpetua Sabado|Consolacion Dumaguit|Leoncia Abubakar|Marcelino Tagle|Basilio Enriquez|Florentino Catindig|' +
  'Anselmo Gatdula|Damaso Ilagan|Elpidio Quirino|Jacinto Zamora|Kalinga Mabasa|Lakandula Bugtong|Maximo Pangilinan|Nenita Salonga|Orencio Pabustan|Pacita Lumagbas|' +
  'Quintin Abesamis|Rufino Cuenca|Segundino Dalangin|Telesforo Hizon|Ulpiano Magat|Vidal Narciso|Wilmer Oabel|Ximeno Paraiso|Yolando Quiambao|Zosimo Rabara').split('|').map(s => s.split(' '));
const UNKNOWN_ALL = invented.concat(RARE);

const dictAvail = typeof globalThis.NAMES_DATA !== 'undefined';
const strip = w => w.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const FIRST = dictAvail ? new Set(globalThis.NAMES_DATA.firstNames.map(strip)) : new Set(), SUR = dictAvail ? new Set(globalThis.NAMES_DATA.surnames.map(strip)) : new Set();
const inDict = w => FIRST.has(strip(w)) || SUR.has(strip(w));
const nlp = global.window.nlp;
const PERSON = ['Person', 'FirstName', 'LastName', 'MaleName', 'FemaleName'];
const compromisePerson = w => { const j = nlp(w.toLowerCase()).json({ terms: { tags: true } }); const t = (j[0] && j[0].terms[0] && j[0].terms[0].tags) || []; return t.some(x => PERSON.includes(x)); };
const unknownPairs = UNKNOWN_ALL.filter(([f, s]) => !(inDict(f) && inDict(s)));
const droppedUnknown = UNKNOWN_ALL.length - unknownPairs.length;
const unknown100 = unknownPairs;

const FR = {
  S: (f, s) => [`Please send the notes to ${f} ${s} tomorrow.`, `${f} ${s}`],
  T: (f, s) => [`Please Write A Letter To ${f} ${s} About The Meeting`, `${f} ${s}`],
  I: (f, s) => [`hi im ${f.toLowerCase()} ${s.toLowerCase()} and i need help with my resume`, `${f.toLowerCase()} ${s.toLowerCase()}`],
  V: (f) => [`Please thank ${f} for the help.`, f],
};
function evalSet(label, pairs) {
  const anchorC = pairs.filter(([f, s]) => compromisePerson(f) || compromisePerson(s)).length;
  const anchorD = pairs.filter(([f, s]) => compromisePerson(f) || compromisePerson(s) || inDict(f) || inDict(s)).length;
  const firstD = pairs.filter(([f]) => compromisePerson(f) || inDict(f)).length;
  const res = {};
  for (const k of ['S', 'T', 'I', 'V']) {
    let ok = 0;
    for (const [f, s] of pairs) { const [p, exp] = FR[k](f, s); if (persons(p).includes(exp)) ok++; }
    res[k] = ok;
  }
  // list frame: groups of four first names
  let lok = 0, lt = 0;
  for (let i = 0; i + 3 < pairs.length; i += 4) {
    const four = pairs.slice(i, i + 4).map(p => p[0]); lt++;
    const got = persons(`Invite ${four[0]}, ${four[1]}, ${four[2]} and ${four[3]} to the dinner.`);
    if (four.every(n => got.includes(n))) lok++;
  }
  console.log = L;
  L(`${label}: n=${pairs.length}  anchor(first or surname) Compromise-only ${anchorC}/${pairs.length}, with dictionary ${anchorD}/${pairs.length}; first name anchored ${firstD}/${pairs.length}`);
  L(`     exact-span found:  sentence ${res.S}/${pairs.length} | Title-Case-only ${res.T}/${pairs.length} | lowercase "im first last" ${res.I}/${pairs.length} | single first name after "thank" ${res.V}/${pairs.length} | list of 4 first names (all four) ${lok}/${lt}`);
  console.log = console.debug = console.warn = () => {};
}
console.log = L;
L(`dictionary file loaded: ${dictAvail}${dictAvail ? ` (${FIRST.size} first names, ${SUR.size} surnames)` : ''}`);
console.log = console.debug = console.warn = () => {};
evalSet('COMMON  (held-out: ordinary names written before the dictionary)', COMMON);
evalSet(`UNKNOWN (held-out: ${droppedUnknown} of ${UNKNOWN_ALL.length} pairs dropped because both words turned out to be in the dictionary)`, unknown100);
