"""Mine the truth corpus for every 'No' rule's actual discriminator.
Output a JSON dict keyed by rule number with per-rule findings.
"""
import json, collections, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

records = []
with open(ROOT / "scripts" / "truth-corpus.jsonl", encoding="utf-8") as f:
    for line in f:
        records.append(json.loads(line))
print(f"Loaded {len(records)} records")


def has_inner_dimple_at(tooling, target, tol=2.0, ref_length=None):
    for op in tooling:
        if op.get("type") != "InnerDimple":
            continue
        pos = op.get("pos")
        if pos is None:
            continue
        if abs(pos - target) < tol:
            return "start"
        if ref_length and abs(pos - (ref_length - target)) < tol:
            return "end"
    return None


def has_op(tooling, op_type):
    return any(op.get("type") == op_type for op in tooling)


def has_web_at(tooling, target, tol=3.0):
    for op in tooling:
        if op.get("type") != "Web":
            continue
        if abs((op.get("pos", -1)) - target) < tol:
            return True
    return False


def has_bolt_at(tooling, target, tol=4.0, ref_length=None):
    for op in tooling:
        if op.get("type") != "Bolt":
            continue
        pos = op.get("pos")
        if pos is None:
            continue
        if abs(pos - target) < tol:
            return "start"
        if ref_length and abs(pos - (ref_length - target)) < tol:
            return "end"
    return None


def has_innerservice(tooling):
    return any(op.get("type") == "InnerService" for op in tooling)


def gauge(stick_profile):
    if not stick_profile or "_" not in stick_profile:
        return None
    try:
        return float(stick_profile.split("_")[1].split("_")[0])
    except Exception:
        return None


def cut_table(records, get_key):
    buckets = collections.defaultdict(lambda: {"with": 0, "without": 0})
    for r in records:
        k = get_key(r)
        if k is None:
            continue
        if r.get("_match"):
            buckets[k]["with"] += 1
        else:
            buckets[k]["without"] += 1
    rows = []
    for k, v in sorted(buckets.items(), key=lambda x: -(x[1]["with"] + x[1]["without"])):
        total = v["with"] + v["without"]
        if total < 5:
            continue
        rows.append({"key": str(k), "with": v["with"], "without": v["without"], "total": total, "pct": round(v["with"] / total * 100, 1)})
    return rows


def mine_rule(rule_num, headline, sticks, dimensions):
    n = len(sticks)
    n_with = sum(1 for s in sticks if s.get("_match"))
    overall = n_with / n * 100 if n else 0
    out = {
        "rule": rule_num,
        "headline": headline,
        "total_sticks": n,
        "match_count": n_with,
        "overall_pct": round(overall, 1),
        "cuts": [],
    }
    for label, get_key in dimensions:
        rows = cut_table(sticks, get_key)
        out["cuts"].append({"cut_by": label, "rows": rows})
    return out


DIM_PLAN = ("plan_type", lambda r: r["plan_type"])
DIM_FRAME = ("frame_type", lambda r: r["frame_type"])
DIM_PROFILE = ("stick_profile", lambda r: r["stick_profile"])
DIM_GAUGE = ("gauge", lambda r: f"{gauge(r['stick_profile'])}" if gauge(r["stick_profile"]) is not None else None)
DIM_PLAN_FRAME = ("(plan_type, frame_type)", lambda r: f"{r['plan_type']}/{r['frame_type']}")
DIM_PLAN_GAUGE = ("(plan_type, gauge)", lambda r: f"{r['plan_type']}/{gauge(r['stick_profile'])}" if gauge(r["stick_profile"]) is not None else None)
DIM_PROFILE_PLAN = ("(stick_profile, plan_type)", lambda r: f"{r['stick_profile']} | {r['plan_type']}")

findings = {}

# ===== Rule 19 / 54 / 55 / 60 / 74 / 75 / 20: Header @58.5 paired dimple =====
hdrs = [r for r in records if r["role"] == "H"]
for r in hdrs:
    L = r.get("ref_length_mm") or r["length_mm"]
    r["_match"] = has_inner_dimple_at(r.get("tooling", []), 58.5, ref_length=L) is not None
shared = mine_rule(19, "Header @58.5 paired dimple — does Detailer emit it?", hdrs,
                   [DIM_PLAN, DIM_PLAN_GAUGE, DIM_PLAN_FRAME, DIM_PROFILE_PLAN])
for n in (19, 20, 54, 55, 60, 74, 75):
    findings[n] = shared

# ===== Rule 5 / 6 / 29 / 91: Wall stud / plate service holes =====
studs = [r for r in records if r["role"] in ("S", "J") and r.get("plan_type") in ("LBW", "NLBW") and (r.get("ref_length_mm") or r["length_mm"]) >= 500]
for r in studs:
    r["_match"] = has_innerservice(r.get("tooling", []))
shared = mine_rule(5, "Wall stud (>=500mm) gets ANY InnerService — selectivity check", studs,
                   [DIM_PLAN, DIM_PLAN_GAUGE, DIM_PLAN_FRAME, DIM_PROFILE_PLAN])
for n in (5, 6, 91):
    findings[n] = shared

# Service on T plates
ts = [r for r in records if r["role"] in ("T", "Tp")]
for r in ts:
    r["_match"] = has_innerservice(r.get("tooling", []))
findings[29] = mine_rule(29, "Top plate has InnerService", ts,
                         [DIM_PLAN, DIM_PLAN_GAUGE, DIM_PLAN_FRAME])

# ===== Rule 32 / 34 / 36 / 38: B plate slab anchors =====
bs = [r for r in records if r["role"] in ("B", "Bp") and gauge(r["stick_profile"]) is not None]
for r in bs:
    L = r.get("ref_length_mm") or r["length_mm"]
    r["_match"] = has_web_at(r.get("tooling", []), 8) or (has_bolt_at(r.get("tooling", []), 62, ref_length=L) is not None)
shared = mine_rule(32, "B plate has Web@8 OR Bolt@62 (slab anchor)", bs,
                   [DIM_PLAN, DIM_PLAN_FRAME, DIM_PLAN_GAUGE, DIM_PROFILE_PLAN])
for n in (32, 34, 36, 38):
    findings[n] = shared

# ===== Rule 42 / 43: Raised Bh slab anchors =====
bhs = [r for r in records if r["role"] == "Bh"]
for r in bhs:
    L = r.get("ref_length_mm") or r["length_mm"]
    r["_match"] = has_web_at(r.get("tooling", []), 8) or (has_bolt_at(r.get("tooling", []), 62, ref_length=L) is not None)
shared = mine_rule(42, "Raised Bh has slab anchor (Web@8 / Bolt@62)", bhs,
                   [DIM_PLAN, DIM_PLAN_FRAME, DIM_PLAN_GAUGE])
findings[42] = shared
findings[43] = shared

# ===== Rule 86: Truss chord panel-point density =====
chords = [r for r in records if r["role"] in ("T", "B") and r.get("plan_type") in ("TIN", "TB2B", "FJ")]
for r in chords:
    L = r.get("ref_length_mm") or r["length_mm"]
    n_dimples = sum(1 for op in r.get("tooling", []) if op.get("type") == "InnerDimple")
    r["_match"] = (L is not None and L > 0 and n_dimples > (L / 1000) * 2)
findings[86] = mine_rule(86, "Truss chord has panel-point dimples (>2 InnerDimple per metre)", chords,
                          [DIM_PLAN, DIM_FRAME, DIM_PLAN_GAUGE])

# ===== Rule 28: Long T plate InnerNotch =====
long_ts = [r for r in records if r["role"] in ("T", "Tp") and (r.get("ref_length_mm") or r["length_mm"]) >= 200]
for r in long_ts:
    r["_match"] = has_op(r.get("tooling", []), "InnerNotch")
findings[28] = mine_rule(28, "Long T plate has InnerNotch", long_ts,
                          [DIM_PLAN, DIM_PLAN_FRAME, DIM_PLAN_GAUGE])

# ===== Rule 87: RP T-plate cap regime =====
rp_ts = [r for r in records if r["role"] in ("T", "Tp") and r.get("plan_type") == "RP"]
for r in rp_ts:
    has_d785 = has_inner_dimple_at(r.get("tooling", []), 78.5) is not None
    r["_match"] = has_d785  # marks "stud-style" (the regime that hurts our simplifier)
findings[87] = mine_rule(87, "RP T-plate has stud-style cap (Dimple@78.5) — opposite of chord-style", rp_ts,
                          [DIM_FRAME, DIM_PLAN_GAUGE, DIM_PROFILE])

# ===== Rule 79-82: Br/R sticks Swage 41 vs 39 =====
brs = [r for r in records if r["role"] in ("Br", "R")]
for r in brs:
    has_long_swage = False
    for op in r.get("tooling", []):
        if op.get("type") == "Swage" and op.get("startPos") is not None:
            span = op.get("endPos", 0) - op.get("startPos", 0)
            if span >= 40.5:
                has_long_swage = True
                break
    r["_match"] = has_long_swage
shared = mine_rule(79, "Br/R has Swage span >=40.5mm (vs standard 39)", brs,
                   [DIM_PLAN, DIM_FRAME, DIM_PROFILE])
for n in (79, 80, 81, 82):
    findings[n] = shared

# ===== Rule 50: 89mm nogs use the same length-bucket pattern =====
n89 = [r for r in records if r["role"] == "N" and gauge(r["stick_profile"]) and "89S41" in r["stick_profile"]]
for r in n89:
    L = r.get("ref_length_mm") or r["length_mm"]
    is_short_bucket = 162 <= L <= 168
    has_notch_caps = has_op(r.get("tooling", []), "InnerNotch")
    has_swage_caps = any(op.get("type") == "Swage" and op.get("startPos", -1) < 5 for op in r.get("tooling", []))
    if is_short_bucket:
        r["_match"] = has_notch_caps  # In the bucket, expect Notch caps
    else:
        r["_match"] = has_swage_caps  # Outside bucket, expect Swage caps
findings[50] = mine_rule(50, "89mm nog: short-bucket has Notch caps OR long has Swage caps (right pattern?)", n89,
                          [DIM_PLAN, DIM_PROFILE, DIM_PLAN_GAUGE])

# ===== Rule 7: Web access holes (mid-stick web positions) =====
studs7 = [r for r in records if r["role"] in ("S", "J") and r.get("plan_type") in ("LBW", "NLBW") and (r.get("ref_length_mm") or r["length_mm"]) >= 1500]
for r in studs7:
    web_count = sum(1 for op in r.get("tooling", []) if op.get("type") == "Web" and op.get("pos", 0) > 100 and op.get("pos", 99999) < (r.get("ref_length_mm") or r["length_mm"]) - 100)
    r["_match"] = web_count >= 1
findings[7] = mine_rule(7, "Wall stud (>=1.5m) has body Web hole(s) — count check", studs7,
                         [DIM_PLAN, DIM_PLAN_GAUGE, DIM_PROFILE_PLAN])

# ===== Rule 8: 89mm wall stud uses 70mm pattern =====
s89 = [r for r in records if r["role"] in ("S", "J") and gauge(r["stick_profile"]) and "89S41" in r["stick_profile"] and r.get("plan_type") in ("LBW", "NLBW")]
for r in s89:
    has_swage_39 = any(op.get("type") == "Swage" and 38 <= (op.get("endPos", 0) - op.get("startPos", 0)) <= 40 for op in r.get("tooling", []) if op.get("startPos") is not None and op.get("startPos") < 5)
    r["_match"] = has_swage_39
findings[8] = mine_rule(8, "89mm wall stud has standard 39mm Swage span at start", s89,
                         [DIM_PLAN, DIM_PROFILE])

# ===== Rule 12 / 14: Kb end-Swage (auto-chamfer derived) =====
kbs = [r for r in records if r["role"] == "Kb"]
for r in kbs:
    L = r.get("ref_length_mm") or r["length_mm"]
    # Look for end Swage with span much larger than 39 (angle-dependent) — flagged as "auto-chamfer fired"
    big_end_swage = any(op.get("type") == "Swage" and op.get("endPos") and abs(op.get("endPos") - L) < 5 and (op.get("endPos") - op.get("startPos", 0)) >= 50 for op in r.get("tooling", []))
    r["_match"] = big_end_swage
shared = mine_rule(12, "Kb has angle-scaled end Swage (>=50mm span — auto-chamfer fired)", kbs,
                   [DIM_PLAN, DIM_PROFILE_PLAN])
findings[12] = shared
findings[14] = shared

# Rules 9, 61, 64, 66 — auto-chamfer
chamfer_kbs = [r for r in records if r["role"] in ("Kb", "W")]
for r in chamfer_kbs:
    has_chamfer_start = any(op.get("type") == "Chamfer" and op.get("kind") == "start" for op in r.get("tooling", []))
    has_chamfer_end = any(op.get("type") == "Chamfer" and op.get("kind") == "end" for op in r.get("tooling", []))
    r["_match"] = has_chamfer_start or has_chamfer_end
shared = mine_rule(9, "Kb/W has any Chamfer (auto-chamfer fired) — by role+plan+frame", chamfer_kbs,
                   [DIM_PLAN, DIM_FRAME, DIM_PROFILE_PLAN])
for n in (9, 61, 66):
    findings[n] = shared

# Save
out_path = ROOT / "docs" / "rule-pdfs" / "_empirical_findings.json"
out_path.write_text(json.dumps(findings, indent=2), encoding="utf-8")
print(f"Wrote {out_path} with {len(findings)} rule findings")

# Print compact summary
seen = set()
for rule_num, fnd in sorted(findings.items()):
    fid = id(fnd)
    if fid in seen:
        continue
    seen.add(fid)
    print(f"\n=== Rule {rule_num}: {fnd['headline']} ===")
    print(f"  Total: {fnd['total_sticks']}, overall match: {fnd['overall_pct']}%")
    for cut in fnd["cuts"][:2]:
        print(f"  -- Cut by {cut['cut_by']} --")
        for row in cut["rows"][:6]:
            print(f"     {row['key']:<40} {row['with']:>5}/{row['total']:<5} = {row['pct']:>5.1f}%")
