#!/usr/bin/env python3
"""
Static extraction of the TToolDef table from FrameCAD Detailer's Tooling.dll.

PE/binary scan. Finds:
  1. The verb-name strings (`lipnotch`, `webnotch`, etc.) in the .rdata-equivalent
  2. References to those strings from .text — each verb is registered in a
     factory function that records (toolName, OperationType, Length,
     ToolLocation, CoordType).
  3. Pulls the surrounding bytes around each verb-string xref to reconstruct
     the metadata.

Output: docs/cracked/tooldef-table.json

Notes on the decoded class architecture (from docs/detailer-rule-decoded.md):
  - TToolData (Pythia: VA 5256928, instanceSize=24) holds an instance.
  - The 24-byte layout from the strings:
      FLength       : Float64  (offset 0)   — 8 bytes
      FToolLocation : Byte     (offset 8)   — TToolLocation enum
      FToolType     : Byte     (offset 9)   — implicit OperationType discriminator
      [+ pointer to ToolName]
  - Constructor `Create(aTool, aLength, aLocation)` is what we hunt for.
"""
from __future__ import annotations
import json
import os
import re
import struct
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# ----------------------------------------------------------------------------
# Paths
# ----------------------------------------------------------------------------
DLL = Path(r"C:/Program Files (x86)/FrameCAD/Detailer/Version 5/Tooling.dll")
ROOT = Path(__file__).resolve().parents[2]
OUT_JSON = ROOT / "docs" / "cracked" / "tooldef-table.json"
OUT_REPORT_RAW = ROOT / "docs" / "cracked" / "tooldef-extraction-raw.json"

# Verbs we care about (from action-defs.json _meta.actions)
VERBS = [
    "lipnotch",
    "webnotch",
    "leftflange",
    "rightflange",
    "leftpartialflange",
    "rightpartialflange",
    "swage",
    "tab",
    "WebTabHoles",
    "webtabholes",
    "rl_lipnotch",
    "ll_lipnotch",
    "rh_lipnotch",
    "lh_lipnotch",
    "null",
    "bad",
]

# Delphi enum ordinals
T_OPERATION_TYPE = ["otPointTool", "otSpannedTool", "otStartTool", "otEndTool", "otBeforeTool", "otAfterTool"]
T_TOOL_LOCATION = ["tlFlange", "tlLeftFlange", "tlRightFlange"]
T_COORD_TYPE = ["ctDontCare", "ctInnerLip", "ctInnerWeb", "ctLeftLip", "ctRightLip", "ctCenter"]


# ----------------------------------------------------------------------------
# PE parsing — minimal
# ----------------------------------------------------------------------------
@dataclass
class Section:
    name: str
    rva: int
    vsize: int
    raw_off: int
    raw_size: int


@dataclass
class PE:
    image_base: int
    sections: list[Section]
    data: bytes

    def rva_to_off(self, rva: int) -> Optional[int]:
        for s in self.sections:
            if s.rva <= rva < s.rva + max(s.vsize, s.raw_size):
                return s.raw_off + (rva - s.rva)
        return None

    def va_to_off(self, va: int) -> Optional[int]:
        return self.rva_to_off(va - self.image_base)

    def off_to_rva(self, off: int) -> Optional[int]:
        for s in self.sections:
            if s.raw_off <= off < s.raw_off + s.raw_size:
                return s.rva + (off - s.raw_off)
        return None

    def off_to_va(self, off: int) -> Optional[int]:
        rva = self.off_to_rva(off)
        return self.image_base + rva if rva is not None else None

    def section_for_off(self, off: int) -> Optional[Section]:
        for s in self.sections:
            if s.raw_off <= off < s.raw_off + s.raw_size:
                return s
        return None


def parse_pe(p: Path) -> PE:
    data = p.read_bytes()
    if data[:2] != b"MZ":
        raise RuntimeError("not a PE file")
    pe_off = struct.unpack_from("<I", data, 0x3C)[0]
    if data[pe_off:pe_off + 4] != b"PE\x00\x00":
        raise RuntimeError("invalid PE header")
    coff = pe_off + 4
    num_sections = struct.unpack_from("<H", data, coff + 2)[0]
    opt_size = struct.unpack_from("<H", data, coff + 16)[0]
    opt_off = coff + 20
    magic = struct.unpack_from("<H", data, opt_off)[0]
    if magic == 0x10b:  # PE32
        image_base = struct.unpack_from("<I", data, opt_off + 28)[0]
    elif magic == 0x20b:  # PE32+
        image_base = struct.unpack_from("<Q", data, opt_off + 24)[0]
    else:
        raise RuntimeError(f"unknown opt magic {magic:#x}")
    sect_off = opt_off + opt_size
    sections = []
    for i in range(num_sections):
        s_off = sect_off + i * 40
        name = data[s_off:s_off + 8].rstrip(b"\x00").decode("ascii", "replace")
        vsize = struct.unpack_from("<I", data, s_off + 8)[0]
        rva = struct.unpack_from("<I", data, s_off + 12)[0]
        raw_size = struct.unpack_from("<I", data, s_off + 16)[0]
        raw_off = struct.unpack_from("<I", data, s_off + 20)[0]
        sections.append(Section(name=name, rva=rva, vsize=vsize, raw_off=raw_off, raw_size=raw_size))
    return PE(image_base=image_base, sections=sections, data=data)


# ----------------------------------------------------------------------------
# String finder
# ----------------------------------------------------------------------------
def find_string_offsets(pe: PE, s: str) -> list[int]:
    """Find every byte-offset of `s` as a Delphi UnicodeString.

    Delphi UnicodeString layout in .rdata:
        -12  refcount  (Int32, often -1)
        -8   elem_size (Int16, =2 for UTF-16) | code_page (Int16)
        -4   length    (Int32, char count)
         0   data      (UTF-16 LE, length×2 bytes)
        2L   null      (2 bytes: 00 00)

    We search for the UTF-16 encoded text + null terminator, then verify the
    length prefix matches. Returns the OFFSET OF THE FIRST CHARACTER (not the
    metadata header), since that's what xrefs point at.
    """
    utf16 = s.encode("utf-16-le")
    needle = utf16 + b"\x00\x00"
    out = []
    start = 0
    while True:
        idx = pe.data.find(needle, start)
        if idx < 0:
            break
        # Verify prev byte is NOT a UTF-16 letter (to avoid e.g. "lipnotch" inside
        # "rl_lipnotch" — although the leading "_" makes this unlikely).
        # Check length prefix at idx-4: should equal len(s).
        ok = True
        if idx >= 4:
            ln = struct.unpack_from("<i", pe.data, idx - 4)[0]
            if ln != len(s):
                ok = False
        if ok:
            out.append(idx)
        start = idx + 2
    return out


def find_xrefs_to_va(pe: PE, target_va: int) -> list[int]:
    """Find every 4-byte little-endian occurrence of `target_va` in the data."""
    needle = struct.pack("<I", target_va & 0xFFFFFFFF)
    out = []
    start = 0
    while True:
        idx = pe.data.find(needle, start)
        if idx < 0:
            break
        out.append(idx)
        start = idx + 1
    return out


# ----------------------------------------------------------------------------
# Heuristic TToolDef record finder
# ----------------------------------------------------------------------------
def scan_around_xref(pe: PE, xref_off: int, window: int = 64) -> dict:
    """Read bytes around an xref site to capture the surrounding metadata.
    Returns hex preview + decoded floats / enum candidates."""
    lo = max(0, xref_off - window)
    hi = min(len(pe.data), xref_off + window + 4)
    blob = pe.data[lo:hi]
    info = {
        "xref_off": xref_off,
        "xref_va": pe.off_to_va(xref_off),
        "section": pe.section_for_off(xref_off).name if pe.section_for_off(xref_off) else None,
        "blob_hex": blob.hex(),
    }
    # If the xref is in a code section (.text), look for nearby push/mov immediates.
    # If it's in a data table (.rdata / .data), look for adjacent floats / pointers.
    floats = []
    for i in range(0, len(blob) - 8, 4):
        try:
            v = struct.unpack_from("<d", blob, i)[0]
        except struct.error:
            continue
        if 0.1 < abs(v) < 10000.0 and not (v != v):  # plausible mm value
            floats.append({"rel": i - window, "val": round(v, 4)})
    info["nearby_doubles"] = floats[:20]
    # Check for plausible byte-enum patterns (0..6 range bytes adjacent).
    info["nearby_bytes"] = list(blob[max(0, window - 16):window + 20])
    return info


def main():
    print(f"Reading {DLL}")
    pe = parse_pe(DLL)
    print(f"  image_base = {pe.image_base:#x}")
    for s in pe.sections:
        print(f"  section {s.name:8} rva={s.rva:#x} raw_off={s.raw_off:#x} size={s.raw_size:#x}")

    raw = {"verbs": {}}

    for verb in VERBS:
        offsets = find_string_offsets(pe, verb)
        verb_info = {"string_offsets": []}
        for off in offsets:
            va = pe.off_to_va(off)
            sec = pe.section_for_off(off)
            xrefs = find_xrefs_to_va(pe, va) if va is not None else []
            xref_blocks = []
            for xref_off in xrefs[:8]:  # cap to 8 xrefs per verb-string
                xref_blocks.append(scan_around_xref(pe, xref_off))
            verb_info["string_offsets"].append({
                "off": off,
                "va": va,
                "section": sec.name if sec else None,
                "xref_count": len(xrefs),
                "xrefs": xref_blocks,
            })
        raw["verbs"][verb] = verb_info
        print(f"  {verb!r}: {len(offsets)} string occurrences, {sum(s['xref_count'] for s in verb_info['string_offsets'])} total xrefs")

    OUT_REPORT_RAW.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT_RAW.write_text(json.dumps(raw, indent=2))
    print(f"Wrote raw scan: {OUT_REPORT_RAW}")
    return raw


if __name__ == "__main__":
    main()
