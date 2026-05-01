// Copy XML+RFY pairs from Y: to local cache.
import { readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const pairsJson = process.argv[2] ?? "scripts/pairs.json";
const outDir = process.argv[3] ?? "test-corpus/HG260012";
mkdirSync(outDir, { recursive: true });

const text = readFileSync(pairsJson, "utf-8").replace(/^﻿/, "");
const pairs = JSON.parse(text);

let n = 0;
for (const p of pairs) {
  const safe = p.plan.replace(/[^A-Za-z0-9._-]/g, "_");
  try {
    copyFileSync(p.xml, join(outDir, `${safe}.xml`));
    copyFileSync(p.rfy, join(outDir, `${safe}.rfy`));
    n++;
  } catch (e) {
    console.error(`Failed for ${p.plan}: ${e.message}`);
  }
}
console.log(`Copied ${n}/${pairs.length} pairs to ${outDir}`);
