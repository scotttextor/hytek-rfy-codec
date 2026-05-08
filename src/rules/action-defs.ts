/**
 * ActionDefsManager — TypeScript loader for the rule dictionary extracted
 * from FrameCAD Detailer's `Tooling.dll` (`.rdata` section).
 *
 * Source: `docs/jailbreak/parsed/action-defs.json` (760 KB) — 27 named
 * sections × 16 edge-mask slots × N alternative `<conditions>:<actions>`
 * tuples. Mirrors Detailer's `DAT_005968d0` → `TObjectDictionary<string,
 * TToolActionSection>` lookup keyed by `JointClassification` name.
 *
 * Architecture (per `docs/detailer-rule-decoded.md` §1):
 *   1. classifier returns a name string ("OnFlat - Standard", "OnEdge -
 *      LipNotchedStandard", etc.)
 *   2. lookup `ActionDefsManager[name]` → `ActionSection`
 *   3. compute `edge_mask` (0..15) from the 4 edge-touch booleans
 *   4. walk `section.slots[edge_mask].alternatives` — first matching
 *      `conditions` clause wins; emit its `ops`.
 *
 * Grammar (raw):
 *   <slot>           ::= <alternative> ('|' <alternative>)*
 *   <alternative>    ::= [<conditions> ':'] <ops>      (conditions optional → fallback)
 *   <conditions>     ::= <token> ('&' <token>)*
 *   <ops>            ::= <op> (',' <op>)*
 *   <op>             ::= <verb> '@' <src> <rel> <dst>
 *   <rel>            ::= '-' | '>'                     ('>' = "less-than" relation)
 *
 * NOTE: Loading: we use `readFileSync` so the codec works whether the JSON
 * is bundled (Vercel) or sits alongside the .ts at runtime (vitest).
 * Fallback chain handles dist/ → src/ → cwd.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import type { JointClassification } from "./classify-joint.js";

// ---------------------------------------------------------------------------
// Public types — match the JSON shape produced by `extract_action_defs.py`
// ---------------------------------------------------------------------------

/** A single condition token. The 21 tokens mined out of the dictionary. */
export type Condition =
  // Edge / corner identity
  | "ee"   // both edges (default fallback "every edge")
  | "we"   // web-edge crossing on connector
  | "le"   // lip-edge crossing on connector
  | "el"   // edge-lip on connectee
  | "ew"   // edge-web on connectee
  // Web-angle / multi-hit
  | "mh"   // multi-hit (multiple intersection points)
  | "nmh"  // not multi-hit
  | "is90" // web angle is 90°
  | "lt90" // web angle < 90°
  | "gt90" // web angle > 90°
  // Box flags (drawn from Detailer's RFrameObjectIntersections record)
  | "box_l"  // left box
  | "box_r"  // right box
  // Top-/bottom-chord pairing
  | "t_tchord"  // top stick is TopChord
  | "b_tchord"  // bottom stick is TopChord
  | "t_bchord"  // top stick is BottomChord
  // Lip flange intersection states (only used in OnEdge LipNotched* group)
  | "rl_e"  // right-lip edge
  | "rl_lf" // right-lip on left-flange
  | "rl_rf" // right-lip on right-flange
  | "ll_e"  // left-lip edge
  | "ll_lf" // left-lip on left-flange
  | "ll_rf" // left-lip on right-flange
  ;

/** A single action verb. The 16 verbs mined out of the dictionary. */
export type ActionVerb =
  | "lipnotch"
  | "swage"
  | "webnotch"
  | "rightflange"
  | "leftflange"
  | "rightpartialflange"
  | "leftpartialflange"
  | "tab"
  | "WebTabHoles"
  | "null"             // emit nothing (explicit "no-op")
  | "bad"              // emit error sentinel
  | "rl_lipnotch"      // right-lip lipnotch (OnEdge variants)
  | "ll_lipnotch"      // left-lip lipnotch
  | "rh_lipnotch"      // right-half lipnotch
  | "lh_lipnotch"      // left-half lipnotch
  ;

/** Single op record produced by the parser. */
export interface ActionOp {
  /** The verb (one of `ActionVerb`). */
  action: string;
  /** Source position token (e.g. "ww", "wend", "rl_rf"). */
  src: string;
  /** Relation: `-` for plain pair, `>` for "greater-than" / "less-than" relation. */
  rel: "-" | ">";
  /** Destination position token (e.g. "wend", "lend"). */
  dst: string;
  /** Original string (for debugging / error messages). */
  raw: string;
}

/** A single conditional alternative within a slot. */
export interface ActionAlternative {
  /** Conjunction of conditions (AND-ed). Empty array = fallback (always fires). */
  conditions: Condition[];
  /** Ops emitted when conditions match. */
  ops: ActionOp[];
  /** Original string. */
  raw: string;
}

/** A single edge-mask slot (0..15) in the section. */
export interface ActionSlot {
  /** 0..15 — combination of LL/LW/WL/WW edge-touch bits (FUN_00545694). */
  slot_index: number;
  /** Original raw string before parsing. */
  raw: string;
  /** Alternatives walked in order; first matching clause wins. */
  alternatives: ActionAlternative[];
}

/** A complete section (one classifier name → 16 slots). */
export interface ActionSection {
  /** Number of slots (always 16 from extraction). */
  slot_count: number;
  /** 16 entries (slot_index 0..15). */
  slots: ActionSlot[];
}

interface ActionDefsFile {
  _meta?: unknown;
  sections: Record<string, ActionSection>;
}

// ---------------------------------------------------------------------------
// Loader — singleton-cached, path-portable
// ---------------------------------------------------------------------------

let _cachedDefs: ActionDefsFile | null = null;

function loadDefsFile(): ActionDefsFile {
  if (_cachedDefs) return _cachedDefs;
  // Try a small fallback chain so the file resolves whether the codec is run
  // from `src/` (vitest), `dist/` (bundled package), or via `npx` (cwd).
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "action-defs.json"),                  // dist/rules/action-defs.json (bundled)
    join(here, "..", "..", "src", "rules", "action-defs.json"),  // src adjacent to dist
    join(here, "..", "src", "rules", "action-defs.json"),
    join(process.cwd(), "src", "rules", "action-defs.json"),
    join(process.cwd(), "dist", "rules", "action-defs.json"),
  ];
  let lastErr: unknown = null;
  for (const p of candidates) {
    try {
      const raw = readFileSync(p, "utf-8");
      const parsed = JSON.parse(raw) as ActionDefsFile;
      if (parsed && parsed.sections) {
        _cachedDefs = parsed;
        return parsed;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `action-defs.json not found in any of: ${candidates.join(", ")}. Last error: ${String(lastErr)}`,
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Get the section for a classifier name, or `undefined` if absent
 *  (e.g. the `"None"` sentinel — Detailer emits no ops). */
export function getActionSection(name: JointClassification | string): ActionSection | undefined {
  const defs = loadDefsFile();
  if (name === "None") return undefined;
  return defs.sections[name];
}

/** All section names present in the dictionary (27 entries — matches the
 *  28-name classifier minus the `None` sentinel). */
export function listSectionNames(): string[] {
  return Object.keys(loadDefsFile().sections);
}

/** Force-load the JSON. Useful for tests + warm-up; otherwise the loader is
 *  invoked lazily on first `getActionSection` call. */
export function preloadActionDefs(): ActionDefsFile {
  return loadDefsFile();
}

// ---------------------------------------------------------------------------
// Helpers exposed for unit tests + condition-eval
// ---------------------------------------------------------------------------

/** Set of all known condition tokens — used by condition-eval to validate input. */
export const KNOWN_CONDITIONS = new Set<Condition>([
  "ee", "we", "le", "el", "ew",
  "mh", "nmh",
  "is90", "lt90", "gt90",
  "box_l", "box_r",
  "t_tchord", "b_tchord", "t_bchord",
  "rl_e", "rl_lf", "rl_rf",
  "ll_e", "ll_lf", "ll_rf",
]);

/** Set of all known action verbs — used by action-emit to validate input. */
export const KNOWN_VERBS = new Set<ActionVerb>([
  "lipnotch", "swage", "webnotch",
  "rightflange", "leftflange",
  "rightpartialflange", "leftpartialflange",
  "tab", "WebTabHoles",
  "null", "bad",
  "rl_lipnotch", "ll_lipnotch",
  "rh_lipnotch", "lh_lipnotch",
]);
