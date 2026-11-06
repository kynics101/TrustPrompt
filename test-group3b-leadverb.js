#!/usr/bin/env node
/**
 * test-group3b-leadverb.js — sentence-initial person-directed verbs that are on the extractor's non-name list.
 * Written by the assistant; fictional names. A: recall for "<Verb> First Last ..." (11 verbs x 3 names x 2 frames = 66);
 * B: benign Title-Case phrases starting with the same verbs (must stay empty): 12 older + 20 new phrases, each bare and with a
 * trailing clause = 64 frames. Run with DET=<detector copy>; LV=<variant> is read by the scratch variant detector.
 */
const { L, persons, exact, touches } = require('./test-group3b-lib.js');
const VERBS = ['Contact', 'Email', 'Called', 'Told', 'Asked', 'Sent', 'Gave', 'Helped', 'Named', 'Thanked', 'Met'];
const PEOPLE = ['Marites Dalisay', 'Rodrigo Aldridge', 'Imelda Quintos'];   // Compromise knows Rodrigo and Imelda; Marites Dalisay is unknown to it
const F = [(v, n) => `${v} ${n} about the invoice.`, (v, n) => `${v} ${n} tomorrow.`];
let n = 0, ex = 0, tc = 0; const per = {}, miss = [];
for (const v of VERBS) for (const p of PEOPLE) for (const f of F) { const ps = persons(f(v, p)); n++; per[v] = per[v] || [0, 0]; per[v][1]++; if (exact(ps, p)) { ex++; per[v][0]++; } else miss.push(f(v, p) + ' => ' + JSON.stringify(ps)); if (touches(ps, p)) tc++; }
L(`A. LEADING VERB + NAME: ${n} frames; exact "First Last" ${ex}/${n}; name touched ${tc}/${n}`);
L('   exact by verb: ' + Object.entries(per).map(([k, v]) => k + ' ' + v[0] + '/' + v[1]).join(', '));
const unk = {}; // by name
for (const p of PEOPLE) { let k = 0, m = 0; for (const v of VERBS) for (const f of F) { m++; if (exact(persons(f(v, p)), p)) k++; } unk[p] = k + '/' + m; }
L('   exact by name: ' + JSON.stringify(unk)); miss.slice(0, 3).forEach(x => L('     ' + x));
const OLD = ['Contact Information Form', 'Contact Page Design Guide', 'Email Marketing Strategy Template', 'Email Address Checklist', 'Call Center Schedule Template',
  'Called Meeting Agenda Draft', 'Told Stories Reading List', 'Sent Items Folder Cleanup', 'Contact Lens Care Guide', 'Ask Me Anything Session Format',
  'Gave Away Items Inventory', 'Helped Customers Report Summary'];
const NEW = ['Contact Us Page Layout', 'Contact Sheet Printing Options', 'Contact Center Staffing Plan', 'Email Newsletter Signup Form', 'Email Server Migration Checklist',
  'Email Signature Style Guide', 'Email Archive Backup Folder', 'Called Back Messages Log', 'Told Tales Storybook Collection', 'Asked Questions Summary Sheet',
  'Sent Mail Cleanup Tool', 'Sent Messages Export Folder', 'Gave Feedback Survey Results', 'Helped Families Outreach Report', 'Named Entities Extraction Notes',
  'Thanked Donors Appreciation Letter', 'Met Gala Fashion Photo Album', 'Met Office Weather Forecast Summary', 'Contact Tracing Data Guidelines', 'Email Campaign Performance Review'];
const run = (list) => { const bad = []; for (const b of list) for (const t of [b, b + ' for the new term.']) { const ps = persons(t); if (ps.length) bad.push(t + ' => ' + JSON.stringify(ps)); } return bad; };
const b1 = run(OLD), b2 = run(NEW);
L(`B. BENIGN Title-Case phrases: older ${b1.length}/${OLD.length * 2}, new ${b2.length}/${NEW.length * 2}, total ${b1.length + b2.length}/${(OLD.length + NEW.length) * 2} produced a person finding`);
b1.concat(b2).slice(0, 10).forEach(x => L('     ' + x));
