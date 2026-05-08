"""Find the function VAs of named Delphi methods by walking RTTI.

Strategy:
1. Find each target method-name string ("ClassifyIntersectionType" etc.) in the
   binary as a Pascal-prefixed string (length-byte + bytes).
2. Look at the bytes immediately before the length byte — that's where the
   typeinfo entry lives.
3. The 4 bytes before the length byte = function VA pointer (Delphi RTTI layout).

Also prints the decompiled-all.txt offset to look up.
"""
import struct, sys, re, pefile
from pathlib import Path

DLL = r"C:\Users\Scott\tools\detailer-bins\Tooling.dll"
DECOMP = r"C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\docs\ghidra-out\decompiled-all.txt"

TARGETS = [
    "ClassifyIntersectionType",
    "MakeOperations",
    "MakeExplicitOperations",
    "GenerateRFYOperations",
    "RecalcTooling",
    "CreateDimpleOffsets",
    "GetTrussHolePosition",
    "HandleExtraHoles",
]

pe = pefile.PE(DLL)
img = pe.get_memory_mapped_image()
image_base = pe.OPTIONAL_HEADER.ImageBase
print(f"image_base = 0x{image_base:x}")
print(f"image size = {len(img)} bytes\n")

def rva_to_va(rva):
    return image_base + rva

def is_in_text(va):
    for s in pe.sections:
        if s.Name.startswith(b".text") or s.Name.startswith(b".itext"):
            base = image_base + s.VirtualAddress
            size = s.Misc_VirtualSize
            if base <= va < base + size:
                return True
    return False

# Find every occurrence of each target as a Pascal-prefixed string
# (preceded by a length byte equal to len(target))
results = {}
for name in TARGETS:
    name_b = name.encode("ascii")
    needle = bytes([len(name_b)]) + name_b
    occurrences = []
    pos = 0
    while True:
        idx = img.find(needle, pos)
        if idx < 0:
            break
        occurrences.append(idx)
        pos = idx + 1
    results[name] = occurrences
    print(f"{name}: {len(occurrences)} occurrences as PascalString")
    for idx in occurrences[:6]:
        va = rva_to_va(idx)
        # Read 8 bytes BEFORE the length byte — could be method VA + size + flags
        before = img[max(0, idx-12):idx]
        after  = img[idx+len(needle):idx+len(needle)+12]
        print(f"   @ 0x{va:08x}  before-bytes: {before.hex(' ')}  after-bytes: {after.hex(' ')}")

# For each occurrence, the modern Delphi method_entry layout is typically:
#   uint16 size (entry total size)
#   uint32 funcptr (VA)
#   uint8  name_len
#   bytes  name
# So at idx-7 we'd find the size header, with funcptr at idx-5 (if it was at idx).
# Actually the right layout depends on the typeinfo. Let me just dump the bytes
# 32 before each occurrence and let me eyeball them.

print("\n=== Detailed dump (32 bytes before each occurrence) ===")
for name in TARGETS:
    print(f"\n## {name}")
    for idx in results[name][:3]:
        va = rva_to_va(idx)
        print(f"  @ 0x{va:08x}")
        for off in range(-32, 0, 4):
            chunk = img[idx+off:idx+off+4]
            if len(chunk) == 4:
                u32 = struct.unpack("<I", chunk)[0]
                annotated = ""
                if is_in_text(u32):
                    annotated = "  -> .text VA"
                print(f"     [idx{off:+d}] {chunk.hex()} = 0x{u32:08x} {annotated}")
        print(f"     [idx+0]  length+name: {img[idx]:02x}={chr(img[idx])!r}")
