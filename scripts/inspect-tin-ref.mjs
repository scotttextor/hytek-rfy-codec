#!/usr/bin/env node
import fs from "node:fs";
import { decode } from "../dist/index.js";

const files = [
  "test-corpus/HG250082_FLAGSTONE_OSHC/CLADDING-GF-TIN-89.075.rfy",
  "test-corpus/HG250057_SE25_LOT_99_RATNAM_ROAD_REDBANK_PLAINS/U2-GF-TIN-70.075.rfy",
  "test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-2F-TIN-89.115.rfy",
];

function dumpStick(stick, opFilter = null) {
  const ops = stick.tooling || [];
  const counts = {};
  for (const op of ops) counts[op.type] = (counts[op.type] || 0) + 1;
  const sum = Object.entries(counts).map(([k,v])=>`${k}=${v}`).join(" ");
  console.log(`  ${stick.name} (len=${(stick.length||0).toFixed(1)}) [${sum}]`);
  if (opFilter) {
    for (const op of ops) {
      if (opFilter(op)) {
        const k = op.kind === "point"
          ? `@${op.pos?.toFixed(2)}`
          : `${op.startPos?.toFixed(2)}..${op.endPos?.toFixed(2)}`;
        const extras = Object.keys(op).filter(x=>!["kind","type","pos","startPos","endPos"].includes(x))
          .map(x=>`${x}=${JSON.stringify(op[x])}`).join(" ");
        console.log(`    ${op.type} ${k} ${extras}`);
      }
    }
  }
}

for (const f of files) {
  console.log(`\n${"=".repeat(80)}\n${f}\n${"=".repeat(80)}`);
  const r = decode(fs.readFileSync(f));
  for (const plan of r.project?.plans || []) {
    for (const frame of plan.frames || []) {
      console.log(`\n--- FRAME ${frame.name} (${(frame.sticks||[]).length} sticks) ---`);
      for (const stick of frame.sticks || []) {
        // Focus on sticks with ScrewHoles, Web@pt, InnerNotch
        const hasInteresting = (stick.tooling || []).some(o =>
          o.type === "ScrewHoles" || o.type === "Web" || o.type === "InnerNotch" || o.type === "Chamfer"
        );
        if (hasInteresting) {
          dumpStick(stick, (op) =>
            op.type === "ScrewHoles" || op.type === "Web" || op.type === "InnerNotch" ||
            op.type === "Chamfer" || op.type === "LipNotch"
          );
        } else {
          dumpStick(stick);
        }
      }
    }
  }
}
