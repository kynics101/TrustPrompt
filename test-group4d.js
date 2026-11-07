#!/usr/bin/env node
/**
 * test-group4d.js — Group 4d checks (everything fictional / written by the assistant):
 *   N  person-directed verbs in METHOD 4.5 (cued frames, several kinds of first names)
 *   B  benign "Ask Alexa / Thank God / Call Mom ..." phrases (any person finding is a false positive)
 *   S  corporate suffix words: 40 benign Title-Case phrases (any organization finding is a false positive) + 15 fictional company names
 * node test-group4d.js [N|B|S]      DET=<copy> to test another build
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
const scan = raw => Det.scan(N.normalizePath_C(raw)).filter(x => /^nlp_/.test(x.patternId));
const P = raw => scan(raw).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);
const O = raw => scan(raw).filter(x => x.patternId === 'nlp_organization').map(x => x.rawMatch);
const sel = process.argv[2] || 'NBS';
const out = []; let fails = 0;

if (sel.includes('N')) {
  const FR = {
    thank: n => `Please thank ${n} for the help.`, email: n => `Please email ${n} about the schedule.`, tell: n => `Please tell ${n} to call me.`,
    ask: n => `Please ask ${n} to bring the files.`, meet: n => `I will meet ${n} tomorrow.`, remind: n => `Please remind ${n} to sign the form.`,
    contact: n => `Please contact ${n} about the schedule.`, call: n => `Please call ${n} after lunch.`, invite: n => `Please invite ${n} to the party.`,
    notify: n => `Please notify ${n} about the change.`,
  };
  const INITIAL = { thank: 'Thank', email: 'Email', tell: 'Tell', ask: 'Ask', meet: 'Meet', remind: 'Remind', contact: 'Contact', call: 'Call', invite: 'Invite', notify: 'Notify' };
  const INIT_FR = {
    thank: n => `Thank ${n} for the help.`, email: n => `Email ${n} about the schedule.`, tell: n => `Tell ${n} to call me.`, ask: n => `Ask ${n} to bring the files.`,
    meet: n => `Meet ${n} at the lobby tomorrow.`, remind: n => `Remind ${n} to sign the form.`, contact: n => `Contact ${n} about the schedule.`,
    call: n => `Call ${n} after lunch.`, invite: n => `Invite ${n} to the party.`, notify: n => `Notify ${n} about the change.`,
  };
  const GROUPS = {
    'known Western first names': ['Marcus', 'Amelia', 'Oliver', 'Hannah'],
    'known Filipino first names': ['Cristina', 'Rowena', 'Gloria', 'Ernesto'],
    'names Compromise does not know': ['Hilario', 'Dionisio', 'Priya', 'Esteban'],
    'names equal to ordinary words': ['Grace', 'Hope', 'Hazel', 'Joy', 'Mason', 'Rose'],
  };
  out.push('[N] person-directed verbs, single first name, found exactly (mid-sentence frame / sentence-initial frame):');
  const miss = [];
  for (const [verb, f] of Object.entries(FR)) {
    const cells = [];
    for (const [g, names] of Object.entries(GROUPS)) {
      let a = 0, b = 0;
      for (const n of names) {
        if (P(f(n)).includes(n)) a++; else miss.push(`${verb} mid ${n}`);
        if (P(INIT_FR[verb](n)).includes(n)) b++; else miss.push(`${verb} init ${n}`);
      }
      cells.push(`${a}/${names.length}|${b}/${names.length}`);
    }
    out.push(`     ${verb.padEnd(8)} ${Object.keys(GROUPS).map((g, i) => g.split(' ').slice(0, 2).join(' ') + ' ' + cells[i]).join('   ')}`);
  }
  out.push('     not found: ' + miss.join(', '));
}

if (sel.includes('B')) {
  const benign = [
    'Ask Alexa what the weather is like.', 'Tell Siri to set an alarm for six.', 'Ask Google for the nearest pharmacy.', 'Thank God it is Friday.',
    'Email Support about the broken login.', 'Call Mom after the exam.', 'Ask Admin to reset the password.', 'Thank You for your help.', 'Tell Me a story about dragons.',
    'Ask Claude to summarize this article.', 'Tell Cortana to play some music.', 'Ask Dad for permission first.', 'Call Dad tonight.', 'Call Mum when you land.',
    'Ask Everyone to join the meeting.', 'Tell Everybody the news.', 'Email Help Desk about the printer.', 'Ask Again later.', 'Tell Us more about the plan.',
    'Thank Them for coming.', 'Ask Him to wait outside.', 'Tell Her the answer.', 'Call Back tomorrow morning.', 'Ask Anyone who knows the way.', 'Email Team about the delay.',
    'Call Staff if you need anything.', 'Ask Lord for guidance.', 'Ask Questions in class.', 'Thank Goodness the test is over.', 'Tell Stories to the children.',
    'Ask Permission before you borrow it.', 'Email Customer Service for a refund.', 'Call Home when you arrive.', 'Thank Heaven for small things.', 'Remind Me to buy milk.',
    'Meet Up with friends on Saturday.', 'Meet Tomorrow at the usual place.', 'Remind Everyone about the deadline.', 'Ask Nobody about this.', 'Tell Someone you trust.',
  ];
  const bad = benign.map(p => [p, P(p)]).filter(([, g]) => g.length);
  fails += bad.length;
  out.push(`[B] benign person-directed-verb phrases: ${benign.length} prompts, person false positives = ${bad.length}` + (bad.length ? '\n' + bad.map(([p, g]) => `     FP ${JSON.stringify(p)} -> ${JSON.stringify(g)}`).join('\n') : ''));
}

if (sel.includes('H')) {
  // held-out: words that are NOT on the addressee list and were not used to build it
  const held = [
    'Ask Experts before you buy.', 'Ask Teachers for feedback.', 'Tell Authorities about the leak.', 'Ask Politely if you need help.', 'Thank Technology for this.',
    'Call Emergency if it gets worse.', 'Email Marketing about the poster.', 'Tell Fortune you said hello.', 'Call Reception from your room.', 'Thank Providence for the rain.',
    'Tell Reality to wait.', 'Ask Oracle about the license.', 'Ask Nature for inspiration.', 'Email Sales about the quote.', 'Call Billing about the invoice.',
    'Email Security about the badge.', 'Ask Management for the schedule.', 'Ask Directions from a local.', 'Tell Science to wait.', 'Ask Feedback from the class.',
  ];
  const bad = held.map(p => [p, P(p)]).filter(([, g]) => g.length);
  out.push(`[H] held-out benign phrases (words not on the list): ${held.length} prompts, person false positives = ${bad.length}` + (bad.length ? '\n' + bad.map(([p, g]) => `     FP ${JSON.stringify(p)} -> ${JSON.stringify(g)}`).join('\n') : ''));
}

if (sel.includes('D')) {
  // Group 8 held-out: 40 NEW phrases (departments and functions) written after the dictionary design, not used to tune anything
  const dep = [
    'Contact Finance about the budget.', 'Email Payroll about the missing allowance.', 'Ask Procurement for a quotation.', 'Contact Compliance before you sign.',
    'Email Legal about the contract.', 'Ask Facilities to fix the aircon.', 'Contact Operations about the delay.', 'Email Accounting for the invoice copy.',
    'Ask Engineering to review the drawing.', 'Contact Admissions about the deadline.', 'Email Registrar for your transcript.', 'Ask Dispatch to send a driver.',
    'Contact Maintenance about the elevator.', 'Email Logistics about the shipment.', 'Ask Treasury to release the funds.', 'Contact Housekeeping for extra towels.',
    'Email Recruitment about the vacancy.', 'Ask Purchasing for a replacement.', 'Contact Planning about the schedule.', 'Email Research about the survey.',
    'Ask Training to book the room.', 'Contact Warranty about the repair.', 'Email Subscriptions to cancel it.', 'Ask Shipping for the tracking number.',
    'Contact Escalations if it is urgent.', 'Tell Dispatch we are ready.', 'Remind Accounting to close the books.', 'Notify Compliance about the incident.',
    'Notify Security about the visitor.', 'Notify Operations of the change.', 'Thank Volunteers for their time.', 'Call Reservations to change the booking.',
    'Call Dispatch for a pickup.', 'Email Newsroom with the tip.', 'Ask Concierge for a taxi.', 'Meet Procurement at ten.', 'Tell Engineering to hold the release.',
    'Remind Payroll about the cutoff.', 'Contact Billing to dispute the charge.', 'Email Reception when you arrive.',
  ];
  const bad = dep.map(p => [p, P(p)]).filter(([, g]) => g.length);
  fails += bad.length;
  out.push(`[D] NEW held-out department/function phrases (Group 8): ${dep.length} prompts, person false positives = ${bad.length}` + (bad.length ? '\n' + bad.map(([p, g]) => `     FP ${JSON.stringify(p)} -> ${JSON.stringify(g)}`).join('\n') : ''));
}

if (sel.includes('X')) {
  // Group 8 held-out: 40 NEW benign Title-Case phrases for the four remaining noun-suffixes (10 each)
  const ph = [
    'Mechanical Properties', 'Optical Properties', 'Nutritional Properties', 'Acoustic Properties', 'Electrical Properties', 'Material Properties', 'Surface Properties', 'Flow Properties', 'Antioxidant Properties', 'Healing Properties',
    'Wireless Technologies', 'Renewable Technologies', 'Cloud Technologies', 'Medical Technologies', 'Sensor Technologies', 'Learning Technologies', 'Display Technologies', 'Battery Technologies', 'Quantum Technologies', 'Farming Technologies',
    'Precision Manufacturing', 'Smart Manufacturing', 'Garment Manufacturing', 'Contract Manufacturing', 'Cement Manufacturing', 'Textile Manufacturing', 'Furniture Manufacturing', 'Steel Manufacturing', 'Automotive Manufacturing', 'Beverage Manufacturing',
    'Forensic Laboratories', 'Teaching Laboratories', 'Dental Laboratories', 'Computer Laboratories', 'Chemistry Laboratories', 'Science Laboratories', 'Physics Laboratories', 'Government Laboratories', 'Veterinary Laboratories', 'Testing Laboratories',
  ];
  const bySuffix = {}; const bad = [];
  for (const p of ph) { const o = O(`Explain ${p} to a beginner.`).concat(O(`${p} are covered in the next lesson.`)); if (o.length) { bad.push([p, o]); const s = p.split(' ').pop(); bySuffix[s] = (bySuffix[s] || 0) + 1; } }
  fails += bad.length;
  out.push(`[X] NEW held-out benign Title-Case phrases (Group 8): ${ph.length}, organization false positives = ${bad.length}` + (bad.length ? ` by suffix ${JSON.stringify(bySuffix)}\n` + bad.map(([p, o]) => `     FP ${JSON.stringify(p)} -> ${JSON.stringify(o)}`).join('\n') : ''));
}

if (sel.includes('S')) {
  const benign = [
    'Health Insurance', 'Life Insurance', 'Car Insurance', 'Travel Insurance', 'Home Insurance',
    'Physical Properties', 'Chemical Properties', 'Rental Properties', 'Magnetic Properties', 'Thermal Properties',
    'Day Trading', 'Stock Trading', 'Online Trading', 'Fair Trading', 'Forex Trading',
    'Supply Chain Logistics', 'Military Logistics', 'Global Logistics', 'Warehouse Logistics', 'Event Logistics',
    'Emerging Technologies', 'Information Technologies', 'Assistive Technologies', 'Green Technologies', 'Digital Technologies',
    'Advanced Manufacturing', 'Lean Manufacturing', 'Additive Manufacturing', 'Food Manufacturing', 'Modern Manufacturing',
    'Residential Realty', 'Commercial Realty', 'Luxury Realty',
    'Clinical Laboratories', 'Medical Laboratories', 'Research Laboratories', 'Public Laboratories',
    'Heavy Industries', 'Small Enterprises', 'Budget Airlines',
  ];
  const bySuffix = {}; const bad = [];
  for (const ph of benign) {
    const o = O(`Explain ${ph} to a beginner.`);
    if (o.length) { bad.push([ph, o]); const s = ph.split(' ').pop(); bySuffix[s] = (bySuffix[s] || 0) + 1; }
  }
  fails += bad.length;
  out.push(`[S] benign Title-Case phrases: ${benign.length}, organization false positives = ${bad.length}` + (bad.length ? ` by suffix ${JSON.stringify(bySuffix)}\n` + bad.map(([p, o]) => `     FP ${JSON.stringify(p)} -> ${JSON.stringify(o)}`).join('\n') : ''));
  const co = ['Quintanilla Insurance', 'Dalisay Properties', 'Montoya Trading', 'Whitfield Logistics', 'Aldridge Technologies', 'Kowalski Manufacturing', 'Abella Realty', 'Thorne Laboratories',
    'Whitfield Holdings', 'Dalisay Enterprises', 'Montoya Industries', 'Quintanilla Ventures', 'Aldridge Pharmaceuticals', 'Ferrer Airlines', 'Villacorta Motors'];
  let ok = 0; const miss = [];
  for (const c of co) {
    const p = `Please send the contract to ${c} today.`, o = O(p), pe = P(p);
    if (o.some(x => x.toLowerCase() === c.toLowerCase()) && !pe.length) ok++; else miss.push(`${c}: org=${JSON.stringify(o)} person=${JSON.stringify(pe)}`);
  }
  out.push(`[S] fictional company names found exactly as an organization with no person leak: ${ok}/${co.length}` + (miss.length ? '\n     ' + miss.join('\n     ') : ''));
}
console.log = L;
out.forEach(l => L(l));
process.exit(fails ? 1 : 0);
