#!/usr/bin/env node
/**
 * Quick probe: dump all ref ops for a given frame+stick from a reference RFY.
 * Usage: node scripts/probe-tb2b.mjs <reference.rfy> <frame> <stick>
 */
import fs from "node:fs";
import { decode } from "../dist/index.js";

const [, , refPath, frameName, stickName] = process.argv;
if (!refPath) {
  console.error("Usage: node scripts/probe-tb2b.mjs <reference.rfy> [frame] [stick]");
  process.exit(1);
}

const doc = decode(fs.readFileSync(refPath));

function fmt(op) {
  if (op.kind === "spanned") return `${op.type} ${op.startPos.toFixed(1)}..${op.endPos.toFixed(1)}`;
  if (op.kind === "point") return `${op.type} @${op.pos.toFixed(2)}`;
  if (op.kind === "start" || op.kind === "end") return `${op.type} @${op.kind}`;
  return JSON.stringify(op);
}

for (const plan of doc.project.plans) {
  for (const frame of plan.frames) {
    if (frameName && frame.name !== frameName) continue;
    console.log(`\n=== ${plan.name} :: ${frame.name} ===`);
    for (const stick of frame.sticks) {
      if (stickName && stick.name !== stickName) continue;
      console.log(`  ${stick.name}  L=${stick.length?.toFixed(1) ?? "?"}  ops=${stick.tooling.length}`);
      for (const op of stick.tooling) {
        console.log(`    ${fmt(op)}`);
      }
    }
  }
}
