/**
 * Project-level Detailer configuration resolution.
 *
 * Two prior agents (C2 + SVC, 2026-05-09) hit the same wall: the Chamfer
 * @end and Kb-InnerService rules verified on HG260001 LBW over-emit on
 * HG260023 PK6 LBW (uniform-flipped Kbs) and under-emit on HG260044 LBW +
 * NLBW (also uniform-flipped Kbs). The discriminator is **per-frame** —
 * frames with all-Kbs-flipped-the-same-way emit BOTH end-Chamfers
 * regardless of `inputFlipped`, while frames with mixed-flipped Kbs use
 * the XNOR rule.
 *
 * That per-frame signal is computed by the diff harness / production
 * importer; this file resolves the **project-level** config from the
 * easily-available signals (jobnum / project name) so callers don't have
 * to hand-pin the config for every job.
 *
 * The mapping is intentionally conservative: only jobnums we have
 * verified reference data for get a non-default config. Unknown projects
 * keep the legacy defaults (xnor-paired Kb chamfer + 28° W threshold +
 * zero InnerService offset), which preserves existing parity for every
 * project not in the table.
 *
 * To override per-job: pass `projectConfig` explicitly through
 * `SynthesizePlansOptions`. The hint resolution is only applied when the
 * caller leaves `projectConfig` undefined.
 */
import type { ProjectConfig } from "./rules/types.js";
/**
 * Hints the resolver uses to pick a config. Every field is optional —
 * fall back to legacy defaults when nothing matches.
 */
export interface ProjectConfigHints {
    /** Job number string from the input XML (e.g. "HG260044"). Whitespace and
     *  surrounding quotes are stripped automatically. */
    jobNum?: string;
    /** Project name (XML root `name` attribute) — used as a backup when
     *  `jobNum` is missing. */
    projectName?: string;
}
/**
 * Resolve a `ProjectConfig` from project hints, or `undefined` if no rule
 * matches (caller should treat undefined as "use legacy defaults" — every
 * rule predicate already does that via `?? <default>`).
 *
 * Mutation guarantee: returns a fresh object so callers can mutate without
 * affecting the table.
 */
export declare function resolveProjectConfigFromHints(hints: ProjectConfigHints): ProjectConfig | undefined;
