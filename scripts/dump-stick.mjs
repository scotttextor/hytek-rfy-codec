// Dump our codec's tooling for a specific stick using the diff harness logic.
import { execSync } from "node:child_process";
const xml = process.argv[2];
const ref = process.argv[3];
const frame = process.argv[4];
const stick = process.argv[5];
const out = execSync(`node scripts/diff-vs-detailer.mjs "${xml}" "${ref}" --dump-stick "${frame}/${stick}"`, { encoding: "utf-8" });
console.log(out);
