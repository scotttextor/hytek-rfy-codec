/**
 * Frame-context tooling generator.
 *
 * Per-stick rules in src/rules/table.ts only cover universal end-anchored ops.
 * The biggest remaining ops are at "crossings" — where two sticks intersect
 * in the frame:
 *
 *   - Top/bottom plate gets LIP NOTCH + DIMPLE pair at every stud's x-coord
 *   - Stud gets LIP NOTCH + DIMPLE pair at every nog's y-coord
 *   - Nog gets WEB+LIP NOTCH + DIMPLE pair at every stud's x-coord
 *
 * Crossings are detected from the sticks' outlineCorners (elevation-graphics).
 * Each stick is approximately a rectangle in 2D frame coords; intersections
 * are where the rectangles overlap.
 */
import type { RfyToolingOp, RfyFrame, RfyStick, RfyPoint } from "../format.js";
import { profileOffsets } from "./table.js";

export interface BoundingBox {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  cx: number;  // centerline x
  cy: number;  // centerline y
}

export interface StickWithBox {
  stick: RfyStick;
  role: string;
  box: BoundingBox;
  /** True if stick is laid horizontally in the frame (plates, nogs, lintels). */
  horizontal: boolean;
}

/** Compute a stick's bounding box in 2D frame coords. */
export function computeBox(stick: RfyStick): BoundingBox | null {
  const corners = stick.outlineCorners ?? [];
  if (corners.length < 2) return null;
  const xs = corners.map(c => c.x);
  const ys = corners.map(c => c.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  return {
    xMin, xMax, yMin, yMax,
    cx: (xMin + xMax) / 2,
    cy: (yMin + yMax) / 2,
  };
}

/** Stick role = name prefix (e.g. "S", "T", "B", "N", "Kb"). */
export function roleFromName(name: string): string {
  return name.replace(/[0-9_].*$/, "");
}

/** Layout a frame: assign each stick a bounding box and orientation. */
export function layoutFrame(frame: RfyFrame): StickWithBox[] {
  const out: StickWithBox[] = [];
  for (const s of frame.sticks) {
    const box = computeBox(s);
    if (!box) continue;
    const w = box.xMax - box.xMin;
    const h = box.yMax - box.yMin;
    out.push({
      stick: s, role: roleFromName(s.name),
      box, horizontal: w > h,
    });
  }
  return out;
}

const STUD_ROLES = new Set(["S", "J"]);    // narrow vertical members only
const TRUSS_WEB_ROLES = new Set(["W"]);    // truss web members (verticals + diagonals)
const CRIPPLE_ROLES = new Set(["Kb", "H"]); // wide horizontal+vertical hybrids — handled separately
const TOP_PLATE_ROLES = new Set(["T", "Tp"]);
const BOT_PLATE_ROLES = new Set(["B", "Bp"]);
const NOG_ROLES = new Set(["N", "Nog"]);
const ALL_PLATE_ROLES = new Set([...TOP_PLATE_ROLES, ...BOT_PLATE_ROLES, ...NOG_ROLES]);
const STUD_MAX_WIDTH = 100;  // real studs are ~40mm wide; Kb/H outlines can be 500mm+

/** Get the stick's 2D centerline midpoints at start and end, derived from
 *  outlineCorners. The corners are the 4-point CCW rectangle around the
 *  diagonal axis, so:
 *    start_centerline = midpoint of corners[0] + corners[3]
 *    end_centerline   = midpoint of corners[1] + corners[2]
 */
function getCenterlineEndpoints(stick: RfyStick): { startL: RfyPoint; endL: RfyPoint } | null {
  const c = stick.outlineCorners;
  if (!c || c.length < 4) return null;
  return {
    startL: { x: (c[0]!.x + c[3]!.x) / 2, y: (c[0]!.y + c[3]!.y) / 2 },
    endL: { x: (c[1]!.x + c[2]!.x) / 2, y: (c[1]!.y + c[2]!.y) / 2 },
  };
}

/** Compute the x-position where the stick's centerline intersects y = atY.
 *  Works for both axis-aligned and diagonal sticks. Returns null if the
 *  stick's centerline doesn't span atY or is purely horizontal. */
function getCrossingX(stick: RfyStick, atY: number): number | null {
  const c = getCenterlineEndpoints(stick);
  if (!c) return null;
  const dy = c.endL.y - c.startL.y;
  if (Math.abs(dy) < 1e-6) return null;  // horizontal stick — doesn't cross horizontal chord
  // Allow small tolerance outside the strict y-range so chord-level crossings near
  // the stick's endpoints still register.
  const yMin = Math.min(c.startL.y, c.endL.y) - 5;
  const yMax = Math.max(c.startL.y, c.endL.y) + 5;
  if (atY < yMin || atY > yMax) return null;
  const t = (atY - c.startL.y) / dy;
  return c.startL.x + t * (c.endL.x - c.startL.x);
}

/** Convert a frame-X-coord crossing into a position along the plate's length. */
function plateLocalPosition(plate: StickWithBox, crossingX: number): number {
  // Plates run horizontally; the position along the plate is the crossing X
  // minus the plate's xMin. (The plate's "length" axis runs xMin → xMax.)
  return crossingX - plate.box.xMin;
}

/** Convert a frame-Y-coord crossing into a position along the stud's length. */
function studLocalPosition(stud: StickWithBox, crossingY: number): number {
  // Studs run vertically; position along stud is crossingY - yMin.
  // BUT some studs are "flipped" (run top-down) and the position would be
  // length - localY. We use yMin → length convention by default (matches
  // observation that the start-end ops at y=yMin & y=yMax pair with pos=0/length).
  return crossingY - stud.box.yMin;
}

/**
 * Generate frame-context tooling ops for every stick in the frame.
 * Returns: Map<stickName, RfyToolingOp[]>
 *
 * The per-stick base rules (table.ts) handle end-anchored ops. Frame-context
 * rules add LIP NOTCH + DIMPLE pairs at crossings.
 */
export function generateFrameContextOps(frame: RfyFrame): Map<string, RfyToolingOp[]> {
  const layout = layoutFrame(frame);
  const result = new Map<string, RfyToolingOp[]>();
  for (const sb of layout) result.set(sb.stick.name, []);

  // Studs: narrow vertical members (S, J). Filter out wide outlines (Kb/H).
  const studs = layout.filter(sb =>
    STUD_ROLES.has(sb.role) && (sb.box.xMax - sb.box.xMin) <= STUD_MAX_WIDTH
  );
  // Truss webs (W): vertical posts AND diagonal members in trusses. They
  // cross top/bottom chords like studs but for diagonals the bbox.cx isn't
  // meaningful — we use line-intersection geometry to find the actual
  // crossing X at the chord's y-level.
  const trussWebs = layout.filter(sb => TRUSS_WEB_ROLES.has(sb.role));
  // Cripple studs: also vertical, but their outlines are too wide to be useful for crossing detection.
  // Their connection point is at one of their X edges (which we treat as a virtual stud).
  const cripples = layout.filter(sb => CRIPPLE_ROLES.has(sb.role));
  // Plates: top + bottom plates only (NOT nogs — nogs are handled in their
  // own loop below with InnerNotch + LipNotch ops at each stud crossing.
  // Including nogs here would double-emit LipNotch + InnerDimple at each
  // crossing — verified 2026-04-30 against HG260044 reference where the
  // duplicate emissions accounted for ~660 over-emissions of LipNotch).
  const plates = layout.filter(sb =>
    ALL_PLATE_ROLES.has(sb.role) && !NOG_ROLES.has(sb.role)
  );

  // Build virtual stud crossings from cripple sticks: each cripple's
  // narrow column is approximately at its xMin (or xMax — we add both
  // and rely on the localPos uniqueness/skip).
  // For NLBW frames, cripples typically attach to plates at one of their
  // edges, not the centerline. We emit two virtual crossings per cripple.
  const virtualStudCrossings = [];
  for (const cr of cripples) {
    // Each cripple may correspond to studs on its left edge OR right edge
    // (at the door/window jamb). Emit both as virtual stud-crossings.
    virtualStudCrossings.push({
      role: "Kb-edge-left", box: { ...cr.box, xMin: cr.box.xMin, xMax: cr.box.xMin + 41, cx: cr.box.xMin + 20 },
      stick: cr.stick, horizontal: false,
    });
    virtualStudCrossings.push({
      role: "Kb-edge-right", box: { ...cr.box, xMin: cr.box.xMax - 41, xMax: cr.box.xMax, cx: cr.box.xMax - 20 },
      stick: cr.stick, horizontal: false,
    });
  }
  const allCrossingStuds = [...studs, ...virtualStudCrossings];

  for (const plate of plates) {
    const offsets = profileOffsets(plate.stick.profile.metricLabel.replace(/\s/g, ""));
    const span = offsets.span;
    const internalSpan = 45;        // width of internal lip notches (vs 39 at edges)
    const internalDimpleOffset = 22.5;  // internal lip notch midpoint offset

    const stickOps = result.get(plate.stick.name)!;
    const seenPositions = new Set<number>();  // dedupe crossings at same localPos

    // Plate centerline y for diagonal-W intersection calc
    const plateCenterY = (plate.box.yMin + plate.box.yMax) / 2;

    for (const stud of allCrossingStuds) {
      // Does this stud's bounding box overlap the plate's bounding box?
      // Plate spans the full frame horizontally; stud spans some Y range.
      // The crossing happens if stud's Y range overlaps plate's Y range.
      const yOverlap = stud.box.yMax >= plate.box.yMin && stud.box.yMin <= plate.box.yMax;
      if (!yOverlap) continue;
      // The crossing X is the stud's centerline (or X overlap with plate).
      const crossingX = stud.box.cx;
      // Skip if crossing is outside plate's X range (with extra tolerance for studs
      // at the very start/end — those are handled by per-stick edge rules).
      if (crossingX < plate.box.xMin + 50) continue;
      if (crossingX > plate.box.xMax - 50) continue;

      const localPos = plateLocalPosition(plate, crossingX);
      // Skip if the crossing is at or near the plate's start/end (those are handled by per-stick rules)
      if (localPos < span + 5) continue;
      if (localPos > plate.stick.length - span - 5) continue;

      // Dedupe: if we've already emitted a crossing within 30mm of this localPos, skip
      const quantizedPos = Math.round(localPos / 30) * 30;
      if (seenPositions.has(quantizedPos)) continue;
      seenPositions.add(quantizedPos);

      // Internal lip notch: spanned, centred on stud, span 45mm typically
      const studWidth = stud.box.xMax - stud.box.xMin;
      const lipSpan = Math.max(internalSpan, Math.min(studWidth + 4, 80));  // cap at 80 to avoid huge spans
      const startPos = localPos - lipSpan / 2;
      const endPos = startPos + lipSpan;

      stickOps.push({
        kind: "spanned", type: "LipNotch",
        startPos: round(startPos), endPos: round(endPos),
      });
      // Dimple inside the lip notch
      stickOps.push({
        kind: "point", type: "InnerDimple",
        pos: round(startPos + internalDimpleOffset),
      });
    }

    // Truss W members crossing this chord: use line-intersection geometry
    // (bbox.cx is wrong for diagonals — would give the bbox midpoint, not
    // the actual crossing-x at the chord's y-level).
    for (const web of trussWebs) {
      const crossingX = getCrossingX(web.stick, plateCenterY);
      if (crossingX === null) continue;
      // Skip if crossing is outside plate's X range
      if (crossingX < plate.box.xMin + 50) continue;
      if (crossingX > plate.box.xMax - 50) continue;
      const localPos = plateLocalPosition(plate, crossingX);
      if (localPos < span + 5) continue;
      if (localPos > plate.stick.length - span - 5) continue;
      const quantizedPos = Math.round(localPos / 30) * 30;
      if (seenPositions.has(quantizedPos)) continue;
      seenPositions.add(quantizedPos);

      // Truss web on chord: same LipNotch + Dimple pattern as a stud crossing.
      const lipSpan = internalSpan;  // 45mm — webs are 41mm wide
      const startPos = localPos - lipSpan / 2;
      const endPos = startPos + lipSpan;
      stickOps.push({
        kind: "spanned", type: "LipNotch",
        startPos: round(startPos), endPos: round(endPos),
      });
      stickOps.push({
        kind: "point", type: "InnerDimple",
        pos: round(startPos + internalDimpleOffset),
      });
    }

    // Detailer JOINS adjacent LipNotches into single wider notches — verified
    // 2026-05-01 against HG260044 GF-TIN PC7-1/B1: 6 W crossings emit ONE
    // wide LipNotch (513..629, span 116) instead of multiple 45mm notches.
    // Threshold: notches whose endPos is within JOIN_GAP_MM of the next
    // notch's startPos get merged. Dimples preserved (they live at the
    // original crossing positions, not at notch endpoints).
    //
    // For trusses (top/bottom chord), the join distance is LARGER because
    // truss panel-points are spaced wider. For walls, join only very-close
    // notches (e.g. virtual-stud-crossings on the same Kb).
    const isTrussChord = trussWebs.length > 0 && stickOps.some(o => o.kind === "spanned" && o.type === "LipNotch");
    const JOIN_GAP_MM = isTrussChord ? 80 : 30;
    joinAdjacentLipNotches(stickOps, JOIN_GAP_MM);
  }

  // Studs: nogs cross them — LIP NOTCH + DIMPLE at the crossing.
  // (Verified 2026-04-30 against PK5-DETAILER-RAW.xml: Detailer emits
  // LipNotch at nog crossings on studs, NOT Swage. Swage is reserved for
  // end-anchored stiffening cuts only. The previous rule table comment
  // had this backwards.)
  // Other horizontal members (headers H, lintels L, ribbons R, etc.) also
  // cross studs and produce LIP NOTCH + DIMPLE.
  const nogs = layout.filter(sb => NOG_ROLES.has(sb.role));
  const otherHorizontal = layout.filter(sb =>
    !NOG_ROLES.has(sb.role) && !STUD_ROLES.has(sb.role) && !ALL_PLATE_ROLES.has(sb.role) && sb.horizontal
  );
  for (const stud of studs) {
    const stickOps = result.get(stud.stick.name)!;
    // Nog crossing rule (verified 2026-05-01 against HG260044 LBW CSV):
    //   - If nog passes THROUGH stud (nog.xMin < stud.xMin AND nog.xMax > stud.xMax)
    //     → SWAGE (stiffening rib, no cut). Interior wall crossings.
    //   - If nog TERMINATES at this stud (nog.xMin or xMax falls inside stud's
    //     X footprint) → LIP NOTCH. Edge studs where nog butts into stud.
    // Both cases also emit InnerDimple inside the cut.
    for (const nog of nogs) {
      const xOverlap = nog.box.xMax >= stud.box.xMin && nog.box.xMin <= stud.box.xMax;
      if (!xOverlap) continue;
      const crossingY = nog.box.cy;
      if (crossingY < stud.box.yMin - 1 || crossingY > stud.box.yMax + 1) continue;
      const localPos = studLocalPosition(stud, crossingY);
      if (localPos < 50) continue;
      if (localPos > stud.stick.length - 50) continue;

      const nogWidth = nog.box.yMax - nog.box.yMin;
      const lipSpan = Math.max(45, nogWidth + 4);
      const startPos = localPos - lipSpan / 2;
      const endPos = startPos + lipSpan;

      // Decide Swage vs LipNotch by termination geometry
      const nogPassesThrough = nog.box.xMin < stud.box.xMin - 1 && nog.box.xMax > stud.box.xMax + 1;
      const opType: "Swage" | "LipNotch" = nogPassesThrough ? "Swage" : "LipNotch";

      stickOps.push({ kind: "spanned", type: opType, startPos: round(startPos), endPos: round(endPos) });
      stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
    }
    // Other horizontal members → LIP NOTCH
    for (const h of otherHorizontal) {
      const xOverlap = h.box.xMax >= stud.box.xMin && h.box.xMin <= stud.box.xMax;
      if (!xOverlap) continue;
      const crossingY = h.box.cy;
      if (crossingY < stud.box.yMin - 1 || crossingY > stud.box.yMax + 1) continue;
      const localPos = studLocalPosition(stud, crossingY);
      if (localPos < 50) continue;
      if (localPos > stud.stick.length - 50) continue;

      const memberWidth = h.box.yMax - h.box.yMin;
      const lipSpan = Math.max(45, memberWidth + 4);
      const startPos = localPos - lipSpan / 2;
      const endPos = startPos + lipSpan;
      stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
      stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
    }
  }

  // Nogs: studs cross them; emit WEB+LIP NOTCH + DIMPLE
  for (const nog of nogs) {
    const stickOps = result.get(nog.stick.name)!;
    for (const stud of studs) {
      const yOverlap = stud.box.yMax >= nog.box.yMin && stud.box.yMin <= nog.box.yMax;
      if (!yOverlap) continue;
      const crossingX = stud.box.cx;
      if (crossingX < nog.box.xMin - 1 || crossingX > nog.box.xMax + 1) continue;
      const localPos = plateLocalPosition(nog, crossingX);
      if (localPos < 50) continue;
      if (localPos > nog.stick.length - 50) continue;

      const studWidth = stud.box.xMax - stud.box.xMin;
      const lipSpan = Math.max(45, studWidth + 4);
      const startPos = localPos - lipSpan / 2;
      const endPos = startPos + lipSpan;

      stickOps.push({ kind: "spanned", type: "InnerNotch", startPos: round(startPos), endPos: round(endPos) });
      stickOps.push({ kind: "spanned", type: "LipNotch", startPos: round(startPos), endPos: round(endPos) });
      stickOps.push({ kind: "point", type: "InnerDimple", pos: round(startPos + 22.5) });
    }
  }

  return result;
}

function round(n: number): number { return Math.round(n * 10000) / 10000; }

/**
 * Mutates `stickOps` in-place: merges any LipNotch ops whose endPos is within
 * `gap` mm of the next LipNotch's startPos into a single wider notch.
 *
 * Detailer's behaviour (verified 2026-05-01 against HG260044 GF-TIN PC7-1/B1):
 * adjacent W crossings on a chord get joined into one continuous notch rather
 * than multiple narrow notches. E.g. 3 webs at x=70, 130, 190 with 45mm
 * individual spans → one 156mm-wide notch from 47..213 instead of 3 separate.
 *
 * Other op types (Dimple, Swage, etc.) are untouched.
 */
function joinAdjacentLipNotches(stickOps: RfyToolingOp[], gap: number): void {
  // Pull out LipNotches, sort by startPos, merge runs.
  const lipNotches: { idx: number; startPos: number; endPos: number }[] = [];
  for (let i = 0; i < stickOps.length; i++) {
    const op = stickOps[i];
    if (op && op.kind === "spanned" && op.type === "LipNotch") {
      lipNotches.push({ idx: i, startPos: op.startPos, endPos: op.endPos });
    }
  }
  if (lipNotches.length < 2) return;

  lipNotches.sort((a, b) => a.startPos - b.startPos);

  // Build merged ranges
  const merged: { startPos: number; endPos: number }[] = [];
  for (const ln of lipNotches) {
    const last = merged[merged.length - 1];
    if (last && ln.startPos <= last.endPos + gap) {
      last.endPos = Math.max(last.endPos, ln.endPos);
    } else {
      merged.push({ startPos: ln.startPos, endPos: ln.endPos });
    }
  }

  // If no actual merging happened (every notch separate), bail
  if (merged.length === lipNotches.length) return;

  // Remove all original LipNotches (highest index first to preserve lower indices)
  const indices = lipNotches.map(ln => ln.idx).sort((a, b) => b - a);
  for (const i of indices) stickOps.splice(i, 1);

  // Append merged notches
  for (const m of merged) {
    stickOps.push({
      kind: "spanned", type: "LipNotch",
      startPos: round(m.startPos), endPos: round(m.endPos),
    });
  }
}
