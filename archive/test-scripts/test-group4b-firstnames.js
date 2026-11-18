#!/usr/bin/env node
/**
 * test-group4b-firstnames.js — does the COMMON_FIRST_NAMES filter (shouldFilterCommonName) drop real names that START with a common
 * first name? 30 fictional names built from common Western and Filipino first names, each in a middle-of-sentence template and a
 * "my name is" template. Everything is written by the assistant. Measurement only.   DET=<copy> to test another build.
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
const persons = raw => Det.scan(N.normalizePath_C(raw)).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
const names = [
  'John Quintanilla', 'Mary Grace Dalisay', 'James Whitfield', 'David Montoya', 'Robert Ferrer', 'Michael Abella', 'William Thorne',
  'Richard Kowalski', 'Charles Aldridge', 'Joseph Villacorta', 'Thomas Hargrove', 'Alice Mae Ellison', 'Bob Navarro', 'Charlie Pascual',
  'Jennifer Soriano', 'Linda Marie Tolentino', 'Daniel Magbanua', 'Sarah Jean Catapang', 'Juan Dalisay', 'Jose Maria Abella', 'Maria Clara Ferrer',
  'Pedro Montoya', 'Ana Liza Quintanilla', 'Luis Whitfield', 'Carlos Thorne', 'Angelica Aldridge', 'Mark Anthony Villacorta', 'Grace Joy Navarro',
  'Patricia Lyn Pascual', 'Kevin Soriano'];
const T = [['middle', n => `Please thank ${n} for the help with the move.`], ['intro', n => `My name is ${n} and I need a cover letter.`]];
const lost = {};
for (const [t, f] of T) { lost[t] = []; for (const n of names) if (!persons(f(n)).some(p => p === n)) lost[t].push(`${n} -> ${JSON.stringify(persons(f(n)))}`); }
console.log = L;
for (const [t] of T) { L(`[${t}] lost ${lost[t].length}/${names.length}`); lost[t].forEach(x => L('     ' + x)); }
