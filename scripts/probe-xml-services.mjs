// Probe XML <tool_action name="Service"> markers and compare to decoded IS positions
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const mod = await import(pathToFileURL(path.join(root, 'dist', 'index.js')).href);

const targetFile = process.argv[2] || 'test-corpus/HG260012_23_SPRINGWOOD_ST_TOWNHOUSES/TH01-1F-LBW-89.075';

const xmlPath = path.join(root, targetFile + '.xml');
const rfyPath = path.join(root, targetFile + '.rfy');

const xml = fs.readFileSync(xmlPath, 'utf8');

// Cheap regex parse: split into <frame ...>...</frame> blocks
const frames = [...xml.matchAll(/<frame name="([^"]+)"[^>]*>([\s\S]*?)<\/frame>/g)];
console.log(`XML has ${frames.length} frames`);

const r = await mod.decode(fs.readFileSync(rfyPath));
const decodedFrames = new Map();
for (const plan of r.project.plans) for (const f of plan.frames) decodedFrames.set(f.name, f);

for (const [, fname, body] of frames) {
  const dec = decodedFrames.get(fname);
  if (!dec) continue;

  const t1 = dec.sticks.find(s => s.name === 'T1');
  const b1 = dec.sticks.find(s => s.name === 'B1');
  const n1 = dec.sticks.find(s => s.name === 'N1');
  if (!t1) continue;
  const t1IS = (t1.tooling||[]).filter(t=>t.type==='InnerService').map(t=>t.pos);
  const b1IS = b1 ? (b1.tooling||[]).filter(t=>t.type==='InnerService').map(t=>t.pos) : null;
  const n1IS = n1 ? (n1.tooling||[]).filter(t=>t.type==='InnerService').map(t=>t.pos) : null;

  // Stick T1 from XML to get start coords
  const stickRe = /<stick name="([^"]+)" type="Plate"[^>]* usage="([^"]+)"[^>]*>\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>/g;
  const sticks = {};
  let m;
  while ((m = stickRe.exec(body)) !== null) {
    const [, name, usage, startStr, endStr] = m;
    const [sx, sy, sz] = startStr.split(',').map(Number);
    const [ex, ey, ez] = endStr.split(',').map(Number);
    sticks[name] = { usage, sx, sy, sz, ex, ey, ez };
  }
  const T1s = sticks.T1, B1s = sticks.B1;
  if (!T1s) continue;

  // Service tool_actions: filter to those that touch the top plate z range
  const svcRe = /<tool_action name="Service">\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>\s*<\/tool_action>/g;
  const services = [];
  let s;
  while ((s = svcRe.exec(body)) !== null) {
    const [sx, sy, sz] = s[1].split(',').map(Number);
    const [ex, ey, ez] = s[2].split(',').map(Number);
    services.push({ sx, sy, sz, ex, ey, ez });
  }

  // Vertical services (sx == ex within tolerance) — these go up into the top plate
  const vertSvc = services.filter(v => Math.abs(v.sx - v.ex) < 0.01);
  // Horizontal services (sz == ez) — bottom plate runs
  const horizSvc = services.filter(v => Math.abs(v.sz - v.ez) < 0.01);

  // Top plate z-band: stick z is at top
  const T1z = T1s.sz;
  // Vertical services that reach the top plate
  const topReach = vertSvc.filter(v => Math.abs(Math.max(v.sz, v.ez) - T1z) < 50);

  // Compute predicted T1 positions: distance from stick start
  const T1startX = T1s.sx;
  const T1endX = T1s.ex;
  const dir = T1endX > T1startX ? 1 : -1;
  const predictedT1 = topReach
    .map(v => Math.abs(T1startX - v.sx))
    .sort((a, b) => a - b);

  // Output
  if (t1IS.length === 0 && (!n1IS || n1IS.length === 0)) continue;
  console.log(`\n--- ${fname} ---`);
  console.log(`  T1 stick: x ${T1startX} -> ${T1endX} (z=${T1z})  len=${t1.length}`);
  if (B1s) console.log(`  B1 stick: x ${B1s.sx} -> ${B1s.ex} (z=${B1s.sz})`);
  console.log(`  XML services: ${services.length}  vertical=${vertSvc.length}  topReach=${topReach.length}  horizontal=${horizSvc.length}`);
  console.log(`  T1 IS (${t1IS.length}): [${t1IS.join(', ')}]`);
  if (b1IS) console.log(`  B1 IS (${b1IS.length}): [${b1IS.join(', ')}]`);
  if (n1IS) console.log(`  N1 IS (${n1IS.length}): [${n1IS.join(', ')}]`);
  console.log(`  Predicted from XML topReach (sorted): [${predictedT1.join(', ')}]`);

  // Also dump the topReach service x's
  const xs = topReach.map(v=>v.sx).sort((a,b)=>a-b);
  console.log(`  Service vertical x's reaching top: [${xs.join(', ')}]`);
}
