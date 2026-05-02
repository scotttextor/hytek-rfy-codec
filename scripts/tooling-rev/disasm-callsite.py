"""Disassemble Detailer.exe around the Tooling.dll callsites — backwards from
the call to find the function prologue, forwards to the next ret."""
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"

CALLSITES = {
    "add_frameobject":     0x016ba27e,
    "generate_operations": 0x016bb078,
    "get_operations_for":  0x016ba9e7,
    "add_explicit_route":  0x016ba108,
}

print("[+] Loading Detailer.exe...")
pe = pefile.PE(EXE, fast_load=False)
image_base = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.startswith(b".text"))
text_data = bytes(text.get_data())
text_va = image_base + text.VirtualAddress
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

def find_function_start(callsite_va: int, max_search: int = 0x600) -> int:
    """Walk backwards looking for typical Delphi prologue (push ebp; mov ebp,esp).
    Returns the VA of the prologue's first byte, or callsite-max_search."""
    off = callsite_va - text_va
    # Look for bytes 55 8B EC (push ebp; mov ebp, esp), the most common Delphi prologue.
    for back in range(0, max_search):
        a = off - back
        if a < 0:
            break
        if text_data[a] == 0x55 and text_data[a+1] == 0x8B and text_data[a+2] == 0xEC:
            # Plausible prologue. Sanity: previous byte should not be inside an
            # instruction that decodes to extend through 'a'. Cheap heuristic: check
            # that the byte before is C3 (ret), CC (int3 padding), or 90 (nop).
            if a == 0 or text_data[a-1] in (0xC3, 0xCC, 0x90, 0xC2):
                return text_va + a
    return callsite_va - max_search

def disasm_function(name, callsite_va):
    start = find_function_start(callsite_va)
    end_search = callsite_va + 0x80  # show callsite + a bit after
    off = start - text_va
    size = end_search - start
    data = text_data[off:off+size]
    print(f"\n========== {name} marshal @ 0x{start:08x} (callsite 0x{callsite_va:08x}) ==========")
    for ins in md.disasm(data, start):
        marker = "  >>>" if ins.address == callsite_va else "     "
        print(f"{marker} 0x{ins.address:08x}  {ins.bytes.hex():<16}  {ins.mnemonic:<6} {ins.op_str}")
        if ins.address >= callsite_va + 0x40 and ins.mnemonic in ("ret", "retn"):
            break

for name, addr in CALLSITES.items():
    disasm_function(name, addr)
