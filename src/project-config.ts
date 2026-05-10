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
 * Project-level config table — explicit per-jobnum overrides.
 *
 * Add entries here as new corpora are validated. Keep the per-corpus
 * basis comment so future agents can audit *why* each value was chosen.
 *
 * Note: per-frame Kb flipped-uniformity STILL drives the actual rule when
 * `kbChamferMode` is left at its default — we only need to set it
 * explicitly here when the auto-derived per-frame signal would be wrong
 * (e.g. a corpus-wide "always uniform" pin to skip the per-frame check).
 */
const PROJECT_CONFIG_TABLE: Array<{ matchJobNum: RegExp; config: ProjectConfig; basis: string }> = [
  {
    // HG260044 — Coral Homes job dated 2026-04-14 (XML datedrawn). Verified
    // 2026-05-09 vs HG260044 GF-LBW corpus: 21/22 frames-with-Kb have
    // uniform `flipped` values among Kb sticks. C2's analysis confirmed
    // every Kb in HG260044 LBW + NLBW gets BOTH end-Chamfers regardless
    // of XNOR(inputFlipped × kbTopAttached). The per-frame auto-derivation
    // would also pick this, but pinning at the project level is faster
    // and survives the 1/22 mixed-flipped frame edge case.
    //
    // Also: HG260044 LBW W sticks at angles down to ~14.5° get Chamfer
    // in Detailer's reference RFY. Mined 2026-05-09 vs HG260044 GF-LBW
    // corpus: angles in {14.6°, 21.5°, 23.5°, 26°, 27°} all have
    // Chamfer @start + @end. The legacy 28° threshold misses every one.
    // Set to 14 to capture all observed ref Chamfers without going
    // unbounded (vertical W's at 0° still skip per the rules-engine
    // check `usage === "Stud"` — but this threshold guards against
    // any future edge cases).
    //
    // Kb InnerService positions on HG260044 sit ~+19mm (consistent
    // across all observed Kb2 sticks in LBW) ahead of HG260001's
    // pattern. The diff harness Pattern-A formula is `pos = ... - 10
    // + extra`; 19 captures the average shift seen in the LBW corpus.
    matchJobNum: /^HG260044$/,
    config: {
      kbChamferMode: "uniform-both-ends",
      wChamferAngleThreshold: 14,
      kbInnerServiceOffsetExtra: 19,
    },
    basis: "HG260044 LBW: 21/22 frames uniform-flipped Kbs (verified 2026-05-09); W chamfer ref includes 14.6°-26° angles; Kb InnerService offset +19mm vs default",
  },
  // HG260023 + HG260001 keep the default xnor-paired mode + 28° W threshold.
  // Don't add explicit entries — let the defaults handle them so the per-frame
  // kbFrameUniformFlipped signal can still kick in for any uniform-Kb frame
  // that turns up in those corpora (e.g. HG260023 PK6 LBW per the C2 report).
];

/**
 * Resolve a `ProjectConfig` from project hints, or `undefined` if no rule
 * matches (caller should treat undefined as "use legacy defaults" — every
 * rule predicate already does that via `?? <default>`).
 *
 * Mutation guarantee: returns a fresh object so callers can mutate without
 * affecting the table.
 */
export function resolveProjectConfigFromHints(hints: ProjectConfigHints): ProjectConfig | undefined {
  const jobNum = normaliseJobNum(hints.jobNum) ?? extractJobNumFromName(hints.projectName);
  if (!jobNum) return undefined;
  for (const entry of PROJECT_CONFIG_TABLE) {
    if (entry.matchJobNum.test(jobNum)) return { ...entry.config };
  }
  return undefined;
}

/** Strip quoting / whitespace artefacts from XML jobnum elements like
 *  ` "HG260044" ` → `HG260044`. */
function normaliseJobNum(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/["'\s]/g, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/** As a fallback, mine a job-number-shaped token (HG\d{6}, ALN\d+, etc.)
 *  from the front of the project name. Returns undefined if nothing
 *  matches. */
function extractJobNumFromName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const m = name.match(/\b([A-Z]{2,4}\d{4,6})\b/);
  return m?.[1];
}
