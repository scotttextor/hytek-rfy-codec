#!/usr/bin/env node
// Analyzer for LipNotch + Swage drift on LBW plans.
// Reads diff JSON, finds (stick, tool) pairs where ours has extras AND ref has missing,
// computes drift signatures.

import fs from 'node:fs';

const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('usage: analyze-lbw-drift.mjs <diff.json> [more.json...]');
  process.exit(1);
}

const TARGET_TOOLS = new Set(['LipNotch', 'Swage']);

// Stick role classifier — same heuristic the codec uses.
function stickRole(name) {
  // Strip trailing digits to get role prefix (T1 -> T, Kb1 -> Kb, S12 -> S, etc.)
  const m = name.match(/^([A-Za-z]+)\d*$/);
  return m ? m[1] : name;
}

function parseOp(opStr) {
  // "LipNotch 1116.1..1271.9" or "InnerDimple @326.5" or "Swage 1252.0..1423.0"
  const span = opStr.match(/^(\w+)\s+([\d.]+)\.\.([\d.]+)$/);
  if (span) return { tool: span[1], start: +span[2], end: +span[3], len: +span[3] - +span[2] };
  const point = opStr.match(/^(\w+)\s+@([\d.]+)$/);
  if (point) return { tool: point[1], pos: +point[2] };
  return null;
}

function pairExtraToMissing(extras, missing, tool) {
  // For a given tool, pair each extra to closest missing by position similarity.
  // Returns drift records.
  const opsExtra = extras.map(parseOp).filter(o => o && o.tool === tool);
  const opsMissing = missing.map(parseOp).filter(o => o && o.tool === tool);
  const used = new Set();
  const records = [];

  for (const e of opsExtra) {
    let best = -1, bestDist = Infinity;
    for (let i = 0; i < opsMissing.length; i++) {
      if (used.has(i)) continue;
      const m = opsMissing[i];
      // distance: for span ops, use start delta; for point ops, use pos delta
      let d;
      if ('start' in e && 'start' in m) {
        d = Math.abs(e.start - m.start) + Math.abs(e.end - m.end) * 0.5;
      } else if ('pos' in e && 'pos' in m) {
        d = Math.abs(e.pos - m.pos);
      } else continue;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    if (best >= 0 && bestDist < 50) {
      used.add(best);
      const m = opsMissing[best];
      records.push({
        type: 'pair',
        tool,
        extra: e,
        missing: m,
        startDrift: 'start' in e ? +(e.start - m.start).toFixed(2) : null,
        endDrift: 'end' in e ? +(e.end - m.end).toFixed(2) : null,
        lenDrift: 'len' in e ? +(e.len - m.len).toFixed(2) : null,
        posDrift: 'pos' in e ? +(e.pos - m.pos).toFixed(2) : null,
      });
    } else {
      records.push({ type: 'extra-only', tool, extra: e });
    }
  }
  for (let i = 0; i < opsMissing.length; i++) {
    if (used.has(i)) continue;
    records.push({ type: 'missing-only', tool, missing: opsMissing[i] });
  }
  return records;
}

const allRecords = [];
const byPlan = {};

for (const p of inputs) {
  const data = JSON.parse(fs.readFileSync(p, 'utf8'));
  const planLabel = p.split(/[/\\]/).pop().replace('.json', '');
  byPlan[planLabel] = { paired: 0, extraOnly: 0, missingOnly: 0 };
  for (const frame of data.byFrame || []) {
    for (const stick of frame.sticks || []) {
      const role = stickRole(stick.name);
      for (const tool of TARGET_TOOLS) {
        const recs = pairExtraToMissing(stick.extras || [], stick.missing || [], tool);
        for (const r of recs) {
          r.frame = frame.name;
          r.stick = stick.name;
          r.role = role;
          r.plan = planLabel;
          allRecords.push(r);
          if (r.type === 'pair') byPlan[planLabel].paired++;
          else if (r.type === 'extra-only') byPlan[planLabel].extraOnly++;
          else byPlan[planLabel].missingOnly++;
        }
      }
    }
  }
}

console.log('\n=== Per-plan summary ===');
for (const [plan, s] of Object.entries(byPlan)) {
  console.log(`  ${plan}: paired=${s.paired}  extra-only=${s.extraOnly}  missing-only=${s.missingOnly}`);
}

// === Drift histograms by (role, tool, type) ===
function bucket(role, tool, kind, key) {
  return `${role}\t${tool}\t${kind}\t${key}`;
}

function summarize(records, label) {
  console.log(`\n=== ${label} ===`);
  const groups = new Map();
  for (const r of records) {
    const role = r.role;
    const tool = r.tool;
    if (r.type === 'pair') {
      const sd = Math.round(r.startDrift * 10) / 10;
      const ed = r.endDrift !== null ? Math.round(r.endDrift * 10) / 10 : null;
      const ld = r.lenDrift !== null ? Math.round(r.lenDrift * 10) / 10 : null;
      const pd = r.posDrift !== null ? Math.round(r.posDrift * 10) / 10 : null;
      let sig;
      if (pd !== null) sig = `pos±${pd}`;
      else sig = `start±${sd} end±${ed} len±${ld}`;
      const k = bucket(role, tool, 'pair', sig);
      groups.set(k, (groups.get(k) || 0) + 1);
    } else if (r.type === 'extra-only') {
      const k = bucket(role, tool, 'extra-only', '');
      groups.set(k, (groups.get(k) || 0) + 1);
    } else {
      const k = bucket(role, tool, 'missing-only', '');
      groups.set(k, (groups.get(k) || 0) + 1);
    }
  }
  // Sort by frequency, top 40
  const sorted = [...groups.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  count\trole\ttool\tkind\tsignature');
  for (const [k, c] of sorted.slice(0, 60)) {
    console.log(`  ${c}\t${k}`);
  }
}

summarize(allRecords, 'TOP DRIFT SIGNATURES (by role × tool × signature)');

// Coarser: just role × tool aggregates
console.log('\n=== Aggregates by role × tool ===');
const agg = new Map();
for (const r of allRecords) {
  const k = `${r.role}\t${r.tool}\t${r.type}`;
  agg.set(k, (agg.get(k) || 0) + 1);
}
const aggSorted = [...agg.entries()].sort((a, b) => b[1] - a[1]);
console.log('  count\trole\ttool\ttype');
for (const [k, c] of aggSorted.slice(0, 30)) console.log(`  ${c}\t${k}`);

// Dump the largest drift bucket to a side file for deeper inspection
const detailFile = '/tmp/lbw-analysis/drift-details.json';
fs.mkdirSync('/tmp/lbw-analysis', { recursive: true });
fs.writeFileSync(detailFile, JSON.stringify(allRecords, null, 2));
console.log(`\nFull records: ${detailFile}`);
