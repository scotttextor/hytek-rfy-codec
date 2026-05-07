"""Mine the panel-point dimple offset across the full TIN corpus.

For every TIN truss frame in truth-corpus.jsonl:
  - Find the TopChord (T) and BottomChord (B) sticks
  - For each, find Web (W) sticks in the same frame
  - Compute the Web endpoint projection onto the chord centerline
  - Find the ref InnerDimple pair nearest each projection
  - Measure the offset between (projection_pos) and (midpoint of paired dimples)

If a stable constant appears across the corpus, that's the missing correction.
The agent's earlier finding was ~29.6mm offset on a 70mm 70S41_0.75 chord. Hypothesis:
chord_half_depth (35mm for 70mm) - some_margin.
"""
from __future__ import annotations
import json, math, statistics, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORPUS = ROOT / "scripts" / "truth-corpus.jsonl"


def load_records() -> list[dict]:
    out = []
    with CORPUS.open(encoding="utf-8") as f:
        for line in f:
            out.append(json.loads(line))
    return out


def project_3d(point_xyz: dict, line_start: dict, line_end: dict) -> tuple[float, float]:
    """Project point onto the line. Return (t along line in [0,1], distance to line)."""
    sx, sy, sz = line_start["x"], line_start["y"], line_start["z"]
    ex, ey, ez = line_end["x"], line_end["y"], line_end["z"]
    px, py, pz = point_xyz["x"], point_xyz["y"], point_xyz["z"]
    dx, dy, dz = ex - sx, ey - sy, ez - sz
    denom = dx * dx + dy * dy + dz * dz
    if denom < 1e-9:
        return 0.0, 1e9
    t = ((px - sx) * dx + (py - sy) * dy + (pz - sz) * dz) / denom
    proj_x, proj_y, proj_z = sx + t * dx, sy + t * dy, sz + t * dz
    dist = math.sqrt((px - proj_x) ** 2 + (py - proj_y) ** 2 + (pz - proj_z) ** 2)
    return t, dist


def stick_length_3d(start: dict, end: dict) -> float:
    return math.sqrt((end["x"] - start["x"]) ** 2 + (end["y"] - start["y"]) ** 2 + (end["z"] - start["z"]) ** 2)


def web_angle_to_chord(web_start: dict, web_end: dict, chord_start: dict, chord_end: dict) -> float:
    """Angle in degrees between web stick and chord stick."""
    wv = (web_end["x"] - web_start["x"], web_end["y"] - web_start["y"], web_end["z"] - web_start["z"])
    cv = (chord_end["x"] - chord_start["x"], chord_end["y"] - chord_start["y"], chord_end["z"] - chord_start["z"])
    wlen = math.sqrt(sum(v * v for v in wv))
    clen = math.sqrt(sum(v * v for v in cv))
    if wlen < 1e-6 or clen < 1e-6:
        return 0.0
    cos_a = (wv[0] * cv[0] + wv[1] * cv[1] + wv[2] * cv[2]) / (wlen * clen)
    cos_a = max(-1.0, min(1.0, cos_a))
    return math.degrees(math.acos(cos_a))


def main():
    print("Loading truth corpus…")
    records = load_records()
    print(f"  {len(records):,} stick records")

    # Group by (pair_id, frame_name)
    frames: dict[tuple, list[dict]] = collections.defaultdict(list)
    for r in records:
        if r.get("plan_type") not in ("TIN", "FJ"):
            continue
        frames[(r["pair_id"], r["frame_name"])].append(r)
    print(f"  TIN/FJ frames: {len(frames):,}")

    # For each frame, separate chords (T/B) from webs (W)
    offsets_collected: list[dict] = []
    for (pair_id, frame_name), frame_sticks in frames.items():
        chords = [s for s in frame_sticks if s.get("role") in ("T", "B")]
        webs = [s for s in frame_sticks if s.get("role") == "W"]
        if not chords or not webs:
            continue

        for chord in chords:
            cs, ce = chord.get("start3D"), chord.get("end3D")
            if not cs or not ce:
                continue
            chord_len = stick_length_3d(cs, ce)
            if chord_len < 200:
                continue

            # Find chord's InnerDimple positions in ref tooling
            ref_dimples = sorted(
                op["pos"] for op in chord.get("tooling", [])
                if op.get("type") == "InnerDimple" and isinstance(op.get("pos"), (int, float))
            )
            if len(ref_dimples) < 2:
                continue

            # Pair adjacent dimples within 80mm of each other (panel-point pairs)
            dimple_pairs: list[tuple[float, float]] = []
            i = 0
            while i < len(ref_dimples) - 1:
                if ref_dimples[i + 1] - ref_dimples[i] < 80:
                    dimple_pairs.append((ref_dimples[i], ref_dimples[i + 1]))
                    i += 2
                else:
                    i += 1
            if not dimple_pairs:
                continue

            # For each web, project endpoint onto chord centerline
            for web in webs:
                ws, we = web.get("start3D"), web.get("end3D")
                if not ws or not we:
                    continue

                # Try both endpoints — whichever is closer to the chord wins
                for endpoint, label in [(ws, "start"), (we, "end")]:
                    t, dist = project_3d(endpoint, cs, ce)
                    if t < -0.05 or t > 1.05:
                        continue  # projection lies off the chord
                    if dist > 200:  # web endpoint is too far from chord — different cluster
                        continue

                    proj_pos_local = t * chord_len
                    angle = web_angle_to_chord(ws, we, cs, ce)

                    # Find the dimple pair whose midpoint is nearest the projection
                    best: tuple[float, float] | None = None
                    best_dist = 9999.0
                    for pair in dimple_pairs:
                        mid = (pair[0] + pair[1]) / 2
                        d = abs(mid - proj_pos_local)
                        if d < best_dist:
                            best_dist = d
                            best = (mid, pair[1] - pair[0])
                    if best is None or best_dist > 200:
                        continue
                    ref_mid, pair_span = best
                    offset = ref_mid - proj_pos_local

                    offsets_collected.append({
                        "pair_id": pair_id,
                        "frame": frame_name,
                        "chord_name": chord["stick_name"],
                        "chord_profile": chord.get("stick_profile"),
                        "chord_role": chord["role"],
                        "web_name": web["stick_name"],
                        "web_endpoint": label,
                        "web_angle_to_chord": round(angle, 1),
                        "proj_pos_local": round(proj_pos_local, 1),
                        "ref_pair_mid": round(ref_mid, 1),
                        "offset": round(offset, 2),
                        "pair_span": round(pair_span, 1),
                        "chord_len": round(chord_len, 1),
                    })

    print(f"\n{len(offsets_collected):,} (web-projection, ref-pair) measurements\n")

    if not offsets_collected:
        print("No measurements gathered. Check that TIN frames have both chord+web sticks with InnerDimple ops in ref.")
        return

    offsets = [o["offset"] for o in offsets_collected]
    print(f"OFFSET (ref_mid - proj_pos_local):")
    print(f"  count: {len(offsets):,}")
    print(f"  mean:   {statistics.mean(offsets):>8.2f}")
    print(f"  median: {statistics.median(offsets):>8.2f}")
    print(f"  stdev:  {statistics.stdev(offsets):>8.2f}")
    print(f"  range:  [{min(offsets):.2f}, {max(offsets):.2f}]")

    # Histogram
    print("\nHistogram (10mm bins):")
    bins: dict[int, int] = collections.defaultdict(int)
    for o in offsets:
        bins[int(o // 10) * 10] += 1
    for b, n in sorted(bins.items()):
        bar = "#" * (n // max(1, len(offsets) // 60))
        print(f"  {b:>+5} to {b+10:+5}: {n:>5}  {bar}")

    # Bucket by chord profile
    print("\nOffset by chord_profile:")
    by_profile: dict[str, list[float]] = collections.defaultdict(list)
    for o in offsets_collected:
        by_profile[o["chord_profile"] or "unknown"].append(o["offset"])
    for prof, vals in sorted(by_profile.items(), key=lambda x: -len(x[1])):
        if len(vals) < 10:
            continue
        print(f"  {prof:<22} n={len(vals):>5}  median={statistics.median(vals):>+7.2f}  mean={statistics.mean(vals):>+7.2f}  stdev={statistics.stdev(vals):>5.2f}")

    # Bucket by web angle range
    print("\nOffset by web angle (10° buckets):")
    by_angle: dict[int, list[float]] = collections.defaultdict(list)
    for o in offsets_collected:
        a = int(o["web_angle_to_chord"] // 10) * 10
        by_angle[a].append(o["offset"])
    for a, vals in sorted(by_angle.items()):
        if len(vals) < 10:
            continue
        print(f"  {a:>2}°-{a+10:<2}°  n={len(vals):>5}  median={statistics.median(vals):>+7.2f}  mean={statistics.mean(vals):>+7.2f}")

    # Test the hypothesis: offset = chord_half_depth * tan(angle)?
    # Where chord_half_depth ≈ 35mm for 70mm, 44.5 for 89mm
    # tan(angle from chord)
    print("\nHypothesis test — offset vs chord_half_depth * tan(web angle from chord):")
    samples = []
    for o in offsets_collected:
        prof = o["chord_profile"] or ""
        if "70S41" in prof:
            half_depth = 35.0
        elif "89S41" in prof:
            half_depth = 44.5
        elif "75S41" in prof:
            half_depth = 37.5
        else:
            continue
        a_deg = o["web_angle_to_chord"]
        # Use angle from PERPENDICULAR to chord (i.e. 90 - a_deg if chord is along axis)
        deflection = 90 - a_deg
        if abs(deflection) >= 89:
            continue
        predicted = half_depth * math.tan(math.radians(deflection))
        residual = o["offset"] - predicted
        samples.append({
            "offset": o["offset"],
            "predicted": round(predicted, 2),
            "residual": round(residual, 2),
            "deflection": round(deflection, 1),
            "half_depth": half_depth,
            "profile": prof,
        })
    if samples:
        residuals = [s["residual"] for s in samples]
        print(f"  count: {len(samples):,}")
        print(f"  residual mean:   {statistics.mean(residuals):>+8.2f}")
        print(f"  residual median: {statistics.median(residuals):>+8.2f}")
        print(f"  residual stdev:  {statistics.stdev(residuals):>+8.2f}")

    # Save raw samples
    out_path = ROOT / "docs" / "panel-point-offsets.jsonl"
    with out_path.open("w", encoding="utf-8") as f:
        for o in offsets_collected:
            f.write(json.dumps(o) + "\n")
    print(f"\nWrote {out_path} ({len(offsets_collected):,} samples)")


if __name__ == "__main__":
    main()
