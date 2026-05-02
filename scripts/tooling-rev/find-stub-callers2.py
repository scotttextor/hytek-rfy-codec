"""Find call rel32 sites in Detailer.exe targeting the Tooling.dll stubs.
Then print disassembly around each callsite to learn the marshal pattern."""
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"

STUBS = {
    "cleanup":               0x016b9bb4,
    "authenticate":          0x016b9bac,
    "get_authcode_key":      0x016b9bc4,
    "add_explicit_route":    0x016b9b9c,
    "generate_operations":   0x016b9bbc,
    "get_intersections_for": 0x016b9bcc,
    "add_frameobject":       0x016b9ba4,
    "get_operations_for":    0x016b9bd4,
}
stub_to_name = {addr: nm for nm, addr in STUBS.items()}

print("[+] Loading Detailer.exe...")
pe = pefile.PE(EXE, fast_load=False)
image_base = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.startswith(b".text"))
text_data = bytes(text.get_data())
text_va = image_base + text.VirtualAddress

# Scan for `E8 <rel32>` (call rel32) and `E9 <rel32>` (jmp rel32).
results = {nm: [] for nm in STUBS}
i = 0
n = len(text_data)
while i < n - 5:
    b0 = text_data[i]
    if b0 in (0xE8, 0xE9):
        rel = int.from_bytes(text_data[i+1:i+5], 'little', signed=True)
        cs_va = text_va + i
        target = (cs_va + 5 + rel) & 0xFFFFFFFF
        if target in stub_to_name:
            results[stub_to_name[target]].append((cs_va, "call" if b0 == 0xE8 else "jmp"))
        i += 5
    else:
        i += 1

for nm, hits in results.items():
    print(f"\n=== {nm}: {len(hits)} relative call/jmp(s) ===")
    for va, kind in hits[:20]:
        print(f"    {kind} @ 0x{va:08x}")
    if len(hits) > 20:
        print(f"    ... and {len(hits)-20} more")
