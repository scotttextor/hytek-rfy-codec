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
// ---------------------------------------------------------------------------
// Loader — singleton-cached, path-portable
// ---------------------------------------------------------------------------
let _cachedDefs = null;
function loadDefsFile() {
    if (_cachedDefs)
        return _cachedDefs;
    // Try a small fallback chain so the file resolves whether the codec is run
    // from `src/` (vitest), `dist/` (bundled package), or via `npx` (cwd).
    const here = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        join(here, "action-defs.json"), // dist/rules/action-defs.json (bundled)
        join(here, "..", "..", "src", "rules", "action-defs.json"), // src adjacent to dist
        join(here, "..", "src", "rules", "action-defs.json"),
        join(process.cwd(), "src", "rules", "action-defs.json"),
        join(process.cwd(), "dist", "rules", "action-defs.json"),
    ];
    let lastErr = null;
    for (const p of candidates) {
        try {
            const raw = readFileSync(p, "utf-8");
            const parsed = JSON.parse(raw);
            if (parsed && parsed.sections) {
                _cachedDefs = parsed;
                return parsed;
            }
        }
        catch (e) {
            lastErr = e;
        }
    }
    throw new Error(`action-defs.json not found in any of: ${candidates.join(", ")}. Last error: ${String(lastErr)}`);
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/** Get the section for a classifier name, or `undefined` if absent
 *  (e.g. the `"None"` sentinel — Detailer emits no ops). */
export function getActionSection(name) {
    const defs = loadDefsFile();
    if (name === "None")
        return undefined;
    return defs.sections[name];
}
/** All section names present in the dictionary (27 entries — matches the
 *  28-name classifier minus the `None` sentinel). */
export function listSectionNames() {
    return Object.keys(loadDefsFile().sections);
}
/** Force-load the JSON. Useful for tests + warm-up; otherwise the loader is
 *  invoked lazily on first `getActionSection` call. */
export function preloadActionDefs() {
    return loadDefsFile();
}
// ---------------------------------------------------------------------------
// Helpers exposed for unit tests + condition-eval
// ---------------------------------------------------------------------------
/** Set of all known condition tokens — used by condition-eval to validate input. */
export const KNOWN_CONDITIONS = new Set([
    "ee", "we", "le", "el", "ew",
    "mh", "nmh",
    "is90", "lt90", "gt90",
    "box_l", "box_r",
    "t_tchord", "b_tchord", "t_bchord",
    "rl_e", "rl_lf", "rl_rf",
    "ll_e", "ll_lf", "ll_rf",
]);
/** Set of all known action verbs — used by action-emit to validate input. */
export const KNOWN_VERBS = new Set([
    "lipnotch", "swage", "webnotch",
    "rightflange", "leftflange",
    "rightpartialflange", "leftpartialflange",
    "tab", "WebTabHoles",
    "null", "bad",
    "rl_lipnotch", "ll_lipnotch",
    "rh_lipnotch", "lh_lipnotch",
]);
