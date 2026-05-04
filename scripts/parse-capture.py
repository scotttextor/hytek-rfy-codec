"""
Parse a frida capture-records.log into structured records.

For each add_frameobject call we extract:
  - frame_id, endpoints
  - FrameRecord 50 bytes (hex)
  - SectionLookupRecord 185 bytes (hex)  ← THE CATALOG PAYLOAD
  - FrameDefRecord 75 bytes (hex)
  - the ops array returned by get_operations_for

Deduplicates SectionLookupRecords by exact byte content. Each unique record
is one HYTEK profile/frame-type catalog. Writes:
  scripts/catalog/index.json        — {hash: { sect_hex, sample_frame_ids[5], sample_endpoints[5] }}
  scripts/catalog/<hash>.bin        — raw 185-byte payload, ready to splice into tooling-driver.py
  scripts/catalog/records.jsonl     — every parsed record (full triple + ops)

Usage:
    python parse-capture.py scripts/capture-records.log scripts/catalog
"""
import sys
import re
import json
import hashlib
from pathlib import Path


CALL_HDR = re.compile(r"=+ add_frameobject call #(\d+) =+")
PTR_RE   = re.compile(r"\b(FrameRecord\*|SectionLookupRec\*|FrameDefRecord\*)\s*=\s*(0x[0-9a-fA-F]+)")
LBL_RE   = re.compile(r"^(FrameRecord|SectionLookupRecord|FrameDefRecord)(?: \([^)]*\))? \((\d+) bytes\):\s*$")
HEX_LINE = re.compile(r"^\s*[0-9a-fA-F]{2}(?:[\s|]+[0-9a-fA-F]{2})*\s*$")
FRAMEID  = re.compile(r"^\s*frame_id\s*=\s*(\d+)\s*$")
EP1      = re.compile(r"^\s*endpoint1\s*=\s*\(([-0-9.]+),\s*([-0-9.]+)\)\s*$")
EP2      = re.compile(r"^\s*endpoint2\s*=\s*\(([-0-9.]+),\s*([-0-9.]+)\)\s*$")
RULECNT  = re.compile(r"^\s*SectionLookupRecord rule_count.*=\s*(\d+)\s*$")
RC_RE    = re.compile(r"\s*→ rc = 0x([0-9a-fA-F]+)")
GETOPS   = re.compile(r"^\s*get_operations_for\(frame_id=(\d+)\) → rc=(\d+), len=(\d+)\s*$")
OP_LINE  = re.compile(r"^\s*op\[(\d+)\]:\s*((?:[0-9a-fA-F]{2}\s*)+)$")


def hexstrip(s: str) -> str:
    return "".join(s.split())


def parse(path: Path):
    records = []
    cur = None
    cur_label = None
    cur_label_left = 0  # bytes still expected for the current hex block
    cur_label_buf = ""

    # Emit helper
    def flush_record():
        if cur and cur.get("call_id") is not None:
            records.append(cur)

    # Standalone ops captures keyed by frame_id (we'll fold them into records
    # later by frame_id, since get_operations_for can fire outside any
    # add_frameobject context).
    ops_by_frame = {}
    current_ops_frame = None

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for raw in f:
            line = raw.rstrip("\n")

            # New call header
            m = CALL_HDR.match(line)
            if m:
                if cur:
                    flush_record()
                cur = {
                    "call_id": int(m.group(1)),
                    "ptrs": {},
                    "FrameRecord": "",
                    "SectionLookupRecord": "",
                    "FrameDefRecord": "",
                    "frame_id": None,
                    "endpoint1": None,
                    "endpoint2": None,
                    "rule_count": None,
                    "rc": None,
                    "ops": [],
                    "ops_meta": None,
                }
                cur_label = None
                cur_label_left = 0
                cur_label_buf = ""
                last_record_for_ops = cur
                continue

            if not cur:
                continue

            # Pointer line
            for pm in PTR_RE.finditer(line):
                key = pm.group(1).rstrip("*")
                cur["ptrs"][key] = pm.group(2)

            # Label line for hex block
            lm = LBL_RE.match(line)
            if lm:
                cur_label = lm.group(1)
                cur_label_left = int(lm.group(2))
                cur_label_buf = ""
                continue

            # Hex continuation: must be currently in a label and the line must
            # consist of hex pairs (with whitespace and/or | separators).
            if cur_label and cur_label_left > 0 and HEX_LINE.match(line):
                h = re.sub(r"[^0-9a-fA-F]", "", line)
                cur_label_buf += h
                consumed = len(h) // 2
                cur_label_left -= consumed
                if cur_label_left <= 0:
                    cur[cur_label] = cur_label_buf
                    cur_label = None
                    cur_label_buf = ""
                    cur_label_left = 0
                continue

            # Decoded fields
            fm = FRAMEID.match(line)
            if fm:
                cur["frame_id"] = int(fm.group(1))
                continue
            e1 = EP1.match(line)
            if e1:
                cur["endpoint1"] = [float(e1.group(1)), float(e1.group(2))]
                continue
            e2 = EP2.match(line)
            if e2:
                cur["endpoint2"] = [float(e2.group(1)), float(e2.group(2))]
                continue
            rc = RULECNT.match(line)
            if rc:
                cur["rule_count"] = int(rc.group(1))
                continue
            rcm = RC_RE.match(line)
            if rcm:
                cur["rc"] = int(rcm.group(1), 16)
                continue

            # get_operations_for line + ops — keyed by frame_id (not position)
            go = GETOPS.match(line)
            if go:
                fid = int(go.group(1))
                current_ops_frame = fid
                ops_by_frame[fid] = {
                    "frame_id": fid,
                    "rc": int(go.group(2)),
                    "len": int(go.group(3)),
                    "ops": [],
                }
                continue
            om = OP_LINE.match(line)
            if om and current_ops_frame is not None:
                ops_by_frame[current_ops_frame]["ops"].append({"i": int(om.group(1)), "hex": hexstrip(om.group(2))})
                continue

        flush_record()

    # Fold ops into records by frame_id (most recent ops capture wins for a
    # given frame_id, which matches Detailer's last-rebuilt state).
    for r in records:
        fid = r.get("frame_id")
        if fid is not None and fid in ops_by_frame:
            ob = ops_by_frame[fid]
            r["ops_meta"] = {"frame_id": ob["frame_id"], "rc": ob["rc"], "len": ob["len"]}
            r["ops"] = ob["ops"]

    return records, ops_by_frame


def main():
    if len(sys.argv) < 3:
        print("usage: parse-capture.py <log> <out_dir>")
        sys.exit(1)
    log = Path(sys.argv[1])
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    records, ops_by_frame = parse(log)
    print(f"parsed {len(records)} records, ops captured for {len(ops_by_frame)} unique frame_ids")
    have_ops = sum(1 for r in records if r["ops"])
    print(f"records with ops attached: {have_ops}")
    # Save ops separately keyed by frame_id (cleanest source-of-truth)
    (out / "ops_by_frame.json").write_text(json.dumps(ops_by_frame, indent=2))
    print(f"wrote {out}/ops_by_frame.json ({len(ops_by_frame)} frames)")
    # Validate: count records with full data
    full = [r for r in records if r["SectionLookupRecord"] and len(r["SectionLookupRecord"]) == 370]
    print(f"records with complete 185-byte SectionLookupRecord: {len(full)}")

    # Deduplicate catalogs
    catalogs = {}
    for r in records:
        sect = r["SectionLookupRecord"]
        if not sect or len(sect) != 370:
            continue
        h = hashlib.sha1(bytes.fromhex(sect)).hexdigest()[:12]
        entry = catalogs.setdefault(h, {
            "hash": h,
            "sect_hex": sect,
            "sample_frame_ids": [],
            "sample_endpoints": [],
            "stick_count": 0,
            "rule_count": r["rule_count"],
            "ops_lengths": [],
        })
        entry["stick_count"] += 1
        if len(entry["sample_frame_ids"]) < 5 and r["frame_id"] is not None:
            entry["sample_frame_ids"].append(r["frame_id"])
        if len(entry["sample_endpoints"]) < 5 and r["endpoint1"] is not None and r["endpoint2"] is not None:
            entry["sample_endpoints"].append({"e1": r["endpoint1"], "e2": r["endpoint2"]})
        if r["ops_meta"] and len(entry["ops_lengths"]) < 10:
            entry["ops_lengths"].append(r["ops_meta"]["len"])

    print(f"\n{len(catalogs)} unique SectionLookupRecord catalogs:")
    for h, c in sorted(catalogs.items(), key=lambda kv: -kv[1]["stick_count"]):
        print(f"  {h}  sticks={c['stick_count']:5d}  ops_lens={c['ops_lengths'][:5]}  sample_ids={c['sample_frame_ids']}")

    # Write outputs
    index = {h: {k: v for k, v in c.items() if k != "sect_hex"} for h, c in catalogs.items()}
    (out / "index.json").write_text(json.dumps(index, indent=2))
    for h, c in catalogs.items():
        (out / f"{h}.bin").write_bytes(bytes.fromhex(c["sect_hex"]))

    # Records JSONL
    with open(out / "records.jsonl", "w", encoding="utf-8") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")

    print(f"\nwrote: {out}/index.json, {len(catalogs)} *.bin files, records.jsonl ({len(records)} records)")


if __name__ == "__main__":
    main()
