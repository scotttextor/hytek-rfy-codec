// Scan all frames in an XML — list which have Kbs but NO Headers (L28-pattern candidates)
import { readFileSync } from "node:fs";
const xml = readFileSync(process.argv[2], "utf-8");

// Quick regex parsing for sticks per frame
const frames = xml.matchAll(/<frame name="([^"]+)"[^>]*>([\s\S]*?)<\/frame>/g);
for (const m of frames) {
  const name = m[1];
  const body = m[2];
  const sticks = [...body.matchAll(/<stick name="([^"]+)"[^>]*usage="([^"]*)"/g)].map(x => ({ name: x[1], usage: x[2] }));
  const kbs = sticks.filter(s => /^Kb\d/.test(s.name));
  const headers = sticks.filter(s => /^H\d/.test(s.name));
  const studs = sticks.filter(s => /^S\d/.test(s.name));
  if (kbs.length > 0) {
    const flag = headers.length === 0 ? "  *** NO HEADERS — L28-pattern candidate ***" : "";
    console.log(`${name}: ${studs.length} S, ${kbs.length} Kb, ${headers.length} H${flag}`);
  }
}
