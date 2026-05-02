// CSV → RFY synthesizer driver.
// Uses the existing synthesizeRfyFromCsv from the codec.
//
// Usage:
//   node scripts/csv-to-rfy.mjs input.csv [--out output.rfy] [--project NAME] [--client NAME] [--date YYYY-MM-DD]
import { readFileSync, writeFileSync } from "node:fs";
import { synthesizeRfyFromCsv } from "../dist/synthesize.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node csv-to-rfy.mjs input.csv [--out output.rfy] [--project NAME] [--client NAME] [--date YYYY-MM-DD]");
  process.exit(1);
}

const csvPath = args[0];
let outPath = csvPath.replace(/\.csv$/i, ".rfy");
const opts = {};
for (let i = 1; i < args.length; i += 2) {
  const flag = args[i];
  const val = args[i+1];
  if (flag === "--out") outPath = val;
  else if (flag === "--project") opts.projectName = val;
  else if (flag === "--client") opts.client = val;
  else if (flag === "--date") opts.date = val;
  else if (flag === "--jobnum") opts.jobNum = val;
}

const csv = readFileSync(csvPath, "utf-8");
console.error(`Reading ${csvPath} (${csv.length} bytes)`);

try {
  const result = synthesizeRfyFromCsv(csv, opts);
  writeFileSync(outPath, result.rfy);
  console.error(`Wrote ${outPath} (${result.rfy.length} bytes)`);
  console.error(`  Plans:  ${result.planCount}`);
  console.error(`  Frames: ${result.frameCount}`);
  console.error(`  Sticks: ${result.stickCount}`);
} catch (e) {
  console.error(`Synthesis failed: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
}
