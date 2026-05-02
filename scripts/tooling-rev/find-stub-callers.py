"""Find Detailer.exe callers of the Tooling.dll import stubs."""
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"

# Stub addresses harvested from find-callers.py output.
# The IAT slot is at 0x016b9bXX, and the stub is the `jmp [iat]` 6 bytes
# preceding (or rather, located at 0x016b9bX0 / via .text mapping).
# Actually each stub IS at the address of the `jmp` instruction. Let me re-derive:
# the find-callers.py "jmp via IAT @ X" prints the address OF the jmp inside .text.
# Wait — I printed 0x016b9bb4 for cleanup but that's the IAT slot address (in .data),
# not in .text. Let me re-read... actually the script printed IAT slot location.
# The stub itself is in .text and contains `FF 25 <iat_slot_imm32>`. So I need to
# scan .text for `FF 25 <iat>` to find the stub VA.
#
# But find-callers.py already printed: "jmp via IAT @ 0x016b9bb4" which means the
# instruction (0xff25 ...) is AT 0x016b9bb4. That IS in .text since .text spans
# the bulk of the image. Confirm by looking at section table...

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

print("[+] Loading Detailer.exe...")
pe = pefile.PE(EXE, fast_load=False)
image_base = pe.OPTIONAL_HEADER.ImageBase
text = next(s for s in pe.sections if s.Name.startswith(b".text"))
text_data = text.get_data()
text_va = image_base + text.VirtualAddress
text_end = text_va + len(text_data)
print(f"[+] .text spans 0x{text_va:08x} - 0x{text_end:08x} ({len(text_data)} bytes)")

# Verify stubs are inside .text:
for nm, addr in STUBS.items():
    in_text = text_va <= addr < text_end
    if in_text:
        off = addr - text_va
        head = text_data[off:off+8].hex()
        # `FF 25 <iat>` — but the address we have is the IAT slot (per pefile.imp.address).
        # So actually the call instructions point AT the IAT slot, not at a stub. Let me
        # re-confirm. pefile docs say imp.address is the VA in the IDATA where the function
        # pointer is stored (i.e. the IAT slot). So our 0x016b9b9c-0x016b9bd4 are IAT slots
        # in some segment. Are they inside .text? If yes, they're part of the embedded IAT
        # which Delphi often does.
        print(f"    {nm}: addr 0x{addr:08x} IS in .text, head bytes = {head}")
    else:
        print(f"    {nm}: addr 0x{addr:08x} is NOT in .text")
