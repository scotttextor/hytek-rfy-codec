"""Find Detailer.exe callsites that call into Tooling.dll exports."""
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"

print("[+] Loading Detailer.exe (this is ~43MB, give it a sec)...")
pe = pefile.PE(EXE, fast_load=False)
image_base = pe.OPTIONAL_HEADER.ImageBase
print(f"[+] ImageBase: 0x{image_base:08x}")

# Find the IAT slot for each Tooling.dll export of interest.
TARGETS = {
    "authenticate", "add_frameobject", "add_explicit_route",
    "generate_operations", "get_operations_for", "get_intersections_for",
    "cleanup", "get_authcode_key",
}
iat_slots = {}  # name -> VA of the IAT entry that holds the imported func ptr

for entry in pe.DIRECTORY_ENTRY_IMPORT:
    if not entry.dll.lower().startswith(b"tooling"):
        continue
    print(f"[+] Found import descriptor for {entry.dll.decode()}")
    for imp in entry.imports:
        nm = imp.name.decode() if imp.name else f"ord_{imp.ordinal}"
        if nm in TARGETS:
            iat_slots[nm] = imp.address  # this is the VA of the IAT slot
            print(f"    {nm:25s} IAT slot @ 0x{imp.address:08x}")

if not iat_slots:
    print("ERROR: no Tooling.dll imports found")
    raise SystemExit(1)

# Now scan the .text section for `call dword ptr [<iat_slot>]` instructions.
text = next(s for s in pe.sections if s.Name.startswith(b".text"))
text_data = text.get_data()
text_va = image_base + text.VirtualAddress

print(f"[+] Scanning .text ({len(text_data)} bytes) for indirect calls to Tooling.dll IAT slots...")

# `call dword ptr [imm32]` opcode = FF 15 <imm32>
# `jmp  dword ptr [imm32]` opcode = FF 25 <imm32>
slot_to_name = {addr: nm for nm, addr in iat_slots.items()}
results = {nm: [] for nm in iat_slots}

i = 0
n = len(text_data)
while i < n - 5:
    b0 = text_data[i]
    b1 = text_data[i+1]
    if b0 == 0xFF and b1 in (0x15, 0x25):
        target = int.from_bytes(text_data[i+2:i+6], 'little')
        if target in slot_to_name:
            callsite_va = text_va + i
            results[slot_to_name[target]].append((callsite_va, b1))
        i += 6
    else:
        i += 1

for nm, hits in results.items():
    print(f"\n=== {nm}: {len(hits)} callsite(s) ===")
    for va, opc in hits:
        kind = "call" if opc == 0x15 else "jmp"
        print(f"    {kind} via IAT @ 0x{va:08x}")
