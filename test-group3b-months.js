#!/usr/bin/env node
/**
 * test-group3b-prefixes.js — template tests for Filipino honorific / kinship prefixes and leading prepositions.
 * Written by the assistant; all names are fictional. Prints measured counts only.
 * Run against two builds to compare (DET=<other detector copy>).
 */
const { L, persons, exact } = require('./test-group3b-lib.js');
// P5. month names that are also first names, in frames the extractors really reach (METHOD 4.5 after for/to/with/from, METHOD 3 subject)
const MONTHS = ['May', 'April', 'June', 'August', 'March', 'Jun'];
const NAMEU = [m => `Please write to ${m} about the schedule.`, m => `I talked with ${m} yesterday.`, m => `Send the notes to ${m} before noon.`,
  m => `I got a message from ${m} this morning.`, m => `The report from ${m} is attached.`, m => `Forward the email from ${m} to the team.`];
const DATEU = [m => `The statement from ${m} 5 is ready.`, m => `The bill for ${m} 12 is unpaid.`, m => `The sale runs from ${m} to December.`,
  m => `Classes run from ${m} until the end of term.`, m => `Open from ${m} through the holidays.`, m => `Open from ${m} 5 to 10.`];
let nk = 0, nn = 0, dr = 0, dn = 0; const lines = [];
for (const m of MONTHS) { for (const f of NAMEU) { nn++; if (exact(persons(f(m)), m)) nk++; else lines.push('name-use lost: ' + f(m)); } for (const f of DATEU) { dn++; if (!exact(persons(f(m)), m)) dr++; else lines.push('date-use kept: ' + f(m)); } }
L(`P5. MONTH NAMES (${MONTHS.join('/')}): name uses kept ${nk}/${nn}; date uses (after "from", or before a digit) rejected ${dr}/${dn}`); lines.slice(0, 8).forEach(x => L('     ' + x));
