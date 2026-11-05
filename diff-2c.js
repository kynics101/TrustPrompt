'use strict';
const fs = require('fs');

function loadRows(filename) {
  const d = JSON.parse(fs.readFileSync(filename, 'utf8'));
  // harness wraps in {rows:[...]}, baseline may be plain array
  return Array.isArray(d) ? d : d.rows;
}

function getOrgs(row) {
  // harness uses actualNlpFindings; baseline might use findings
  const src = row.actualNlpFindings || row.findings || [];
  return src.filter(f => f.patternId === 'nlp_organization').map(f => f.rawMatch);
}

function getShouldFlag(row) {
  return row.shouldFlag || row.expected_flag;
}

const base = loadRows('baseline.json');
const curr = loadRows('after-group2c.json');

const baseMap = new Map(base.map(r => [r.rowId || r.id, r]));

let newPass = [], newFail = [], orgDeltaTotal = 0;
const removedRows = [];

for (const row of curr) {
  const rowId = row.rowId || row.id;
  const bRow = baseMap.get(rowId);
  if (!bRow) continue;

  const bOrgs = getOrgs(bRow);
  const cOrgs = getOrgs(row);
  const shouldFlag = getShouldFlag(row) || getShouldFlag(bRow);

  const bSet = new Set(bOrgs.map(x => x.toLowerCase()));
  const cSet = new Set(cOrgs.map(x => x.toLowerCase()));

  const added   = cOrgs.filter(x => !bSet.has(x.toLowerCase()));
  const removed = bOrgs.filter(x => !cSet.has(x.toLowerCase()));

  orgDeltaTotal += cOrgs.length - bOrgs.length;

  if (added.length === 0 && removed.length === 0) continue;

  const info = { id: rowId, shouldFlag, added, removed };
  if (shouldFlag === 'yes' && added.length > 0) newPass.push(info);
  if (shouldFlag === 'no'  && added.length > 0) newFail.push(info);
  if (removed.length > 0) removedRows.push(info);
}

console.log('=== Newly passing YES-rows (gained nlp_organization) ===');
newPass.forEach(r => {
  const addStr = r.added.map(s => `"${s}"`).join(', ');
  const remStr = r.removed.length ? `  -[${r.removed.map(s=>`"${s}"`).join(', ')}]` : '';
  console.log(`  ${r.id}: +[${addStr}]${remStr}`);
});
console.log(`  Count: ${newPass.length}`);

console.log('');
console.log('=== Regressions on NO-rows (gained spurious nlp_organization) ===');
newFail.forEach(r => {
  const addStr = r.added.map(s => `"${s}"`).join(', ');
  console.log(`  ${r.id}: +[${addStr}]`);
});
console.log(`  Count: ${newFail.length}`);

console.log('');
console.log('=== Rows where an org finding was REMOVED ===');
removedRows.filter(r => r.removed.length > 0).forEach(r => {
  const remStr = r.removed.map(s => `"${s}"`).join(', ');
  console.log(`  ${r.id} (${r.shouldFlag}): -[${remStr}]`);
});

console.log('');
console.log(`Net delta in nlp_organization count vs baseline: ${orgDeltaTotal > 0 ? '+' : ''}${orgDeltaTotal}`);
