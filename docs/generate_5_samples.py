"""Generate 5 reference samples for Scott's remaining questions.
Produces a single markdown document + a single PDF document.
"""
import json, os, math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIFF_DIR = ROOT / "scripts" / "baselines" / "raw-y-pairs"
LINKS_FILE = ROOT / "docs" / "rule-pdfs" / "_links.json"

with LINKS_FILE.open(encoding="utf-8") as f:
    LINKS = json.load(f)


def manuf_pdf_for(job: str, plan: str) -> str | None:
    return LINKS.get("manufacturing_pdf", {}).get(job, {}).get(plan)


def fcp_for(job: str) -> str | None:
    return LINKS.get("fcp", {}).get(job)


def get_stick(pair_id: str, frame_name: str, stick_name: str):
    f = DIFF_DIR / f"{pair_id}.json"
    if not f.exists():
        return None, None, None
    d = json.loads(f.read_text(encoding="utf-8"))
    for fr in d.get("byFrame", []):
        if fr.get("name") != frame_name:
            continue
        for s in fr.get("sticks", []):
            if s.get("name") == stick_name:
                return fr, s, d
    return None, None, d


# The 5 sample cases
SAMPLES = [
    {
        "n": 1,
        "title": "NLBW Raised B-plate slab anchors",
        "question": "Why does this NLBW raised B-plate (sill above an opening) get slab anchor bolts when an LBW raised B doesn't?",
        "pair": "HG260001__GF-NLBW-70.075",
        "frame": "N14",
        "stick": "B1",
        "context": "This is a raised B-plate (Bh) sitting at z=61.5mm — i.e. it's the sill above a door opening, not on the slab itself. In Detailer's reference, it has Web@8 + Bolt@62 (slab anchor pattern). LBW raised B-plates (e.g. PK4 L4 B2) at the same elevation do NOT have these. We want to know what makes Detailer fire slab anchors here."
    },
    {
        "n": 2,
        "title": "Truss panel-point dimples (the pair next to each web crossing)",
        "question": "At each panel-point on this TopChord, look at the InnerDimple PAIRS in the ref ops. Each pair sits to ONE SIDE of the web-stick projection by ~25mm. What determines which side?",
        "pair": "HG250011__GF-TIN-70.075",
        "frame": "PC1-1",
        "stick": "T2",
        "context": "T2 is a top chord. The ref has multiple InnerDimple PAIRS in the body — these are panel-point markers. Each pair (e.g. InnerDimple @550 + @601) sits offset from where the diagonal web stick projects onto the chord. Sometimes the pair is BEFORE the projection point, sometimes AFTER. Looking for the rule that determines the side."
    },
    {
        "n": 3,
        "title": "Truss chord 'cap notches' at start and end (clarifying my term)",
        "question": "When I said 'cap notch', I meant the InnerNotch + LipNotch span at the very start (0..39mm) and very end (length-39..length) of a chord stick. In TIN trusses ~80% of chord sticks have these caps; ~20% have only LipNotches without InnerNotches. Look at this T2 stick — what physically distinguishes a chord that gets the InnerNotch cap vs one that doesn't?",
        "pair": "HG250011__GF-TIN-70.075",
        "frame": "PC1-1",
        "stick": "T2",
        "context": "Same stick as #2 but looking at the START and END ops only. The InnerNotch+LipNotch cap is for connecting to another chord segment OR to a heel/apex piece. The 20% without InnerNotch may be the ones that connect to nothing (free end) or to a different chord type."
    },
    {
        "n": 4,
        "title": "Br/R stick tooling (decoded ops with HYTEK codes)",
        "question": "What is an R6 stick on this TGI1-1 frame, and what are these tooling codes? Are they ribbons, lateral braces, or something else? And confirm the 41mm Swage span / 11mm dimple offset is correct (vs studs' 39 + 16.5).",
        "pair": "HG250011__GF-TIN-70.095",
        "frame": "TGI1-1",
        "stick": "R6",
        "context": "R6 is 399mm long. Detailer's reference has: Chamfer@start, InnerDimple @99.5, @198.5, @281.5 (3 dimples in the body), LipNotch 77..122, InnerNotch 176..221, LipNotch 176..221, InnerNotch 259..304. Codec only emits Swage 357.9..398.9. Want to confirm what type of stick this is in HYTEK terms and what these ops represent."
    },
    {
        "n": 5,
        "title": "Long top plate with InnerNotch in body",
        "question": "This 4190mm long top plate has an InnerNotch span 192..279 in the BODY (not at the ends). What triggers this — is it above an opening? At a king-stud crossing? At a plate joint? Where in this frame would I look to find the cause?",
        "pair": "HG250085__GF-TIN-70.095",
        "frame": "TN4-1",
        "stick": "T4",
        "context": "T4 is a 4190mm top chord on a TIN truss. Ref has the standard caps at 0..39 and 4151..4190, PLUS an InnerNotch span 192..279 sitting in the body. That second InnerNotch is what we need to understand — most long T plates have ONLY the cap notches; ~5% have a body notch like this. Looking for the geometric or structural trigger."
    },
]


def fmt_ops(ops: list[str], limit: int = 40) -> str:
    if not ops:
        return "(none)"
    return "\n".join(f"  - {op}" for op in ops[:limit]) + (f"\n  ... +{len(ops) - limit} more" if len(ops) > limit else "")


def file_uri(path: str | None) -> str:
    if not path:
        return "(not available)"
    return "file:///" + str(path).replace("\\", "/")


# Build the markdown document
out_lines = ["# 5 reference samples for Scott to review",
             "",
             "Open in any markdown viewer or paste into Excel for ops lists. Each sample has a manufacturing PDF link + .fcp link so you can navigate to the same stick in Detailer.",
             "",
             "---",
             ""]


for s in SAMPLES:
    fr, stick, _ = get_stick(s["pair"], s["frame"], s["stick"])
    job = s["pair"].split("__")[0]
    plan = s["pair"].split("__")[1]
    manuf = manuf_pdf_for(job, plan)
    fcp = fcp_for(job)

    out_lines.append(f"## Sample {s['n']}: {s['title']}")
    out_lines.append("")
    out_lines.append(f"**Job / plan / frame / stick:** `{job}` / `{plan}` / `{s['frame']}` / `{s['stick']}`")
    if stick:
        L = stick.get("refLength") or stick.get("oursLength") or "?"
        out_lines.append(f"**Stick length:** {L:.1f}mm" if isinstance(L, (int, float)) else f"**Stick length:** {L}")
        out_lines.append(f"**Matched ops:** {stick.get('matchedCount', 0)}, extras: {len(stick.get('extras', []) or [])}, missing: {len(stick.get('missing', []) or [])}")
    out_lines.append("")
    out_lines.append(f"### My question")
    out_lines.append(s["question"])
    out_lines.append("")
    out_lines.append(f"### Context")
    out_lines.append(s["context"])
    out_lines.append("")
    out_lines.append(f"### Open the same stick in Detailer")
    out_lines.append(f"- Manufacturing PDF: [{os.path.basename(manuf) if manuf else '—'}]({file_uri(manuf)})")
    out_lines.append(f"- Detailer project: [{os.path.basename(fcp) if fcp else '—'}]({file_uri(fcp)})")
    out_lines.append("")
    if stick:
        out_lines.append(f"### Codec emits (ops we generate)")
        out_lines.append("```")
        for op in (stick.get("extras", []) or [])[:30]:
            out_lines.append(f"  + {op}")
        if not stick.get("extras"):
            out_lines.append("  (codec emits the matched ops only — no extras for this stick)")
        out_lines.append("```")
        out_lines.append("")
        out_lines.append(f"### Detailer reference (ops missing from codec)")
        out_lines.append("```")
        for op in (stick.get("missing", []) or [])[:30]:
            out_lines.append(f"  - {op}")
        if not stick.get("missing"):
            out_lines.append("  (no missing ops — codec matches reference for this stick)")
        out_lines.append("```")
    else:
        out_lines.append("**(stick not found in diff data — may need a different example)**")
    out_lines.append("")
    out_lines.append("---")
    out_lines.append("")


out_path = ROOT / "docs" / "5-samples-for-scott.md"
out_path.write_text("\n".join(out_lines), encoding="utf-8")
print(f"Wrote {out_path}")
print(f"  ({len(out_lines)} lines)")
