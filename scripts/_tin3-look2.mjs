import fs from "node:fs";
import { decode } from "../dist/index.js";
const oursPath = "C:/Users/Scott/AppData/Local/Temp/tin3/run3.ours.rfy";
const doc = decode(fs.readFileSync(oursPath));
for (const plan of doc.project.plans ?? []) {
  for (const fr of plan.frames ?? []) {
    if (!["HN3-1","HN12-1"].includes(fr.name)) continue;
    for (const st of fr.sticks) {
      if (!["T2","T3"].includes(st.name)) continue;
      console.log(`\n=== ${fr.name} ${st.name} (${(st.tooling||[]).length} ops) ===`);
      for (const op of st.tooling || []) {
        if (op.kind === "point") console.log(`  ${op.type} @${op.pos.toFixed(2)}`);
        else if (op.kind === "spanned") console.log(`  ${op.type} ${op.startPos.toFixed(2)}..${op.endPos.toFixed(2)}`);
      }
    }
  }
}
