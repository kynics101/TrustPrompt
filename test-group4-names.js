#!/usr/bin/env node
/**
 * test-group4-names.js — Group 4 (person-name span extraction): end-to-end tests (normalizePath_C -> scan), benign sets and
 * metamorphic templates. Everything here is written by the assistant; all names are fictional and none come from the 161-row set.
 *
 *   node test-group4-names.js                 all sections
 *   node test-group4-names.js U,P             only the listed sections
 *   DET=<detector copy> node test-group4-names.js    run an older detector for before/after
 *
 * Sections:  U unicode | P particles/hyphen/suffix/cap | I initials, "Ma." | J job-span clipping, "Co" | T title-case anchored
 *            L lists | S lowercase self-introductions | G group 1/3/3b/3c protections | M metamorphic templates
 *            BB benign (sentence/lower/Title) | BL benign lists | BS benign lowercase "i am / im / my name is" phrases
 * Each positive case is an exact-span check on the person findings. Benign sets count ANY person finding as a false positive
 * (other nlp_* types are reported separately, they belong to other groups). Exit code is non-zero if any check fails.
 */
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
const other = (raw) => scan(raw).filter(x => x.patternId !== 'nlp_person_name' && /^nlp_/.test(x.patternId)).length;
const only = (process.argv[2] || '').split(',').filter(Boolean);
const want = s => !only.length || only.includes(s);
const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));

let totalFail = 0;
function positives(name, title, cases) {
  if (!want(name)) return;
  let ok = 0; const bad = [];
  for (const [p, exp] of cases) { const got = persons(p); if (same(got, exp)) ok++; else bad.push([p, exp, got]); }
  totalFail += bad.length;
  L(`[${name}] ${title}: ${ok}/${cases.length} exact`);
  bad.slice(0, 40).forEach(([p, e, g]) => L(`     FAIL ${JSON.stringify(p)}\n          expected ${JSON.stringify(e)} got ${JSON.stringify(g)}`));
}
function benign(name, title, prompts) {
  if (!want(name)) return;
  const bad = []; let nonPerson = 0;
  for (const p of prompts) { const got = persons(p); nonPerson += other(p); if (got.length) bad.push([p, got]); }
  totalFail += bad.length;
  L(`[${name}] ${title}: ${prompts.length} prompts, person false positives = ${bad.length} (other-type nlp findings, not counted: ${nonPerson})`);
  bad.slice(0, 40).forEach(([p, g]) => L(`     FP ${JSON.stringify(p)} -> ${JSON.stringify(g)}`));
}

// ── U: Unicode letters, end to end ────────────────────────────────────────────
positives('U', 'accented letters stay inside the name', [
  ['Please send the notes to Grace Dela Peña tomorrow.', ['Grace Dela Peña']],
  ['Niño Quintos called me yesterday.', ['Niño Quintos']],
  ['The letter was signed by Beatriz Muñoz last week.', ['Beatriz Muñoz']],
  ['Thank you, José Ferrer, for the help.', ['José Ferrer']],
  ['My teacher is Ana García and she is kind.', ['Ana García']],
  ['Please remind Hilario Peña to sign the form.', ['Hilario Peña']],
  ['Zoë Müller and Søren Ångström joined the call.', ['Zoë Müller', 'Søren Ångström']],
  ['The report was written by Renée Dalisay on Friday.', ['Renée Dalisay']],
]);

// ── P: particles, hyphens, apostrophes, suffixes, word cap ────────────────────
positives('P', 'particles / hyphen / apostrophe / suffix / long names', [
  ['Please draft a note for Wilfredo dela Rosa today.', ['Wilfredo dela Rosa']],
  ['Imelda de la Torre arrived at noon.', ['Imelda de la Torre']],
  ['Pedro de los Santos arrived at noon.', ['Pedro de los Santos']],
  ['Dionisio del Rosario arrived at noon.', ['Dionisio del Rosario']],
  ['Karim Van Der Merwe arrived at noon.', ['Karim Van Der Merwe']],
  ['Yusuf Al Mansouri presented the results.', ['Yusuf Al Mansouri']],
  ['Rosario Abella-Quintos arrived at noon.', ['Rosario Abella-Quintos']],
  ['Rosa Santos-Lim and Sean O\'Brien arrived together.', ['Rosa Santos-Lim', 'Sean O\'Brien']],
  ['The cake is for Amara Okafor-Eze tonight.', ['Amara Okafor-Eze']],
  ['Cecilia Mae Dalisay Montoya lives in Tarlac.', ['Cecilia Mae Dalisay Montoya']],
  ['Hilario Jay Dela Cruz lives in Tarlac.', ['Hilario Jay Dela Cruz']],
  ['Esteban Miguel Quintanilla III went home early.', ['Esteban Miguel Quintanilla III']],
  ['Orlando Villacorta Jr. went home early.', ['Orlando Villacorta Jr']],
  ['Orlando Villacorta Sr. went home early.', ['Orlando Villacorta Sr']],
  ['Lourdes Cristina Esperanza Villacorta y Montoya arrived.', ['Lourdes Cristina Esperanza Villacorta y Montoya']],
  ['Maria Elena Cristina Ferrer Dalisay Whitfield arrived.', ['Maria Elena Cristina Ferrer Dalisay Whitfield']],
  ['Priya Kowalski\'s notebook is on the desk.', ['Priya Kowalski']],
]);

// ── I: initials and "Ma." ─────────────────────────────────────────────────────
positives('I', 'initials and Ma.', [
  ['My aunt, J. P. Dalisay-Quintos, left me a recipe.', ['J. P. Dalisay-Quintos']],
  ['Please thank Ma. Beatriz Muñoz-Ferrer for hosting.', ['Ma. Beatriz Muñoz-Ferrer']],
  ['The author, R. K. Thorne, signed the book.', ['R. K. Thorne']],
  ['Please thank Ma. Lourdes Abella for hosting.', ['Ma. Lourdes Abella']],
  ['Susan B. Whitfield presented the budget.', ['Susan B. Whitfield']],
]);

// ── J: job-span clipping and "Co" ─────────────────────────────────────────────
positives('J', 'job-span clipping and Co', [
  ['Format this: Beatriz Quintanilla Branch Coordinator for the northern region handles requests.', ['Beatriz Quintanilla']],
  ['Hilario Ferrer Regional Manager approved the leave request.', ['Hilario Ferrer']],
  ['Team: Anna Marie Co (accountant), Pedro Dalisay (electrician).', ['Anna Marie Co', 'Pedro Dalisay']],
  ['Please thank Cynthia Co for the help.', ['Cynthia Co']],
  ['Please email Marcus Co about the schedule.', ['Marcus Co']],
]);

// ── T: Title-Case-only prompts (anchored rule) ────────────────────────────────
positives('T', 'Title-Case-only prompts', [
  ['Please Write A Letter To Alvin Jay Dela Rosa About The Meeting', ['Alvin Jay Dela Rosa']],
  ['Send The Report To Grace Dela Peña Tomorrow', ['Grace Dela Peña']],
  ['Draft An Email For Beatriz Quintanilla About The Schedule', ['Beatriz Quintanilla']],
  ['Remind Hilario Ferrer To Submit The Form Today', ['Hilario Ferrer']],
  ['Thank You Wilfredo Dalisay For Helping Me Move', ['Wilfredo Dalisay']],
  ['Write A Birthday Message For Cecilia Mae Montoya', ['Cecilia Mae Montoya']],
  ['Ask Marcus Thorne About The Quarterly Report', ['Marcus Thorne']],
  ['I Spoke With Priya Kowalski Yesterday About The Plan', ['Priya Kowalski']],
]);

// ── L: lists ──────────────────────────────────────────────────────────────────
positives('L', 'lists of names', [
  ['Ana, Ben, Carla and Dan went to the market.', ['Ana', 'Ben', 'Carla', 'Dan']],
  ['Invite Hilario, Beatriz, Dionisio and Wilfredo to the dinner.', ['Hilario', 'Beatriz', 'Dionisio', 'Wilfredo']],
  ['Attendees: Rosa Abella, Marcus Thorne, and Priya Kowalski.', ['Rosa Abella', 'Marcus Thorne', 'Priya Kowalski']],
]);

// ── S: lowercase self-introductions ───────────────────────────────────────────
positives('S', 'lowercase self-introductions', [
  ['hello, my name is beatriz quintanilla and i need a cover letter', ['beatriz quintanilla']],
  ['hi im amelia thorne and i need help with my resume', ['amelia thorne']],
  ['my name is wilfredo and i need help', ['wilfredo']],
  ['please call me marcus dalisay if you need more info', ['marcus dalisay']],
]);
// Informational (never counted as failures): first names Compromise does not know are NOT found after "im / i am / call me".
if (want('S')) {
  const unk = ['hi im hilario ferrer and i need help', 'please call me dionisio dalisay if you need more info'];
  L('[S-info] unknown first name after im / call me (limitation, not counted): ' + unk.map(p => JSON.stringify(persons(p))).join(' '));
}

// ── G: Group 1 / 3 / 3b / 3c protections (must stay non-person) ───────────────
benign('G', 'protections: organizations, places, titles, ordinary words', [
  'Hilario Dalisay Foundation donated books to the school.',
  'Hospital San Beatriz opened a new wing in Tarlac City.',
  'Please Write A Quarterly Report Template For The Team',
  'I live on Ferrer Street near the Dalisay Avenue stop.',
  'Quarterly Budget Review Meeting is on Friday.',
  'We moved from Quezon City to Cebu City in March.',
  'Rice Without Salt is my favorite cookbook.',
]);

// G2: a person next to an organization / a title in the same line keeps exactly the person's words
positives('G2', 'person next to organization / title / flattened sign-off', [
  ['Best regards, Andrea Joy Sarmiento Tarlac State University College of Education', ['Andrea Joy Sarmiento']],
  ['Tarlac National High School Principal Armando Dizon spoke at the event.', ['Armando Dizon']],
  ['Alvin Jay Dela Rosa Senior Accountant CPA is employed at a bank.', ['Alvin Jay Dela Rosa']],
  ['Maria Santos Foundation donated books to the school.', []],
]);
// Known open items found while building these sets (identical with the pre-Group-4 detector; not caused by or fixed in Group 4):
if (want('G')) {
  const known = ['Thanked Donors Appreciation Letter is the title of the file.', 'The Quintanilla Group announced a merger with Whitfield Holdings.'];
  L('[G-info] known pre-existing person false positives (not counted): ' + known.map(p => JSON.stringify(persons(p))).join(' '));
}

// ── M: metamorphic templates (name length x position x script) ────────────────
if (want('M')) {
  const G1 = ['Beatriz', 'Hilario', 'Imelda', 'Wilfredo', 'Cynthia', 'Dionisio', 'Marcus', 'Priya', 'Oliver', 'Amelia', 'Rodrigo', 'Lourdes', 'Esteban', 'Niño', 'Zoë', 'Renée'];
  const G2 = ['Mae', 'Jay', 'Lyn', 'Jean', 'Marie', 'Paul'];
  const SUR = ['Quintanilla', 'Dalisay', 'Whitfield', 'Aldridge', 'Montoya', 'Peña', 'Muñoz', 'García', 'Ferrer', 'Abella', 'Thorne', 'Kowalski', 'Santos-Lim', 'Okafor-Eze', 'Müller', 'Ångström'];
  const PART = ['Dela', 'De La', 'De Los', 'Del', 'Van Der', 'Al'];
  const build = (n, i) => {
    const g = G1[i % G1.length], s = SUR[(i * 5 + 3) % SUR.length], m = G2[i % G2.length], pa = PART[i % PART.length];
    switch (n) {
      case 1: return g;
      case 2: return `${g} ${s}`;
      case 3: return `${g} ${m} ${s}`;
      case 4: return `${g} ${m} ${pa} ${s}`;
      case 5: return `${g} ${m} ${G1[(i + 7) % G1.length]} ${pa} ${s}`;
    }
  };
  const TPL = [
    ['start', n => `${n} called me yesterday about the plan.`],
    ['middle', n => `Please thank ${n} for the help with the move.`],
    ['end', n => `I would like to thank ${n}.`],
    ['comma', n => `Hello, ${n} is here to see you.`],
  ];
  const stat = {};
  for (let len = 1; len <= 5; len++) {
    for (const [pos, f] of TPL) {
      let ok = 0, tot = 0; const bad = [];
      for (let i = 0; i < 6; i++) {
        const nm = build(len, i); tot++;
        const got = persons(f(nm));
        if (same(got, [nm])) ok++; else bad.push([nm, got]);
      }
      stat[`${len} words / ${pos}`] = `${ok}/${tot}`;
      if (bad.length && len > 1) { totalFail += bad.length; bad.slice(0, 2).forEach(([nm, g]) => L(`     FAIL [${len}w ${pos}] ${nm} -> ${JSON.stringify(g)}`)); }
      if (len === 1 && bad.length) { /* single first names are policy-dependent: reported, not failed */ }
    }
  }
  L('[M] exact-span template results (name words / position):');
  for (const len of [1, 2, 3, 4, 5]) L('     ' + len + ' word(s): ' + TPL.map(([pos]) => `${pos} ${stat[`${len} words / ${pos}`]}`).join(' | '));
}

// ── Benign sets ───────────────────────────────────────────────────────────────
const BB_BASE = [
  'Write a short poem about the rainy season in the mountains.',
  'Explain the causes of the French Revolution in three paragraphs.',
  'Give me a recipe for chicken adobo with less salt.',
  'How do I convert a list of strings to integers in Python?',
  'Plan a weekend trip to the beach with a small budget.',
  'Summarize the main ideas of supply and demand for my economics class.',
  'What is the difference between affect and effect?',
  'Create a weekly study schedule for biology and chemistry.',
  'Suggest names for a bakery that sells banana bread and pandesal.',
  'Draft a polite email asking my landlord to fix the leaking faucet.',
  'Describe how photosynthesis works for a grade five student.',
  'Write a limerick about a cat who loves to nap on the keyboard.',
  'Translate good morning and thank you into Spanish and Filipino.',
  'List five tips for preparing for a job interview.',
  'Explain what a balance sheet shows and why it matters.',
  'Help me name my new mobile game about space farming.',
];
if (want('BB')) {
  const title = s => s.replace(/\b([a-z])/g, c => c.toUpperCase());
  const set = [...BB_BASE, ...BB_BASE.map(s => s.toLowerCase().replace(/[.?]$/, '')), ...BB_BASE.map(title)];
  benign('BB', 'benign sentence / lower / Title (' + BB_BASE.length + ' x 3)', set);
}
benign('BH', 'benign Title-Case headings / product / course / event names', [
  'Gulf Stream Bridge Maintenance Schedule', 'Advanced Calculus For Engineering Students', 'Pacific Crest Trail Hiking Guide',
  'Annual Summer Reading Challenge Registration', 'Northern Lights Photography Workshop Notes', 'Beginner Pottery Class Supply List',
  'Harvest Moon Festival Volunteer Handbook', 'Quantum Leap Fitness Program Overview', 'Silver Birch Elementary Parent Newsletter',
  'Blue Lagoon Resort Booking Confirmation', 'Introduction To Marine Biology Syllabus', 'Mountain View Community Garden Rules',
  'Midnight Express Train Timetable', 'Golden Gate Cycling Club Newsletter', 'Rapid Response Training Manual Chapter Four',
  'Emerald Coast Seafood Festival Menu', 'Creative Writing Workshop Registration Form', 'Starlight Cinema Weekend Program',
  'Cedar Ridge Hiking Trail Map', 'Digital Marketing Fundamentals Course Outline', 'Crimson Tide Football Season Preview',
  'Lakeside Pottery Studio Class Schedule', 'Wild Orchid Garden Tour Information', 'Urban Sketching Meetup Group Guidelines',
  'Fresh Harvest Farmers Market Vendor List', 'Thunder Bay Fishing Derby Rules', 'Autumn Leaf Festival Parade Route',
  'Open Source Contributor Guide Version Two', 'Sunrise Yoga Retreat Packing List', 'Coral Reef Conservation Project Update',
  'Please Draft A Weekly Menu For The Cafeteria', 'Write A Summary Of The Water Cycle For Grade Five',
  'Explain How Solar Panels Work To A Ten Year Old', 'Create A Study Plan For The Chemistry Midterm Exam',
  'Suggest Names For A Coffee Shop Near The Beach', 'Translate This Paragraph Into Simple English Please',
  'Plan A Three Day Trip To The Mountains With Friends', 'Give Me Tips For A Successful Job Interview Tomorrow',
]);
benign('BL','benign lists (places, products, foods, ordinary words)', [
  'Compare Paris, Madrid, Lisbon and Vienna for a spring holiday.',
  'We sell Apples, Mangoes, Bananas and Grapes at the market.',
  'Rank these phones: Galaxy, Pixel, Xperia and Redmi.',
  'Buy eggs, rice, tomatoes and onions on the way home.',
  'Visit Baguio, Sagada, Banaue and Vigan during the long weekend.',
  'Tuesday, Wednesday, Thursday and Friday are open for booking.',
  'The menu has Adobo, Sinigang, Kaldereta and Lechon.',
  'Colors available: Red, Blue, Green and Yellow.',
  'Languages offered: French, German, Japanese and Korean.',
  'Planets covered: Mercury, Venus, Earth and Mars.',
  'Compare Tarlac, Pampanga, Bulacan and Nueva Ecija for farming.',
  'Install Python, Node, Docker and Git before the workshop.',
  'Our teams are Alpha, Bravo, Charlie and Delta.',
  'Order Burger, Fries, Salad and Soda for the party.',
  'Pack sunscreen, towels, snacks and water for the trip.',
  'Classes this term: Algebra, Geometry, Chemistry and History.',
]);
benign('BS', 'benign lowercase self-introduction phrases (about 40)', [
  'im sorry about the late reply', 'i am from tarlac and i love the food', 'im a student in grade ten',
  'i am 22 years old and want to learn guitar', 'im not sure what to cook tonight', 'i am tired and need a nap',
  'im looking for a good book about history', 'i am happy with the results', 'my name is long so please shorten it for the form',
  'im hungry what can i cook with eggs', 'i am interested in learning python', 'im planning a trip next month',
  'i am working on a school project about plants', 'im late for class help me write an excuse', 'i am new here and need directions',
  'im confused about fractions', 'i am afraid of public speaking', 'im from the province and moving to the city',
  'i am a teacher and need a lesson plan', 'im studying for the board exam', 'i am going to the market later',
  'im thinking of changing careers', 'i am so excited about the trip', 'im ready to start the essay',
  'i am allergic to peanuts and need a safe recipe', 'im okay with either option', 'i am feeling sick today',
  'im trying to save money this year', 'i am in the library right now', 'im writing a story about a dragon',
  'i am the oldest of four kids', 'im happy to help with the party', 'i am looking forward to the weekend',
  'im using a laptop with little memory', 'i am married with two children', 'im good at math but weak in english',
  'my name is not important just fix the grammar', 'i am here to ask about scholarships', 'im in a hurry please answer fast',
  'this is fine thanks', 'this is my first time cooking rice', 'call me back when you are free tomorrow',
]);

L(`\nTOTAL FAILURES: ${totalFail}`);
process.exit(totalFail ? 1 : 0);
