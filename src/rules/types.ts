/**
 * Tooling-rule engine — types.
 *
 * The rule engine takes a stick description (role, profile, length, frame
 * context) and produces the list of tooling operations Detailer would
 * place on it.
 *
 * Rules are derived statistically from real Detailer outputs (see
 * research/output/rules-derived.txt) and encoded as data here.
 */
import type { RfyToolingOp, ToolType } from "../format.js";

/** What we know about the stick when applying rules. */
export interface StickContext {
  /** Role inferred from stick name prefix (e.g. "S", "T", "B", "N", "Kb", "W"). */
  role: string;
  /** Stick length in mm. */
  length: number;
  /** Profile family — "70S41", "89S41", "150S41", etc. (gauge stripped). */
  profileFamily: string;
  /** Profile gauge (e.g. "0.75", "0.95"). */
  gauge: string;
  /** Whether the stick is flipped (LEFT in CSV). Affects which flange. */
  flipped: boolean;

  /** Optional: containing frame's length / height. */
  frameLength?: number;
  frameHeight?: number;
  /** Optional: containing frame's name (e.g. "N28"). */
  frameName?: string;
  /** Optional: usage from framecad_import.xml (e.g. "topplate"). */
  usage?: string;
  /** Optional: pack/plan name (e.g. "PK1-GF-NLBW-70.075") — useful for plan-type-specific rules. */
  planName?: string;
  /** Optional: full stick name (e.g. "B1", "B2", "Kb1"). Lets predicates
   *  distinguish primary plates (B1) from secondary plates (B2/B3). */
  stickName?: string;
}

/**
 * A position generator. Yields op positions for a given context.
 * - "endAnchored": pos = length - offset
 * - "startAnchored": pos = offset
 * - "centred": pos = length / 2 + offset
 * - "spaced": evenly spaced from start, with first at firstOffset and gap = spacing
 *   (yields max k positions where k*spacing + firstOffset <= length - lastOffset)
 */
export type Anchor =
  | { kind: "startAnchored"; offset: number }
  | { kind: "endAnchored"; offset: number }
  | { kind: "centred"; offset?: number }
  | { kind: "fraction"; fraction: number }   // pos = length * fraction
  | { kind: "spaced"; firstOffset: number; spacing: number; lastOffset: number };

/** A single op-placement rule. */
export interface OpRule {
  /** Tool type to emit. */
  toolType: ToolType;
  /** Tool kind: point / spanned / start / end. */
  kind: "point" | "spanned" | "start" | "end";
  /** Where to place it. For spanned, this is the start. */
  anchor: Anchor;
  /** For spanned tools: span length (added to start to get end). */
  spanLength?: number;
  /** Confidence of this rule from corpus analysis. */
  confidence: "high" | "medium" | "low";
  /** Optional predicate — rule only fires if this returns true. */
  predicate?: (ctx: StickContext) => boolean;
  /** Source observation: e.g. "S on 70S41 — 1500-3000  (fixture: 100% of 523 sticks)" */
  notes?: string;
}

/** Group of rules that apply to a particular stick group. */
export interface RuleGroup {
  /** Stick role pattern (regex on role prefix, e.g. /^S$/). */
  rolePattern: RegExp;
  /** Profile family pattern (e.g. /^70S41$/). */
  profilePattern: RegExp;
  /** Length range: [min, max] inclusive on min, exclusive on max. */
  lengthRange: [number, number];
  /** Rules to apply to sticks in this group. */
  rules: OpRule[];
}

/** Rule application result with debugging trace. */
export interface RuleApplicationResult {
  ops: RfyToolingOp[];
  matchedGroup?: RuleGroup;
  trace: string[];
}
