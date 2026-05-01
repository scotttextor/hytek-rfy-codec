// Copy every pair from all-pairs.json into test-corpus/<project>/
import { readFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const allPairs = JSON.parse(readFileSync("test-corpus/all-pairs.json", "utf-8"));
const projects = new Set(allPairs.map(p => p.project));
for (const p of projects) mkdirSync(join("test-corpus", sanitize(p)), { recursive: true });

function sanitize(s) { return s.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80); }

let n = 0, skipped = 0;
for (const p of allPairs) {
  const safe = p.plan.replace(/[^A-Za-z0-9._-]/g, "_");
  const dir = join("test-corpus", sanitize(p.project));
  const xmlDest = join(dir, `${safe}.xml`);
  const rfyDest = join(dir, `${safe}.rfy`);
  if (existsSync(xmlDest) && existsSync(rfyDest)) { skipped++; continue; }
  try {
    copyFileSync(p.xml, xmlDest);
    copyFileSync(p.rfy, rfyDest);
    n++;
  } catch (e) {
    console.error(`Skip ${p.plan}: ${e.message}`);
  }
}
console.log(`Copied ${n}, skipped ${skipped} (already cached)`);
