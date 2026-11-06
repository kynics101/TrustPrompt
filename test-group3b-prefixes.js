#!/usr/bin/env node
/**
 * test-group3b-prefixes.js — template tests for Filipino honorific / kinship prefixes and leading prepositions.
 * Written by the assistant; all names are fictional. Prints measured counts only.
 * Run against two builds to compare (DET=<other detector copy>).
 */
const { L, persons, lc, exact, touches } = require('./test-group3b-lib.js');
const UNAMB = ['Aling', 'Aleng', 'Mang', 'Manong', 'Manang', 'Kapitan', 'Ate', 'Kuya', 'Tita', 'Tito', 'Lola', 'Lolo', 'Ninong', 'Ninang'];
const AMB = ['Don', 'Dona', 'Ka', 'Kap'];
const PEOPLE = [['Nestor', 'Villacorta'], ['Marites', 'Dalisay']];
const FRAMES = [
  ['uncued, after call', (p, f, l) => `Please call ${p} ${f} ${l} about the schedule.`],
  ['uncued, subject', (p, f, l) => `${p} ${f} ${l} said the meeting moved.`],
  ['uncued, after to', (p, f, l) => `I talked to ${p} ${f} ${l} yesterday.`],
  ['cued, appositive', (p, f, l) => `${p} ${f} ${l}, a nurse, called me.`],
  ['prefix + first name only', (p, f) => `Please ask ${p} ${f} to call me back.`],
];
function run(prefixes) {
  const rows = [];
  for (const p of prefixes) {
    let n = 0, attached = 0, exactFull = 0, touched = 0; const bad = [];
    for (const [f, l] of PEOPLE) for (const [fk, fr] of FRAMES) {
      const t = fr(p, f, l), ps = persons(t); n++;
      const target = fk.startsWith('prefix +') ? f : `${f} ${l}`;
      const att = ps.some(x => lc(x).split(/\s+/)[0] === lc(p));
      if (att) attached++;
      if (exact(ps, target)) exactFull++;
      if (touches(ps, target)) touched++; else bad.push(t + ' => ' + JSON.stringify(ps));
    }
    rows.push({ p, n, attached, exactFull, touched, bad });
  }
  return rows;
}
const show = (title, rows) => { L(title); for (const r of rows) { L(`   ${r.p.padEnd(8)} frames ${r.n}; prefix kept inside finding ${r.attached}; exact "First Last" ${r.exactFull}; name touched ${r.touched}`); r.bad.slice(0, 2).forEach(x => L('       MISSED: ' + x)); } };
show('P1. UNAMBIGUOUS prefixes (expected: prefix never kept, exact name found):', run(UNAMB));
show('P2. AMBIGUOUS prefixes used as honorifics (Don/Dona are Person-tagged by Compromise, so they stay attached by design):', run(AMB));

// names that ARE these words, and a leading preposition
const NAMEFRAMES = [n => `${n} will review the draft.`, n => `My name is ${n}.`, n => `Please send the file to ${n} today.`];
const REAL = ['Don Aldridge', 'Dona Whitfield', 'Ka Dalisay', 'Kap Lumbao', 'Don Carlos Reyes', 'Per Andersson', 'Ate Villacorta'];
L('P3. NAMES THAT EQUAL A PREFIX WORD (is the whole name still reported, first word included?):');
for (const n of REAL) { let kept = 0, touchedN = 0; const outs = []; for (const f of NAMEFRAMES) { const ps = persons(f(n)); if (exact(ps, n)) kept++; if (touches(ps, n)) touchedN++; outs.push(JSON.stringify(ps)); } L(`   ${n.padEnd(18)} full name exact ${kept}/3; touched ${touchedN}/3   ${outs[0]}`); }
const PER = [['Per', 'Elena', 'Cruz'], ['Per', 'Nathaniel', 'Ocampo'], ['Via', 'Karen', 'Tiongson']];
L('P4. LEADING PREPOSITION before a full name:');
for (const [p, f, l] of PER) { const ps = persons(`${p} ${f} ${l} the request was approved.`); const ps2 = persons(`Please reply, ${p} ${f} ${l} sent it.`); L(`   ${p} ${f} ${l}: ${JSON.stringify(ps)}  |  ${JSON.stringify(ps2)}`); }

// P5. month names that are also first names, in frames the extractors really reach (METHOD 4.5 after for/to/with/from, METHOD 3 subject)
const MONTHS = ['May', 'April', 'June', 'August', 'March', 'Jun'];
const NAMEU = [m => `Please write to ${m} about the schedule.`, m => `I talked with ${m} yesterday.`, m => `Send the notes to ${m} before noon.`,
  m => `I got a message from ${m} this morning.`, m => `The report from ${m} is attached.`, m => `Forward the email from ${m} to the team.`];
const DATEU = [m => `The statement from ${m} 5 is ready.`, m => `The bill for ${m} 12 is unpaid.`, m => `The sale runs from ${m} to December.`,
  m => `Classes run from ${m} until the end of term.`, m => `Open from ${m} through the holidays.`, m => `Open from ${m} 5 to 10.`];
let nk = 0, nn = 0, dr = 0, dn = 0; const lines = [];
for (const m of MONTHS) { for (const f of NAMEU) { nn++; if (exact(persons(f(m)), m)) nk++; else lines.push('name-use lost: ' + f(m)); } for (const f of DATEU) { dn++; if (!exact(persons(f(m)), m)) dr++; else lines.push('date-use kept: ' + f(m)); } }
L(`P5. MONTH NAMES (${MONTHS.join('/')}): name uses kept ${nk}/${nn}; date uses (after "from", or before a digit) rejected ${dr}/${dn}`); lines.slice(0, 8).forEach(x => L('     ' + x));
