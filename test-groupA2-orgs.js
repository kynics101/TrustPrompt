#!/usr/bin/env node
/**
 * test-groupA2-orgs.js — Cause A head-list expansion: NEW held-out evaluation (all entities invented; no row of any earlier test set is used).
 *
 *   node test-groupA2-orgs.js [--json out.json] [--fp] [--misses]       DET=<detector copy> runs another build
 *
 * The head list is read from the detector under test (CA_HEADS_BY_CATEGORY). The 10 categories of the first Cause A step are OLD, the
 * categories added by industry section are NEW.
 * Part A organizations = <invented name> [<modifier>] <head>:
 *   IN-new     one organization per head of the NEW categories (every new head is exercised; names and modifiers cycle)
 *   OUT-plain  business nouns that are NOT in the list (chosen from other trades; filtered programmatically against the list under test)
 *   OUT-morph  plural agent nouns in -ers that are not listed explicitly (covered only by the morphological rule)
 *   name kinds: "inv" = invented name word, "sur" = a real surname used as the name part (a person finding may compete)
 * Frames: F1 affiliated, F2 from-frame, F2b "<Org> is hiring", F3 no evidence (neither org nor person), F4 ordinary lower-case noun, F5 heading.
 * Part B: 300 Title Case headings + 300 ordinary-noun sentences (lower case and Title Case) that use the NEW heads with generic modifiers:
 *   no organization and no person finding allowed.
 */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
global.window = {}; global.globalThis = global; global.document = { title: 't' };
const L = console.log; console.log = console.debug = console.warn = () => {};
require('./terms-organizations.js'); require('./terms-occupations.js'); require('./terms-names.js');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ph-address-db.js'), 'utf8') + ';globalThis.PH_ADDRESS_DB=PH_ADDRESS_DB;');
global.window.nlp = require('./lib/compromise.min.js');
require(process.env.NORM ? path.resolve(process.env.NORM) : './normalizer.js');
const DETFILE = process.env.DET ? path.resolve(process.env.DET) : path.join(__dirname, 'linguistic-detector.js');
require(DETFILE);
const Det = globalThis.TrustLinguisticDetector, N = globalThis.TrustNormalizer;
const scan = raw => Det.scan(N.normalizePath_C(raw)).filter(x => /^nlp_(?:organization|person_name)$/.test(x.patternId));
const orgs = raw => scan(raw).filter(x => x.patternId === 'nlp_organization').map(x => x.rawMatch);
const pers = raw => scan(raw).filter(x => x.patternId === 'nlp_person_name').map(x => x.rawMatch);

// ── head list under test ──
const src = fs.readFileSync(process.env.LISTSRC ? path.resolve(process.env.LISTSRC) : DETFILE, 'utf8');   // LISTSRC = detector whose list defines the test set (use it to run an older build on the same set)
const mm = src.match(/const CA_HEADS_BY_CATEGORY = (\{[\s\S]*?\n  \});/);
const CATS = mm ? new Function('return ' + mm[1])() : {};
const OLD_CATS = ['retail', 'food', 'transport', 'health', 'education', 'professional', 'construction', 'media', 'hospitality', 'trade'];
const words = c => (CATS[c] || '').split(' ').filter(Boolean);
const OLDW = new Set(OLD_CATS.flatMap(words)), ALLW = new Set(Object.keys(CATS).flatMap(words));
const NEWW = [...ALLW].filter(w => !OLDW.has(w));

const cap = s => s[0].toUpperCase() + s.slice(1);
const NAMES_INV = ('Alderwick Briarcliff Cedarholm Dunmore Everleigh Foxglove Greystone Hartwell Ingleby Juniperhill Kestrelcroft Lindenfell Marrowby Nightingdale Oakmere Pembridge Quillfeather Ravensworth ' +
  'Sablewood Tarrington Ulverston Vexford Wrenfield Yarnhollow Ambergate Birchfell Coldharbor Drayton-Moor Ellisfield Fernhollow Gorsedale Hawksmoor Ironwood Kelsworth Lavenham Moorcroft Newbolt ' +
  'Overdale Primrose Rushmere Silverbrook Thornfield Underhill Valewood Westbrook Ashcombe Bramblewood Copperfield Dellwood Elderglen Falconridge Glenwick Havenport Isleworth Jadestone Kinloch ' +
  'Lakemont Mistral Northcote Orchardson Pinewick Redwater Skylark Tamarind Urbanova Verano Willowmere Zenith Auberon Belmoral Castellane Drovers Eskimoor Fenwick Galbraith Halloran Inverlee ' +
  'Jorvik Kensley Lorimer Marden Norwell Osmund Pendleton Quenby Rothwell Selwyn Tavistock Uxbridge Varley Wendover Yelverton Zouche').split(' ');
const NAMES_SUR = ('Mendoza Villareal Okonkwo Hashemi Kowalski Fontaine Petrov Sandoval Nakamura Lindqvist Moreau Abernathy Delacroix Navarrete Rosales Tanaka Dominguez Castellano Aguilar Bernardo ' +
  'Ferrer Gutierrez Hernandez Ibrahim Jimenez Kaur Lopez Medina Nunez Ortega Pacheco Quiroz Ramos Salazar Torres Uy Valdez Wong Yap Zamora').split(' ');
const MODS = ['', '', '', 'Home ', 'City ', 'Family ', 'Metro ', 'Prime ', 'United ', 'Pacific ', 'Royal ', 'Central '];
const OUT_PLAIN_CAND = ('Pottery Cannery Smithy Apiary Vineyard Cidery Bindery Glassworks Stockyard Feedlot Chandlery Cooperage Taverna Creperie Chocolaterie Haberdashery Millinery Perfumery Apothecary ' +
  'Dispensary Orthotics Prosthetics Podiatry Chiropractic Acupuncture Audiology Ophthalmology Midwifery Gunsmith Saddlery Marina Boatyard Drydock Aerospace Avionics Robotics Nanotech Biotech ' +
  'Genomics Semiconductors Photonics Optics Acoustics Auctions Antiques Collectibles Souvenirs Novelties Linens Draperies Rugs Carpets Tiles Mattresses Hammocks Pavilion Brasserie Trattoria Ristorante ' +
  'Cantina Taqueria Gelateria Pianos Violins Guitars Bicycles Motorcycles Scooters Tractors Trailers Boats Yachts Canoes Kayaks Tents Uniforms Embroidery Weaving Knitwear Leatherworks Saddles ' +
  'Pharmaceutics Hydroponics Aquarium Taxidermy Candlemaking Papermaking Ironmongery Fishmongery Greengrocery Butchery Bookbinding Printworks Sawyers? Wineries Orchardists Glassmaking Toolmaking ' +
  'Bakehouse Alehouse Teashop Chophouse Icehouse Smokery Rendering Hatcheries Abattoir Slaughterhouse Tannin Millworks Ropeworks Brickworks Ironworks Shipwrights Boatbuilding Gunmaking Clockmaking ' +
  'Watchmaking Goldsmithing Silversmiths Coppersmiths Blacksmiths Wheelwrights Locksmithing Cobblery Cordwainery Haulers Drovers').replace(/\?/g, '').split(' ');
const OUT_PLAIN = [...new Set(OUT_PLAIN_CAND)].filter(w => !ALLW.has(w.toLowerCase()) && !/^[A-Za-z]{4,}ers$/.test(w));
const OUT_MORPH_CAND = ('Weavers Potters Brewers Auctioneers Fishmongers Pawnbrokers Bookbinders Glaziers Chandlers Ranchers Vintners Distillers Smelters Tanners Millers Printers Shippers Loaders Hoisters ' +
  'Cutters Welders Stitchers Dyers Spinners Knitters Sellers Traders').split(' ');
const OUT_MORPH = OUT_MORPH_CAND.filter(w => !ALLW.has(w.toLowerCase()));

const ORGS = []; const seen = new Set();
const mk = (kind, heads, count, seed) => {
  for (let i = 0; i < count; i++) {
    const sur = (i % 4 === 3), pool = sur ? NAMES_SUR : NAMES_INV;
    const nm = pool[(i * 7 + seed) % pool.length], h = heads[(kind === 'IN-new' ? i : (i * 3 + seed)) % heads.length], m = MODS[(i * 5 + seed) % MODS.length];
    const o = `${nm} ${m}${cap(h)}`.replace(/\s+/g, ' ');
    if (!seen.has(o)) { seen.add(o); ORGS.push({ o, kind, nk: sur ? 'sur' : 'inv', head: h }); }
  }
};
mk('IN-new', NEWW, NEWW.length, 2); mk('OUT-plain', OUT_PLAIN, Math.max(300, OUT_PLAIN.length * 3), 5); mk('OUT-morph', OUT_MORPH, OUT_MORPH.length * 3, 11);

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

// ── Part B ──
const GMODS = ('Customer Storage Appliance Home Garden Pet Baby Laptop Phone Window Roof Student Member Patient Tenant Visitor Senior Youth Beginner Weekend Kitchen Bathroom ' +
  'Office Bicycle Garage Wedding Birthday Holiday Summer Winter Budget Starter Online Local Basic Simple Advanced Everyday Seasonal Weekly Modern Classic Healthy Easy Quick').split(' ');
const HT = [m => m, m => `${m} Guide`, m => `${m} for Small Homes`, m => `Understanding ${m}`, m => `Chapter 5: ${m}`, m => `${m} Checklist for Beginners`];
const HEAD = [];
for (let i = 0; HEAD.length < 300 && i < 8000; i++) {
  const m = GMODS[(i * 7) % GMODS.length], h = cap(NEWW[(i * 11 + Math.floor(i / 9)) % NEWW.length]), t = HT[i % HT.length];
  const s = t(`${m} ${h}`); if (!HEAD.includes(s)) HEAD.push(s);
}
const ST = [(m, h) => `We read about ${m.toLowerCase()} ${h.toLowerCase()} in class today.`, (m, h) => `The ${m.toLowerCase()} ${h.toLowerCase()} section of the library was closed.`,
  (m, h) => `Our teacher explained how ${m.toLowerCase()} ${h.toLowerCase()} work in a small town.`, (m, h) => `Today's lesson covers ${m} ${h} and their history.`];
const SENT = [];
for (let i = 0; SENT.length < 300 && i < 8000; i++) {
  const m = GMODS[(i * 5 + 3) % GMODS.length], h = cap(NEWW[(i * 13 + Math.floor(i / 7)) % NEWW.length]), s = ST[i % ST.length](m, h); if (!SENT.includes(s)) SENT.push(s);
}

function run() {
  const kinds = {}, bad = [];
  const add = (k, key) => { k[key] = (k[key] || 0) + 1; };
  for (const { o, kind, nk } of ORGS) {
    const k = kinds[kind] || (kinds[kind] = { n: 0, nInv: 0, F1: 0, F1inv: 0, F1sur: 0, F2: 0, F2b: 0, F3org: 0, F3per: 0, F4: 0, F5: 0, F5per: 0 });
    k.n++; if (nk === 'inv') k.nInv++;
    const f1 = found(F.F1(o), o); if (f1) { k.F1++; add(k, nk === 'inv' ? 'F1inv' : 'F1sur'); }
    if (found(F.F2(o), o)) k.F2++; if (found(F.F2b(o), o)) k.F2b++;
    const f3 = scan(F.F3(o)); if (f3.some(x => x.patternId === 'nlp_organization')) k.F3org++; if (f3.some(x => x.patternId === 'nlp_person_name')) { k.F3per++; bad.push('F3 person: ' + F.F3(o) + ' => ' + pers(F.F3(o))); }
    if (scan(F.F4(o)).length) { k.F4++; bad.push('F4: ' + F.F4(o) + ' => ' + scan(F.F4(o)).map(x => x.rawMatch)); }
    if (orgs(F.F5(o)).length) { k.F5++; bad.push('F5: ' + F.F5(o) + ' => ' + orgs(F.F5(o))); }
    if (pers(F.F5(o)).length) k.F5per++;
  }
  L(`heads: ${ALLW.size} total (${OLDW.size} old, ${NEWW.length} new); OUT-plain heads ${OUT_PLAIN.length}, OUT-morph heads ${OUT_MORPH.length}`);
  L(`Part A: ${ORGS.length} organizations (F1 inv = invented name part, sur = surname part)`);
  for (const [kind, k] of Object.entries(kinds)) L(`  ${kind.padEnd(10)} n=${String(k.n).padStart(3)} (inv ${k.nInv})  F1 found ${k.F1} (inv ${k.F1inv}/${k.nInv}, sur ${k.F1sur}/${k.n - k.nInv})  F2 ${k.F2}  F2b ${k.F2b}  | F3 (no evidence) org ${k.F3org} person ${k.F3per}  F4 ordinary-noun ${k.F4}  F5 heading org ${k.F5} person ${k.F5per}`);
  if (process.argv.includes('--misses')) for (const { o, kind, nk } of ORGS) if (kind === 'IN-new' && nk === 'inv' && !found(F.F1(o), o)) L(`   miss IN-new inv F1: ${o} => ${JSON.stringify(scan(F.F1(o)).map(x => x.patternId.slice(4, 7) + ':' + x.rawMatch))}`);
  let hOrg = 0, hPer = 0, sOrg = 0, sPer = 0; const hbad = [];
  for (const s of HEAD) { const o = orgs(s), p = pers(s); if (o.length) { hOrg++; hbad.push('HEAD ORG ' + s + ' => ' + o); } if (p.length) { hPer++; hbad.push('HEAD PER ' + s + ' => ' + p); } }
  for (const s of SENT) { const o = orgs(s), p = pers(s); if (o.length) { sOrg++; hbad.push('SENT ORG ' + s + ' => ' + o); } if (p.length) { sPer++; hbad.push('SENT PER ' + s + ' => ' + p); } }
  L(`Part B: ${HEAD.length} Title Case headings: org ${hOrg}, person ${hPer} | ${SENT.length} ordinary-noun sentences: org ${sOrg}, person ${sPer}`);
  if (process.argv.includes('--fp')) bad.slice(0, 40).concat(hbad.slice(0, 60)).forEach(x => L('   ' + x));
  const ji = process.argv.indexOf('--json'); if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ kinds, hOrg, hPer, sOrg, sPer, bad, hbad }, null, 1));
  const ps = [F.F1(ORGS[0].o), F.F2(ORGS[200].o), HEAD.join(' ')];
  ps.forEach((p, i) => { scan(p); const t0 = process.hrtime.bigint(); for (let q = 0; q < 3; q++) scan(p); L(`speed prompt ${i + 1} (${p.length} chars): ${(Number(process.hrtime.bigint() - t0) / 3e6).toFixed(0)} ms/scan`); });
}
run();
