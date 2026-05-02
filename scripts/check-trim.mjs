// For each project, compute input nog length vs ref nog length to see if trim
// applies and how much.
import { readFileSync } from "node:fs";
import { decode } from "../dist/decode.js";

function parseXmlNogs(xmlText) {
  const out = [];
  const re = /<frame name="([^"]+)"[\s\S]*?<\/frame>/g;
  let m;
  while ((m = re.exec(xmlText)) !== null) {
    const fname = m[1], body = m[0];
    const sticks = body.matchAll(/<stick name="([^"]+)"[^>]*usage="([^"]*)"[^>]*>\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>/g);
    for (const s of sticks) {
      if (!/^N\d/.test(s[1])) continue;
      const start = s[3].trim().split(",").map(Number);
      const end = s[4].trim().split(",").map(Number);
      const dx = end[0] - start[0], dy = end[1] - start[1], dz = end[2] - start[2];
      const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
      out.push({ frame: fname, name: s[1], inputLen: len });
    }
  }
  return out;
}

function getRefNogs(rfyPath) {
  const doc = decode(readFileSync(rfyPath));
  const out = new Map();
  for (const p of doc.project.plans) for (const f of p.frames) for (const s of f.sticks) {
    if (/^N\d/.test(s.name)) out.set(`${f.name}/${s.name}`, s.length);
  }
  return out;
}

const xmlPath = process.argv[2];
const rfyPath = process.argv[3];
const xml = readFileSync(xmlPath, "utf-8");
const inputNogs = parseXmlNogs(xml);
const refLengths = getRefNogs(rfyPath);

let trimmedCount = 0, untrimmedCount = 0;
const diffs = [];
for (const n of inputNogs) {
  const refLen = refLengths.get(`${n.frame}/${n.name}`);
  if (refLen == null) continue;
  const diff = n.inputLen - refLen;
  diffs.push(diff);
  if (Math.abs(diff) < 0.01) untrimmedCount++;
  else if (Math.abs(diff - 2) < 0.1) trimmedCount++;
}
console.log(`File: ${xmlPath}`);
console.log(`  Total nogs: ${inputNogs.length} input, ${refLengths.size} ref`);
console.log(`  Untrimmed (diff ~0): ${untrimmedCount}`);
console.log(`  Trimmed by 2mm: ${trimmedCount}`);
console.log(`  Other diffs:`, [...new Set(diffs.filter(d => Math.abs(d) >= 0.01 && Math.abs(d - 2) >= 0.1).map(d => d.toFixed(3)))].slice(0, 10).join(", "));
