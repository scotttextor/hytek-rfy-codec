// Quick structure inspector — confirms the decoded RfyDocument shape
// using a local fixture (no Y: drive needed).
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decodeXml } from "../../dist/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const xml = readFileSync(join(__dirname, "..", "..", "test", "fixtures", "HG260001_LOT289_decrypted.xml"), "utf8");

const doc = decodeXml(xml);
console.log("Top-level keys:", Object.keys(doc));
console.log("doc.project keys:", Object.keys(doc.project ?? {}));
console.log("doc.project.plans length:", doc.project?.plans?.length ?? 0);

const plan0 = doc.project?.plans?.[0];
console.log("plan[0] keys:", Object.keys(plan0 ?? {}));
console.log("plan[0].frames length:", plan0?.frames?.length ?? 0);

const frame0 = plan0?.frames?.[0];
console.log("frame[0] keys:", Object.keys(frame0 ?? {}));
console.log("frame[0].sticks length:", frame0?.sticks?.length ?? 0);

const stick0 = frame0?.sticks?.[0];
console.log("stick[0] keys:", Object.keys(stick0 ?? {}));
console.log("stick[0].name:", stick0?.name);
console.log("stick[0].type:", stick0?.type);
console.log("stick[0].length:", stick0?.length);
console.log("stick[0].profile.metricLabel:", stick0?.profile?.metricLabel);
console.log("stick[0].profile.gauge:", stick0?.profile?.gauge);
console.log("stick[0].tooling length:", stick0?.tooling?.length ?? 0);
console.log("stick[0].tooling sample:", JSON.stringify(stick0?.tooling?.slice(0, 3) ?? [], null, 2));

// Tally op types across the whole document
const tally = {};
let totalSticks = 0;
let totalOps = 0;
const stickTypes = {};
const stickNamePrefixes = {};
for (const plan of doc.project?.plans ?? []) {
  for (const frame of plan.frames ?? []) {
    for (const stick of frame.sticks ?? []) {
      totalSticks++;
      stickTypes[stick.type] = (stickTypes[stick.type] || 0) + 1;
      const prefix = (stick.name ?? "").replace(/[0-9_].*$/, "");
      stickNamePrefixes[prefix] = (stickNamePrefixes[prefix] || 0) + 1;
      for (const op of stick.tooling ?? []) {
        tally[op.type] = (tally[op.type] || 0) + 1;
        totalOps++;
      }
    }
  }
}
console.log(`\nTotal: ${totalSticks} sticks, ${totalOps} ops`);
console.log("Stick types:", stickTypes);
console.log("Stick name prefixes:", stickNamePrefixes);
console.log("Op type tally:", tally);
