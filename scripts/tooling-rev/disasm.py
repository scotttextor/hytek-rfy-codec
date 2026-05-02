"""Disassemble key Tooling.dll exports.

Run with 64-bit Python (capstone wheel is x64).
"""
import sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

DLL = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll"

EXPORTS = {
    "add_explicit_route":      0x18633c,
    "add_frameobject":         0x186410,
    "authenticate":            0x1865e0,
    "cleanup":                 0x186658,
    "generate_operations":     0x186678,
    "get_authcode_key":        0x1866a8,
    "get_intersections_for":   0x1866d0,
    "get_operations_for":      0x1867d4,
}

pe = pefile.PE(DLL, fast_load=True)
image_base = pe.OPTIONAL_HEADER.ImageBase
print(f"# ImageBase: 0x{image_base:08x}")
print(f"# Sections:")
for s in pe.sections:
    print(f"#   {s.Name.rstrip(b'\\x00').decode()}  RVA=0x{s.VirtualAddress:08x} VS=0x{s.Misc_VirtualSize:08x} RAW=0x{s.PointerToRawData:08x}")

# Load entire image into a virtual address-indexed buffer
def get_data_at_rva(rva, size):
    return pe.get_data(rva, size)

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

def disasm_function(name, rva, max_bytes=0x300):
    print(f"\n=== {name} @ RVA 0x{rva:08x}  (VA 0x{image_base+rva:08x}) ===")
    try:
        data = pe.get_memory_mapped_image()[rva:rva+max_bytes]
    except Exception as e:
        print(f"  ! couldn't read: {e}")
        return
    va = image_base + rva
    count = 0
    for ins in md.disasm(data, va):
        print(f"  0x{ins.address:08x}  {ins.bytes.hex():<20}  {ins.mnemonic:<6} {ins.op_str}")
        count += 1
        # Stop on ret with reasonable budget; show next 2 instructions for context
        if ins.mnemonic == "ret":
            break
        if count > 200:
            print(f"  ... truncated at {count} insns")
            break

target = sys.argv[1] if len(sys.argv) > 1 else "all"
if target == "all":
    for name, rva in EXPORTS.items():
        disasm_function(name, rva)
else:
    disasm_function(target, EXPORTS[target])
