/**
 * Frame-context PASS that walks crossings via the ActionDefsManager rule
 * dictionary (the 27-section, 346-slot table extracted from Tooling.dll).
 *
 * This is the NEW PATH that supplements (does NOT replace) the legacy
 * crossings logic in `frame-context.ts`. It runs first; for sticks where it
 * fires, the legacy path skips the corresponding ops. For sticks where it
 * doesn't fire (or where the classifier returns "None" / a section we can't
 * resolve), the legacy path handles them as before.
 *
 * Gated by env flag `CODEC_USE_ACTION_DEFS=1`. Default OFF on first commit
 * so we can A/B test parity before flipping the default.
 *
 * Wire-up:
 *
 *   const result = runActionDefsPass(layout, machineSetup, planType);
 *   for (const [stickName, info] of result.entries()) {
 *     if (info.handled) {
 *       // append info.ops to the stick's tooling array
 *       // mark the legacy crossings code to skip this stick
 *     }
 *   }
 */
import type { RfyToolingOp } from "../format.js";
import { type JointClassification } from "./classify-joint.js";
import { type FrameFlags } from "./frame-flags.js";
import type { StickWithBox } from "./frame-context.js";
import type { MachineSetup } from "../machine-setups.js";
export interface ActionDefsPassInfo {
    /** Did the new path emit ops for this stick (i.e. legacy code should skip
     *  it)? false = pass-through to legacy. */
    handled: boolean;
    /** The ops the new path emitted (may be empty even when handled=true if
     *  the section's matching alternative was the `null` no-op fallback). */
    ops: RfyToolingOp[];
    /** Classifier name for debugging. */
    classification?: JointClassification;
    /** Trace lines from the emit. */
    trace?: string;
}
export interface ActionDefsPassConfig {
    /** Env flag value. When false, the pass is a no-op. */
    enabled: boolean;
    /** Resolved machine setup — used for span / clearance defaults. */
    setup: MachineSetup;
    /** Optional: derived FrameFlags. If absent, derived from planName. */
    frameFlags?: FrameFlags;
    /** Plan name (e.g. "GF-LBW-89.075") — used to derive FrameFlags. */
    planName?: string;
}
/** Whether the action-defs pass is enabled for the current run. Reads
 *  CODEC_USE_ACTION_DEFS env var. */
export declare function isActionDefsPassEnabled(): boolean;
/**
 * Run the action-defs pass over a frame's crossings. Returns a per-stick
 * map: name → handled+ops+trace.
 *
 * The legacy `frame-context.ts` engine should consult this map BEFORE its
 * crossings loop and skip any stick where `handled === true`.
 */
export declare function runActionDefsPass(layout: StickWithBox[], config: ActionDefsPassConfig): Map<string, ActionDefsPassInfo>;
/** Empty pass result — used when the env flag is off (legacy path runs alone). */
export declare function emptyActionDefsPass(layout: StickWithBox[]): Map<string, ActionDefsPassInfo>;
