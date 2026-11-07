#!/usr/bin/env node
/**
 * test-group4-anchor-recall.js — how many fictional first names / surnames does Compromise tag as a Person when lowercased and
 * looked at in isolation (the "anchor" the Title-Case heading guard (R6), the list rule and the lowercase self-introduction rule use)?
 * Names are written by the assistant; none come from the 161-row set. Measurement only.
 */
'use strict';
global.window = {}; global.globalThis = global;
global.window.nlp = require('./lib/compromise.min.js');
const PERSON = ['Person', 'FirstName', 'LastName', 'MaleName', 'FemaleName'];
const tagged = w => { const j = global.window.nlp(w.toLowerCase()).json({ terms: { tags: true } }); const t = (j[0] && j[0].terms[0] && j[0].terms[0].tags) || []; return t.some(x => PERSON.includes(x)); };
const sets = {
  'Filipino first names': ['Hilario', 'Dionisio', 'Wilfredo', 'Lourdes', 'Imelda', 'Rodrigo', 'Esteban', 'Cecilia', 'Beatriz', 'Remedios', 'Teodoro', 'Marites', 'Rowena', 'Jolina', 'Nestor', 'Perla', 'Ernesto', 'Gloria', 'Danilo', 'Cristina', 'Alfredo', 'Marilou', 'Rolando', 'Evangeline'],
  'Western first names': ['Marcus', 'Priya', 'Oliver', 'Amelia', 'Hannah', 'Gregory', 'Natalie', 'Brandon', 'Sophie', 'Theodore', 'Vanessa', 'Dennis', 'Isabel', 'Patrick', 'Colleen', 'Raymond', 'Tiffany', 'Jordan', 'Allison', 'Walter', 'Brenda', 'Franklin', 'Heather', 'Douglas'],
  'Filipino surnames': ['Quintanilla', 'Dalisay', 'Abella', 'Montoya', 'Villacorta', 'Ferrer', 'Manalo', 'Pascual', 'Soriano', 'Dimaculangan', 'Magbanua', 'Tolentino', 'Catapang', 'Aquino', 'Bautista', 'Evangelista'],
  'Western surnames': ['Whitfield', 'Aldridge', 'Thorne', 'Kowalski', 'Hargrove', 'Ellison', 'Fitzgerald', 'Lindqvist', 'Brennan', 'Caldwell', 'Ashworth', 'Pemberton', 'Hollis', 'Sutherland', 'Rutherford', 'Nakamura'],
};
for (const [name, list] of Object.entries(sets)) {
  const hit = list.filter(tagged);
  console.log(`${name}: ${hit.length}/${list.length} = ${(hit.length / list.length).toFixed(2)}   missed: ${list.filter(w => !hit.includes(w)).join(', ')}`);
}
