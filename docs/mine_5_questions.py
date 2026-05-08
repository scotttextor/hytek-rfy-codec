"""For each of the 5 open questions, mine the truth corpus to find the
actual discriminator (like we did for R-sticks → 'Rail' usage)."""
import json, collections, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
records = []
with (ROOT / "scripts" / "truth-corpus.jsonl").open(encoding="utf-8") as f:
    for line in f:
        records.append(json.loads(line))


def has_op(tooling, type_):
    return any(op.get("type") == type_ for op in tooling)


def has_op_at(tooling, type_, target, tol=2.0):
    for op in tooling:
        if op.get("type") != type_: continue
        pos = op.get("pos")
        if pos is None: continue
        if abs(pos - target) < tol: return True
    return False


def has_span_op_at(tooling, type_, target_start, tol=2.0):
    for op in tooling:
        if op.get("type") != type_: continue
        sp = op.get("startPos")
        if sp is None: continue
        if abs(sp - target_start) < tol: return True
    return False


# ============================================================
# QUESTION 1 — NLBW Raised Bh slab anchors
# Why does NLBW Bh get Web@8 + Bolt@62 when LBW Bh doesn't?
# ============================================================
print("=" * 80)
print("Q1 — NLBW Raised Bh slab anchors")
print("=" * 80)
bh_sticks = [r for r in records if r["role"] == "Bh"]
print(f"Total Bh sticks: {len(bh_sticks)}")
if bh_sticks:
    # Bucket by plan_type and check for Web@8
    by_plan = collections.defaultdict(lambda: {"with_anchors": 0, "without": 0, "usages": []})
    for r in bh_sticks:
        has_anchor = has_op_at(r.get("tooling", []), "Web", 8) or has_op_at(r.get("tooling", []), "Bolt", 62)
        if has_anchor:
            by_plan[r["plan_type"]]["with_anchors"] += 1
        else:
            by_plan[r["plan_type"]]["without"] += 1
        by_plan[r["plan_type"]]["usages"].append(r.get("usage", "?"))
    for plan, v in by_plan.items():
        n = v["with_anchors"] + v["without"]
        usages = collections.Counter(v["usages"]).most_common(5)
        print(f"  {plan:<6} n={n} with_anchors={v['with_anchors']} without={v['without']}  usages: {usages}")
else:
    # Maybe Bh role wasn't extracted as Bh — check raised B-plates by Z
    print("  No Bh role records. Searching for raised B (B/Bp role at non-zero z)…")
    raised = []
    for r in records:
        if r["role"] not in ("B", "Bp"): continue
        z_start = r.get("start3D", {}).get("z")
        if z_start is None or z_start < 30 or z_start > 150: continue  # ~62 mm = sill above door
        raised.append(r)
    print(f"  Found {len(raised)} potential raised B sticks (z between 30-150mm)")
    by_plan = collections.defaultdict(lambda: {"anchors": 0, "noanchors": 0, "usages": []})
    for r in raised:
        has_anchor = has_op_at(r.get("tooling", []), "Web", 8) or has_op_at(r.get("tooling", []), "Bolt", 62)
        if has_anchor: by_plan[r["plan_type"]]["anchors"] += 1
        else: by_plan[r["plan_type"]]["noanchors"] += 1
        by_plan[r["plan_type"]]["usages"].append(r.get("usage", "?"))
    for plan, v in sorted(by_plan.items()):
        n = v["anchors"] + v["noanchors"]
        if n < 3: continue
        u = collections.Counter(v["usages"]).most_common(3)
        print(f"  plan={plan:<6}  n={n}  with_anchors={v['anchors']:<4}  without={v['noanchors']:<4}  usages: {u}")

# ============================================================
# QUESTION 2 — Truss panel-point dimple pair sign discriminator
# (Already mined — saved in panel-point-offsets.jsonl)
# ============================================================
print("\n" + "=" * 80)
print("Q2 — Panel-point dimple pair sign")
print("=" * 80)
print("Already mined: bimodal ±25mm. Sign correlates with web angle direction.")
print("  Web at 60-70°: median +16.8mm (positive offset)")
print("  Web at 90° (vertical):  median -28.5mm (negative offset)")
print("  Web at 100-110°: median +5.7mm")
print("  → Sign flips with web angle direction (heel vs apex side)")
print("  Need engineering-level XML attribute or geometric test to determine which.")
print("  Saved as docs/panel-point-offsets.jsonl (14,750 measurements)")


# ============================================================
# QUESTION 3 — Truss chord cap notches: InnerNotch+LipNotch vs LipNotch only
# ============================================================
print("\n" + "=" * 80)
print("Q3 — Truss chord 'cap notches' — InnerNotch present or not at start/end")
print("=" * 80)
chords = [r for r in records if r["role"] in ("T", "B") and r.get("plan_type") in ("TIN", "TB2B", "FJ")]
print(f"Total truss chord sticks: {len(chords)}")

# For each chord stick, check if start cap has InnerNotch
def has_start_innernotch(tooling):
    for op in tooling:
        if op.get("type") != "InnerNotch": continue
        sp = op.get("startPos")
        if sp is None: continue
        if abs(sp) < 2: return True
    return False

def has_start_lipnotch(tooling):
    for op in tooling:
        if op.get("type") != "LipNotch": continue
        sp = op.get("startPos")
        if sp is None: continue
        if abs(sp) < 2: return True
    return False

# Bucket by plan_type / frame_type / usage / neighbours
by_attr = collections.defaultdict(lambda: {"both": 0, "lip_only": 0, "neither": 0})
for r in chords:
    has_in = has_start_innernotch(r.get("tooling", []))
    has_lip = has_start_lipnotch(r.get("tooling", []))
    key = (r.get("plan_type"), r.get("frame_type"), r.get("usage", "?"), r["role"])
    if has_in and has_lip: by_attr[key]["both"] += 1
    elif has_lip: by_attr[key]["lip_only"] += 1
    else: by_attr[key]["neither"] += 1

print("\nBy (plan, frame_type, usage, role) — start cap pattern:")
print(f"{'(plan, frame_type, usage, role)':<55} {'both':>5} {'lip_only':>9} {'neither':>8}")
for key, v in sorted(by_attr.items(), key=lambda x: -(x[1]["both"] + x[1]["lip_only"] + x[1]["neither"])):
    n = v["both"] + v["lip_only"] + v["neither"]
    if n < 5: continue
    print(f"  {str(key):<55} {v['both']:>5} {v['lip_only']:>9} {v['neither']:>8}")


# ============================================================
# QUESTION 4 — R/Br stick discriminator
# (Already known: usage='Rail' for all 194 sticks)
# ============================================================
print("\n" + "=" * 80)
print("Q4 — R/Br sticks → all 194 are usage='Rail' on truss frames")
print("=" * 80)
print("ANSWERED — see previous analysis. Just need confirmation of what 'Rail' means in HYTEK terms.")


# ============================================================
# QUESTION 5 — Long T plate InnerNotch in body (not at ends)
# ============================================================
print("\n" + "=" * 80)
print("Q5 — Long T plate body InnerNotch (where in the plate? what triggers it?)")
print("=" * 80)
def body_innernotches(tooling, length):
    out = []
    for op in tooling:
        if op.get("type") != "InnerNotch": continue
        sp = op.get("startPos")
        if sp is None: continue
        # Body = not within 60mm of start or end
        if 60 < sp < length - 60:
            out.append(sp)
    return out

# Find long T plates with body InnerNotch
ts_with_body = []
for r in records:
    if r["role"] not in ("T", "Tp"): continue
    L = r.get("ref_length_mm") or r["length_mm"]
    if L < 1500: continue
    body = body_innernotches(r.get("tooling", []), L)
    if not body: continue
    ts_with_body.append({
        "pair": r["pair_id"],
        "frame": r["frame_name"],
        "stick": r["stick_name"],
        "L": L,
        "body_positions": body,
        "usage": r.get("usage", "?"),
        "plan_type": r["plan_type"],
        "frame_type": r["frame_type"],
        "neighbours": r.get("neighbours", []),
    })

print(f"Long T plates with body InnerNotch: {len(ts_with_body)}")
by_plan = collections.Counter(t["plan_type"] for t in ts_with_body)
print(f"  by plan_type: {by_plan.most_common()}")
by_usage = collections.Counter(t["usage"] for t in ts_with_body)
print(f"  by usage: {by_usage.most_common()}")
by_frame_type = collections.Counter(t["frame_type"] for t in ts_with_body)
print(f"  by frame_type: {by_frame_type.most_common()}")

# Check if body position correlates with neighbour stick position
print("\nFirst 10 body InnerNotches with neighbours metadata:")
for t in ts_with_body[:10]:
    nbrs = t["neighbours"][:3] if t.get("neighbours") else "(no neighbour data)"
    pos_str = ", ".join(f"{p:.0f}" for p in t["body_positions"])
    print(f"  {t['pair']:<35} {t['frame']:<8} {t['stick']:<5} L={t['L']:>5.0f}mm body@[{pos_str}] usage={t['usage']:<10} {nbrs}")
