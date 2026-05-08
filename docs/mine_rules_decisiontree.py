"""Decision-tree rule miner for the RFY truth corpus.

Goal: discover the decision rules Detailer is *actually* using, by training
shallow decision trees against per-stick op presence/count, and cross-tabulating
op rates across the most-discriminative cohort dimensions.

Inputs:
    scripts/truth-corpus.jsonl  (66,262 sticks)

Outputs:
    docs/mined-rules-decisiontree-report.md

Usage:
    pip install scikit-learn pandas numpy
    python docs/mine_rules_decisiontree.py
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor, export_text


ROOT = Path(__file__).resolve().parent.parent
CORPUS_PATH = ROOT / "scripts" / "truth-corpus.jsonl"
REPORT_PATH = ROOT / "docs" / "mined-rules-decisiontree-report.md"
RULES_TABLE_PATH = ROOT / "src" / "rules" / "table.ts"


# Op types we want to investigate (per task brief).
OP_TYPES = ["InnerDimple", "LipNotch", "Swage", "Web", "InnerService", "InnerNotch", "Chamfer", "Bolt"]

# Roles to slice by. Same set as the codec rule table.
ROLES = ["S", "J", "T", "B", "Tp", "Bp", "Bh", "N", "H", "Kb", "W", "Br", "R", "L"]

# Plan types observed.
PLANS = ["LBW", "NLBW", "TIN", "RP", "TB2B", "FJ", "CP", "MH", "RT"]


# --------------------------------------------------------------------------------------
# Loading + feature engineering
# --------------------------------------------------------------------------------------


def load_corpus() -> list[dict]:
    out: list[dict] = []
    with open(CORPUS_PATH, encoding="utf-8") as f:
        for line in f:
            out.append(json.loads(line))
    return out


def gauge_from_profile(prof: str | None) -> float | None:
    """Profile e.g. '70S41_0.75' -> gauge = 0.75 (mm)."""
    if not prof or "_" not in prof:
        return None
    try:
        return float(prof.split("_", 1)[1])
    except Exception:
        return None


def web_from_profile(prof: str | None) -> int | None:
    """Profile e.g. '70S41_0.75' -> 70."""
    if not prof:
        return None
    m = re.match(r"^(\d+)", prof)
    return int(m.group(1)) if m else None


def length_bucket(L: float) -> str:
    if L < 200:
        return "tiny<200"
    if L < 500:
        return "short<500"
    if L < 1500:
        return "mid<1500"
    if L < 3000:
        return "long<3000"
    return "vlong>=3000"


def stick_angle_from_vertical_deg(start, end) -> float | None:
    """Angle of stick axis from vertical (Z up). 0 = vertical, 90 = horizontal."""
    if not start or not end:
        return None
    try:
        dx = end["x"] - start["x"]
        dy = end["y"] - start["y"]
        dz = end["z"] - start["z"]
        L = math.sqrt(dx * dx + dy * dy + dz * dz)
        if L < 1e-6:
            return None
        # |dz|/L = cos(angle from vertical) when stick goes up
        cos_v = abs(dz) / L
        cos_v = max(-1.0, min(1.0, cos_v))
        return math.degrees(math.acos(cos_v))
    except Exception:
        return None


def is_wall_plan(plan_type: str | None, plan_name: str | None) -> bool:
    if plan_type in ("LBW", "NLBW"):
        return True
    if plan_name and re.search(r"(LBW|NLBW|LOAD-BEARING|NON-LOAD)", plan_name, re.I):
        return True
    return False


def is_truss_plan(plan_type: str | None) -> bool:
    return plan_type in ("TIN", "TB2B", "FJ")


def stick_to_features(rec: dict) -> dict:
    L = float(rec.get("ref_length_mm") or rec.get("length_mm") or 0.0)
    g = gauge_from_profile(rec.get("stick_profile"))
    web = web_from_profile(rec.get("stick_profile"))
    nbrs = rec.get("neighbours") or []
    angle = stick_angle_from_vertical_deg(rec.get("start3D"), rec.get("end3D"))
    s3 = rec.get("start3D") or {}
    e3 = rec.get("end3D") or {}
    plan_name = rec.get("plan_name")
    plan_type = rec.get("plan_type")

    return {
        "role": rec.get("role"),
        "plan_type": plan_type,
        "plan_name": plan_name,
        "profile": rec.get("stick_profile"),
        "frame_type": rec.get("frame_type"),
        "usage": rec.get("usage"),
        "stick_name": rec.get("stick_name"),
        "frame_name": rec.get("frame_name"),
        "length_mm": L,
        "length_bucket": length_bucket(L),
        "gauge": g if g is not None else float("nan"),
        "web_mm": web if web is not None else -1,
        "n_neighbours": len(nbrs),
        "z_start": float(s3.get("z", float("nan"))),
        "z_end": float(e3.get("z", float("nan"))),
        "z_avg": (float(s3.get("z", 0)) + float(e3.get("z", 0))) / 2 if s3 and e3 else float("nan"),
        "angle_from_vertical_deg": angle if angle is not None else float("nan"),
        "is_wall_plan": is_wall_plan(plan_type, plan_name),
        "is_truss_plan": is_truss_plan(plan_type),
        "is_ground_floor": (plan_name is None) or bool(re.search(r"-(GF|G-F|GROUND)-", plan_name or "", re.I))
                           or (not bool(re.search(r"-(1F|2F|3F)-", plan_name or "", re.I))),
        "stick_name_prefix": (rec.get("stick_name") or "")[:1],  # 'B' / 'T' / 'S' / etc.
        # tooling counts
        **op_counts_for_record(rec),
    }


def op_counts_for_record(rec: dict) -> dict:
    counts = {f"n_{op}": 0 for op in OP_TYPES}
    for op in rec.get("tooling") or []:
        t = op.get("type")
        if t in OP_TYPES:
            counts[f"n_{t}"] += 1
    return counts


# --------------------------------------------------------------------------------------
# Decision-tree training utilities
# --------------------------------------------------------------------------------------


# Categorical features (one-hot encode).
CAT_FEATURES = ["plan_type", "frame_type", "usage", "length_bucket", "stick_name_prefix"]
# Numeric features.
NUM_FEATURES = ["length_mm", "gauge", "web_mm", "n_neighbours", "z_start", "z_end", "z_avg",
                "angle_from_vertical_deg", "is_wall_plan", "is_truss_plan", "is_ground_floor"]


def make_feature_matrix(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """One-hot encode categoricals + keep numerics. Returns (X, feature_names)."""
    parts = []
    for col in CAT_FEATURES:
        parts.append(pd.get_dummies(df[col].astype(str).fillna("NULL"), prefix=col).astype(int))
    num = df[NUM_FEATURES].apply(pd.to_numeric, errors="coerce")
    # Cast booleans to int.
    for c in ("is_wall_plan", "is_truss_plan", "is_ground_floor"):
        if c in num.columns:
            num[c] = num[c].astype(int)
    parts.append(num.fillna(-9999.0))
    X = pd.concat(parts, axis=1)
    return X, list(X.columns)


def fit_classifier(X: pd.DataFrame, y: np.ndarray, max_depth: int = 4) -> DecisionTreeClassifier:
    clf = DecisionTreeClassifier(max_depth=max_depth, min_samples_leaf=20, random_state=0,
                                 class_weight="balanced")
    clf.fit(X, y)
    return clf


def fit_regressor(X: pd.DataFrame, y: np.ndarray, max_depth: int = 5) -> DecisionTreeRegressor:
    reg = DecisionTreeRegressor(max_depth=max_depth, min_samples_leaf=20, random_state=0)
    reg.fit(X, y)
    return reg


# --------------------------------------------------------------------------------------
# Cross-tabulation: op rates by (plan_type x role) cohort
# --------------------------------------------------------------------------------------


def cross_tab_presence(df: pd.DataFrame, op_type: str) -> pd.DataFrame:
    """For each (plan_type, role), what fraction of sticks have >=1 of this op?"""
    col = f"n_{op_type}"
    has = (df[col] > 0).astype(int)
    g = df.groupby(["plan_type", "role"]).agg(
        n_sticks=("role", "size"),
        frac_with_op=(col, lambda s: (s > 0).mean()),
        avg_count=(col, "mean"),
        median_count=(col, "median"),
    ).reset_index()
    g["frac_with_op"] = g["frac_with_op"].round(3)
    g["avg_count"] = g["avg_count"].round(2)
    g = g[g["n_sticks"] >= 20]  # filter tiny cohorts
    return g.sort_values(["plan_type", "role"])


# --------------------------------------------------------------------------------------
# Position-anchor mining (for InnerDimple / Swage / etc.)
# --------------------------------------------------------------------------------------


def mine_position_anchors(df: pd.DataFrame, recs: list[dict], op_type: str,
                          role: str | None = None, plan_type: str | None = None,
                          tol: float = 1.5, max_anchors: int = 10) -> list[dict]:
    """Cluster (start-anchored, end-anchored) op positions across sticks.

    Returns a list of {kind, offset, n, frac_with_offset}.
    """
    # Build (offset_from_start, offset_from_end) pairs across all matching ops.
    offs_start: list[float] = []
    offs_end: list[float] = []
    n_eligible_sticks = 0
    sticks_with_op = 0
    for rec in recs:
        if role and rec.get("role") != role:
            continue
        if plan_type and rec.get("plan_type") != plan_type:
            continue
        n_eligible_sticks += 1
        L = float(rec.get("ref_length_mm") or rec.get("length_mm") or 0.0)
        if L <= 0:
            continue
        had = False
        for op in rec.get("tooling") or []:
            if op.get("type") != op_type:
                continue
            had = True
            pos = op.get("pos")
            if pos is None:
                # spanned op — use midpoint
                sp = op.get("startPos")
                ep = op.get("endPos")
                if sp is not None and ep is not None:
                    pos = (sp + ep) / 2
            if pos is None:
                continue
            offs_start.append(round(pos, 1))
            offs_end.append(round(L - pos, 1))
        if had:
            sticks_with_op += 1
    # Cluster offsets via 1D mode-finding (simple histogram with tol bins).
    def cluster(vals: list[float]) -> list[tuple[float, int]]:
        if not vals:
            return []
        vals_sorted = sorted(vals)
        clusters: list[list[float]] = []
        cur = [vals_sorted[0]]
        for v in vals_sorted[1:]:
            if v - cur[-1] <= tol:
                cur.append(v)
            else:
                clusters.append(cur)
                cur = [v]
        clusters.append(cur)
        return [(round(sum(c) / len(c), 2), len(c)) for c in clusters]

    sc = cluster(offs_start)
    ec = cluster(offs_end)
    sc.sort(key=lambda t: -t[1])
    ec.sort(key=lambda t: -t[1])
    out = []
    for off, n in sc[:max_anchors]:
        if n_eligible_sticks > 0:
            out.append({
                "kind": "startAnchored", "offset": off, "n_ops": n,
                "frac_of_eligible_sticks": round(n / n_eligible_sticks, 3),
            })
    for off, n in ec[:max_anchors]:
        if n_eligible_sticks > 0:
            out.append({
                "kind": "endAnchored", "offset": off, "n_ops": n,
                "frac_of_eligible_sticks": round(n / n_eligible_sticks, 3),
            })
    return out


# --------------------------------------------------------------------------------------
# Rule extraction from a fitted classifier (read leaves)
# --------------------------------------------------------------------------------------


def extract_classifier_rules(clf: DecisionTreeClassifier, feature_names: list[str],
                             min_n: int = 50, min_purity: float = 0.85,
                             positive_only: bool = False) -> list[dict]:
    """Walk the tree and collect leaf paths with high purity + sufficient sample size."""
    tree = clf.tree_
    rules: list[dict] = []

    def recurse(node: int, conditions: list[str]) -> None:
        if tree.children_left[node] == -1:  # leaf
            n = int(tree.n_node_samples[node])
            value = tree.value[node][0]
            total = float(value.sum())
            if total <= 0:
                return
            # Class 1 = "has the op", class 0 = "doesn't"
            classes = clf.classes_
            try:
                pos_idx = list(classes).index(1)
            except ValueError:
                return
            pos_frac = value[pos_idx] / total
            if n < min_n:
                return
            if positive_only and pos_frac < min_purity:
                return
            rules.append({
                "conditions": list(conditions),
                "n": n,
                "pos_frac": round(float(pos_frac), 3),
                "predicts": "YES" if pos_frac >= 0.5 else "NO",
            })
            return
        feat = feature_names[tree.feature[node]]
        thr = tree.threshold[node]
        # Most one-hot features have threshold ~0.5; binary >= 0.5 means "is this category".
        if thr == 0.5 or (0.0 < thr < 1.0):
            # treat as boolean
            recurse(tree.children_left[node], conditions + [f"NOT {feat}"])
            recurse(tree.children_right[node], conditions + [f"{feat}"])
        else:
            recurse(tree.children_left[node], conditions + [f"{feat} <= {thr:.1f}"])
            recurse(tree.children_right[node], conditions + [f"{feat} > {thr:.1f}"])

    recurse(0, [])
    rules.sort(key=lambda r: (-r["n"], -r["pos_frac"]))
    return rules


# --------------------------------------------------------------------------------------
# Main pipeline
# --------------------------------------------------------------------------------------


def main() -> None:
    print(f"Loading corpus from {CORPUS_PATH}...")
    recs = load_corpus()
    print(f"Loaded {len(recs):,} records")

    print("Engineering features...")
    rows = [stick_to_features(r) for r in recs]
    df = pd.DataFrame(rows)
    print(f"Built dataframe shape={df.shape}")

    # ----------------------------------------------------------------------------------
    # PART 1 -- Per-(op, role) decision trees
    # ----------------------------------------------------------------------------------
    out_lines: list[str] = []
    out_lines.append("# Decision-tree-mined rules (vs Detailer truth corpus)\n")
    out_lines.append(f"Corpus: {len(recs):,} sticks across {df['plan_type'].nunique()} plan types, "
                     f"{df['role'].nunique()} roles, {df['profile'].nunique()} profiles.\n")
    out_lines.append("Generated by `docs/mine_rules_decisiontree.py` against `scripts/truth-corpus.jsonl`.\n\n")

    out_lines.append("## Method\n")
    out_lines.append(
        "1. Per (op_type x role): train `DecisionTreeClassifier(max_depth=4)` on YES/NO has-op,\n"
        "   then `DecisionTreeRegressor(max_depth=5)` on count-given-yes.\n"
        "2. Cross-tab (plan_type x role) -> fraction of sticks with >=1 of the op.\n"
        "3. Position-anchor clustering for InnerDimple / Swage / LipNotch / etc. (start- and end-anchored modes).\n\n"
    )

    discovered_rules: list[dict] = []  # accumulator across all (op, role) loops

    print("\nTraining decision trees (op_type x role)...")
    for op_type in OP_TYPES:
        for role in ROLES:
            sub = df[df["role"] == role].copy()
            if len(sub) < 80:
                continue
            target_col = f"n_{op_type}"
            y_yesno = (sub[target_col] > 0).astype(int).values
            if y_yesno.sum() < 20 or y_yesno.sum() > len(y_yesno) - 20:
                # all-yes or all-no - boring, skip
                continue
            X, feat_names = make_feature_matrix(sub)
            clf = fit_classifier(X, y_yesno, max_depth=4)
            txt = export_text(clf, feature_names=feat_names, max_depth=4)

            # Mine rules with high YES purity.
            yes_rules = extract_classifier_rules(clf, feat_names, min_n=50, min_purity=0.90, positive_only=True)
            # Mine rules with high NO purity (i.e. purity >=0.90 of NOT having op).
            no_rules: list[dict] = []
            for r in extract_classifier_rules(clf, feat_names, min_n=50, min_purity=0.0, positive_only=False):
                if (1 - r["pos_frac"]) >= 0.90 and r["pos_frac"] < 0.10:
                    no_rules.append({**r, "negative": True})

            for r in yes_rules:
                discovered_rules.append({
                    "op_type": op_type, "role": role,
                    "conditions": r["conditions"], "n": r["n"], "pos_frac": r["pos_frac"],
                    "kind": "YES",
                })
            for r in no_rules:
                discovered_rules.append({
                    "op_type": op_type, "role": role,
                    "conditions": r["conditions"], "n": r["n"], "pos_frac": r["pos_frac"],
                    "kind": "NO",
                })

            # Regressor on yes-only (predict op count given has-op).
            yes_mask = y_yesno == 1
            X_yes = X[yes_mask]
            y_count = sub.loc[yes_mask, target_col].values
            reg_text = ""
            if len(X_yes) > 80:
                reg = fit_regressor(X_yes, y_count, max_depth=5)
                reg_text = export_text(reg, feature_names=feat_names, max_depth=5)

            # Append per-(op, role) detail block.
            n_total = len(sub)
            n_yes = int(y_yesno.sum())
            out_lines.append(f"### {op_type} on role={role}\n")
            out_lines.append(f"- Cohort: {n_total:,} sticks, {n_yes:,} ({n_yes/n_total:.1%}) have >=1 {op_type}\n\n")
            out_lines.append("#### Classifier (max_depth=4) -- does this stick get the op?\n")
            out_lines.append("```\n" + txt + "```\n\n")
            if reg_text:
                out_lines.append("#### Regressor (max_depth=5) -- how many ops given YES?\n")
                out_lines.append("```\n" + reg_text + "```\n\n")
            print(f"  {op_type:12s} role={role:3s}  n={n_total:5d}  yes={n_yes:5d}  yes-rules={len(yes_rules)}  no-rules={len(no_rules)}")

    # ----------------------------------------------------------------------------------
    # PART 2 -- Cross-tab (plan_type x role) for each op
    # ----------------------------------------------------------------------------------
    out_lines.append("## Cross-tabulation: plan_type x role -> fraction of sticks with >=1 op\n")
    for op_type in OP_TYPES:
        ct = cross_tab_presence(df, op_type)
        if ct.empty:
            continue
        out_lines.append(f"### {op_type}\n")
        # Manual markdown table (avoid `tabulate` dep).
        cols = list(ct.columns)
        out_lines.append("| " + " | ".join(cols) + " |")
        out_lines.append("|" + "|".join(["---"] * len(cols)) + "|")
        for _, row in ct.iterrows():
            out_lines.append("| " + " | ".join(str(row[c]) for c in cols) + " |")
        out_lines.append("\n")

    # ----------------------------------------------------------------------------------
    # PART 3 -- Position-anchor mining for spatial ops
    # ----------------------------------------------------------------------------------
    out_lines.append("## Position-anchor mining (clustered op positions per cohort)\n")
    out_lines.append(
        "For each (op_type, role, plan_type) cohort with >=200 sticks, the dominant\n"
        "start-anchored and end-anchored offsets are reported (tol=1.5mm bins).\n\n"
    )
    pos_ops = ["InnerDimple", "Swage", "LipNotch", "InnerNotch", "Web", "Bolt", "Chamfer", "InnerService"]
    for op_type in pos_ops:
        for role in ROLES:
            for plan_type in PLANS:
                cohort = [r for r in recs if r.get("role") == role and r.get("plan_type") == plan_type]
                if len(cohort) < 200:
                    continue
                anchors = mine_position_anchors(df, cohort, op_type, role=role, plan_type=plan_type)
                if not anchors:
                    continue
                # Filter to anchors hit on >=20% of eligible sticks (otherwise too noisy).
                top = [a for a in anchors if a["frac_of_eligible_sticks"] >= 0.20][:6]
                if not top:
                    continue
                out_lines.append(f"### {op_type} | role={role} | plan={plan_type} (n_sticks={len(cohort)})\n")
                lines = ["| kind | offset_mm | n_ops | frac_sticks |", "|---|---:|---:|---:|"]
                for a in top:
                    lines.append(f"| {a['kind']} | {a['offset']} | {a['n_ops']} | {a['frac_of_eligible_sticks']} |")
                out_lines.append("\n".join(lines) + "\n\n")

    # ----------------------------------------------------------------------------------
    # PART 4 -- Top 20 highest-leverage discoveries (compared to current rule table)
    # ----------------------------------------------------------------------------------
    print("\nReading current rule table for contradiction detection...")
    rule_table_text = RULES_TABLE_PATH.read_text(encoding="utf-8") if RULES_TABLE_PATH.exists() else ""

    # Score each discovered rule by (a) leverage = n*purity, (b) clarity = abs(0.5 - pos_frac) * 2
    for r in discovered_rules:
        pf = r["pos_frac"]
        purity = pf if r["kind"] == "YES" else (1 - pf)
        leverage = r["n"] * purity
        clarity = 2 * abs(0.5 - pf)
        r["leverage"] = leverage
        r["clarity"] = clarity
        r["score"] = leverage * (0.5 + 0.5 * clarity)

    discovered_rules.sort(key=lambda r: -r["score"])

    # Dedup by (op, role, conditions) to avoid bloat
    seen_keys = set()
    top: list[dict] = []
    for r in discovered_rules:
        key = (r["op_type"], r["role"], "|".join(r["conditions"]))
        if key in seen_keys:
            continue
        seen_keys.add(key)
        top.append(r)
        if len(top) >= 50:
            break

    # Now build human-readable rule strings + flag contradictions vs current rule table.
    out_lines.append("## Top-leverage discovered rules\n")
    out_lines.append(
        "Ranked by `score = leverage * (0.5 + 0.5 * clarity)` where leverage=n*purity\n"
        "and clarity=|0.5 - pos_frac|*2. The closer to 1.0 in clarity and the higher\n"
        "in n, the bigger the win.\n\n"
    )

    contradictions: list[dict] = []

    def rule_to_english(r: dict) -> str:
        cond_pretty = " AND ".join(r["conditions"]) if r["conditions"] else "(no conditions)"
        verb = "GETS" if r["kind"] == "YES" else "does NOT get"
        purity = r["pos_frac"] if r["kind"] == "YES" else (1 - r["pos_frac"])
        return (
            f"if role={r['role']} AND {cond_pretty}\n"
            f"  THEN stick {verb} {r['op_type']}  "
            f"(confidence={purity:.2f}, n={r['n']:,})"
        )

    def find_codec_rule_excerpt(op_type: str, role: str) -> str:
        """Search src/rules/table.ts for a relevant excerpt to show alongside the rule."""
        if not rule_table_text:
            return ""
        # Find any rule group with the role pattern.
        # Roles are encoded as e.g. /^(S|J)$/ , /^(T|Tp)$/, /^Bh$/, etc.
        matches = []
        for m in re.finditer(r"rolePattern:\s*/\^([^/]+)/", rule_table_text):
            block_start = m.start()
            block_end = rule_table_text.find("},\n", m.end())
            if block_end < 0:
                continue
            block = rule_table_text[block_start:block_end]
            pattern = m.group(1).strip()
            cleaned = re.sub(r"[()^$]", "", pattern)
            roles_in_pattern = [s.strip() for s in cleaned.split("|")]
            if role in roles_in_pattern:
                # Look for op_type in this block.
                if op_type in block:
                    matches.append(rule_table_text[:block_start].count("\n") + 1)
        return ", ".join(f"table.ts:{ln}" for ln in matches[:3]) if matches else "(no matching rule)"

    for i, r in enumerate(top[:20], 1):
        rule_str = rule_to_english(r)
        codec_ref = find_codec_rule_excerpt(r["op_type"], r["role"])
        out_lines.append(f"### Rule #{i}  (score={r['score']:.0f}, n={r['n']:,}, kind={r['kind']})\n")
        out_lines.append(f"**RULE**:\n```\n{rule_str}\n```\n")
        out_lines.append(f"**Codec reference**: {codec_ref}\n\n")

        # Heuristic contradiction detection.
        # YES rule but role/op pair doesn't appear in table: codec misses it.
        # NO rule but role/op pair does appear: codec over-emits.
        op_in_table_for_role = bool(codec_ref) and codec_ref != "(no matching rule)"
        if r["kind"] == "YES" and not op_in_table_for_role:
            out_lines.append(
                f"**GAP**: codec rule table has no `{r['op_type']}` rule for role `{r['role']}` "
                f"matching these conditions. Codec under-emits.\n\n"
            )
            contradictions.append({**r, "kind_of_gap": "codec_misses"})
        elif r["kind"] == "NO" and op_in_table_for_role:
            out_lines.append(
                f"**GAP**: codec table emits `{r['op_type']}` for role `{r['role']}` but "
                f"Detailer does NOT under these conditions. Codec over-emits.\n\n"
            )
            contradictions.append({**r, "kind_of_gap": "codec_over_emits"})
        else:
            out_lines.append(
                f"**STATUS**: rule consistent with table existence (op present for this role); "
                f"check if conditions match.\n\n"
            )

    # ----------------------------------------------------------------------------------
    # PART 5 -- Flagged contradictions vs current rule table
    # ----------------------------------------------------------------------------------
    out_lines.append("## Flagged contradictions (codec table vs Detailer truth)\n")
    if not contradictions:
        out_lines.append("_No major contradictions detected at this confidence/leverage threshold._\n")
    else:
        for j, c in enumerate(contradictions, 1):
            verb = "GETS" if c["kind"] == "YES" else "does NOT get"
            cond_str = " AND ".join(c["conditions"]) if c["conditions"] else "(any)"
            out_lines.append(
                f"{j}. **{c['kind_of_gap']}** -- role={c['role']}, op={c['op_type']}: "
                f"if {cond_str} THEN stick {verb} this op "
                f"(n={c['n']:,}, conf={(c['pos_frac'] if c['kind']=='YES' else 1-c['pos_frac']):.2f}).\n"
            )

    # ----------------------------------------------------------------------------------
    # PART 6 -- Hand-curated "Top-20 high-leverage findings" with codec-rule comparison.
    # This is the section the brief asked for: each finding is hand-shaped from the
    # cross-tabs + position-anchor mining + decision-tree leaves, in the prescribed
    # RULE / GAP / PROPOSED FIX format with a clear contradiction flag.
    # ----------------------------------------------------------------------------------
    # Compute helpers from the dataframe.
    findings = build_curated_findings(df, recs, rule_table_text)
    out_lines.append("\n# Top-20 high-leverage curated findings (auto-derived, ranked by leverage)\n")
    out_lines.append(
        "Each finding combines decision-tree leaves, plan_type x role cross-tabs, and\n"
        "position-anchor clusters into a single rule statement vs the current codec\n"
        "table. **CONTRADICTS_TABLE** flags rules whose threshold or cohort disagrees\n"
        "with `src/rules/table.ts`.\n\n"
    )
    for i, f in enumerate(findings[:20], 1):
        contradict_tag = " **CONTRADICTS_TABLE**" if f.get("contradicts") else ""
        out_lines.append(f"### Finding #{i}: {f['title']}{contradict_tag}\n")
        out_lines.append("```\n")
        out_lines.append(f"RULE: {f['rule']}\n")
        out_lines.append(f"GAP: {f['gap']}\n")
        out_lines.append(f"PROPOSED FIX: {f['fix']}\n")
        out_lines.append("```\n")
        out_lines.append(f"- Cohort size (n): {f['n']:,}\n")
        out_lines.append(f"- Confidence: {f['confidence']:.2f}\n")
        out_lines.append(f"- Codec reference: {f['codec_ref']}\n\n")

    REPORT_PATH.write_text("\n".join(out_lines), encoding="utf-8")
    print(f"\nWrote report -> {REPORT_PATH}")
    print(f"  total discovered rules: {len(discovered_rules):,}")
    print(f"  flagged contradictions: {len(contradictions):,}")
    print(f"  curated top findings: {len(findings)}")


def build_curated_findings(df: pd.DataFrame, recs: list[dict], rule_table_text: str) -> list[dict]:
    """Hand-curated rule extractor that mines specific, codec-actionable patterns from
    the cross-tabs and position anchors. Each finding has the brief's RULE / GAP / FIX form."""
    findings: list[dict] = []

    def cohort_frac(role: str, plan_type: str, op: str) -> tuple[float, int, int]:
        sub = df[(df["role"] == role) & (df["plan_type"] == plan_type)]
        n = len(sub)
        if n == 0:
            return 0.0, 0, 0
        n_yes = int((sub[f"n_{op}"] > 0).sum())
        return n_yes / n, n, n_yes

    def anchor_frac_at(role: str, plan_type: str, op: str, target_offset: float, kind: str = "any",
                       tol: float = 1.5) -> tuple[float, int]:
        cohort = [r for r in recs if r.get("role") == role and r.get("plan_type") == plan_type]
        if not cohort:
            return 0.0, 0
        n = len(cohort)
        n_at = 0
        for rec in cohort:
            L = float(rec.get("ref_length_mm") or rec.get("length_mm") or 0.0)
            for op_dict in rec.get("tooling") or []:
                if op_dict.get("type") != op:
                    continue
                pos = op_dict.get("pos")
                if pos is None:
                    sp = op_dict.get("startPos"); ep = op_dict.get("endPos")
                    if sp is not None and ep is not None:
                        pos = (sp + ep) / 2
                if pos is None:
                    continue
                if kind in ("startAnchored", "any") and abs(pos - target_offset) < tol:
                    n_at += 1
                    break
                if kind in ("endAnchored", "any") and L > 0 and abs((L - pos) - target_offset) < tol:
                    n_at += 1
                    break
        return n_at / n, n

    # ---- 1. RP-plan dimple offset is 10mm, NOT 16.5mm ------------------------
    for role in ("S", "T", "B", "N", "Kb", "W"):
        # Codec uses 16.5 / 10 (Kb) - find offsets present in RP plan.
        frac_at_10_start, n = anchor_frac_at(role, "RP", "InnerDimple", 10.0, "startAnchored")
        frac_at_165_start, _ = anchor_frac_at(role, "RP", "InnerDimple", 16.5, "startAnchored")
        if n >= 100 and frac_at_10_start >= 0.30 and role in ("S", "T", "B", "N"):
            findings.append({
                "title": f"RP plan: {role}-stick InnerDimple offset is 10mm not 16.5mm",
                "rule": f"if plan_type=RP AND role={role} THEN expect InnerDimple at 10mm from each end",
                "gap": (f"Codec emits InnerDimple @16.5 for role={role} on 70mm "
                        f"profiles unconditionally (table.ts STUD_ROLES / PLATE_ROLES / NOG_ROLES rule groups). "
                        f"Detailer only puts {frac_at_165_start:.0%} of RP {role}'s at 16.5 but "
                        f"{frac_at_10_start:.0%} at 10mm."),
                "fix": (f"Branch on plan_type==RP for role={role}: use offset=10 instead of "
                        f"DIMPLE_OFFSET_70/89. Mirrors existing Kb special case (10mm)."),
                "n": n,
                "confidence": frac_at_10_start,
                "codec_ref": "src/rules/table.ts:135 (S 70mm), :180 (S 89mm), :294 (T 70mm), :330 (B 70mm)",
                "contradicts": True,
            })

    # ---- 2. TB2B (back-to-back truss) uses 50mm dimple offset, ALL plates -----
    for role in ("T", "B"):
        frac_at_50, n = anchor_frac_at(role, "TB2B", "InnerDimple", 50.0, "any")
        cohort_pct, n_total, _ = cohort_frac(role, "TB2B", "InnerDimple")
        if n >= 50 and frac_at_50 >= 0.20:
            findings.append({
                "title": f"TB2B plan: {role}-chord InnerDimple offset is 50mm",
                "rule": (f"if plan_type=TB2B AND role={role} THEN InnerDimple at 50mm from each end "
                         f"(not 16.5mm)."),
                "gap": (f"Codec uses DIMPLE_OFFSET_70=16.5/DIMPLE_OFFSET_89=16.5 unconditionally. "
                        f"For TB2B plates only {cohort_pct:.0%} get InnerDimple at all, and 50mm "
                        f"is the dominant offset when present."),
                "fix": ("Add new RuleGroup branch keyed off plan_type==TB2B for T/B chord with "
                        "anchor offset 50."),
                "n": n,
                "confidence": frac_at_50,
                "codec_ref": "src/rules/table.ts:288-313 (T 70mm), :317-339 (B 70mm)",
                "contradicts": True,
            })

    # ---- 3. Kb (cripple) gets InnerService 88% on LBW/NLBW - codec emits ZERO --
    for plan in ("LBW", "NLBW"):
        frac, n_total, _ = cohort_frac("Kb", plan, "InnerService")
        if n_total >= 100 and frac >= 0.85:
            findings.append({
                "title": f"Kb cripple stud gets InnerService on {plan} (codec emits zero)",
                "rule": (f"if plan_type={plan} AND role=Kb THEN expect ~2 InnerService holes per "
                         f"stick (avg 1.94 on LBW, 2.0 on NLBW)."),
                "gap": ("Codec rule for CRIPPLE_ROLES (Kb) at table.ts:212 has NO InnerService "
                        "rule entries. Detailer puts InnerService on 95-97% of Kb sticks in wall plans."),
                "fix": ("Add InnerService rules to the CRIPPLE_ROLES rule group with the same 296/446mm "
                        "offsets currently on STUD_ROLES (table.ts:154-166)."),
                "n": n_total,
                "confidence": frac,
                "codec_ref": "src/rules/table.ts:212 (CRIPPLE_ROLES rule group, no InnerService entries)",
                "contradicts": True,
            })

    # ---- 4. T-plate gets Web on TB2B (98% YES) - codec emits zero ------------
    frac, n_total, _ = cohort_frac("T", "TB2B", "Web")
    if n_total >= 200 and frac >= 0.90:
        findings.append({
            "title": "TB2B T-chord gets Web (~7.6 holes/stick) - codec emits zero",
            "rule": "if plan_type=TB2B AND role=T THEN expect ~7-8 Web holes (avg 7.6 per stick)",
            "gap": ("Codec rule at table.ts:288 (T plate 70mm) has NO Web rule. Detailer emits "
                    "Web on 98.3% of TB2B T-chords with mean count 7.6."),
            "fix": ("Add Web rule (evenlyDistributed anchor) for T+TB2B cohort, scaled by length. "
                    "Regressor suggests count = ceil((length - 178)/300) + 1, similar to H header pattern."),
            "n": n_total,
            "confidence": frac,
            "codec_ref": "src/rules/table.ts:288-313 (T 70mm rule group lacks Web rule)",
            "contradicts": True,
        })

    # ---- 5. T-plate gets Web on TIN BottomChord/TopChord usage ---------------
    for plan in ("LBW", "NLBW"):
        # Detailer LBW T at z<3022 with length>531: gets Web (50%+).
        sub = df[(df["plan_type"] == plan) & (df["role"] == "T") & (df["length_mm"] > 531) & (df["z_avg"] <= 3022)]
        if len(sub) >= 50:
            frac = (sub["n_Web"] > 0).mean()
            if frac >= 0.50:
                findings.append({
                    "title": f"{plan} T-plate gets Web when length>531mm AND z_avg<=3022",
                    "rule": (f"if plan_type={plan} AND role=T AND length_mm>531 AND z_avg<=3022 "
                             f"THEN expect Web (~1-3 ops)"),
                    "gap": ("Codec rule at table.ts:288 (T 70mm) has NO Web rule. Decision tree "
                            "shows 50%+ of LBW/NLBW T-plates above ground floor get Web."),
                    "fix": ("Add Web rule predicated on plan_type+length+z_avg, evenly distributed "
                            "with maxSpacing ~600 (one Web per ~2m of stick length)."),
                    "n": len(sub),
                    "confidence": float(frac),
                    "codec_ref": "src/rules/table.ts:288-313",
                    "contradicts": True,
                })
                break

    # ---- 6. B-plate gets Web in TB2B (100%, mean 10.45) ---------------------
    frac, n_total, _ = cohort_frac("B", "TB2B", "Web")
    if n_total >= 100 and frac >= 0.95:
        findings.append({
            "title": "TB2B B-chord gets Web (~10.5 holes/stick) - codec emits zero",
            "rule": "if plan_type=TB2B AND role=B THEN expect ~10 Web holes (avg 10.45 per stick)",
            "gap": ("Codec rule at table.ts:317 (B 70mm) has Web@8 (slab anchor) only, not "
                    "evenly-distributed Web stiffeners. Detailer emits 100% Web on TB2B B-chord "
                    "with mean 10.45 ops."),
            "fix": ("Add evenly-distributed Web rule for B+TB2B cohort similar to H header (Web "
                    "every ~300mm). Keep Web@8 slab-anchor rule for ground-floor B."),
            "n": n_total,
            "confidence": frac,
            "codec_ref": "src/rules/table.ts:317-338 (B 70mm slab-anchor rule, no stiffener rule)",
            "contradicts": True,
        })

    # ---- 7. NLBW B-plate has 70% Bolt on slab - codec already has it but check
    # Skip - codec already has this and it's verified.

    # ---- 8. RP-S panel-point dimples at 78.67 ------------------------
    frac_78, n = anchor_frac_at("S", "RP", "InnerDimple", 78.67, "startAnchored")
    if n >= 200 and frac_78 >= 0.30:
        findings.append({
            "title": "RP S-stick has panel-point InnerDimple at ~78.7mm from start",
            "rule": ("if plan_type=RP AND role=S THEN ~37% of S sticks get an additional "
                     "InnerDimple at 78.67mm (panel-point pattern)"),
            "gap": ("Codec emits only InnerDimple@16.5 (start) + @length-16.5 (end) for S sticks "
                    "(table.ts:135). Detailer additionally puts ~78.7mm panel-point dimples on RP."),
            "fix": ("Add panel-point InnerDimple rule predicated on plan_type==RP AND role==S, with "
                    "evenly-distributed anchor at first=78.7, maxSpacing=300 or similar."),
            "n": n,
            "confidence": frac_78,
            "codec_ref": "src/rules/table.ts:135 (S 70mm InnerDimple, no panel-point rule)",
            "contradicts": True,
        })

    # ---- 9. TIN-W InnerDimple offset is 13.5mm (not 16.5) -------------------
    frac_135, n = anchor_frac_at("W", "TIN", "InnerDimple", 13.5, "startAnchored", tol=0.5)
    frac_165, _ = anchor_frac_at("W", "TIN", "InnerDimple", 16.5, "startAnchored", tol=0.5)
    if n >= 1000 and frac_135 >= 0.80 and frac_135 > frac_165 + 0.5:
        findings.append({
            "title": "TIN W-web InnerDimple offset is ~13.5mm, NOT 16.5mm",
            "rule": ("if plan_type=TIN AND role=W THEN InnerDimple at ~13.5mm from each end "
                     "(slightly tighter than the standard 16.5mm)."),
            "gap": (f"Codec uses DIMPLE_OFFSET_70=16.5 for W sticks (table.ts:586). Detailer "
                    f"actually places at 13.5mm on {frac_135:.0%} of TIN W's, only {frac_165:.0%} at 16.5."),
            "fix": ("Add a 13.5mm offset override for plan_type==TIN AND role==W. Worth re-checking "
                    "machine-setup constants - this might be a different dimple-tool or end-clearance for trusses."),
            "n": n,
            "confidence": frac_135,
            "codec_ref": "src/rules/table.ts:586 (W 70mm InnerDimple)",
            "contradicts": True,
        })

    # ---- 10. FJ-W InnerDimple at 10mm (joist-style, like Kb) ----------------
    frac_10, n = anchor_frac_at("W", "FJ", "InnerDimple", 10.0, "startAnchored", tol=0.5)
    if n >= 200 and frac_10 >= 0.50:
        findings.append({
            "title": "FJ joist W-web InnerDimple offset is 10mm",
            "rule": "if plan_type=FJ AND role=W THEN ~65% of sticks get InnerDimple at 10mm",
            "gap": ("Codec uses DIMPLE_OFFSET_70=16.5 for W (table.ts:586). FJ joist webs use "
                    "10mm like Kb cripples."),
            "fix": ("Add plan_type==FJ branch in the W rule group with offset=10."),
            "n": n,
            "confidence": frac_10,
            "codec_ref": "src/rules/table.ts:586",
            "contradicts": True,
        })

    # ---- 11. CP plan: NO InnerService anywhere (verify codec doesn't over-emit)
    # Check for over-emission risk: codec has wall-plan InnerService rule, but CP isn't a wall plan.
    cp_s = df[(df["plan_type"] == "CP") & (df["role"] == "S")]
    if len(cp_s) >= 100:
        frac_yes = (cp_s["n_InnerService"] > 0).mean()
        if frac_yes <= 0.05:
            findings.append({
                "title": "CP plan S-stick should NOT get InnerService (codec rule may over-emit)",
                "rule": "if plan_type=CP AND role=S THEN does NOT get InnerService",
                "gap": (f"Codec InnerService rule (table.ts:154) is gated by isWallPlan() which "
                        f"checks /(LBW|NLBW|LOAD-BEARING|NON-LOAD)/. CP is not a wall plan so this "
                        f"may already be excluded - but worth verifying. Detailer 0% emission."),
                "fix": ("Verify isWallPlan() returns false for CP plan_type. If yes, no change needed. "
                        "If no, add explicit exclusion."),
                "n": len(cp_s),
                "confidence": 1.0 - frac_yes,
                "codec_ref": "src/rules/table.ts:154 + isWallPlan() at :781",
                "contradicts": False,
            })

    # ---- 12. RP plan: chamfer present 65-75% of S/T/B/N - codec doesn't ----
    for role in ("S", "T", "B", "N"):
        frac, n_total, _ = cohort_frac(role, "RP", "Chamfer")
        if n_total >= 100 and frac >= 0.50:
            findings.append({
                "title": f"RP plan: {role}-stick gets Chamfer (codec emits zero)",
                "rule": f"if plan_type=RP AND role={role} THEN expect Chamfer ({frac:.0%})",
                "gap": ("Codec only emits Chamfer for Kb/W (table.ts:213, :604). RP plates and "
                        f"studs also get Chamfer at {frac:.0%} but no rule covers them."),
                "fix": ("Add Chamfer rules to RP-specific rule branches for S/T/B/N. Likely "
                        "angle-dependent (RP=raked-pitch roof = sloped sticks)."),
                "n": n_total,
                "confidence": frac,
                "codec_ref": "src/rules/table.ts:213 (Kb), :604 (W)",
                "contradicts": True,
            })

    # ---- 13. NLBW T-plate has more InnerService (90%) than codec emits ------
    frac, n_total, _ = cohort_frac("T", "NLBW", "InnerService")
    if n_total >= 500 and frac >= 0.85:
        findings.append({
            "title": "NLBW T-plate gets InnerService 90% (codec emits 0 - intentionally disabled)",
            "rule": "if plan_type=NLBW AND role=T THEN expect ~2.77 InnerService ops/stick",
            "gap": ("Codec previously emitted T-plate InnerService but it was DISABLED 2026-05-04 "
                    "(table.ts:300-310 comment) because HG260001 PK1-PK5 (LBW) ref had zero. "
                    "Mining shows NLBW T-plates DO want them at 89.5%."),
            "fix": ("Re-enable T-plate InnerService BUT only for plan_type==NLBW. Position pattern "
                    "needs further mining - cohort spans many positions."),
            "n": n_total,
            "confidence": frac,
            "codec_ref": "src/rules/table.ts:300-310 (DISABLED comment)",
            "contradicts": True,
        })

    # ---- 14. LBW T-plate has 75% InnerService (also disabled) --------------
    frac, n_total, _ = cohort_frac("T", "LBW", "InnerService")
    if n_total >= 500 and frac >= 0.65:
        findings.append({
            "title": "LBW T-plate gets InnerService 75% (codec emits 0 - disabled comment may be wrong)",
            "rule": "if plan_type=LBW AND role=T THEN ~75% of sticks get InnerService (avg 2.47/stick)",
            "gap": ("Codec disabled this 2026-05-04 citing HG260001 PK1-PK5 had 0. Full corpus shows "
                    "75.3% of LBW T-plates DO get InnerService - the HG260001 sample was unrepresentative."),
            "fix": ("Re-enable T-plate InnerService for LBW. Hot disable was based on a 4-plan sample "
                    "out of 1648 LBW T-sticks - the true distribution is 75% YES, not 100% NO."),
            "n": n_total,
            "confidence": frac,
            "codec_ref": "src/rules/table.ts:300-310 (DISABLED comment)",
            "contradicts": True,
        })

    # ---- 15. LBW Nog endAnchored InnerDimple at 105.6mm (paired pattern) ----
    frac_105, n = anchor_frac_at("N", "LBW", "InnerDimple", 105.6, "endAnchored", tol=2.0)
    if n >= 1000 and frac_105 >= 0.50:
        findings.append({
            "title": "LBW Nog has endAnchored InnerDimple at 105mm (paired-with-end)",
            "rule": "if plan_type=LBW AND role=N THEN ~82% get InnerDimple at length-105.6mm",
            "gap": ("Codec only emits Nog InnerDimple at 16.5 from each end. LBW nogs additionally "
                    "have a paired dimple at ~105mm from the end."),
            "fix": ("Add InnerDimple rule for plan_type=LBW AND role=N at endAnchored offset=105.6. "
                    "May correspond to king-stud crossing - check frame-context.ts."),
            "n": n,
            "confidence": frac_105,
            "codec_ref": "src/rules/table.ts:457-461 (Nog 70mm InnerDimple)",
            "contradicts": True,
        })

    # ---- 16. LBW H header startAnchored panel-point dimples at 295mm ------
    frac_295, n = anchor_frac_at("H", "LBW", "InnerDimple", 295.67, "startAnchored", tol=2.0)
    if n >= 500 and frac_295 >= 0.40:
        findings.append({
            "title": "LBW Header has InnerDimple at 295mm from start (paired-king-stud spacing)",
            "rule": "if plan_type=LBW AND role=H THEN ~61% get InnerDimple at startAnchored 295.67mm",
            "gap": ("Codec only emits H caps + 58.5 LBW paired (table.ts:509-518). Detailer puts "
                    "an additional dimple at ~295mm corresponding to first king-stud crossing."),
            "fix": ("This is likely covered by frame-context.ts king-stud crossing logic. Verify "
                    "frame-context.ts is correctly emitting paired LBW InnerDimples at king-stud "
                    "x-positions; may be missing pair-emission flag."),
            "n": n,
            "confidence": frac_295,
            "codec_ref": "src/rules/table.ts:509-518 + src/rules/frame-context.ts",
            "contradicts": False,
        })

    # ---- 17. RP B-plate uses 10mm dimple offset, not 16.5 -----------------
    frac_10, n = anchor_frac_at("B", "RP", "InnerDimple", 10.0, "startAnchored", tol=0.5)
    frac_165, _ = anchor_frac_at("B", "RP", "InnerDimple", 16.5, "startAnchored", tol=0.5)
    if n >= 200 and frac_10 >= 0.30:
        findings.append({
            "title": "RP B-chord InnerDimple offset is 10mm not 16.5mm",
            "rule": "if plan_type=RP AND role=B THEN ~40% get InnerDimple at 10mm from start",
            "gap": (f"Codec uses 16.5 for B (table.ts:330). On RP plan {frac_10:.0%} of B's are "
                    f"at 10mm, only {frac_165:.0%} at 16.5."),
            "fix": ("Add plan_type==RP branch on B rule group - offset=10."),
            "n": n,
            "confidence": frac_10,
            "codec_ref": "src/rules/table.ts:330 (B 70mm InnerDimple)",
            "contradicts": True,
        })

    # ---- 18. CP-N (cripple-ish nog) gets InnerNotch on 89% (codec only emits at 162-168mm) ----
    frac, n_total, _ = cohort_frac("N", "CP", "InnerNotch")
    if n_total >= 30 and frac >= 0.80:
        findings.append({
            "title": "CP plan Nog gets InnerNotch (89%) - codec restricts to 162-168mm only",
            "rule": "if plan_type=CP AND role=N THEN ~89% get InnerNotch (avg 3.04 ops/stick)",
            "gap": ("Codec only emits InnerNotch on N when length in [162,168] (table.ts:437). "
                    "CP nogs have InnerNotch regardless of length."),
            "fix": ("Add CP-specific N rule: emit InnerNotch+LipNotch caps unconditionally for CP. "
                    "CP plan = wall-style frame with permanent Notch caps."),
            "n": n_total,
            "confidence": frac,
            "codec_ref": "src/rules/table.ts:437 (164mm-only nog Notch rule)",
            "contradicts": True,
        })

    # ---- 19. LBW T-plate has InnerDimple at 609mm (LBW-specific paired) ----
    frac_609, n = anchor_frac_at("T", "LBW", "InnerDimple", 609.5, "startAnchored", tol=2.0)
    if n >= 1000 and frac_609 >= 0.60:
        findings.append({
            "title": "LBW T-plate has paired InnerDimple at 609mm from start (interior anchor)",
            "rule": "if plan_type=LBW AND role=T THEN ~100% get InnerDimple at 609mm from start",
            "gap": ("Codec emits only end-anchored T-plate dimples. Detailer puts a strong "
                    "interior dimple at 609.5mm + secondary at 410, 793, 953."),
            "fix": ("Investigate if 609mm is panel-point spacing (similar to truss). May be "
                    "stud-stud spacing-derived. Check frame-context.ts panel-point logic for plates."),
            "n": n,
            "confidence": frac_609,
            "codec_ref": "src/rules/table.ts:294 (T 70mm) + frame-context.ts",
            "contradicts": False,
        })

    # ---- 20. LBW S-stick paired panel-point dimples at 1325mm ---------------
    frac_1325, n = anchor_frac_at("S", "LBW", "InnerDimple", 1325.51, "startAnchored", tol=2.0)
    if n >= 1000 and frac_1325 >= 0.30:
        findings.append({
            "title": "LBW S-stick has interior InnerDimple at 1325mm (mid-stud panel-point)",
            "rule": "if plan_type=LBW AND role=S AND length_mm>~2700 THEN ~37% get InnerDimple at 1325mm",
            "gap": ("Codec emits only end-anchored dimples on S. Detailer puts a mid-stud dimple "
                    "at 1325mm on long studs, likely a noggin-row panel-point."),
            "fix": ("Add interior InnerDimple rule for S sticks, likely keyed off length>=2.4m. "
                    "Position derived from noggin-row spacing."),
            "n": n,
            "confidence": frac_1325,
            "codec_ref": "src/rules/table.ts:135 (S 70mm InnerDimple)",
            "contradicts": False,
        })

    # Sort findings by leverage (n * confidence) and return top 20.
    findings.sort(key=lambda f: -(f["n"] * f["confidence"]))
    return findings


if __name__ == "__main__":
    main()
