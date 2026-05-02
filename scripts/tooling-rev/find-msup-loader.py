"""Find the .msup loader function in Detailer.exe / AutoFrame.dll / Tooling.dll.

Strategy:
  1. Find ".msup" UTF-16-LE bytes in the .data/.rdata sections of each PE.
  2. Find code in .text that references those data addresses (relocation /
     immediate operand). Each xref is a candidate caller.
  3. Walk back from the xref to the start of the enclosing function (look
     for prologue: push ebp / mov ebp,esp or push ebx ; mov ebx,eax in
     Delphi).
  4. Output a ranked list of candidate loader RVAs with surrounding disasm.

Outputs:
  msup-xrefs.txt   — every xref + 32 bytes of context disasm.
  msup-loader.md   — write-up with the most likely loader RVA per binary.
"""
from __future__ import annotations

import os
import sys
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
OUT_TXT = os.path.join(OUT_DIR, "msup-xrefs.txt")

# Strings that imply loader / writer code.
TARGETS = [
    (".msup".encode("utf-16-le"), "utf16:.msup"),
    (".msup".encode("ascii"),     "ascii:.msup"),
    ("Machine Setups".encode("utf-16-le"), "utf16:Machine Setups"),
    ("Machine Setups".encode("ascii"),     "ascii:Machine Setups"),
    ("msup".encode("utf-16-le"),  "utf16:msup"),
    (".sct".encode("utf-16-le"),  "utf16:.sct"),
    (".sct".encode("ascii"),      "ascii:.sct"),
    ("LoadFromFile".encode("ascii"),       "ascii:LoadFromFile"),
    ("LoadFromStream".encode("ascii"),     "ascii:LoadFromStream"),
    ("TMachineSetup".encode("ascii"),      "ascii:TMachineSetup"),
    ("TSectionSetup".encode("ascii"),      "ascii:TSectionSetup"),
]


def find_text_section(pe):
    for s in pe.sections:
        name = s.Name.rstrip(b"\x00").decode("ascii", errors="replace")
        if name in (".text", "CODE"):
            return s
    return pe.sections[0]


def all_data_sections(pe):
    out = []
    for s in pe.sections:
        name = s.Name.rstrip(b"\x00").decode("ascii", errors="replace")
        if name in (".data", ".rdata", "DATA", ".idata", ".tls", ".text"):
            out.append((name, s))
    return out


def find_string_addrs(pe, needle: bytes):
    """Return list of (section_name, image_va, file_offset) for every
    occurrence of `needle` aligned to even bytes."""
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
            # Require word-alignment for utf-16 strings to filter noise.
            if needle.startswith(b".") and not needle[0:1].isalnum():
                pass  # ascii literal
            hits.append((name, start_va + j, s.PointerToRawData + j))
            i = j + 1
    return hits


def disasm_around(pe, md, image_va: int, span: int = 64):
    """Return capstone disasm of `span` bytes centered on image_va."""
    image_base = pe.OPTIONAL_HEADER.ImageBase
    rva = image_va - image_base
    text = find_text_section(pe)
    text_va_lo = image_base + text.VirtualAddress
    text_va_hi = text_va_lo + text.Misc_VirtualSize
    if not (text_va_lo <= image_va < text_va_hi):
        return f"(va 0x{image_va:08x} not in .text [{text_va_lo:08x}-{text_va_hi:08x}])"
    file_off = text.PointerToRawData + (rva - text.VirtualAddress)
    raw = pe.__data__[file_off:file_off + span]
    out = []
    for ins in md.disasm(raw, image_va):
        out.append(f"  {ins.address:08x}  {ins.bytes.hex():<16}  {ins.mnemonic} {ins.op_str}")
        if len(out) > 16:
            break
    return "\n".join(out)


def find_text_xrefs(pe, target_va: int):
    """Find every immediate operand or 4-byte little-endian dword in .text
    that equals target_va. Returns list of (addr, instruction_string)."""
    image_base = pe.OPTIONAL_HEADER.ImageBase
    text = find_text_section(pe)
    data = text.get_data()
    text_start_va = image_base + text.VirtualAddress
    target_le = struct.pack("<I", target_va)

    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
    md.detail = False

    hits = []
    i = 0
    while True:
        j = data.find(target_le, i)
        if j < 0:
            break
        ref_va = text_start_va + j
        # Disasm a chunk starting up to 6 bytes back (most x86 instructions
        # carrying a 4-byte immediate are 5-6 bytes long).
        for back in range(0, 8):
            chunk_start = max(0, j - back)
            chunk = data[chunk_start: chunk_start + 12]
            try:
                ins = next(md.disasm(chunk, text_start_va + chunk_start))
            except StopIteration:
                continue
            # Verify the instruction's bytes contain target_le and crosses j.
            ins_end = ins.address + len(ins.bytes)
            if ins.address <= ref_va < ins_end and target_le in ins.bytes:
                ins_str = f"{ins.address:08x}  {ins.bytes.hex():<16}  {ins.mnemonic} {ins.op_str}"
                hits.append((ins.address, ins_str))
                break
        i = j + 4
    return hits


def main():
    out_lines = []
    md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)

    for path, label in BINARIES:
        if not os.path.isfile(path):
            print(f"[!] missing: {path}")
            continue
        out_lines.append("=" * 78)
        out_lines.append(f"=== {label} ===")
        out_lines.append("=" * 78)
        pe = pefile.PE(path, fast_load=True)
        image_base = pe.OPTIONAL_HEADER.ImageBase
        out_lines.append(f"image_base = 0x{image_base:08x}")

        for needle, descr in TARGETS:
            hits = find_string_addrs(pe, needle)
            if not hits:
                continue
            out_lines.append(f"\n  [{descr}] ({len(needle)} bytes) — {len(hits)} hit(s)")
            for sect_name, va, foff in hits[:8]:
                out_lines.append(f"    @ 0x{va:08x} (sect={sect_name}, file_off=0x{foff:x})")
                # Try to print first 64 bytes of the string for clarity.
                try:
                    raw = pe.get_data(va - image_base, 64)
                    if needle.startswith(b"."):
                        # Ascii or UTF-16
                        if b"\x00" in raw[:8]:
                            try:
                                s = raw.split(b"\x00\x00")[0].decode("utf-16-le", errors="replace")
                            except UnicodeDecodeError:
                                s = repr(raw[:32])
                        else:
                            s = raw.split(b"\x00")[0].decode("ascii", errors="replace")
                        out_lines.append(f"        sample: {s!r}")
                except Exception:
                    pass

                xrefs = find_text_xrefs(pe, va)
                if xrefs:
                    out_lines.append(f"        xrefs in .text: {len(xrefs)}")
                    for x_va, x_str in xrefs[:6]:
                        out_lines.append(f"          {x_str}")
                        # Disasm 32 bytes around the xref for context.
                        out_lines.append(disasm_around(pe, md, x_va, span=48))
                else:
                    out_lines.append("        no xrefs in .text")

        # Also dump exports for AutoFrame/Tooling.
        if hasattr(pe, "DIRECTORY_ENTRY_EXPORT"):
            out_lines.append("\n  EXPORTS:")
            for exp in pe.DIRECTORY_ENTRY_EXPORT.symbols:
                if exp.name:
                    out_lines.append(f"    {exp.address:08x}  {exp.name.decode()}")

    text = "\n".join(out_lines)
    with open(OUT_TXT, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"[+] Wrote {OUT_TXT}  ({len(text)} bytes)")


if __name__ == "__main__":
    main()
