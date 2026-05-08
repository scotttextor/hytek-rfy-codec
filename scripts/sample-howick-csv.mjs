// Generate a sample Howick CSV from a cached RFY in the test corpus.
// Usage: node scripts/sample-howick-csv.mjs [rfy-path] [out-path]
import { readFileSync, writeFileSync } from "node:fs";
import { decode } from "../dist/decode.js";
import { generateHowickCsv } from "../dist/howick-csv.js";

const rfyPath =
  process.argv[2] ??
  "test-corpus/HG260044/HG260044-GF-NLBW-89.075.rfy";
const outPath = process.argv[3] ?? "examples/sample-output.csv";

const doc = decode(readFileSync(rfyPath));

// Trim to first plan + first 3 frames so the sample stays human-readable.
const trimmed = {
  ...doc,
  project: {
    ...doc.project,
    plans: doc.project.plans.slice(0, 1).map(p => ({
      ...p,
      frames: p.frames.slice(0, 3),
    })),
  },
};

const csv = generateHowickCsv(trimmed, { variant: "v2" });
writeFileSync(outPath, csv);

console.log(`Wrote ${outPath}`);
console.log(`  source     : ${rfyPath}`);
console.log(`  project    : ${doc.project.name}`);
console.log(`  plans      : ${doc.project.plans.length} (sampled 1)`);
console.log(`  total rows : ${csv.split("\n").length - 1}`);
