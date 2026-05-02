"""find-msup-loader2.py — improved version.

Three fixes vs v1:
 1. Search for `target_va` AND `target_va - 8` (Delphi AnsiString hdr offset)
    AND `target_va - 0xc` (Delphi UnicodeString hdr — codepage + refcount + len).
 2. Use `fast_load=False` so we get exports.
 3. Also dump the function start (look back for typical Delphi prologue:
    `push ebp ; mov ebp, esp` or `push ebx`) for each xref.
"""
from __future__ import annotations

import os
import struct
import pefile
import capstone

BINARIES = [
    (r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe",
     "Detailer.exe"),
    (r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\AutoFrame.dll",
     "AutoFrame.dll"),
    (r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll",
     "Tooling.dll"),
]
OUT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_TXT = os.path.join(OUT_DIR, "msup-xrefs2.txt")

TARGETS = [
    (".msup".encode("utf-16-le"), "utf16:.msup"),
    ("Machine Setups".encode("utf-16-le"), "utf16:Machine Setups"),
    ("msup".encode("utf-16-le"), "utf16:msup"),
    (".sct".encode("utf-16-le"), "utf16:.sct"),
    (".sct".encode("ascii"), "ascii:.sct"),
    ("MachineSetup", "ascii:MachineSetup"),
    ("LoadFromFile", "ascii:LoadFromFile"),
]
# Convert pure-ascii TARGETS strings to bytes uniformly.
TARGETS = [(t if isinstance(t, bytes) else t.encode('ascii'), descr) for t, descr in TARGETS]


def all_data_sections(pe):
    out = []
    for s in pe.sections:
        name = s.Name.rstrip(b"\x00").decode("ascii", errors="replace")
        if name not in (".reloc",):
            out.append((name, s))
    return out


def find_string_addrs(pe, needle: bytes):
    image_base = pe.OPTIONAL_HEADER.ImageBase
    hits = []
    for name, s in all_data_sections(pe):
        data = s.get_data()
        start_va = image_base + s.VirtualAddress
        i = 0
        while True:
            j = data.find(needle, i)
            if j < 0:
                break
            hits.append((name, start_va + j, s.PointerToRawData + j))
            i = j + 1
    return hits


def find_text_section(pe):
    for s in pe.sections:
        name = s.Name.rstrip(b"\x00").decode("ascii", errors="replace")
        if name in (".text", "CODE"):
            return s
    return pe.sections[0]


def find_text_xrefs_to(pe, candidate_vas: list[int]):
    """Search .text for any little-endian dword that matches one of
    candidate_vas. Return list of (matched_va, ref_va_in_text)."""
    image_base = pe.OPTIONAL_HEADER.ImageBase
    text = find_text_section(pe)
    data = text.get_data()
    text_start_va = image_base + text.VirtualAddress
    candidates = {struct.pack("<I", v): v for v in candidate_vas}
    hits = []
    # Brute-force scan — fast enough for ~10MB .text.
    for needle, va in candidates.items():
        i = 0
        while True:
            j = data.find(needle, i)
            if j < 0:
                break
            ref_va = text_start_va + j
            hits.append((va, ref_va))
            i = j + 1
    return hits


def disasm_at(pe, md, image_va: int, span: int = 64):
    image_base = pe.OPTIONAL_HEADER.ImageBase
    text = find_text_section(pe)
    text_va_lo = image_base + text.VirtualAddress
    if not (text_va_lo <= image_va < text_va_lo + text.Misc_VirtualSize):
        return f"(va not in .text)"
    file_off = text.PointerToRawData + (image_va - text_va_lo)
    raw = pe.__data__[file_off:file_off + span]
    out = []
    for ins in md.disasm(raw, image_va):
        out.append(f"  {ins.address:08x}  {ins.bytes.hex():<14}  {ins.mnemonic} {ins.op_str}")
        if len(out) > 8:
            break
    return "\n".join(out)


def find_function_start(pe, md, ref_va: int, max_back=0x400):
    """Walk back from ref_va looking for the start of the enclosing function.
    Heuristics:
      - 0xCC padding (int3) — typical Delphi inter-function gap.
      - `push ebp ; mov ebp, esp` — explicit prologue.
      - `push ebx ; mov ebx, eax` — Delphi class method prologue.
    """
    image_base = pe.OPTIONAL_HEADER.ImageBase
    text = find_text_section(pe)
    text_va_lo = image_base + text.VirtualAddress
    file_off = text.PointerToRawData + (ref_va - text_va_lo)
    start = max(file_off - max_back, text.PointerToRawData)
    raw = pe.__data__[start:file_off + 4]
    # Look for the LAST 0xCC byte before ref_va; that's likely just before a
    # function start.
    last_cc = raw.rfind(b"\xcc")
    if last_cc >= 0 and last_cc < len(raw) - 4:
        candidate = start + last_cc + 1
        # Skip any further 0xCC padding.
        while pe.__data__[candidate:candidate + 1] == b"\xcc":
            candidate += 1
        return text_va_lo + (candidate - text.PointerToRawData)
    return ref_va  # fallback


def main():
    out = []
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)

    for path, label in BINARIES:
        if not os.path.isfile(path):
            continue
        out.append("=" * 78)
        out.append(f"=== {label} ===")
        out.append("=" * 78)
        pe = pefile.PE(path, fast_load=False)
        image_base = pe.OPTIONAL_HEADER.ImageBase
        out.append(f"image_base = 0x{image_base:08x}")

        for needle, descr in TARGETS:
            hits = find_string_addrs(pe, needle)
            if not hits:
                continue
            out.append(f"\n  [{descr}] — {len(hits)} string occurrence(s)")
            # Build candidate VAs: body VA, body-8 (Ansi hdr), body-0xc (Unicode hdr).
            candidate_vas = []
            for sect_name, va, foff in hits:
                candidate_vas.extend([va, va - 8, va - 0xc, va - 4, va - 0x10])

            xrefs = find_text_xrefs_to(pe, candidate_vas)
            if not xrefs:
                out.append(f"    no xrefs found anywhere in .text (tried VA, VA-4, VA-8, VA-c, VA-10)")
                continue
            out.append(f"    {len(xrefs)} xref(s) (using offset variants):")
            for hit_va, ref_va in xrefs[:30]:
                offset = next(v[1] - hit_va for v in [(("",) , hit_va) ] if False) if False else 0  # noop
                # Compute which offset variant matched
                deltas = []
                for sect_name, body_va, foff in hits:
                    if body_va == hit_va:
                        deltas.append("body")
                    elif body_va - 8 == hit_va:
                        deltas.append("hdr-8")
                    elif body_va - 0xc == hit_va:
                        deltas.append("hdr-c")
                    elif body_va - 4 == hit_va:
                        deltas.append("hdr-4")
                    elif body_va - 0x10 == hit_va:
                        deltas.append("hdr-10")
                kind = "/".join(deltas) if deltas else "?"
                out.append(f"      ref @ 0x{ref_va:08x}  -> string VA 0x{hit_va:08x} ({kind})")
                out.append(disasm_at(pe, md, ref_va - 1, span=24))
                fn_start = find_function_start(pe, md, ref_va)
                if fn_start != ref_va:
                    out.append(f"      [enclosing fn likely starts at 0x{fn_start:08x}]")
                out.append("")

        # Exports
        if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
            out.append("\n  EXPORTS:")
            for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols:
                if exp.name:
                    out.append(f"    rva 0x{exp.address:08x}  {exp.name.decode()}")

    text = "\n".join(out)
    with open(OUT_TXT, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"[+] Wrote {OUT_TXT}  ({len(text)} bytes)")


if __name__ == "__main__":
    main()
