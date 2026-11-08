#!/usr/bin/env node
/**
 * test-group7-orgs-s2.js — Group 7 stage 2 held-out evaluation: (c) "Group" / "Agency" and (d) "Unit" / "Division" / "Section" as head words.
 *
 *   node test-group7-orgs-s2.js [--misses] [--json out.json]        DET=<detector copy> runs another build
 *
 * The lists below were written BEFORE the stage 2 code and are not taken from the 161 rows. Entities are fictional or generic (invented place and
 * company-like words with a sector word). Frames per organization:
 *   F1 affiliated   "My cousin works at <Org> as a clerk."
 *   F2 plain        "Please summarize the latest notice from <Org> for the group chat."
 *   F3 common-word  the same words lower-case in an ordinary sentence       -> NO nlp_organization finding allowed
 *   F4 heading      the same words inside a Title Case heading line         -> NO nlp_organization finding allowed (kind S and U only)
 * Kinds: S = <Name> <Sector word> Group/Agency (found in F1 and F2); U = <Sector phrase> Unit/Division/Section (found in F1 and F2);
 *        K = <Name> Group/Agency with no sector word (found in F1 with an affiliation cue; must NOT be found in F2).
 * Part B: benign phrases and 100 Title Case headings (no nlp_organization finding allowed).
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
const orgsOf = raw => Det.scan(N.normalizePath_C(raw)).filter(x => x.patternId === 'nlp_organization').map(x => x.rawMatch);

// ── Part A lists ──
const NAMES = 'Harborview Ironbridge Lakeshore Stonebridge Northfield Westbrook Eastgate Silverlake Greenfield Redwood Clearwater Brightwater Oakmont Pinecrest Rivermont Summitview Cedarwood Fairhaven Goldcrest Highland Kingsport Lindenwood Maplewood Newbridge Orchard Parkside Queensgate Ridgeway Stratford Thornhill Uplands Valleyview Willowbrook Yorkshire Ashford Birchwood Cleveland Dunmore Elmhurst Fernwood Glenmore Hawthorne Islington Juniper Kenilworth Langley Marlow Norwood Oxford Portland Quincy Rochester Salisbury Tamworth Ventnor Whitby Xenia Yardley Zephyr Alderwood Brookfield Carrington'.split(' ');
const SECT_GROUP = ['Medical', 'Security', 'Health', 'Energy', 'Insurance', 'Financial', 'Media', 'Logistics', 'Education', 'Construction', 'Engineering', 'Marketing', 'Retail', 'Hospitality', 'Telecom', 'Dental', 'Pharmaceutical', 'Consulting', 'Property', 'Shipping'];
const SECT_AGENCY = ['Security', 'Advertising', 'Employment', 'Staffing', 'Recruitment', 'Marketing', 'Insurance', 'Media', 'Consulting', 'Property', 'Logistics', 'Engineering', 'Communications', 'Placement'];
const UNIT_SECT = ['Cardiology', 'Pediatrics', 'Oncology', 'Radiology', 'Intensive Care', 'Emergency', 'Surgical', 'Nursing', 'Finance', 'Accounting', 'Human Resources', 'Legal', 'Customer Service', 'Procurement', 'Maintenance', 'Sales', 'Marketing', 'Operations', 'Security', 'Rural Health', 'Fire Prevention', 'Records Management', 'Quality Assurance', 'Research and Development', 'Information Technology', 'Payroll', 'Laboratory', 'Environmental', 'Planning', 'Engineering'];
const UHEAD = ['Unit', 'Division', 'Section'];

const ORGS = [];
let n = 0;
for (let i = 0; i < 70; i++) { const nm = NAMES[(i * 7) % NAMES.length], s = SECT_GROUP[(i * 3) % SECT_GROUP.length]; ORGS.push([`${nm} ${s} Group`, 'S', [nm, s, 'Group']]); }
for (let i = 0; i < 56; i++) { const nm = NAMES[(i * 11 + 5) % NAMES.length], s = SECT_AGENCY[(i * 5) % SECT_AGENCY.length]; ORGS.push([`${nm} ${s} Agency`, 'S', [nm, s, 'Agency']]); }
for (let i = 0; i < 130; i++) { const s = UNIT_SECT[i % UNIT_SECT.length], h = UHEAD[Math.floor(i / UNIT_SECT.length) % 3]; ORGS.push([`${s} ${h}`, 'U', [s, h]]); }
for (let i = 0; i < 60; i++) { const nm = NAMES[(i * 13 + 2) % NAMES.length], h = i % 2 ? 'Group' : 'Agency'; ORGS.push([`${nm} ${h}`, 'K', [nm, h]]); }

const F1 = o => `My cousin works at ${o} as a clerk.`;
const F2 = o => `Please summarize the latest notice from ${o} for the group chat.`;
const F3 = o => `We talked about the ${o.toLowerCase()} during the lecture yesterday.`;
const F4 = o => `Orientation Guide for ${o} Policies and Procedures`;
const esc = s => s.toLowerCase().replace(/[.,]/g, '');
const hit = (raw, o) => orgsOf(raw).some(m => { const a = esc(m), b = esc(o); return a === b || a.includes(b) || (b.includes(a) && a.split(' ').length >= 2); });

// ── Part B: benign phrases (zero nlp_organization findings allowed) ──
const BENIGN = [
  'The age group of ten to twelve years is the most active one.', 'Which blood group is the universal donor?', 'Our focus group met on Tuesday.', 'She joined a support group last month.',
  'We formed a study group for the exam.', 'The travel agency opened early.', 'A news agency reported the storm.', 'What does a government agency do in general?', 'A government agency issued the permit.',
  'Unit 4 covers fractions.', 'Please run the unit test before you push.', 'I need a unit conversion table for the lab.', 'The division of labor is an old idea.', 'Long division is hard for my son.',
  'Please read section 3 before class.', 'A subsection of the report was missing.', 'Why did the sales division grow last year?', 'Is the marketing division important in a small firm?', 'The finance section of the newspaper is thin.',
  'Group Discussion Topics for Class', 'Agency and Structure in Sociology', 'Group Work Rules', 'Unit Test Review Sheet', 'Section 3 Summary', 'Division of Labor Explained',
  'What is the difference between a unit and a division in the army?', 'Our peer group is very supportive.', 'The ethnic group is small.', 'The control group received no treatment.', 'A reading group meets weekly.',
  'He works in a government agency, he said, but did not say which.', 'Each unit of the course has a quiz.', 'The security section of the airport was crowded.', 'The medical group chat is noisy.', 'A health unit is a measure in the textbook.',
  'Pressure group politics is a topic in civics.', 'The travel agency and the news agency are on the same street.', 'Our team split into three groups of five.', 'The sports section has the scores.', 'Divide the cake into equal sections.',
  'The unit price is fifty pesos.', 'He leads the cooking group on Fridays.', 'An advertising agency was hired by the school, according to the notice.', 'An employment agency can help you find a job.', 'Join the discussion group for beginners.',
];
// 100 Title Case headings that contain these words
const HW = ['Group', 'Agency', 'Unit', 'Division', 'Section'];
const MODS = ['Age', 'Blood', 'Focus', 'Support', 'Study', 'Travel', 'News', 'Peer', 'Reading', 'Control', 'Discussion', 'Working', 'Medical', 'Security', 'Health', 'Sales', 'Finance', 'Math', 'Science', 'Government'];
const ENDS = ['Guide for Beginners', 'Rules and Schedule', 'Lesson Plan Overview', 'Topics and Questions', 'Tips and Best Practices', 'Review Sheet', 'Summary Report', 'Checklist for Teachers', 'Handbook Chapter Notes', 'Examples and Exercises'];
const HEADINGS = [];
for (let i = 0; i < 100; i++) { HEADINGS.push(`${MODS[i % MODS.length]} ${HW[(i * 3 + Math.floor(i / 20)) % HW.length]} ${ENDS[(i * 7 + 1) % ENDS.length]}`); }
HEADINGS.push('Tips for Running a Study Group in College', 'How to Write a Unit Plan', 'Understanding the Division of Powers'); HEADINGS.length = 100;

function run() {
  const kinds = {}, miss = [], rows = [];
  for (const [o, k] of ORGS) {
    const t = kinds[k] || (kinds[k] = { n: 0, F1: 0, F2: 0, F3fp: 0, F4fp: 0, F4n: 0 });
    t.n++;
    const f1 = hit(F1(o), o), f2 = hit(F2(o), o), f3 = orgsOf(F3(o)).length > 0;
    if (f1) t.F1++; if (f2) t.F2++; if (f3) t.F3fp++;
    let f4 = false;
    if (k !== 'K') { t.F4n++; f4 = orgsOf(F4(o)).length > 0; if (f4) t.F4fp++; }
    rows.push({ o, k, f1, f2, f3, f4 });
    if (k === 'K' ? !f1 : (!f1 || !f2)) miss.push(`${o} [${k}]${f1 ? '' : ' F1'}${f2 ? '' : ' F2'}`);
  }
  const N_ = ORGS.length;
  L(`Part A: ${N_} held-out organizations`);
  const lab = { S: 'S sector Group/Agency', U: 'U sector Unit/Div/Sect', K: 'K name-only (cue needed)' };
  for (const [k, v] of Object.entries(kinds)) {
    const f2txt = k === 'K' ? `F2 plain (must NOT flag) flagged ${v.F2}` : `F2 plain found ${v.F2}`;
    L(`  ${lab[k].padEnd(26)} n=${v.n}  F1 affiliated found ${v.F1}  ${f2txt}  F3 common-word false positives ${v.F3fp}` + (k !== 'K' ? `  F4 heading false positives ${v.F4fp}/${v.F4n}` : ''));
  }
  const bn = BENIGN.map(s => ({ s, o: orgsOf(s) })), hd = HEADINGS.map(s => ({ s, o: orgsOf(s) }));
  const bfp = bn.filter(x => x.o.length), hfp = hd.filter(x => x.o.length);
  L(`Part B: ${BENIGN.length} benign phrases with an organization finding: ${bfp.length}; ${HEADINGS.length} Title Case headings with an organization finding: ${hfp.length}`);
  bfp.concat(hfp).forEach(x => L(`  FP: ${JSON.stringify(x.s)} => ${JSON.stringify(x.o)}`));
  if (process.argv.includes('--misses')) miss.forEach(m => L('  miss: ' + m));
  const ji = process.argv.indexOf('--json');
  if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ rows, bn, hd }, null, 1));
  const prompts = [F1(ORGS[0][0]), F2(ORGS[80][0]), BENIGN.join(' ') + ' ' + BENIGN.join(' ')];
  prompts.forEach((p, i) => { Det.scan(N.normalizePath_C(p)); const t0 = process.hrtime.bigint(); for (let q = 0; q < 3; q++) Det.scan(N.normalizePath_C(p)); L(`speed prompt ${i + 1} (${p.length} chars): ${(Number(process.hrtime.bigint() - t0) / 3e6).toFixed(0)} ms/scan`); });
}
run();
