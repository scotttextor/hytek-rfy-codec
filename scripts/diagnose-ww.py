"""Diagnose W-to-W centreline intersections vs original FrameCAD bolt holes.

For every PAIR of webs whose centrelines mathematically intersect within both
sticks' bounds, check whether the ORIGINAL FrameCAD CSV punched a BOLT HOLES
op at that local position on EITHER web.

Empirical answer to: "should the simplifier's centreline rule fire on W-to-W?"

Usage:
  python diagnose-ww.py truss.xml original.csv
"""
import re, math, sys
from collections import defaultdict

if len(sys.argv) < 3:
    print('Usage: python diagnose-ww.py truss.xml original.csv')
    sys.exit(1)

xml_path = sys.argv[1]
csv_path = sys.argv[2]

# ---- parse XML ----
text = open(xml_path).read()
frames = {}  # frame_name -> { plan, sticks: [stick] }

for plan_match in re.finditer(r'<plan name="([^"]+)">(.*?)</plan>', text, re.DOTALL):
    plan_name = plan_match.group(1)
    plan_body = plan_match.group(2)
    if not re.search(r'-LIN-', plan_name, re.IGNORECASE):
        continue
    for fm in re.finditer(r'<frame name="([^"]+)" type="([^"]+)"[^>]*>(.*?)</frame>', plan_body, re.DOTALL):
        frame_name, frame_type, frame_body = fm.groups()
        if frame_type != 'Truss':
            continue
        sticks = []
        for sm in re.finditer(
            r'<stick\s+([^>]*?)>\s*<start>([^<]+)</start>\s*<end>([^<]+)</end>',
            frame_body
        ):
            attrs, st, en = sm.groups()
            def get(s, k):
                m = re.search(rf'\b{k}="([^"]*)"', s)
                return m.group(1) if m else ''
            name = get(attrs, 'name')
            usage = get(attrs, 'usage')
            sx, sy, sz = [float(v) for v in st.strip().split(',')]
            ex, ey, ez = [float(v) for v in en.strip().split(',')]
            sticks.append({
                'name': name, 'usage': usage,
                'start': (sx, sy, sz), 'end': (ex, ey, ez),
            })
        frames[frame_name] = {'plan': plan_name, 'sticks': sticks}

# ---- parse CSV (original) ----
def parse_csv(path):
    out = {}
    with open(path) as f:
        for line in f:
            parts = [p.strip() for p in line.strip().split(',')]
            if len(parts) < 14 or parts[0] != 'COMPONENT':
                continue
            name = parts[1]
            try:
                length = float(parts[7])
            except:
                length = 0
            ops = []
            i = 13
            while i+1 < len(parts):
                tool = parts[i]
                try:
                    pos = float(parts[i+1])
                except:
                    i += 1
                    continue
                ops.append((tool, pos))
                i += 2
            out[name] = {'ops': ops, 'length': length}
    return out

orig = parse_csv(csv_path)

# ---- centreline intersection ----
def line_int(s1, s2, slack=20):
    x1, z1 = s1['start'][0], s1['start'][2]
    x2, z2 = s1['end'][0], s1['end'][2]
    x3, z3 = s2['start'][0], s2['start'][2]
    x4, z4 = s2['end'][0], s2['end'][2]
    d = (x1-x2)*(z3-z4) - (z1-z2)*(x3-x4)
    if abs(d) < 1e-9:
        return None
    t = ((x1-x3)*(z3-z4) - (z1-z3)*(x3-x4)) / d
    u = -((x1-x2)*(z1-z3) - (z1-z2)*(x1-x3)) / d
    L1 = math.hypot(x2-x1, z2-z1)
    L2 = math.hypot(x4-x3, z4-z3)
    st_ = slack/L1 if L1 > 0 else 0
    su = slack/L2 if L2 > 0 else 0
    if not (-st_ <= t <= 1+st_):
        return None
    if not (-su <= u <= 1+su):
        return None
    return t, u

def stick_length(s):
    return math.hypot(s['end'][0]-s['start'][0], s['end'][2]-s['start'][2])

def find_csv_for_stick(frame_name, stick, sticks_in_frame):
    """Return the matching CSV component dict for a given XML stick.
    Match by name+length first, then length-only fallback."""
    prefix = f'{frame_name}-'
    candidates = {n: d for n, d in orig.items() if n.startswith(prefix)}
    target_name = f'{prefix}{stick["name"]}'
    L = stick_length(stick)
    # Pass 1: exact name + length
    if target_name in candidates and abs(candidates[target_name]['length'] - L) < 1.0:
        return candidates[target_name]
    # Pass 2: length-only fallback
    best = None; best_diff = 5.0
    for cname, cdata in candidates.items():
        d = abs(cdata['length'] - L)
        if d < best_diff:
            best_diff = d; best = cdata
    return best

# ---- enumerate W-to-W intersections ----
print(f'\n{"Frame":<10} {"Web-A":<6} {"Web-B":<6} {"X":>9} {"Z":>9} {"posA":>8} {"posB":>8} {"OrigBoltA":<12} {"OrigBoltB":<12} Verdict')
print('-' * 108)

total_ww = 0
ww_with_bolt_either = 0
ww_with_bolt_both = 0
ww_with_no_bolts = 0

per_frame_ww = defaultdict(int)
per_frame_with_bolts = defaultdict(int)

# Track unique pairs by name (girder duplicates produce identical name pairs).
# Use a tolerance comparison on positions to avoid double-counting.
for frame_name in sorted(frames):
    frame = frames[frame_name]
    sticks = frame['sticks']
    seen_pairs = set()  # (nameA, nameB, posA_rounded, posB_rounded)
    for i in range(len(sticks)):
        for j in range(i+1, len(sticks)):
            si, sj = sticks[i], sticks[j]
            if si['usage'].lower() != 'web' or sj['usage'].lower() != 'web':
                continue
            r = line_int(si, sj)
            if not r:
                continue
            t, u = r
            Li = stick_length(si)
            Lj = stick_length(sj)
            posI = max(0, min(Li, t*Li))
            posJ = max(0, min(Lj, u*Lj))
            # X,Z of intersection
            xi = si['start'][0] + t*(si['end'][0]-si['start'][0])
            zi = si['start'][2] + t*(si['end'][2]-si['start'][2])
            # Dedupe by names + pos rounded
            key = (si['name'], sj['name'], round(posI/2)*2, round(posJ/2)*2)
            if key in seen_pairs:
                continue
            seen_pairs.add(key)
            total_ww += 1
            per_frame_ww[frame_name] += 1

            # Check original CSV for bolt holes near posI on web-A and posJ on web-B
            csv_a = find_csv_for_stick(frame_name, si, sticks)
            csv_b = find_csv_for_stick(frame_name, sj, sticks)
            tol = 5.0  # mm

            def has_bolt_near(csv_comp, pos):
                if not csv_comp:
                    return None
                for tool, p in csv_comp['ops']:
                    if tool == 'BOLT HOLES' and abs(p - pos) < tol:
                        return p
                return None

            bolt_a = has_bolt_near(csv_a, posI)
            bolt_b = has_bolt_near(csv_b, posJ)

            if bolt_a is not None or bolt_b is not None:
                ww_with_bolt_either += 1
                per_frame_with_bolts[frame_name] += 1
            else:
                ww_with_no_bolts += 1
            if bolt_a is not None and bolt_b is not None:
                ww_with_bolt_both += 1

            verdict = ''
            if bolt_a is not None and bolt_b is not None:
                verdict = 'BOTH have bolt'
            elif bolt_a is not None:
                verdict = 'ONLY A has bolt'
            elif bolt_b is not None:
                verdict = 'ONLY B has bolt'
            else:
                verdict = 'NEITHER (skip)'

            ba_str = f'{bolt_a:.2f}' if bolt_a is not None else '-'
            bb_str = f'{bolt_b:.2f}' if bolt_b is not None else '-'
            print(f'{frame_name:<10} {si["name"]:<6} {sj["name"]:<6} {xi:>9.1f} {zi:>9.1f} '
                  f'{posI:>8.2f} {posJ:>8.2f} {ba_str:<12} {bb_str:<12} {verdict}')

print('-' * 108)
print()
print('SUMMARY')
print('-------')
print(f'Total W<->W centreline intersections (deduped): {total_ww}')
print(f'  with bolt hole in ORIG CSV on EITHER web:     {ww_with_bolt_either}  '
      f'({100*ww_with_bolt_either/total_ww:.1f}% if non-zero)' if total_ww else '')
print(f'  with bolt hole in ORIG CSV on BOTH webs:      {ww_with_bolt_both}')
print(f'  with NO bolt hole on either web (skip):       {ww_with_no_bolts}')

print()
print('Per-frame breakdown:')
for f in sorted(per_frame_ww):
    print(f'  {f:<10} W<->W={per_frame_ww[f]:<3} with-bolts={per_frame_with_bolts[f]}')
