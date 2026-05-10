#!/usr/bin/env node
// Show actual rows for a specific drift cluster.
// Usage: node show-drift-cluster.mjs <details.json> <role> <tool> <type> [signature-prefix]

import fs from 'node:fs';

const [, , detailsFile, role, tool, type, sigPrefix] = process.argv;
const all = JSON.parse(fs.readFileSync(detailsFile, 'utf8'));

function fmt(r) {
  let line = `${r.plan} ${r.frame}/${r.stick} ${r.role}/${r.tool} ${r.type}`;
  if (r.type === 'pair') {
    if (r.posDrift !== null) line += ` posDrift=${r.posDrift}`;
    else line += ` start=${r.extra.start}→${r.missing.start} end=${r.extra.end}→${r.missing.end} ` +
      `(startDrift=${r.startDrift} endDrift=${r.endDrift} lenDrift=${r.lenDrift})`;
  } else if (r.type === 'extra-only') {
    line += ` ours=${JSON.stringify(r.extra)}`;
  } else if (r.type === 'missing-only') {
    line += ` ref=${JSON.stringify(r.missing)}`;
  }
  return line;
}

const filtered = all.filter(r =>
  r.role === role && r.tool === tool && r.type === type
);

console.log(`Cluster ${role} ${tool} ${type} — ${filtered.length} records`);
for (const r of filtered.slice(0, 80)) {
  console.log(fmt(r));
}
