#!/usr/bin/env node
/**
 * test-groupA-orgs.js — Cause A held-out evaluation: a Title Case run ending in an ordinary business noun is an organization candidate, not a person.
 *
 *   node test-groupA-orgs.js [--json out.json] [--fp]        DET=<detector copy> runs another build
 *
 * Written BEFORE the Cause A code. All entities are invented. Organizations = <Name> [<Modifier>] <Head>. Heads come in two groups:
 *   IN   heads drawn from the business categories the rule is built from (retail, food, transport, health, education, professional services,
 *        construction, media, hospitality)
 *   OUT  heads that are deliberately NOT in the rule's list (other trades and shops); some of them are covered by the morphological rule
 *        (plural agent nouns in -ers: "OUT-morph"), the others are not ("OUT-plain"). Recall is reported separately for IN / OUT-morph / OUT-plain.
 * Frames per organization:
 *   F1 affiliated     "My cousin works at <Org> as a clerk."                         expected: organization found
 *   F2 from-frame     "Please summarize the latest notice from <Org> for the group chat."   expected: organization found
 *   F2b subject use   "<Org> is hiring new staff this month."                        expected: organization found
 *   F3 no evidence    "Many people like <Org> a lot these days."                     expected: NEITHER organization NOR person
 *   F4 ordinary noun  "We talked about the <org in lower case> during the lecture."  expected: no finding
 *   F5 heading        "Orientation Guide for <Org> Policies and Procedures"          expected: no organization
 * Part B: 300 Title Case headings that contain the same head words with generic modifiers ("<Mod> <Head>", "... Guide", "... for Small Homes",
 *   "Understanding ...", "Chapter 5: ..."): no organization and no person allowed.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log; console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require(process.env.NORM ? path.resolve(process.env.NORM) : './normalizer.js');
require(process.env.DET ? path.resolve(process.env.DET) : './linguistic-detector.js');
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const scan = raw => Det.scan(N.normalizePath_C(raw)).filter(x => /^nlp_(?:organization|person_name)$/.test(x.patternId));
const orgs = raw => scan(raw).filter(x => x.patternId === 'nlp_organization').map(x => x.rawMatch);
const pers = raw => scan(raw).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);

const NAMES = ('Brightwater Kestrel Marlowe Ashgrove Pelham Quillon Verdant Halcyon Ironvale Larkspur Mossgate Northwind Oakhaven Pinnacle Redfern Stonehaven Thistledown Umberfield Valemont ' +
  'Wexford Yarrowby Zephyrine Amberly Bellweather Corvina Dunsford Eastmere Fallowfield Glenmoor Hollybrook Ivywood Jasperton Kingsley Lowmoor Maplecroft Nettlebed Orrington Penhallow ' +
  'Quarrydale Rosethorn Saltmarsh Tidewell Upperton Vinecrest Whitmore Yewdale Ardenne Brackenridge Calloway Dovedale Elmsworth Foxmoor Garrowby Harlowe Iverson Jessamine Kirkland ' +
  'Sunrise Copper Golden Maple Silver Crimson Meadow Willow Harvest Lantern Compass Anchor Beacon Cobalt Ember Falcon Granite Juniper Magnolia Orchard Prairie Summit Timber Velvet').split(' ');
const HEADS_IN = ('Grocers Grocery Supermarket Boutique Pharmacy Bookstore Emporium Restaurant Cafe Bakery Bistro Diner Catering Brewery Transport Logistics Freight Trucking Couriers Movers ' +
  'Clinic Dental Laboratory Diagnostics Wellness Library Tutorial Preschool Services Solutions Consulting Associates Partners Accounting Engineering Staffing Construction Builders Contractors ' +
  'Realty Properties Plumbing Electrical Roofing Repair Repairs Hardware Media Studios Productions Publishing Press Broadcasting Printing Hotel Resort Inn Lodge Travel Tours Spa Salon Fitness Trading Supply Distributors Manufacturing').split(' ');
const HEADS_OUT_PLAIN = ('Pawnshop Laundromat Tailoring Florist Furniture Daycare Dairy Creamery Foundry Distillery Mortuary Dealership Vineyard Hatchery Cannery Haulage Carwash Optician Apiary Smithy').split(' ');
const HEADS_OUT_MORPH = ('Printers Jewelers Roasters Bottlers Forwarders Surveyors Outfitters Wreckers Packers Fabricators').split(' ');
const MODS = ['', '', '', 'Home ', 'City ', 'Family ', 'Metro ', 'Prime ', 'United ', 'Pacific '];
const ORGS = [];
const mk = (kind, heads, count, seed) => {
  for (let i = 0; i < count; i++) {
    const nm = NAMES[(i * 7 + seed) % NAMES.length], h = heads[(i * 3 + seed) % heads.length], m = MODS[(i * 5 + seed) % MODS.length];
    const o = `${nm} ${m}${h}`.replace(/\s+/g, ' ');
    if (!ORGS.some(x => x.o === o)) ORGS.push({ o, kind, head: h });
  }
};
mk('IN', HEADS_IN, 230, 1); mk('OUT-plain', HEADS_OUT_PLAIN, 100, 4); mk('OUT-morph', HEADS_OUT_MORPH, 50, 9);

const F = {
  F1: o => `My cousin works at ${o} as a clerk.`,
  F2: o => `Please summarize the latest notice from ${o} for the group chat.`,
  F2b: o => `${o} is hiring new staff this month.`,
  F3: o => `Many people like ${o} a lot these days.`,
  F4: o => `We talked about the ${o.toLowerCase()} during the lecture.`,
  F5: o => `Orientation Guide for ${o} Policies and Procedures`,
};
const esc = s => s.toLowerCase().replace(/[.,]/g, '');
const found = (raw, o) => orgs(raw).some(m => { const a = esc(m), b = esc(o); return a === b || a.includes(b) || (b.includes(a) && a.split(' ').length >= 2); });

// ── Part B: headings with the same head words ──
const GMODS = ('Customer Storage Appliance Home Garden Pet Baby Laptop Phone Window Roof Student Member Patient Tenant Visitor Senior Youth Beginner Weekend Kitchen Bathroom ' +
  'Office Bicycle Garage Travel Wedding Birthday Holiday Summer Winter Budget Starter Online Local Basic Simple Advanced').split(' ');
const HW = HEADS_IN.concat(HEADS_OUT_PLAIN, HEADS_OUT_MORPH);
const HT = [m => m, m => `${m} Guide`, m => `${m} for Small Homes`, m => `Understanding ${m}`, m => `Chapter 5: ${m}`, m => `${m} Checklist for Beginners`];
const HEAD = [];
for (let i = 0; HEAD.length < 300 && i < 5000; i++) {
  const m = GMODS[(i * 7) % GMODS.length], h = HW[(i * 11 + Math.floor(i / 9)) % HW.length], t = HT[i % HT.length];
  const s = t(`${m} ${h}`);
  if (!HEAD.includes(s)) HEAD.push(s);
}

function run() {
  const kinds = {}, bad = [];
  for (const { o, kind } of ORGS) {
    const k = kinds[kind] || (kinds[kind] = { n: 0, F1: 0, F2: 0, F2b: 0, F3org: 0, F3per: 0, F4: 0, F5: 0, F5per: 0 });
    k.n++;
    if (found(F.F1(o), o)) k.F1++; if (found(F.F2(o), o)) k.F2++; if (found(F.F2b(o), o)) k.F2b++;
    const f3 = scan(F.F3(o)); if (f3.some(x => x.patternId === 'nlp_organization')) k.F3org++; if (f3.some(x => x.patternId === 'nlp_person_name')) { k.F3per++; bad.push('F3 person: ' + F.F3(o) + ' => ' + pers(F.F3(o))); }
    if (scan(F.F4(o)).length) { k.F4++; bad.push('F4: ' + F.F4(o) + ' => ' + scan(F.F4(o)).map(x => x.rawMatch)); }
    if (orgs(F.F5(o)).length) { k.F5++; bad.push('F5: ' + F.F5(o) + ' => ' + orgs(F.F5(o))); }
    if (pers(F.F5(o)).length) k.F5per++;
  }
  L(`Part A: ${ORGS.length} organizations`);
  for (const [kind, k] of Object.entries(kinds)) L(`  ${kind.padEnd(10)} n=${String(k.n).padStart(3)}  F1 found ${k.F1}  F2 found ${k.F2}  F2b found ${k.F2b}  | F3 (no evidence) org ${k.F3org} person ${k.F3per}  F4 ordinary-noun findings ${k.F4}  F5 heading org ${k.F5} person ${k.F5per}`);
  if (process.argv.includes('--misses')) {
    for (const { o, kind } of ORGS) {
      if (kind === 'IN' && !found(F.F1(o), o)) L(`   miss IN F1: ${o} => ${JSON.stringify(scan(F.F1(o)).map(x => x.patternId.slice(4, 7) + ':' + x.rawMatch))}`);
      const p = pers(F.F3(o)); if (p.length) L(`   F3 person (${kind}): ${F.F3(o)} => ${p}`);
    }
  }
  let hOrg = 0, hPer = 0; const hbad = [];
  for (const s of HEAD) { const o = orgs(s), p = pers(s); if (o.length) { hOrg++; hbad.push('ORG ' + s + ' => ' + o); } if (p.length) { hPer++; hbad.push('PER ' + s + ' => ' + p); } }
  L(`Part B: ${HEAD.length} Title Case headings with the same head words: with an organization finding ${hOrg}, with a person finding ${hPer}`);
  if (process.argv.includes('--fp')) bad.slice(0, 40).concat(hbad.slice(0, 40)).forEach(x => L('   ' + x));
  const ji = process.argv.indexOf('--json'); if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ kinds, hOrg, hPer, bad, hbad }, null, 1));
  const ps = [F.F1(ORGS[0].o), F.F2(ORGS[200].o), HEAD.join(' ')];
  ps.forEach((p, i) => { scan(p); const t0 = process.hrtime.bigint(); for (let q = 0; q < 3; q++) scan(p); L(`speed prompt ${i + 1} (${p.length} chars): ${(Number(process.hrtime.bigint() - t0) / 3e6).toFixed(0)} ms/scan`); });
}
run();
