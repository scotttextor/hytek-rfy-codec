import type { JointClassification } from "./classify-joint.js";
/** A single condition token. The 21 tokens mined out of the dictionary. */
export type Condition = "ee" | "we" | "le" | "el" | "ew" | "mh" | "nmh" | "is90" | "lt90" | "gt90" | "box_l" | "box_r" | "t_tchord" | "b_tchord" | "t_bchord" | "rl_e" | "rl_lf" | "rl_rf" | "ll_e" | "ll_lf" | "ll_rf";
/** A single action verb. The 16 verbs mined out of the dictionary. */
export type ActionVerb = "lipnotch" | "swage" | "webnotch" | "rightflange" | "leftflange" | "rightpartialflange" | "leftpartialflange" | "tab" | "WebTabHoles" | "null" | "bad" | "rl_lipnotch" | "ll_lipnotch" | "rh_lipnotch" | "lh_lipnotch";
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
/** Get the section for a classifier name, or `undefined` if absent
 *  (e.g. the `"None"` sentinel — Detailer emits no ops). */
export declare function getActionSection(name: JointClassification | string): ActionSection | undefined;
/** All section names present in the dictionary (27 entries — matches the
 *  28-name classifier minus the `None` sentinel). */
export declare function listSectionNames(): string[];
/** Force-load the JSON. Useful for tests + warm-up; otherwise the loader is
 *  invoked lazily on first `getActionSection` call. */
export declare function preloadActionDefs(): ActionDefsFile;
/** Set of all known condition tokens — used by condition-eval to validate input. */
export declare const KNOWN_CONDITIONS: Set<Condition>;
/** Set of all known action verbs — used by action-emit to validate input. */
export declare const KNOWN_VERBS: Set<ActionVerb>;
export {};
