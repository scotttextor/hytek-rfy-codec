"""Comprehensive verification: loop through every stick in every frame,
compare simplified BOLT HOLES positions to the mathematically-expected
centreline-intersection positions.

Usage:
  python verify-all.py truss.xml original.csv simplified.csv [--verbose]
"""
import re, math, sys, argparse
from collections import defaultdict

ap = argparse.ArgumentParser()
ap.add_argument('xml')
ap.add_argument('orig_csv')
ap.add_argument('simp_csv')
ap.add_argument('--verbose', action='store_true')
ap.add_argument('--tolerance', type=float, default=0.5, help='mm tolerance for position match')
args = ap.parse_args()

# ---------- parse XML for stick coords + frame-level data ----------
xml_text = open(args.xml).read()

frames = {}  # frame_name -> { plan, type, sticks: {name: stick} }

for plan_match in re.finditer(r'<plan name="([^"]+)">(.*?)</plan>', xml_text, re.DOTALL):
    plan_name = plan_match.group(1)
    plan_body = plan_match.group(2)
    for fm in re.finditer(r'<frame name="([^"]+)" type="([^"]+)"[^>]*>(.*?)</frame>', plan_body, re.DOTALL):
        frame_name, frame_type, frame_body = fm.groups()
        # Use a LIST so duplicate stick names (girder doublings) are preserved.
        # Sticks get unique IDs (name#0, name#1, ...) but keep their real name too.
        sticks = []
        name_seen = {}
        for sm in re.finditer(r'<stick\s+([^>]*?)>\s*<start>([^<]+)</start>\s*<end>([^<]+)</end>', frame_body):
            attrs, st, en = sm.groups()
            def get(s, k):
                m = re.search(rf'\b{k}="([^"]*)"', s)
                return m.group(1) if m else ''
            name = get(attrs, 'name')
            usage = get(attrs, 'usage')
            sx, sy, sz = [float(v) for v in st.strip().split(',')]
            ex, ey, ez = [float(v) for v in en.strip().split(',')]
            idx = name_seen.get(name, 0)
            name_seen[name] = idx + 1
            sticks.append({'name': name, 'idx': idx, 'usage': usage, 'start': (sx, sy, sz), 'end': (ex, ey, ez)})
        frames[frame_name] = {'plan': plan_name, 'type': frame_type, 'sticks': sticks}

# ---------- parse CSVs ----------
def parse_csv(path):
    """Returns dict: name → {ops: [...], length: float}"""
    out = {}
    with open(path) as f:
        for line in f:
            parts = [p.strip() for p in line.strip().split(',')]
            if len(parts) < 14 or parts[0] != 'COMPONENT': continue
            name = parts[1]
            try: length = float(parts[7])
            except: length = 0
            ops = []
            i = 13
            while i+1 < len(parts):
                tool = parts[i]
                try: pos = float(parts[i+1])
                except: i += 1; continue
                ops.append((tool, pos))
                i += 2
            out[name] = {'ops': ops, 'length': length}
    return out

orig = parse_csv(args.orig_csv)
simp = parse_csv(args.simp_csv)

# ---------- centreline intersection ----------
def line_int(s1, s2, slack=20):
    x1, z1 = s1['start'][0], s1['start'][2]
    x2, z2 = s1['end'][0], s1['end'][2]
    x3, z3 = s2['start'][0], s2['start'][2]
    x4, z4 = s2['end'][0], s2['end'][2]
    d = (x1-x2)*(z3-z4) - (z1-z2)*(x3-x4)
    if abs(d) < 1e-9: return None
    t = ((x1-x3)*(z3-z4) - (z1-z3)*(x3-x4)) / d
    u = -((x1-x2)*(z1-z3) - (z1-z2)*(x1-x3)) / d
    L1 = math.hypot(x2-x1, z2-z1)
    L2 = math.hypot(x4-x3, z4-z3)
    st_ = slack/L1 if L1 > 0 else 0
    su = slack/L2 if L2 > 0 else 0
    if not (-st_ <= t <= 1+st_): return None
    if not (-su <= u <= 1+su): return None
    return t, u

# ---------- run verification per stick ----------
results = []  # (frame, stick, status, detail)
total_sticks = 0
pass_sticks = 0
fail_sticks = 0
skipped_frames = []

for frame_name, frame in frames.items():
    if frame['type'] != 'Truss':
        skipped_frames.append((frame_name, f'type={frame["type"]} (not Truss)'))
        continue
    if not re.search(r'-LIN-', frame['plan'], re.IGNORECASE):
        skipped_frames.append((frame_name, f'plan={frame["plan"]} (not Linear)'))
        continue

    sticks = frame['sticks']  # list

    # compute expected bolt positions per stick (keyed by name; duplicates aggregated)
    expected = defaultdict(list)
    for i in range(len(sticks)):
        for j in range(i+1, len(sticks)):
            # Skip web-to-web intersections. HYTEK Linear trusses fasten webs
            # only to chords (never web-to-web) — FrameCAD does not punch
            # BOLT HOLES at W<->W mathematical crossings, and neither does
            # the simplifier, so the verifier must skip them too.
            if (sticks[i].get('usage', '').lower() == 'web' and
                    sticks[j].get('usage', '').lower() == 'web'):
                continue
            r = line_int(sticks[i], sticks[j])
            if not r: continue
            t, u = r
            L1 = math.hypot(sticks[i]['end'][0]-sticks[i]['start'][0],
                            sticks[i]['end'][2]-sticks[i]['start'][2])
            L2 = math.hypot(sticks[j]['end'][0]-sticks[j]['start'][0],
                            sticks[j]['end'][2]-sticks[j]['start'][2])
            expected[sticks[i]['name']].append(max(0, min(L1, t*L1)))
            expected[sticks[j]['name']].append(max(0, min(L2, u*L2)))

    # Dedupe near-identical positions (girder duplicate-stick artefacts)
    def dedupe(positions, tol=1.0):
        out = []
        for p in sorted(positions):
            if not out or abs(p - out[-1]) > tol:
                out.append(p)
        return out

    # Find CSV components in this frame (handles "B1 (Box1)" splice naming)
    prefix = f'{frame_name}-'
    csv_in_frame = {n: d for n, d in simp.items() if n.startswith(prefix)}

    # Verify uniquely-named XML sticks against the corresponding CSV components.
    # For duplicate-named sticks (girder W6×4 etc.), the simplifier rolls them
    # into one bolt-list per name, then each CSV component instance gets the
    # same dedupe'd list — verify against ANY one CSV component of that name.
    seen_names = set()
    for stick_data in frame['sticks']:
        stick_name = stick_data['name']
        if stick_name in seen_names: continue   # only check each name once
        seen_names.add(stick_name)
        total_sticks += 1
        # Find the matching CSV component by name+length
        slen = math.hypot(stick_data['end'][0]-stick_data['start'][0],
                          stick_data['end'][2]-stick_data['start'][2])
        csv_name = None
        target = f'{prefix}{stick_name}'
        if target in csv_in_frame and abs(csv_in_frame[target]['length'] - slen) < 1.0:
            csv_name = target
        else:
            # Length-only match for splice sticks (B1 (Box1) → XML B2)
            best = None; best_diff = 5.0
            for cname, cdata in csv_in_frame.items():
                d = abs(cdata['length'] - slen)
                if d < best_diff: best_diff = d; best = cname
            csv_name = best
        simp_ops = simp.get(csv_name, {}).get('ops', []) if csv_name else []
        simp_bolts = dedupe([round(p, 2) for t, p in simp_ops if t == 'BOLT HOLES'])
        expected_bolts = dedupe([round(p, 2) for p in expected.get(stick_name, [])])

        # Compare
        if len(simp_bolts) != len(expected_bolts):
            results.append((frame_name, stick_name, 'FAIL',
                            f'count: simp={len(simp_bolts)} vs expected={len(expected_bolts)}'))
            fail_sticks += 1
            continue
        mismatch = []
        for s, e in zip(simp_bolts, expected_bolts):
            if abs(s - e) > args.tolerance:
                mismatch.append((s, e))
        if mismatch:
            results.append((frame_name, stick_name, 'FAIL',
                            f'positions differ: {mismatch[:3]}'))
            fail_sticks += 1
        else:
            results.append((frame_name, stick_name, 'PASS', f'{len(simp_bolts)} bolts'))
            pass_sticks += 1

# ---------- print results ----------
if args.verbose:
    print(f'\n{"Frame":<12} {"Stick":<8} {"Status":<6} Detail')
    print('-' * 70)
    for f, s, st, d in results:
        print(f'{f:<12} {s:<8} {st:<6} {d}')

# Summary by frame
print('\nSummary by frame:')
print(f'{"Frame":<14} {"PASS":>6} {"FAIL":>6} Detail')
print('-' * 60)
by_frame = defaultdict(lambda: {'pass': 0, 'fail': 0, 'fails': []})
for f, s, st, d in results:
    if st == 'PASS': by_frame[f]['pass'] += 1
    else:
        by_frame[f]['fail'] += 1
        by_frame[f]['fails'].append((s, d))
for f in sorted(by_frame):
    info = by_frame[f]
    fail_summary = ''
    if info['fails']:
        fail_summary = '  (' + ', '.join(f'{s}: {d[:30]}' for s, d in info['fails'][:3]) + ')'
    print(f'{f:<14} {info["pass"]:>6} {info["fail"]:>6}{fail_summary}')

print()
if skipped_frames:
    print('Skipped (non-Linear) frames:')
    for n, r in skipped_frames:
        print(f'  {n}: {r}')
    print()

print('=' * 60)
print(f'OVERALL: {pass_sticks}/{total_sticks} sticks PASS, {fail_sticks} FAIL')
print(f'         {len(by_frame)} Linear frames verified, {len(skipped_frames)} skipped')
if fail_sticks == 0:
    print('         PASS - every stick matches expected centreline-intersection positions')
else:
    print(f'         FAIL - {fail_sticks} sticks have mismatches — investigate above')
