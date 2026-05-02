"""Disassemble helper/internal functions to understand structures."""
import sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

DLL = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll"

# Internal helpers we need to understand (referenced by exports)
TARGETS = {
    "auth_helper_at_0x566da4":   0x166da4,  # called by authenticate
    "init_state_at_0x585f68":    0x185f68,  # called when global state ptr is null
    "obj_lookup_at_0x585df4":    0x185df4,  # called by generate_operations
    "frame_id_resolve_585f90":   0x185f90,  # called by add_frameobject
    "section_resolve_585b6c":    0x185b6c,  # called by add_frameobject
}

pe = pefile.PE(DLL, fast_load=True)
image_base = pe.OPTIONAL_HEADER.ImageBase
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

def disasm(name, rva, max_bytes=0x400, max_insns=120):
    print(f"\n=== {name} @ RVA 0x{rva:08x}  (VA 0x{image_base+rva:08x}) ===")
    data = pe.get_memory_mapped_image()[rva:rva+max_bytes]
    va = image_base + rva
    count = 0
    for ins in md.disasm(data, va):
        print(f"  0x{ins.address:08x}  {ins.bytes.hex():<20}  {ins.mnemonic:<6} {ins.op_str}")
        count += 1
        if ins.mnemonic == "ret" and count > 5:
            break
        if count > max_insns:
            print("  ... truncated")
            break

for name, rva in TARGETS.items():
    disasm(name, rva)
