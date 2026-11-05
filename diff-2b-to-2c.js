'use strict';
const fs = require('fs');

function loadRows(filename) {
  const d = JSON.parse(fs.readFileSync(filename, 'utf8'));
  return Array.isArray(d) ? d : d.rows;
}

function getOrgs(row) {
  const src = row.actualNlpFindings || row.findings || [];
  return src.filter(f => f.patternId === 'nlp_organization').map(f => f.rawMatch);
}

function getShouldFlag(row) {
  return row.shouldFlag || row.expected_flag;
}

const prev = loadRows('after-group2b.json');
const curr = loadRows('after-group2c.json');

const prevMap = new Map(prev.map(r => [r.rowId || r.id, r]));

let newPass = [], newFail = [], orgDeltaTotal = 0;
const removedRows = [];

for (const row of curr) {
  const rowId = row.rowId || row.id;
  const pRow = prevMap.get(rowId);
  if (!pRow) continue;

  const pOrgs = getOrgs(pRow);
  const cOrgs = getOrgs(row);
  const shouldFlag = getShouldFlag(row) || getShouldFlag(pRow);

  const pSet = new Set(pOrgs.map(x => x.toLowerCase()));
  const cSet = new Set(cOrgs.map(x => x.toLowerCase()));

  const added   = cOrgs.filter(x => !pSet.has(x.toLowerCase()));
  const removed = pOrgs.filter(x => !cSet.has(x.toLowerCase()));

  orgDeltaTotal += cOrgs.length - pOrgs.length;

  if (added.length === 0 && removed.length === 0) continue;

  const info = { id: rowId, shouldFlag, added, removed };
  if (shouldFlag === 'yes' && added.length > 0) newPass.push(info);
  if (shouldFlag === 'no'  && added.length > 0) newFail.push(info);
  if (removed.length > 0) removedRows.push(info);
}

console.log('=== Newly passing YES-rows (new nlp_organization vs group 2b) ===');
newPass.forEach(r => {
  const addStr = r.added.map(s => `"${s}"`).join(', ');
  const remStr = r.removed.length ? `  removed: [${r.removed.map(s=>`"${s}"`).join(', ')}]` : '';
  console.log(`  ${r.id}: +[${addStr}]${remStr}`);
});
console.log(`  Count: ${newPass.length}`);

console.log('');
console.log('=== NEW regressions on NO-rows (new spurious org vs group 2b) ===');
newFail.forEach(r => {
  const addStr = r.added.map(s => `"${s}"`).join(', ');
  console.log(`  ${r.id}: +[${addStr}]`);
});
console.log(`  Count: ${newFail.length}`);

console.log('');
console.log('=== Rows where an org finding was REMOVED vs group 2b ===');
removedRows.filter(r => r.removed.length > 0).forEach(r => {
  const remStr = r.removed.map(s => `"${s}"`).join(', ');
  console.log(`  ${r.id} (${r.shouldFlag}): -[${remStr}]`);
});
const removedCount = removedRows.filter(r => r.removed.length > 0).length;
console.log(`  Count: ${removedCount}`);

console.log('');
console.log(`Net delta in nlp_organization count vs group 2b: ${orgDeltaTotal > 0 ? '+' : ''}${orgDeltaTotal}`);
