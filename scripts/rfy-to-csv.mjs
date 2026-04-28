// Quick RFY → CSV converter
// Usage: node scripts/rfy-to-csv.mjs <path-to-rfy>
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { decode } from "../dist/decode.js";
import { documentToCsvs } from "../dist/csv.js";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node rfy-to-csv.mjs <path-to-rfy>");
  process.exit(1);
}

const rfyBytes = readFileSync(inputPath);
const doc = decode(rfyBytes);
const csvs = documentToCsvs(doc);

const outDir = dirname(inputPath);
const wrote = [];
for (const [name, content] of Object.entries(csvs)) {
  const outPath = join(outDir, name);
  writeFileSync(outPath, content);
  wrote.push(outPath);
}

console.log(`Decoded ${basename(inputPath)} → ${wrote.length} CSV file(s):`);
for (const p of wrote) console.log(`  ${p}`);
