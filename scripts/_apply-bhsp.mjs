#!/usr/bin/env node
// One-shot script to apply BHSP rule edits to table.ts and diff harness wiring.
// Idempotent — applies all changes if not already present, no-ops otherwise.
import fs from 'node:fs';

function patchFile(path, patches) {
  let s = fs.readFileSync(path, 'utf8');
  // Normalize CRLF → LF so our patches (LF) match. We'll restore at write time.
  const wasCRLF = s.includes('\r\n');
  if (wasCRLF) s = s.replace(/\r\n/g, '\n');
  let changes = 0;
  for (const [needle, replacement] of patches) {
    if (s.includes(replacement)) continue;
    if (!s.includes(needle)) {
      console.error(`MISSING NEEDLE in ${path}:\n${needle.slice(0, 200)}\n...`);
      process.exit(1);
    }
    s = s.replace(needle, replacement);
    changes++;
  }
  if (wasCRLF) s = s.replace(/\n/g, '\r\n');
  fs.writeFileSync(path, s);
  console.log(`${path}: ${changes} patches applied`);
}

const bhOld = `attach to the slab.
  {
    rolePattern: /^Bh$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "Raised 70mm B: InnerNotch at start clearance" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high" },
    ],
  },
`;

const bhNew = `attach to the slab.
  //
  // BHSP (2026-05-11): On NLBW plans, when the Bh's START or END faces the
  // frame envelope perimeter (within ~10mm along the run axis), Detailer
  // swaps that end's \`InnerNotch + LipNotch\` cap-stack for a \`Swage\` cap.
  // Verified vs HG260044 GF-NLBW-70.075 (12 affected B/H sticks across
  // N1/N8/N15/N19/N28/N52) and HG260001 PK1+PK2 GF-NLBW-70.075 (matching
  // pattern). The diff harness sets \`bhStartCapIsSwage\` / \`bhEndCapIsSwage\`
  // per-stick from envelope geometry. When NEITHER flag is set, the
  // existing Notch+LipNotch cap-stack stands at both ends.
  {
    rolePattern: /^Bh$/,
    profilePattern: /^70S41$/,
    lengthRange: [0, Infinity],
    rules: [
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high",
        predicate: bhStartTakesSwageCap,
        notes: "BHSP: Raised 70mm B start faces perimeter — Swage replaces Notch+LipNotch" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhStartTakesSwageCap(ctx),
        notes: "Raised 70mm B: InnerNotch at start clearance" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhStartTakesSwageCap(ctx) },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high",
        predicate: bhEndTakesSwageCap,
        notes: "BHSP: Raised 70mm B end faces perimeter — Swage replaces Notch+LipNotch" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhEndTakesSwageCap(ctx) },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhEndTakesSwageCap(ctx) },
    ],
  },
`;

const hOld = `      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header start cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header start cap: LipNotch" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high", notes: "Header dimple at 16.5" },
`;

const hNew = `      // BHSP (2026-05-11): Swage @start replaces Notch+LipNotch when start faces perimeter (NLBW only).
      { toolType: "Swage", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high",
        predicate: bhStartTakesSwageCap,
        notes: "BHSP: 70mm header start faces perimeter — Swage replaces Notch+LipNotch" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhStartTakesSwageCap(ctx),
        notes: "70mm header start cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "startAnchored", offset: 0 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhStartTakesSwageCap(ctx),
        notes: "70mm header start cap: LipNotch" },
      { toolType: "InnerDimple", kind: "point", anchor: { kind: "startAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high", notes: "Header dimple at 16.5" },
`;

const hEndOld = `      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header end cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high", notes: "70mm header end cap: LipNotch" },
`;

const hEndNew = `      { toolType: "InnerDimple", kind: "point", anchor: { kind: "endAnchored", offset: DIMPLE_OFFSET_70 }, confidence: "high" },
      // BHSP (2026-05-11): Swage @end replaces Notch+LipNotch when end faces perimeter (NLBW only).
      { toolType: "Swage", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high",
        predicate: bhEndTakesSwageCap,
        notes: "BHSP: 70mm header end faces perimeter — Swage replaces Notch+LipNotch" },
      { toolType: "InnerNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhEndTakesSwageCap(ctx),
        notes: "70mm header end cap: InnerNotch" },
      { toolType: "LipNotch", kind: "spanned", anchor: { kind: "endAnchored", offset: SPAN_70 }, spanLength: SPAN_70, confidence: "high",
        predicate: (ctx) => !bhEndTakesSwageCap(ctx),
        notes: "70mm header end cap: LipNotch" },
`;

// types.ts: per-end Swage cap flags
const typesOld = `  nogStartCapIsNotch?: boolean;
  /** NLBW3 (2026-05-10): same as \`nogStartCapIsNotch\` but for the END
   *  endpoint. */
  nogEndCapIsNotch?: boolean;
  /**
   * Optional: per-project Detailer configuration. Resolved by the caller`;

const typesNew = `  nogStartCapIsNotch?: boolean;
  /** NLBW3 (2026-05-10): same as \`nogStartCapIsNotch\` but for the END
   *  endpoint. */
  nogEndCapIsNotch?: boolean;
  /**
   * BHSP (2026-05-11): true if this raised B-plate (Bh role) or H header's
   * START end faces the frame envelope perimeter (within ~10mm along its
   * run axis). When true, Detailer caps the perimeter-facing end with
   * \`Swage\` (span 39 on 70S41) instead of the default \`InnerNotch +
   * LipNotch\` cap-stack. Set by the diff harness / framecad-import. NLBW
   * plans only — rule predicate short-circuits otherwise.
   */
  bhStartCapIsSwage?: boolean;
  /** BHSP (2026-05-11): same as \`bhStartCapIsSwage\` but for the END
   *  endpoint. */
  bhEndCapIsSwage?: boolean;
  /**
   * Optional: per-project Detailer configuration. Resolved by the caller`;

// table.ts: helper functions for BHSP predicate
const helpersOld = `/** NLBW3 (2026-05-10): same as \`nogStartTakesNotchCap\` but for the END. */
function nogEndTakesNotchCap(ctx: StickContext): boolean {
  if (!/(NLBW|NON-LBW)/i.test(ctx.planName ?? "")) return false;
  if (ctx.nogEndCapIsNotch === true) return true;
  if (ctx.nogEndCapIsNotch === undefined && ctx.nogIsSubPanelBothInterior === true) return true;
  return false;
}

export const RULE_TABLE: RuleGroup[] = [`;

const helpersNew = `/** NLBW3 (2026-05-10): same as \`nogStartTakesNotchCap\` but for the END. */
function nogEndTakesNotchCap(ctx: StickContext): boolean {
  if (!/(NLBW|NON-LBW)/i.test(ctx.planName ?? "")) return false;
  if (ctx.nogEndCapIsNotch === true) return true;
  if (ctx.nogEndCapIsNotch === undefined && ctx.nogIsSubPanelBothInterior === true) return true;
  return false;
}

/**
 * BHSP (2026-05-11): Whether this raised B-plate (Bh role) or H header's
 * START end takes a \`Swage\` cap instead of the default \`InnerNotch +
 * LipNotch\` cap-stack. Detailer's reference RFY caps the END FACING THE
 * FRAME ENVELOPE perimeter with Swage on sub-plates above rough openings.
 * Verified vs HG260044 GF-NLBW-70.075 (12 sticks across N1/N8/N15/N19/N28/
 * N52) and HG260001 PK1/PK2 GF-NLBW-70.075. Polarity is shared across both
 * corpora. Predicate gates on NLBW plan-name match and the per-end flag
 * \`bhStartCapIsSwage\` set by the diff harness.
 */
function bhStartTakesSwageCap(ctx: StickContext): boolean {
  if (!/(NLBW|NON-LBW)/i.test(ctx.planName ?? "")) return false;
  return ctx.bhStartCapIsSwage === true;
}

/** BHSP (2026-05-11): same as \`bhStartTakesSwageCap\` but for the END. */
function bhEndTakesSwageCap(ctx: StickContext): boolean {
  if (!/(NLBW|NON-LBW)/i.test(ctx.planName ?? "")) return false;
  return ctx.bhEndCapIsSwage === true;
}

export const RULE_TABLE: RuleGroup[] = [`;

patchFile('src/rules/types.ts', [
  [typesOld, typesNew],
]);

patchFile('src/rules/table.ts', [
  [helpersOld, helpersNew],
  [bhOld, bhNew],
  [hOld, hNew],
  [hEndOld, hEndNew],
]);

const harnessPrePassOld = `            if (startNotch) _nogStartCapByName.set(nog.name, true);
            if (endNotch) _nogEndCapByName.set(nog.name, true);
          }
        }
      }

      const sticks = [];`;

const harnessPrePassNew = `            if (startNotch) _nogStartCapByName.set(nog.name, true);
            if (endNotch) _nogEndCapByName.set(nog.name, true);
          }
        }
      }

      // BHSP (2026-05-11): per-end Swage cap detection on Bh raised B-plates
      // and H headers in NLBW plans. When the stick's start or end endpoint
      // sits within ~10mm of the frame envelope perimeter (along its run
      // axis), Detailer caps that end with \`Swage\` instead of the default
      // \`InnerNotch + LipNotch\` cap-stack.
      //
      // Verified vs HG260044 GF-NLBW-70.075: 12 affected B/H sticks across
      // N1/N8/N15/N19/N28/N52. Verified vs HG260001 PK1+PK2 GF-NLBW-70.075.
      // Polarity is shared across both corpora.
      const _bhStartCapByName = new Map();
      const _bhEndCapByName = new Map();
      {
        const isNLBW = /(NLBW|NON-LBW)/i.test(plan.name);
        if (isNLBW) {
          const fxMin = Math.min(...env.map(v => v.x));
          const fxMax = Math.max(...env.map(v => v.x));
          const fyMin = Math.min(...env.map(v => v.y));
          const fyMax = Math.max(...env.map(v => v.y));
          const PERIMETER_TOL = 10;
          for (const s of f.stick ?? []) {
            const u = String(s["@_usage"] ?? "").toLowerCase();
            const n = String(s["@_name"] ?? "");
            const ps = parseTriple(String(s.start ?? "0,0,0"));
            const pe = parseTriple(String(s.end ?? "0,0,0"));
            const z = (ps.z + pe.z) / 2;
            const isRaisedB = u === "bottomplate" && Math.abs(z - frameElevation - 61.5) < 1 && /^B\\d/.test(n);
            const isH = (u === "headplate" || u === "head") && /^H\\d/.test(n);
            if (!isRaisedB && !isH) continue;
            const dx = Math.abs(pe.x - ps.x);
            const dy = Math.abs(pe.y - ps.y);
            const axis = dx > dy ? "x" : "y";
            const startV = axis === "x" ? ps.x : ps.y;
            const endV = axis === "x" ? pe.x : pe.y;
            const axMin = axis === "x" ? fxMin : fyMin;
            const axMax = axis === "x" ? fxMax : fyMax;
            const startAtPerim = Math.abs(startV - axMin) <= PERIMETER_TOL || Math.abs(startV - axMax) <= PERIMETER_TOL;
            const endAtPerim = Math.abs(endV - axMin) <= PERIMETER_TOL || Math.abs(endV - axMax) <= PERIMETER_TOL;
            // Only fire when OTHER end is interior — full-span sub-plates
            // (start AND end both at perimeter) keep their existing
            // Notch+LipNotch caps (they are the primary B/H plate).
            if (startAtPerim && !endAtPerim) _bhStartCapByName.set(n, true);
            if (endAtPerim && !startAtPerim) _bhEndCapByName.set(n, true);
          }
        }
      }

      const sticks = [];`;

const harnessCallSiteOld = `          nogStartCapIsNotch: _nogStartCapByName.get(stick.name) === true,
          nogEndCapIsNotch: _nogEndCapByName.get(stick.name) === true,
          projectConfig,
        });`;

const harnessCallSiteNew = `          nogStartCapIsNotch: _nogStartCapByName.get(stick.name) === true,
          nogEndCapIsNotch: _nogEndCapByName.get(stick.name) === true,
          bhStartCapIsSwage: _bhStartCapByName.get(stick.name) === true,
          bhEndCapIsSwage: _bhEndCapByName.get(stick.name) === true,
          projectConfig,
        });`;

patchFile('scripts/diff-vs-detailer.mjs', [
  [harnessPrePassOld, harnessPrePassNew],
  [harnessCallSiteOld, harnessCallSiteNew],
]);

console.log('All patches applied.');
