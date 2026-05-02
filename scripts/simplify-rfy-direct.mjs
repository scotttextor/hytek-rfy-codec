// Direct RFY simplifier — modifies the original RFY in place rather than
// going through CSV. Preserves ALL physical-fit ops (TrussChamfer, Flange,
// PartialFlange, LipNotch, Swage, InnerDimple) exactly as in the source RFY,
// and only replaces Web (bolt-hole) ops with the new centreline-intersection rule.
//
// Usage:
//   node scripts/simplify-rfy-direct.mjs original.rfy truss.xml [--out simplified.rfy]
//                                          [--report-only] [--exclude FRAME1,FRAME2]
import { readFileSync, writeFileSync } from "node:fs";
import { decode } from "../dist/decode.js";
import { decryptRfy, encryptRfy } from "../dist/crypto.js";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: node simplify-rfy-direct.mjs original.rfy truss.xml [--out simplified.rfy] [--report-only] [--exclude FRAME1,FRAME2]");
  process.exit(1);
}

const rfyPath = args[0];
const xmlPath = args[1];
let outPath = rfyPath.replace(/\.rfy$/i, ".simplified.rfy");
let reportOnly = false;
const excludeFrames = new Set();
for (let i = 2; i < args.length; i++) {
  if (args[i] === "--out") outPath = args[++i];
  else if (args[i] === "--report-only") reportOnly = true;
  else if (args[i] === "--exclude") {
    for (const f of (args[++i] || "").split(",")) {
      if (f.trim()) excludeFrames.add(f.trim());
    }
  }
}

// ---------- Parse the truss XML for stick coordinates ----------
const xmlText = readFileSync(xmlPath, "utf-8");
const xmlSticks = new Map(); // "FRAME-STICK" -> { start, end, type, usage, profile, gauge }
const planByFrame = new Map(); // FRAME -> plan name

const planMatches = [...xmlText.matchAll(/<plan name="([^"]+)">([\s\S]*?)<\/plan>/g)];
for (const pm of planMatches) {
  const planName = pm[1];
  const planBody = pm[2];
  const frameMatches = [...planBody.matchAll(/<frame name="([^"]+)" type="([^"]+)"[^>]*>([\s\S]*?)<\/frame>/g)];
  for (const fm of frameMatches) {
    const frameName = fm[1];
    const frameType = fm[2];
    const frameBody = fm[3];
    planByFrame.set(frameName, { plan: planName, type: frameType });
    const stickMatches = [...frameBody.matchAll(/<stick\s+([^>]*?)>\s*<start>([^<]+)<\/start>\s*<end>([^<]+)<\/end>\s*<profile\s+([^/>]*?)\/?>/g)];
    for (const sm of stickMatches) {
      const attrs = sm[1], startStr = sm[2], endStr = sm[3], profStr = sm[4];
      const getAttr = (s, k) => {
        const m = s.match(new RegExp(`\\b${k}="([^"]*)"`));
        return m ? m[1] : "";
      };
      const name = getAttr(attrs, "name");
      const usage = getAttr(attrs, "usage");
      const gauge = getAttr(attrs, "gauge");
      const [sx, sy, sz] = startStr.trim().split(",").map(parseFloat);
      const [ex, ey, ez] = endStr.trim().split(",").map(parseFloat);
      xmlSticks.set(`${frameName}-${name}`, {
        frameName, stickName: name,
        start: [sx, sy, sz], end: [ex, ey, ez],
        usage, gauge,
        profile: {
          web: getAttr(profStr, "web"),
          lFlange: getAttr(profStr, "l_flange"),
          rFlange: getAttr(profStr, "r_flange"),
          lLip: getAttr(profStr, "l_lip"),
          rLip: getAttr(profStr, "r_lip"),
          shape: getAttr(profStr, "shape"),
        },
      });
    }
  }
}

// ---------- 4-layer detection ----------
function isLinearTruss(frameName) {
  const meta = planByFrame.get(frameName);
  if (!meta) return { ok: false, reason: "frame not in XML" };
  if (meta.type !== "Truss") return { ok: false, reason: `frame type "${meta.type}" not Truss` };
  if (!/-LIN-/i.test(meta.plan)) return { ok: false, reason: `plan "${meta.plan}" not Linear` };

  // Get all sticks in this frame
  const frameSticks = [...xmlSticks.values()].filter(s => s.frameName === frameName);
  for (const s of frameSticks) {
    const p = s.profile;
    if (p.web !== "89" || p.rFlange !== "41" || p.lFlange !== "38" ||
        p.lLip !== "11.0" || p.rLip !== "11.0" || p.shape !== "C") {
      return { ok: false, reason: `${s.stickName} wrong profile (${p.web}x${p.rFlange} ${p.shape})` };
    }
    if (s.gauge !== "0.75") return { ok: false, reason: `${s.stickName} wrong gauge (${s.gauge})` };
  }
  const hasChord = frameSticks.some(s => /chord/i.test(s.usage));
  const hasWeb = frameSticks.some(s => /web/i.test(s.usage));
  if (!hasChord) return { ok: false, reason: "no chord members" };
  if (!hasWeb) return { ok: false, reason: "no web members" };
  return { ok: true };
}

// ---------- Centreline intersection (XZ planar) ----------
function lineIntersection(s1, s2, slack = 20) {
  const x1 = s1.start[0], z1 = s1.start[2];
  const x2 = s1.end[0], z2 = s1.end[2];
  const x3 = s2.start[0], z3 = s2.start[2];
  const x4 = s2.end[0], z4 = s2.end[2];
  const denom = (x1-x2)*(z3-z4) - (z1-z2)*(x3-x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1-x3)*(z3-z4) - (z1-z3)*(x3-x4)) / denom;
  const u = -((x1-x2)*(z1-z3) - (z1-z2)*(x1-x3)) / denom;
  const L1 = Math.hypot(x2-x1, z2-z1);
  const L2 = Math.hypot(x4-x3, z4-z3);
  const st_ = slack/L1, su = slack/L2;
  if (t < -st_ || t > 1+st_) return null;
  if (u < -su || u > 1+su) return null;
  return { pt: [x1+t*(x2-x1), z1+t*(z2-z1)], t, u };
}

// ---------- Decrypt + parse the source RFY (we'll edit the XML inside) ----------
const rfyBuf = readFileSync(rfyPath);
const rfyXmlText = decryptRfy(rfyBuf);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,  // keep original ordering for clean output
  allowBooleanAttributes: true,
  parseAttributeValue: false,
});
const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  format: true,
  indentBy: "  ",
  suppressBooleanAttributes: false,
});

const tree = parser.parse(rfyXmlText);

// Walk the tree and modify Web ops on Linear truss sticks
function walkPlans(node) {
  if (!Array.isArray(node)) {
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        if (Array.isArray(node[key])) walkPlans(node[key]);
      }
    }
    return;
  }
  for (const item of node) {
    if (item.frame && Array.isArray(item.frame)) {
      processFrame(item);
    } else if (typeof item === 'object') {
      for (const key of Object.keys(item)) {
        if (Array.isArray(item[key])) walkPlans(item[key]);
      }
    }
  }
}

const decisions = [];

function processFrame(frameWrap) {
  // frameWrap is { frame: [...], ":@": { @_name: "..." } }
  const frameAttrs = frameWrap[":@"] || {};
  const frameName = frameAttrs["@_name"];
  if (!frameName) return;

  if (excludeFrames.has(frameName)) {
    decisions.push({ frame: frameName, decision: "SKIP", reason: "in exclude list" });
    return;
  }
  const det = isLinearTruss(frameName);
  if (!det.ok) {
    decisions.push({ frame: frameName, decision: "SKIP", reason: det.reason });
    return;
  }

  // Get this frame's sticks for centreline-intersection computation
  const frameSticks = [...xmlSticks.values()].filter(s => s.frameName === frameName);

  // Compute new bolt positions per stick (local mm)
  const newBoltsPerStick = new Map(); // stickName -> [pos]
  for (let i = 0; i < frameSticks.length; i++) {
    for (let j = i+1; j < frameSticks.length; j++) {
      const r = lineIntersection(frameSticks[i], frameSticks[j]);
      if (!r) continue;
      const lengthI = Math.hypot(
        frameSticks[i].end[0] - frameSticks[i].start[0],
        frameSticks[i].end[2] - frameSticks[i].start[2]
      );
      const lengthJ = Math.hypot(
        frameSticks[j].end[0] - frameSticks[j].start[0],
        frameSticks[j].end[2] - frameSticks[j].start[2]
      );
      const posI = Math.max(0, Math.min(lengthI, r.t * lengthI));
      const posJ = Math.max(0, Math.min(lengthJ, r.u * lengthJ));
      const ai = newBoltsPerStick.get(frameSticks[i].stickName) ?? [];
      ai.push(posI); newBoltsPerStick.set(frameSticks[i].stickName, ai);
      const aj = newBoltsPerStick.get(frameSticks[j].stickName) ?? [];
      aj.push(posJ); newBoltsPerStick.set(frameSticks[j].stickName, aj);
    }
  }

  // Walk frame children, find each <stick>, modify its <tooling>
  let modifiedStickCount = 0;
  for (const child of frameWrap.frame) {
    if (!child.stick) continue;
    const stickAttrs = child[":@"] || {};
    const stickName = stickAttrs["@_name"];
    if (!stickName) continue;
    // Find the <tooling> child
    const toolingNode = child.stick.find(c => c.tooling !== undefined);
    if (!toolingNode) continue;
    // Remove existing point-tool entries with type="Web"
    const filteredOps = toolingNode.tooling.filter(op => {
      if (op["point-tool"] !== undefined) {
        const t = (op[":@"] || {})["@_type"];
        return t !== "Web";
      }
      return true;
    });
    // Add new point-tool Web entries at centreline-intersection positions
    const newPositions = (newBoltsPerStick.get(stickName) || []).slice().sort((a,b) => a-b);
    for (const pos of newPositions) {
      filteredOps.push({
        "point-tool": [],
        ":@": { "@_type": "Web", "@_pos": pos.toFixed(2) },
      });
    }
    toolingNode.tooling = filteredOps;
    modifiedStickCount++;
  }
  decisions.push({
    frame: frameName,
    decision: "APPLY",
    reason: `${modifiedStickCount} sticks updated, ${[...newBoltsPerStick.values()].flat().length} bolt positions placed`,
  });
}

walkPlans(tree);

// Print audit
console.error("\nAUDIT LOG:");
console.error("-".repeat(80));
console.error(`${"Frame".padEnd(20)} ${"Decision".padEnd(8)} Reason`);
console.error("-".repeat(80));
for (const d of decisions) {
  console.error(`${d.frame.padEnd(20)} ${d.decision.padEnd(8)} ${d.reason}`);
}
const applied = decisions.filter(d => d.decision === "APPLY").length;
const skipped = decisions.filter(d => d.decision === "SKIP").length;
console.error("-".repeat(80));
console.error(`Applied: ${applied}  Skipped: ${skipped}`);

if (reportOnly) {
  console.error("\nREPORT-ONLY: no output written.");
  process.exit(0);
}

// Re-build XML and re-encrypt
const newXml = builder.build(tree);
const newRfy = encryptRfy(newXml);
writeFileSync(outPath, newRfy);
console.error(`\nWrote ${outPath} (${newRfy.length} bytes, source was ${rfyBuf.length} bytes)`);
