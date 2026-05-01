// Dump key geometry of a frame: stud Xs, Kb endpoints, plate length
import { readFileSync } from "node:fs";
const xml = readFileSync(process.argv[2], "utf-8");
const wantFrames = process.argv.slice(3);

const frames = xml.matchAll(/<frame name="([^"]+)"[^>]*>([\s\S]*?)<\/frame>/g);
for (const m of frames) {
  const name = m[1];
  if (wantFrames.length && !wantFrames.includes(name)) continue;
  const body = m[2];
  const sticks = [...body.matchAll(/<stick name="([^"]+)"[^>]*usage="([^"]*)"[^>]*>\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>/g)].map(x => ({
    name: x[1],
    usage: x[2],
    start: x[3].trim().split(",").map(Number),
    end: x[4].trim().split(",").map(Number),
  }));
  console.log(`\n${name}:`);
  const t1 = sticks.find(s => s.name === "T1");
  if (t1) {
    const xMax = Math.max(t1.start[0], t1.end[0]);
    const xMin = Math.min(t1.start[0], t1.end[0]);
    console.log(`  T1: world x ${xMin}..${xMax}, length ${(xMax-xMin).toFixed(0)}`);
  }
  for (const s of sticks) {
    if (/^S\d/.test(s.name) || /^Kb\d/.test(s.name)) {
      const z0 = s.start[2], z1 = s.end[2];
      const x0 = s.start[0], x1 = s.end[0];
      const isVertical = Math.abs(x1 - x0) < 1;
      const flag = isVertical ? "vertical" : `diagonal ${(x1-x0).toFixed(0)}mm`;
      console.log(`  ${s.name.padEnd(5)}: x=${x0.toFixed(2)}..${x1.toFixed(2)}, z=${z0.toFixed(0)}..${z1.toFixed(0)}  ${flag}`);
    }
  }
}
