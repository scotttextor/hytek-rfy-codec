"""HYTEK Linear-Truss simplifier — first-pass post-processor.

Reads:    truss.xml  +  truss.csv  (FrameCAD outputs)
Writes:   truss.simplified.csv      (with the new centreline-intersection rule)

What it does:
  1. Detect Linear trusses via 4-layer test (frame type, plan name pattern,
     profile, geometry signature). NEVER touches walls/floors/non-Linear trusses.
  2. For every pair of sticks whose centrelines actually intersect within both
     sticks' physical bounds:
       - Project intersection onto each stick's local axis
       - Add a "BOLT HOLES" op at that local position on each stick
  3. Keep all OTHER ops untouched (SWAGE, LIP NOTCH, LEG NOTCH, etc.)
  4. Replace original BOLT HOLES with the new centreline-intersection BOLT HOLES.

Safety:
  - Original CSV is never overwritten.
  - Audit log printed for every frame: applied / skipped + reason.
  - Manual exclusion list via --exclude option.
  - --report-only mode shows decisions without writing output.

Usage:
  python simplify-truss.py truss.xml truss.csv [--report-only] [--exclude TN1-3,TN1-4]
"""
import re, math, sys, argparse, os
from collections import defaultdict

# ---------- XML parsing ----------

def parse_xml(xml_path):
    text = open(xml_path).read()
    plans = []
    # plan blocks
    for plan_match in re.finditer(r'<plan name="([^"]+)">(.*?)</plan>', text, re.DOTALL):
        plan_name = plan_match.group(1)
        plan_body = plan_match.group(2)
        frames = []
        for frame_match in re.finditer(r'<frame name="([^"]+)" type="([^"]+)"[^>]*>(.*?)</frame>', plan_body, re.DOTALL):
            frame_name = frame_match.group(1)
            frame_type = frame_match.group(2)
            frame_body = frame_match.group(3)
            sticks = []
            # Match each <stick>...</stick> block, then extract attrs separately
            for stick_match in re.finditer(
                r'<stick\s+([^>]*?)>\s*<start>([^<]+)</start>\s*<end>([^<]+)</end>\s*<profile\s+([^/>]*?)/?>',
                frame_body
            ):
                attrs_str, st, en, prof_str = stick_match.groups()
                def get_attr(s, key):
                    m = re.search(rf'\b{key}="([^"]*)"', s)
                    return m.group(1) if m else ''
                name = get_attr(attrs_str, 'name')
                typ = get_attr(attrs_str, 'type')
                gauge = get_attr(attrs_str, 'gauge')
                usage = get_attr(attrs_str, 'usage')
                sx,sy,sz = [float(v) for v in st.strip().split(',')]
                ex,ey,ez = [float(v) for v in en.strip().split(',')]
                sticks.append({
                    'name': name, 'type': typ, 'gauge': gauge, 'usage': usage,
                    'start': (sx, sy, sz), 'end': (ex, ey, ez),
                    'profile': {
                        'web': get_attr(prof_str, 'web'),
                        'l_flange': get_attr(prof_str, 'l_flange'),
                        'r_flange': get_attr(prof_str, 'r_flange'),
                        'l_lip': get_attr(prof_str, 'l_lip'),
                        'r_lip': get_attr(prof_str, 'r_lip'),
                        'shape': get_attr(prof_str, 'shape'),
                    },
                })
            frames.append({'name': frame_name, 'type': frame_type, 'sticks': sticks})
        plans.append({'name': plan_name, 'frames': frames})
    return {'plans': plans}


# ---------- CSV parsing ----------

def parse_csv(csv_path):
    out = []
    with open(csv_path) as f:
        for line in f:
            parts = [p.strip() for p in line.strip().split(',')]
            if len(parts) < 14 or parts[0] != 'COMPONENT':
                out.append({'kind': 'raw', 'line': line.rstrip('\n')})
                continue
            name = parts[1]
            ops_raw = parts[13:]
            ops = []
            i = 0
            while i+1 < len(ops_raw):
                tool = ops_raw[i]
                try:
                    pos = float(ops_raw[i+1])
                    ops.append([tool, pos])
                except:
                    pass
                i += 2
            out.append({
                'kind': 'component',
                'name': name,
                'header': parts[:13],   # 13 fields before ops
                'ops': ops,
            })
    return out

def write_csv(rows, csv_path):
    with open(csv_path, 'w', newline='') as f:
        for row in rows:
            if row['kind'] == 'raw':
                f.write(row['line'] + '\n')
            else:
                fields = list(row['header'])
                for tool, pos in row['ops']:
                    fields.append(tool)
                    pos_str = f'{pos:.2f}'.rstrip('0').rstrip('.') if '.' in f'{pos:.2f}' else f'{pos:.2f}'
                    fields.append(pos_str)
                f.write(','.join(fields) + '\n')


# ---------- 4-layer detection ----------

def is_linear_truss(plan, frame):
    """Returns (ok: bool, reason: str)"""
    # Layer 1
    if frame['type'] != 'Truss':
        return False, f'frame type "{frame["type"]}" is not Truss'

    # Layer 2
    if not re.search(r'-LIN-', plan['name'], re.IGNORECASE):
        return False, f'plan "{plan["name"]}" does not match -LIN- pattern'

    # Layer 3 — every stick must be 89×41 lipped C with 0.75 gauge
    for s in frame['sticks']:
        p = s['profile']
        if (p['web'] != '89' or p['r_flange'] != '41' or p['l_flange'] != '38' or
                p['l_lip'] != '11.0' or p['r_lip'] != '11.0' or p['shape'] != 'C'):
            return False, f'stick "{s["name"]}" wrong profile ({p["web"]}×{p["r_flange"]} {p["shape"]})'
        if s['gauge'] != '0.75':
            return False, f'stick "{s["name"]}" wrong gauge ({s["gauge"]})'

    # Layer 4 — sanity check: must actually have chords AND webs (filters
    # out frames that pass profile but aren't really trusses)
    has_chord = any(s['usage'].lower() in ('bottomchord', 'topchord') for s in frame['sticks'])
    has_web = any(s['usage'].lower() == 'web' for s in frame['sticks'])

    if not has_chord:
        return False, 'no chord members (not a real truss)'
    if not has_web:
        return False, 'no web members (not a real truss)'

    return True, 'all 4 layers passed'


# ---------- Centreline intersection (XZ plane only — trusses are planar) ----------

def line_intersection_xz(s1, s2, slack_mm=20):
    """Returns (pt_xz, t, u) or None. Uses XZ projection (planar trusses)."""
    x1, z1 = s1['start'][0], s1['start'][2]
    x2, z2 = s1['end'][0], s1['end'][2]
    x3, z3 = s2['start'][0], s2['start'][2]
    x4, z4 = s2['end'][0], s2['end'][2]
    denom = (x1-x2)*(z3-z4) - (z1-z2)*(x3-x4)
    if abs(denom) < 1e-9: return None
    t = ((x1-x3)*(z3-z4) - (z1-z3)*(x3-x4)) / denom
    u = -((x1-x2)*(z1-z3) - (z1-z2)*(x1-x3)) / denom
    L1 = math.hypot(x2-x1, z2-z1)
    L2 = math.hypot(x4-x3, z4-z3)
    st_ = slack_mm/L1 if L1 > 0 else 0
    su = slack_mm/L2 if L2 > 0 else 0
    if not (-st_ <= t <= 1+st_): return None
    if not (-su <= u <= 1+su): return None
    px = x1 + t*(x2-x1)
    pz = z1 + t*(z2-z1)
    return (px, pz), t, u


# ---------- Apply the new rule to one frame ----------

def apply_centreline_rule(frame, csv_components):
    """Mutates csv_components: removes BOLT HOLES on this frame's sticks,
    adds new BOLT HOLES at centreline intersections."""
    sticks = frame['sticks']
    name_to_stick = {s['name']: s for s in sticks}

    # Collect new bolt-hole positions per stick
    new_bolts = defaultdict(list)  # stick_name -> [position_mm]

    for i in range(len(sticks)):
        for j in range(i+1, len(sticks)):
            r = line_intersection_xz(sticks[i], sticks[j])
            if not r: continue
            pt, t, u = r
            # t is parameter along sticks[i] (0..1); local position = t * length_i
            length_i = math.hypot(sticks[i]['end'][0] - sticks[i]['start'][0],
                                  sticks[i]['end'][2] - sticks[i]['start'][2])
            length_j = math.hypot(sticks[j]['end'][0] - sticks[j]['start'][0],
                                  sticks[j]['end'][2] - sticks[j]['start'][2])
            pos_i = max(0, min(length_i, t * length_i))
            pos_j = max(0, min(length_j, u * length_j))
            new_bolts[sticks[i]['name']].append(pos_i)
            new_bolts[sticks[j]['name']].append(pos_j)

    # Dedupe near-identical positions per stick (within 1mm tolerance).
    # Truss girders have 4× duplicate sticks (W6×4 etc.) at slightly different
    # XML coords — produces 4 near-identical intersection positions per crossing.
    def dedupe_positions(positions, tol=1.0):
        out = []
        for p in sorted(positions):
            if not out or abs(p - out[-1]) > tol:
                out.append(p)
        return out

    # Patch the CSV components belonging to this frame
    for comp in csv_components:
        if comp['kind'] != 'component': continue
        # Match by frame prefix
        prefix = frame['name'] + '-'
        if not comp['name'].startswith(prefix): continue
        short = comp['name'][len(prefix):]
        if short not in name_to_stick: continue

        # Remove old BOLT HOLES, keep everything else
        kept = [(t, p) for t, p in comp['ops'] if t != 'BOLT HOLES']

        # Dedupe positions, then add new BOLT HOLES at centreline-intersection positions
        for pos in dedupe_positions(new_bolts.get(short, [])):
            kept.append(('BOLT HOLES', round(pos, 2)))

        comp['ops'] = kept


# ---------- Main ----------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xml', help='Truss XML file from FrameCAD Structure')
    ap.add_argument('csv', help='Truss CSV file from FrameCAD Structure')
    ap.add_argument('--out', default=None, help='Output CSV path (default: input.simplified.csv)')
    ap.add_argument('--report-only', action='store_true', help='Show decisions but do not write output')
    ap.add_argument('--exclude', default='', help='Comma-separated frame names to NEVER simplify')
    args = ap.parse_args()

    exclude = set(s.strip() for s in args.exclude.split(',') if s.strip())

    print(f'Reading XML:  {args.xml}')
    xml = parse_xml(args.xml)
    print(f'Reading CSV:  {args.csv}')
    csv_rows = parse_csv(args.csv)

    print(f'\nAUDIT LOG (4-layer detection per frame):')
    print(f'{"-"*78}')
    print(f'{"Plan/Frame":<40} {"Decision":<10} Reason')
    print(f'{"-"*78}')

    applied_count = 0
    skipped_count = 0
    for plan in xml['plans']:
        for frame in plan['frames']:
            label = f'{plan["name"]}/{frame["name"]}'
            if frame['name'] in exclude:
                print(f'{label:<40} {"SKIP":<10} in exclude list')
                skipped_count += 1
                continue
            ok, reason = is_linear_truss(plan, frame)
            if not ok:
                print(f'{label:<40} {"SKIP":<10} {reason}')
                skipped_count += 1
                continue
            print(f'{label:<40} {"APPLY":<10} {reason}')
            applied_count += 1
            if not args.report_only:
                apply_centreline_rule(frame, csv_rows)

    print(f'{"-"*78}')
    print(f'Applied:  {applied_count} frames')
    print(f'Skipped:  {skipped_count} frames')
    print()

    if args.report_only:
        print('REPORT-ONLY mode: no output written.')
        return

    # Write output
    out_path = args.out
    if not out_path:
        base, ext = os.path.splitext(args.csv)
        out_path = f'{base}.simplified{ext}'
    write_csv(csv_rows, out_path)
    print(f'Wrote: {out_path}')


if __name__ == '__main__':
    main()
