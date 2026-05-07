"""Render one PDF per Not-100% rule, showing a representative stick with
codec-emit ops above the stick and Detailer-reference ops below — with
extras (codec emits but Detailer doesn't) and missing (Detailer wants but
codec doesn't) marked in red.

Output: docs/rule-pdfs/rule-NN.pdf
Plus:   docs/rule-pdfs/_index.json mapping rule# -> pdf path
"""
from __future__ import annotations
import json, os, re, sys, traceback
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, FancyBboxPatch
from matplotlib.lines import Line2D

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "scripts" / "baselines" / "raw-y-pairs"
OUT = Path(__file__).resolve().parent / "rule-pdfs"
OUT.mkdir(exist_ok=True)

# Per-rule example: (jobnum, plan_name, frame_name, stick_name, headline)
# headline = the specific issue I want this PDF to illustrate.
EXAMPLES = {
    5: ("HG260001", "GF-LBW-70.075", "L4", "S11", "Service hole @296 — emitted on every wall stud, but Detailer is selective about WHICH studs."),
    6: ("HG260001", "GF-LBW-70.075", "PK1-L1", "S1", "Same selective behaviour as #5 — paired hole at 446."),
    7: ("HG260001", "GF-LBW-70.075", "PK1-L1", "S1", "Web access holes emitted by post-process — count/spacing not corpus-verified."),
    8: ("HG260012", "TH01-GF-LBW-89.075", "L1101", "S1", "89mm wall stud — same 39/16.5 pattern copied from 70mm. Confirm or correct."),
    12: ("HG260001", "GF-LBW-70.075", "PK4-L4", "Kb1", "Kb end-Swage span = 45/cos(angle from horizontal). Curve fit, not a HYTEK constant."),
    14: ("HG260012", "TH01-GF-LBW-89.075", "L1001", "Kb1", "89mm Kb pattern copied from 70mm. Confirm or correct."),
    15: ("HG260001", "GF-LBW-70.075", "PK4-L4", "H1", "H end-Swage 43mm rule — possibly dead code (the HEADER_ROLES rule always wins)."),
    19: ("HG260001", "GF-LBW-70.075", "PK4-L4", "T2", "Short T sub-plate above header — paired Dimple@58.5 LBW only. Why LBW-only?"),
    20: ("HG260001", "GF-LBW-70.075", "PK4-L4", "T2", "Mirror of #19 at the end — same LBW-only question."),
    28: ("HG260001", "GF-LBW-70.075", "PK4-L4", "T1", "Long T plate — InnerNotch DELIBERATELY DISABLED (100 extras vs 12 matches)."),
    29: ("HG260001", "GF-LBW-70.075", "PK4-L4", "T1", "Long T plate — InnerService DELIBERATELY DISABLED (256 extras vs 14 missing)."),
    30: ("HG260012", "TH01-GF-LBW-89.075", "L1101", "T1", "89mm long T plate — pattern copied from 70mm."),
    32: ("HG260001", "GF-LBW-70.075", "PK1-N1", "B1", "Web@8 (slab wiring) — only on primary B + GF + LBW/NLBW. Confirm gates."),
    33: ("HG260001", "GF-LBW-70.075", "PK1-N1", "B1", "Same as #32 — but rule #33 is a Yes (the dimple). Skipping."),
    34: ("HG260001", "GF-LBW-70.075", "PK1-N1", "B1", "Bolt@62 (slab anchor) — same gates as Web@8. Where does 62mm come from?"),
    36: ("HG260001", "GF-LBW-70.075", "PK1-N1", "B1", "Mirror of #34 at the end (length-62)."),
    38: ("HG260044", "GF-NLBW-89.075", "PK1-N1", "B1", "89mm B with gauge<1.0 gate — single-corpus. Do thicker plates skip slab bolts?"),
    42: ("HG260001", "GF-NLBW-70.075", "PK1-N14", "B1", "NLBW raised B (Bh) — gets slab anchors. LBW raised B doesn't. Why?"),
    43: ("HG260001", "GF-NLBW-70.075", "PK1-N14", "B1", "Mirror of #42 at the end."),
    50: ("HG260012", "TH01-GF-LBW-89.075", "L1001", "N1", "89mm nogs — length-bucketed pattern copied from 70mm."),
    54: ("HG260001", "GF-LBW-70.075", "PK4-L4", "H1", "Full header — paired Dimple@58.5 LBW only. Same question as #19."),
    55: ("HG260001", "GF-LBW-70.075", "PK4-L4", "H1", "Mirror of #54 at the end."),
    59: ("HG260001", "GF-LBW-70.075", "PK4-L4", "H1", "Web stiffener holes on H1/H3 of paired-header frame. What makes a header 'paired'?"),
    60: ("HG260012", "TH01-GF-LBW-89.075", "L1001", "H1", "89mm header — paired 58.5 ALWAYS, regardless of LBW/NLBW. Is that real?"),
    61: ("HG260001", "GF-LBW-70.075", "PK4-L27", "W2", "Wall brace W chamfer threshold ~28° from vertical. Is that the actual rule?"),
    64: ("HG260001", "GF-LBW-70.075", "PK4-L27", "W2", "Wall brace W end-Swage = 39/cos(a) + 8*tan²(a). Curve fit, not derived."),
    66: ("HG260001", "GF-LBW-70.075", "PK4-L27", "W2", "Mirror of #61 at the end."),
    74: ("HG260012", "TH01-GF-LBW-89.075", "L1101", "L1", "89mm sill — paired Dimple@58.5 always. Why 89mm specifically?"),
    75: ("HG260012", "TH01-GF-LBW-89.075", "L1101", "L1", "Mirror of #74 at the end."),
    79: ("HG260001", "GF-LBW-70.075", "PK4-L33", "Br1", "Brace/Ribbon Swage 41 + Dimple 11 — single sample. Different from W?"),
    80: ("HG260001", "GF-LBW-70.075", "PK4-L33", "Br1", "Br/R InnerDimple at 11mm (vs 16.5 for studs)."),
    81: ("HG260001", "GF-LBW-70.075", "PK4-L33", "Br1", "Mirror of #79 at the end."),
    82: ("HG260001", "GF-LBW-70.075", "PK4-L33", "Br1", "Mirror of #80 at the end."),
    83: ("HG260002", "GF-RP-70.075", "R1", "T1", "Crossings on plate from stud — position usually right, tool TYPE drifts on RP."),
    84: ("HG260001", "GF-LBW-70.075", "PK4-L4", "S5", "Crossings on stud from nog — same kind of bleed."),
    85: ("HG260001", "GF-LBW-70.075", "PK4-L4", "N1", "Crossings on nog from stud — Web+LipNotch+Dimple combination."),
    86: ("HG250011", "GF-TIN-70.075", "PC1-1", "T2", "Truss panel-points NOT EMITTED. Worth +13pp on TIN. The bottom strip's red ops show every InnerDimple/LipNotch the codec is missing at each Web-stick projection."),
    87: ("HG260006", "GF-RP-70.075", "R1", "T1", "RP simplifier HURTS this case (33% → 69% if disabled). Stud-style caps not chord-style."),
    89: ("HG260001", "GF-TB2B-70.075", "L1", "T1", "TB2B simplifier — untested at scale. Show the cap pattern."),
    90: ("HG260043", "GF-RP-89.115", "R1", "T1", "Linear-truss simplifier — bolt-hole at every web crossing. 1-job tuning."),
    91: ("HG260010", "GF-LBW-70.075", "PK1-L2", "S1", "Wall service simplifier — over-emits ~40× on small jobs."),
}

# Color coding
C_OURS_OK = "#2E7D32"      # green — codec emits, ref also has it
C_OURS_EXTRA = "#C62828"   # red — codec emits, ref doesn't (extra)
C_REF_OK = "#2E7D32"       # green — ref has, codec also emits
C_REF_MISS = "#C62828"     # red — ref has, codec doesn't (missing)
C_STICK = "#FFCB05"        # HYTEK yellow — the stick body
C_STICK_BORDER = "#231F20" # HYTEK black


def parse_op(opstr: str):
    """Parse 'Swage 0.0..39.0' or 'InnerDimple @16.5' or 'Chamfer @start'/'@end'.
    Returns (toolType, kind, low, high) where kind in {span, point, end-anchored}.
    """
    m = re.match(r'^(\w+)\s+(.+)$', opstr.strip())
    if not m:
        return None
    typ, rest = m.group(1), m.group(2).strip()
    rng = re.match(r'^([\d.]+)\s*\.\.\s*([\d.]+)$', rest)
    if rng:
        return (typ, "span", float(rng.group(1)), float(rng.group(2)))
    pt = re.match(r'^@\s*([\d.]+)$', rest)
    if pt:
        return (typ, "point", float(pt.group(1)), None)
    se = re.match(r'^@\s*(start|end)$', rest)
    if se:
        return (typ, "anchor", se.group(1), None)
    return (typ, "unknown", rest, None)


def find_stick(diff_json: dict, frame_name: str, stick_name: str):
    by_frame = diff_json.get("byFrame", []) or []
    # Tolerate "PK1-L1" or "L1" — split on '-' and try both halves.
    fname_candidates = [frame_name]
    if "-" in frame_name:
        fname_candidates.append(frame_name.split("-", 1)[1])
        fname_candidates.append(frame_name.split("-", 1)[0])
    for frame in by_frame:
        if frame.get("name") in fname_candidates:
            for s in frame.get("sticks", []):
                if s.get("name") == stick_name:
                    return frame, s
    # Fallback: find the stick by name across all frames
    for frame in by_frame:
        for s in frame.get("sticks", []):
            if s.get("name") == stick_name:
                return frame, s
    return None, None


def render_pdf(rule_num: int, rule_text_short: str, headline: str, jobnum: str,
               plan_name: str, frame_name: str, stick_name: str, out_path: Path):
    diff_path = RAW / f"{jobnum}__{plan_name}.json"
    if not diff_path.exists():
        # Render an explanation page instead
        return render_unavailable(rule_num, rule_text_short, headline, jobnum, plan_name, frame_name, stick_name, out_path,
                                  reason=f"Diff JSON not found at {diff_path.name}")
    try:
        diff = json.loads(diff_path.read_text(encoding="utf-8"))
    except Exception as e:
        return render_unavailable(rule_num, rule_text_short, headline, jobnum, plan_name, frame_name, stick_name, out_path,
                                  reason=f"Could not load diff JSON: {e}")
    frame, stick = find_stick(diff, frame_name, stick_name)
    if stick is None:
        return render_unavailable(rule_num, rule_text_short, headline, jobnum, plan_name, frame_name, stick_name, out_path,
                                  reason=f"Stick {stick_name} not found in frame {frame_name} (or any frame in this plan)")

    extras = stick.get("extras", []) or []
    missing = stick.get("missing", []) or []
    matched = stick.get("matchedCount", 0)
    length = stick.get("oursLength") or stick.get("refLength") or 1000.0

    # Figure layout: BIG left margin (axes start at 0.18) so the strip-row
    # labels render fully without clipping. Strip labels live in figure
    # coordinates between 0.01 and 0.17.
    fig = plt.figure(figsize=(14, 8.5))

    ax_top = fig.add_axes([0.18, 0.55, 0.80, 0.22])
    ax_stick = fig.add_axes([0.18, 0.45, 0.80, 0.07])
    ax_bot = fig.add_axes([0.18, 0.22, 0.80, 0.22])
    ax_text = fig.add_axes([0.04, 0.02, 0.94, 0.16])
    ax_text.axis("off")

    # Figure-coordinate strip labels — independent of the data axes, never clipped
    fig.text(0.02, 0.66, "CODEC", fontsize=12, fontweight="bold", color="#C62828", ha="left")
    fig.text(0.02, 0.635, "EMITS", fontsize=12, fontweight="bold", color="#C62828", ha="left")
    fig.text(0.02, 0.61, "(extra)", fontsize=8, color="#666", ha="left", style="italic")
    fig.text(0.02, 0.585, "Detailer", fontsize=8, color="#666", ha="left", style="italic")
    fig.text(0.02, 0.565, "doesn't", fontsize=8, color="#666", ha="left", style="italic")
    fig.text(0.02, 0.545, "have these", fontsize=8, color="#666", ha="left", style="italic")

    fig.text(0.02, 0.36, "DETAILER", fontsize=12, fontweight="bold", color="#C62828", ha="left")
    fig.text(0.02, 0.335, "REF", fontsize=12, fontweight="bold", color="#C62828", ha="left")
    fig.text(0.02, 0.31, "(missing)", fontsize=8, color="#666", ha="left", style="italic")
    fig.text(0.02, 0.285, "codec", fontsize=8, color="#666", ha="left", style="italic")
    fig.text(0.02, 0.265, "should have", fontsize=8, color="#666", ha="left", style="italic")
    fig.text(0.02, 0.245, "emitted these", fontsize=8, color="#666", ha="left", style="italic")

    # Stick bar
    ax_stick.add_patch(Rectangle((0, 0.2), length, 0.6, facecolor=C_STICK, edgecolor=C_STICK_BORDER, linewidth=1.5))
    ax_stick.set_xlim(-length * 0.04, length * 1.04)
    ax_stick.set_ylim(0, 1)
    ax_stick.set_yticks([])
    ax_stick.set_xlabel(f"Position along stick (mm) — total length {length:.0f} mm", fontsize=9)
    ax_stick.text(0, 0.5, "start", ha="right", va="center", fontsize=8, color="#666", weight="bold")
    ax_stick.text(length, 0.5, "end", ha="left", va="center", fontsize=8, color="#666", weight="bold")

    def get_op_x(parsed, length):
        typ, kind, a, b = parsed
        if kind == "span": return (a + b) / 2
        if kind == "point": return a
        if kind == "anchor": return 0 if a == "start" else length
        return None

    def draw_ops_strip(ax, ops_list, label_main, label_sub, side="top"):
        """side='top' means strip is ABOVE the stick (codec emits).
        side='bottom' means strip is BELOW the stick (Detailer ref / missing)."""
        ax.set_xlim(-length * 0.04, length * 1.04)
        ax.set_ylim(0, 1)
        ax.set_yticks([])
        ax.set_xticks([])
        for sp in ("top", "right", "left", "bottom"):
            ax.spines[sp].set_visible(False)
        # (Strip labels are drawn in figure coords by the caller — see fig.text() block above.)
        # Suppress unused-arg warning by referencing them
        _ = (label_main, label_sub)

        # Sort ops left-to-right and assign stagger levels (4 lanes) by index
        # so labels don't overlap.
        op_xs = []
        for opstr in ops_list:
            parsed = parse_op(opstr)
            if parsed is None:
                continue
            x = get_op_x(parsed, length)
            if x is None:
                continue
            op_xs.append((x, opstr, parsed))
        op_xs.sort(key=lambda t: t[0])

        # 4 stagger lanes; the lane-Y depends on whether we're top or bottom strip
        # Top strip: ops sit between y=0.05 (near stick) and y=0.95 (label area)
        # Lanes for labels (top): 0.95, 0.78, 0.62, 0.45 (descending toward stick)
        # Bottom strip mirrored.
        if side == "top":
            lanes = [0.92, 0.74, 0.56, 0.38]
            stick_anchor_y = 0.0  # bottom of strip = next to stick
        else:
            lanes = [0.08, 0.26, 0.44, 0.62]
            stick_anchor_y = 1.0  # top of strip = next to stick

        for i, (x, opstr, parsed) in enumerate(op_xs):
            typ, kind, a, b = parsed
            lane_y = lanes[i % len(lanes)]
            color = "#C62828"  # always red — these are the "wrong" ops on this strip
            # Body of the op (rectangle for spans, vertical line for points/anchors)
            if kind == "span":
                bar_y = 0.10 if side == "top" else 0.78
                ax.add_patch(Rectangle((a, bar_y), b - a, 0.12,
                                       facecolor=color, alpha=0.45, edgecolor=color, linewidth=1.0))
                center_x = (a + b) / 2
                # Leader line from bar to label lane
                ax.plot([center_x, center_x], [bar_y + (0.12 if side == "top" else 0), lane_y - (0.02 if side == "top" else -0.02)],
                        color=color, linewidth=0.8, alpha=0.5)
                label_text = f"{typ} {a:.0f}..{b:.0f}"
            elif kind == "point":
                ax.plot([x, x], [stick_anchor_y, lane_y], color=color, linewidth=1.0, alpha=0.6)
                ax.scatter([x], [lane_y], color=color, s=20, zorder=3)
                label_text = f"{typ}@{x:.0f}"
            elif kind == "anchor":
                pos = 0 if a == "start" else length
                ax.plot([pos, pos], [stick_anchor_y, lane_y], color=color, linewidth=1.5, alpha=0.7)
                label_text = f"{typ} @{a}"
            else:
                continue

            # Background-boxed label so neighbours don't crash visually
            ax.text(x, lane_y, label_text,
                    ha="center", va="center", fontsize=7.5, color=color, weight="bold",
                    bbox=dict(facecolor="white", edgecolor=color, alpha=0.85,
                              boxstyle="round,pad=0.15", linewidth=0.5))

    # Identify matched ops by looking at the intersection of extras vs missing
    # (an op that appears in BOTH 'extras' and 'missing' is a near-miss; in the diff
    # JSON they're separated. The "matched" count gives us total. We don't have a
    # direct list of matched ops — they're implicit. So both strips display the
    # ops they have, all in the colour of their relationship to the other side.)
    extras_set = set(extras)
    missing_set = set(missing)

    draw_ops_strip(ax_top, extras, "CODEC EMITS", "(extra — Detailer doesn't have these)", side="top")
    draw_ops_strip(ax_bot, missing, "DETAILER REF", "(missing — codec should have emitted these)", side="bottom")

    # Title at very top
    fig.suptitle(
        f"Rule #{rule_num} — {rule_text_short}",
        fontsize=15, fontweight="bold", y=0.985
    )
    fig.text(0.10, 0.94, f"Example: {jobnum}  |  plan {plan_name}  |  frame {frame_name}  |  stick {stick_name}",
             fontsize=10, color="#444")
    fig.text(0.10, 0.91, headline, fontsize=9.5, color="#222", style="italic", wrap=True)

    # Bottom text — totals + headline
    ax_text.text(0.0, 1.0,
                 f"Stick totals on this example:",
                 fontsize=10, fontweight="bold", va="top")
    ax_text.text(0.0, 0.85,
                 f"  • Matched ops:    {matched}\n"
                 f"  • Extras (codec emits, Detailer doesn't):  {len(extras)}\n"
                 f"  • Missing (Detailer has, codec doesn't):   {len(missing)}",
                 fontsize=9, va="top", family="monospace")

    ax_text.text(0.0, 0.40,
                 "How to read:",
                 fontsize=10, fontweight="bold", va="top")
    ax_text.text(0.0, 0.30,
                 "  • Top strip = ops the CODEC currently emits but Detailer's reference doesn't have (red = wrong-emit).\n"
                 "  • Bottom strip = ops Detailer's reference has but the CODEC doesn't emit (red = miss).\n"
                 "  • The yellow bar in the middle = the stick body, drawn to scale.\n"
                 "  • Spans (Swage/LipNotch/InnerNotch) are coloured rectangles.\n"
                 "  • Points (InnerDimple/Bolt/Web) are vertical lines + dots.\n"
                 "  • Anchors (Chamfer @start/@end) are at the very ends.",
                 fontsize=8, va="top")

    fig.savefig(out_path, format="pdf")
    plt.close(fig)
    return True


def render_unavailable(rule_num, rule_text, headline, jobnum, plan, frame, stick, out_path, reason):
    fig = plt.figure(figsize=(11.5, 7.5))
    fig.text(0.5, 0.92, f"Rule #{rule_num} — {rule_text}", fontsize=14, fontweight="bold", ha="center")
    fig.text(0.5, 0.86, "Example data not available", fontsize=12, ha="center", color="#C62828", style="italic")
    fig.text(0.08, 0.74, "Cited example:", fontsize=10, fontweight="bold")
    fig.text(0.10, 0.70, f"Job: {jobnum}", fontsize=9, family="monospace")
    fig.text(0.10, 0.67, f"Plan: {plan}", fontsize=9, family="monospace")
    fig.text(0.10, 0.64, f"Frame: {frame}", fontsize=9, family="monospace")
    fig.text(0.10, 0.61, f"Stick: {stick}", fontsize=9, family="monospace")
    fig.text(0.08, 0.52, "Issue summary:", fontsize=10, fontweight="bold")
    fig.text(0.08, 0.48, headline, fontsize=10, wrap=True)
    fig.text(0.08, 0.30, "Why no diagram:", fontsize=10, fontweight="bold")
    fig.text(0.08, 0.26, reason, fontsize=9, color="#666")
    fig.text(0.08, 0.18, "What to do:", fontsize=10, fontweight="bold")
    fig.text(0.08, 0.14, "Open the .fcp link beside this rule in Detailer and navigate to the cited frame and stick.\nDescribe the correct rule in the 'Scott's correction' column of the spreadsheet.",
             fontsize=9, va="top")
    fig.savefig(out_path, format="pdf")
    plt.close(fig)
    return False


def main():
    # Quick rule-text-short lookup (mirrors the spreadsheet's "What we emit" column)
    rule_text_short = {
        5: "Wall stud service hole @296",
        6: "Wall stud service hole @446",
        7: "Wall stud web access holes (post-process)",
        8: "89mm wall stud — full pattern copied from 70mm",
        12: "Kb end-Swage = 45/cos(angle from horizontal)",
        14: "89mm Kb pattern copied from 70mm",
        15: "H end-Swage 43mm (cripple-role)",
        19: "Short T sub-plate — Dimple@58.5 LBW only (start)",
        20: "Short T sub-plate — Dimple@58.5 LBW only (end)",
        28: "Long T plate — InnerNotch DELIBERATELY NOT EMITTED",
        29: "Long T plate — InnerService DELIBERATELY NOT EMITTED",
        30: "89mm long T plate — copied from 70mm",
        32: "B plate Web@8 (slab wiring access) — gates uncertain",
        34: "B plate Bolt@62 (slab anchor) — 62mm offset undocumented",
        36: "B plate Bolt@length-62 — same gates as #34",
        38: "89mm B with gauge<1.0 gate",
        42: "Raised Bh — NLBW gets slab anchors, LBW doesn't",
        43: "Raised Bh end-Bolt — same NLBW-only gate",
        50: "89mm nogs — length-bucketed pattern from 70mm",
        54: "Header H paired Dimple@58.5 LBW only (start)",
        55: "Header H paired Dimple@58.5 LBW only (end)",
        59: "Header web stiffener holes — paired-header detection",
        60: "89mm header always paired 58.5",
        61: "Wall brace W chamfer — 28° threshold",
        64: "Wall brace W end-Swage = 39/cos(a) + 8*tan²(a)",
        66: "Wall brace W end chamfer — same 28° threshold",
        74: "89mm sill L paired Dimple@58.5 (start)",
        75: "89mm sill L paired Dimple@58.5 (end)",
        79: "Br/R Swage 41mm start — single sample",
        80: "Br/R Dimple at 11mm",
        81: "Br/R Swage 41mm end",
        82: "Br/R Dimple at length-11",
        83: "Crossings: plate gets notch from stud — tool type drifts",
        84: "Crossings: stud gets notch from nog",
        85: "Crossings: nog gets notches from stud",
        86: "Truss panel-points NOT EMITTED — biggest single gap",
        87: "RP simplifier — bimodal, hurts half the corpus",
        89: "TB2B simplifier — untested at scale",
        90: "Linear-truss simplifier — 1-job tuning",
        91: "Wall-service simplifier — bimodal",
    }

    # Optional --only flag for sample runs: --only 5,86
    only = None
    if "--only" in sys.argv:
        i = sys.argv.index("--only")
        only = set(int(x) for x in sys.argv[i + 1].split(","))

    index = {}
    success = 0
    fail = 0
    for rule_num, (job, plan, frame, stick, headline) in EXAMPLES.items():
        if only is not None and rule_num not in only:
            continue
        out_path = OUT / f"rule-{rule_num:02d}.pdf"
        text = rule_text_short.get(rule_num, f"Rule #{rule_num}")
        try:
            ok = render_pdf(rule_num, text, headline, job, plan, frame, stick, out_path)
            if ok:
                success += 1
            else:
                fail += 1
            index[rule_num] = str(out_path)
            print(f"[{rule_num:>2}] {'OK ' if ok else 'PARTIAL'} -> {out_path.name}")
        except Exception as e:
            traceback.print_exc()
            fail += 1
            print(f"[{rule_num:>2}] FAIL: {e}")

    (OUT / "_index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print(f"\nGenerated: {success} full diagrams, {fail} placeholder-only.")
    print(f"Output: {OUT}")


if __name__ == "__main__":
    main()
