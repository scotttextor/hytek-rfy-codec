// Probe InnerService positions across corpora
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const mod = await import(pathToFileURL(path.join(root, 'dist', 'index.js')).href);

const corpora = [
  'HG260012_23_SPRINGWOOD_ST_TOWNHOUSES',
  'HG250057_SE25_LOT_99_RATNAM_ROAD_REDBANK_PLAINS',
  'HG250082_FLAGSTONE_OSHC',
  'HG250096_SE14_LOT_85_SHARMAN_STREET_REDBANK_PLAINS',
];

const PRINT_FRAMES = process.env.PRINT_FRAMES ? parseInt(process.env.PRINT_FRAMES) : 5;

for (const corpus of corpora) {
  const dir = path.join(root, 'test-corpus', corpus);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.rfy'));
  console.log(`\n=== ${corpus} (${files.length} rfy files) ===`);

  for (const file of files) {
    const isLBW = /-LBW-/.test(file);
    const filter = process.env.LBW_ONLY === '1' ? isLBW : true;
    if (!filter) continue;

    const buf = fs.readFileSync(path.join(dir, file));
    let r;
    try { r = await mod.decode(buf); }
    catch (e) { console.log(`  ${file}: DECODE FAIL: ${e.message}`); continue; }

    let printed = 0;
    for (const plan of r.project.plans) {
      for (const f of plan.frames) {
        // collect T/B/N InnerService positions
        const interesting = f.sticks.filter(s =>
          /^[TBN]\d+$/.test(s.name) ||
          /^J\d+$/.test(s.name)  // Jacks too
        );
        const isvcByStick = interesting.map(s => {
          const isv = (s.tooling || []).filter(t => t.type === 'InnerService').map(t => t.pos);
          return { name: s.name, length: s.length, count: isv.length, positions: isv };
        });
        const anyHasIS = isvcByStick.some(s => s.count > 0);
        if (!anyHasIS) continue;

        if (printed < PRINT_FRAMES) {
          console.log(`  ${file} :: frame ${f.name} (sticks=${f.sticks.length})`);
          for (const s of isvcByStick) {
            if (s.count > 0) {
              console.log(`    ${s.name.padEnd(4)} L=${s.length.toString().padStart(7)}  IS(${s.count}): [${s.positions.join(', ')}]`);
            }
          }
          printed++;
        }
      }
    }
  }
}
