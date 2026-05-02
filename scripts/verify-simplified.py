"""Manual verification: for a specific stick, prove the simplified BOLT HOLES
are at the correct centreline-intersection positions.

Usage:
  python verify-simplified.py truss.xml original.csv simplified.csv FRAME-STICK

  e.g. python verify-simplified.py truss.xml orig.csv simp.csv TN2-1-W5
"""
import re, math, sys

if len(sys.argv) < 5:
    print('Usage: python verify-simplified.py truss.xml original.csv simplified.csv FRAME-STICK')
    print('       e.g.  python verify-simplified.py truss.xml orig.csv simp.csv TN2-1-W5')
    sys.exit(1)

xml_path, orig_path, simp_path, target = sys.argv[1:5]

# Parse the XML to get all stick coordinates for the target's frame
text = open(xml_path).read()
frame_name = '-'.join(target.split('-')[:-1])
stick_short = target.split('-')[-1]

frame_match = re.search(rf'<frame name="{re.escape(frame_name)}"[^>]*>(.*?)</frame>', text, re.DOTALL)
if not frame_match:
    print(f'Frame {frame_name} not found in XML')
    sys.exit(1)
frame_body = frame_match.group(1)

sticks = {}
for sm in re.finditer(r'<stick\s+([^>]*?)>\s*<start>([^<]+)</start>\s*<end>([^<]+)</end>', frame_body):
    attrs, st, en = sm.groups()
    name = re.search(r'name="([^"]+)"', attrs).group(1)
    sx, sy, sz = [float(v) for v in st.strip().split(',')]
    ex, ey, ez = [float(v) for v in en.strip().split(',')]
    sticks[name] = {'start': (sx, sy, sz), 'end': (ex, ey, ez)}

if stick_short not in sticks:
    print(f'Stick {stick_short} not in frame {frame_name}')
    sys.exit(1)

t_stick = sticks[stick_short]
length = math.hypot(t_stick['end'][0] - t_stick['start'][0],
                    t_stick['end'][2] - t_stick['start'][2])

print(f'\n=== Verifying {target} ===')
print(f'Stick: {stick_short}')
print(f'  start = {t_stick["start"]}')
print(f'  end   = {t_stick["end"]}')
print(f'  length = {length:.2f} mm')
print()

# Find all centreline intersections involving this stick
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
    return (x1 + t*(x2-x1), z1 + t*(z2-z1)), t, u

print('Centreline intersections found (math from XML coords):')
expected_positions = []
for other_name, other in sticks.items():
    if other_name == stick_short: continue
    r = line_int(t_stick, other)
    if r:
        pt, t, u = r
        local_pos = t * length
        expected_positions.append((other_name, local_pos, pt))
        print(f'  with {other_name:5s}: intersection at world ({pt[0]:.2f}, {pt[1]:.2f})')
        print(f'                  -> local position on {stick_short}: {local_pos:.2f} mm')

# Read both CSVs to compare
def get_ops(path, target_name):
    with open(path) as f:
        for line in f:
            parts = [p.strip() for p in line.strip().split(',')]
            if len(parts) < 14 or parts[0] != 'COMPONENT': continue
            if parts[1] != target_name: continue
            ops_raw = parts[13:]
            ops = []
            i = 0
            while i+1 < len(ops_raw):
                try:
                    pos = float(ops_raw[i+1])
                    ops.append((ops_raw[i], pos))
                except: pass
                i += 2
            return ops
    return None

orig_ops = get_ops(orig_path, target) or []
simp_ops = get_ops(simp_path, target) or []

orig_bolts = sorted(p for t, p in orig_ops if t == 'BOLT HOLES')
simp_bolts = sorted(p for t, p in simp_ops if t == 'BOLT HOLES')
expected_bolts = sorted(local for _, local, _ in expected_positions)

print()
print(f'Original BOLT HOLES ({len(orig_bolts)}):  {orig_bolts}')
print(f'Simplified BOLT HOLES ({len(simp_bolts)}): {[round(p,2) for p in simp_bolts]}')
print(f'Expected (centreline) ({len(expected_bolts)}): {[round(p,2) for p in expected_bolts]}')
print()

# Verify
match = True
if len(simp_bolts) != len(expected_bolts):
    print(f'MISMATCH count: simplified={len(simp_bolts)}, expected={len(expected_bolts)}')
    match = False
else:
    for s, e in zip(simp_bolts, expected_bolts):
        if abs(s - e) > 0.5:
            print(f'MISMATCH position: simplified={s:.2f}, expected={e:.2f}')
            match = False

if match:
    print('PASS — simplified BOLT HOLES match the centreline-intersection positions exactly')
else:
    print('FAIL — see mismatches above')
