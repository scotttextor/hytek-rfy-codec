// Specifically probe HG260001 input XML for Service spacing pattern
import * as fs from 'node:fs';
import * as path from 'node:path';

const xmlPath = 'C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260001/HG260001-LBW-INPUT.xml';
const xml = fs.readFileSync(xmlPath, 'utf8');

const frames = [...xml.matchAll(/<frame name="([^"]+)"[^>]*>([\s\S]*?)<\/frame>/g)];
console.log(`HG260001 input XML has ${frames.length} frames`);

let frameCount = 0;
for (const [, fname, body] of frames) {
  // Find T1 stick
  const t1m = body.match(/<stick name="T1" type="Plate"[^>]*>\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>/);
  if (!t1m) continue;
  const [sx, sy, sz] = t1m[1].split(',').map(Number);
  const [ex, ey, ez] = t1m[2].split(',').map(Number);
  const T1z = sz;

  // Find vertical services touching top
  const svcRe = /<tool_action name="Service">\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>\s*<\/tool_action>/g;
  const services = [];
  let s;
  while ((s = svcRe.exec(body)) !== null) {
    const [vsx, vsy, vsz] = s[1].split(',').map(Number);
    const [vex, vey, vez] = s[2].split(',').map(Number);
    services.push({ sx: vsx, sz: vsz, ex: vex, ez: vez });
  }
  const vertSvc = services.filter(v => Math.abs(v.sx - v.ex) < 0.01);
  const topReach = vertSvc.filter(v => Math.abs(Math.max(v.sz, v.ez) - T1z) < 50);

  if (topReach.length === 0) continue;
  frameCount++;
  if (frameCount > 10) break;

  const dist = topReach.map(v => Math.abs(sx - v.sx)).sort((a,b)=>a-b);
  // Compute gaps
  const gaps = [];
  for (let i = 1; i < dist.length; i++) gaps.push((dist[i]-dist[i-1]).toFixed(2));
  console.log(`  ${fname}: T1 x=${sx}->${ex}  topServices=${topReach.length}`);
  console.log(`    distances from T1 start: [${dist.map(d=>d.toFixed(2)).join(', ')}]`);
  console.log(`    gaps: [${gaps.join(', ')}]`);
}
