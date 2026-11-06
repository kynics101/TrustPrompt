#!/usr/bin/env node
/**
 * test-group3b-leadverb.js — sentence-initial verbs that are on the extractor's non-name list (Contact, Email, Told...).
 * Written by the assistant; fictional names. A: recall for "<Verb> First Last ..." ; B: benign Title-Case phrases that start with
 * the same words (must stay empty). Run with DET=<detector copy> to compare builds.
 */
const { L, persons, exact, touches } = require('./test-group3b-lib.js');
const VERBS = ['Contact', 'Email', 'Called', 'Told', 'Asked', 'Sent', 'Helped', 'Gave', 'Call', 'Ask', 'Tell'];
const PEOPLE = ['Marites Dalisay', 'Rodrigo Aldridge', 'Imelda Quintos'];
const F = [(v, n) => `${v} ${n} about the invoice.`, (v, n) => `${v} ${n} tomorrow.`];
let n = 0, ex = 0, tc = 0; const per = {}, miss = [];
for (const v of VERBS) for (const p of PEOPLE) for (const f of F) { const ps = persons(f(v, p)); n++; per[v] = per[v] || [0, 0]; per[v][1]++; if (exact(ps, p)) { ex++; per[v][0]++; } else miss.push(f(v, p) + ' => ' + JSON.stringify(ps)); if (touches(ps, p)) tc++; }
L(`A. LEADING VERB + NAME: ${n} frames; exact "First Last" ${ex}/${n}; name touched ${tc}/${n}`);
L('   exact by verb: ' + Object.entries(per).map(([k, v]) => k + ' ' + v[0] + '/' + v[1]).join(', ')); miss.slice(0, 4).forEach(x => L('     ' + x));
const BENIGN = ['Contact Information Form', 'Contact Page Design Guide', 'Email Marketing Strategy Template', 'Email Address Checklist', 'Call Center Schedule Template',
  'Called Meeting Agenda Draft', 'Told Stories Reading List', 'Sent Items Folder Cleanup', 'Contact Lens Care Guide', 'Ask Me Anything Session Format',
  'Gave Away Items Inventory', 'Helped Customers Report Summary'];
const bad = []; for (const b of BENIGN) for (const t of [b, b + ' for the new term.']) { const ps = persons(t); if (ps.length) bad.push(t + ' => ' + JSON.stringify(ps)); }
L(`B. BENIGN Title-Case phrases starting with those words: ${bad.length}/${BENIGN.length * 2} produced a person finding`); bad.slice(0, 8).forEach(x => L('     ' + x));
