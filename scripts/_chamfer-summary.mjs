// Show all W sticks: angle, chamfer in ref?, chamfer in ours?
import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";

const xmlPath = process.argv[2];
const jsonPath = process.argv[3];

const parser = new XMLParser({ ignoreAttributes:false, attributeNamePrefix:"@_", parseAttributeValue:true, parseTagValue:false, isArray:n=>["plan","frame","stick","vertex","tool_action"].includes(n) });
const root = parser.parse(fs.readFileSync(xmlPath, "utf8")).framecad_import;

function parseTriple(t) { const n = String(t).trim().split(/[ ,\t]+/).map(Number); return {x:n[0]||0,y:n[1]||0,z:n[2]||0}; }
function distance3D(a,b) { const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

const meta = new Map();
for (const p of root.plan ?? []) {
  for (const f of p.frame ?? []) {
    for (const s of f.stick ?? []) {
      const start = parseTriple(String(s.start ?? "0,0,0"));
      const end = parseTriple(String(s.end ?? "0,0,0"));
      const length = distance3D(start, end);
      if (length < 0.1) continue;
      const dz = Math.abs(end.z - start.z);
      const angleFromVertical = Math.acos(Math.min(dz / length, 1)) * 180 / Math.PI;
      const profile = `${s.profile?.["@_web"]}S${Math.max(s.profile?.["@_l_flange"]||0, s.profile?.["@_r_flange"]||0)}`;
      meta.set(`${f["@_name"]}/${s["@_name"]}`, { angle: angleFromVertical, length, profile });
    }
  }
}

// load diff and aggregate per angle bucket
const diff = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const buckets = {}; // angle bucket → {countW, missingChamfer, hadChamfer}
for (const fr of diff.byFrame || []) {
  for (const st of fr.sticks || []) {
    if (!/^W\d/.test(st.name)) continue;
    const m = meta.get(`${fr.name}/${st.name}`);
    if (!m) continue;
    const bucket = Math.floor(m.angle);
    if (!buckets[bucket]) buckets[bucket] = { countW: 0, missStart: 0, missEnd: 0, extraStart: 0, extraEnd: 0 };
    buckets[bucket].countW += 1;
    if ((st.missing || []).some(o => o.startsWith("Chamfer @start"))) buckets[bucket].missStart += 1;
    if ((st.missing || []).some(o => o.startsWith("Chamfer @end"))) buckets[bucket].missEnd += 1;
    if ((st.extras || []).some(o => o.startsWith("Chamfer @start"))) buckets[bucket].extraStart += 1;
    if ((st.extras || []).some(o => o.startsWith("Chamfer @end"))) buckets[bucket].extraEnd += 1;
  }
}
console.log("angle  W#  missChamferStart  missChamferEnd  extraChamferStart  extraChamferEnd");
for (const a of Object.keys(buckets).sort((x,y) => +x - +y)) {
  const b = buckets[a];
  console.log(`${a.padEnd(4)}° ${String(b.countW).padStart(3)}  missStart=${b.missStart} missEnd=${b.missEnd} extraStart=${b.extraStart} extraEnd=${b.extraEnd}`);
}

// Critical: find W sticks with NO chamfer issues AND angle < 28
console.log("\n\nW STICKS WITH NO CHAMFER ISSUE (matched correctly) - by angle bucket:");
const byBucketNoIssue = {};
for (const fr of diff.byFrame || []) {
  for (const st of fr.sticks || []) {
    if (!/^W\d/.test(st.name)) continue;
    const m = meta.get(`${fr.name}/${st.name}`);
    if (!m) continue;
    const hasMissChamfer = (st.missing || []).some(o => o.startsWith("Chamfer "));
    const hasExtraChamfer = (st.extras || []).some(o => o.startsWith("Chamfer "));
    if (hasMissChamfer || hasExtraChamfer) continue;
    const bucket = Math.floor(m.angle);
    byBucketNoIssue[bucket] = (byBucketNoIssue[bucket] || 0) + 1;
  }
}
for (const a of Object.keys(byBucketNoIssue).sort((x,y) => +x - +y)) {
  console.log(`  ${a}°: ${byBucketNoIssue[a]} W sticks chamfer-clean`);
}
