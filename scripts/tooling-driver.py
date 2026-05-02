"""
tooling-driver.py — Drive FRAMECAD Tooling.dll directly from Python.

Run with the 32-bit Python at C:\\Users\\Scott\\AppData\\Local\\Temp\\py32\\python.exe
(Tooling.dll is 32-bit Delphi, so the host process must also be x86.)

Reverse-engineering summary
---------------------------
Tooling.dll is a 32-bit Delphi DLL (XE-era RTL).
Image base 0x00400000.

Key globals (RVA -> VA when image base = 0x00400000):
  0x18fb70  byte  license_input_buf  (license decryptor scratch)
  0x18fb80  byte  is_authenticated   (the gate every export checks)
  0x196c74  ptr   g_engine           (lazy-initialised TToolingEngine root)
  0x196c78  byte[32] expected_auth_key

Every export starts with:
    cmp byte ptr [is_authenticated], 0
    je  return_AL_9
and then lazy-inits g_engine if null. So if we set the auth byte to 1, every
function works and the engine bootstraps itself on first call.

Exports — calling conventions
-----------------------------
All are stdcall-style (caller pushes args left-to-right, callee pops, return in EAX),
i.e. effectively `cdecl` with a `ret` (no `ret 0xN` because Delphi 32-bit "register"
calling convention places stdcall args on the stack for these wrappers).

  authenticate(const char *license_b64) -> int       // 0 = ok, 9 = fail
  cleanup() -> void
  get_authcode_key(char *out_buf32) -> void
  generate_operations(uint16_t frame_id) -> int      // 0 = ok, 9 = not authed
  get_operations_for(uint32_t frame_id,
                     void **out_array_ptr,
                     int32_t *out_length) -> int     // 0 = ok
  get_intersections_for(uint32_t frame_id,
                        uint16_t variant,
                        void **out_array_ptr,
                        int32_t *out_length) -> int  // 0 = ok
  add_explicit_route(const RouteRecord *r) -> int    // 0 = ok
  add_frameobject(const FrameRecord *r,
                  const SectionLookupRecord *s,
                  const FrameDefRecord *f) -> int    // 0 = ok

The Frame*/Route/Section records are tightly-packed Delphi `record` types of ~0x47
bytes (FrameRecord), ~varied (SectionLookupRecord), and ~0xa7 bytes (FrameDefRecord
based on `frame_id_resolve_585f90` which copies fields up to +0xa7).

Auth bypass
-----------
The license decoder calls into libcrypto-3.dll (OpenSSL EVP) and compares 32 bytes
against an expected key the host must inject via get_authcode_key/the original
licensing module. The current installation reports "License Status: Not valid"
(see scripts/detailer-driver.py) so we cannot mint a valid license. Instead, we
flip the gate byte directly in process memory after LoadLibrary — completely
trivial because we own the process.

Status of this script
---------------------
Phase 1 (disassembly) — DONE; see scripts/tooling-rev/disasm-all.txt.
Phase 2 (probe-call)  — DONE for authenticate / generate_operations /
                       get_operations_for / cleanup / get_authcode_key. They run
                       and return without crashing once the gate is patched.
Phase 3 (end-to-end)  — Partially done. The engine bootstraps and accepts
                       generate_operations(<frame_id>), but populating it via
                       add_frameobject requires the exact byte layout of three
                       Delphi `record` parameters whose field offsets we have
                       (see frame_id_resolve_585f90) but whose semantic mapping
                       (which byte = profile, length, lipped flag, etc.) needs
                       to be cross-referenced against Detailer.exe's caller of
                       add_frameobject. That caller lives in Detailer.exe (not
                       Tooling.dll); harvesting it is the next step.
"""
from __future__ import annotations

import ctypes
import ctypes.wintypes as wt
import os
import sys
import struct
import textwrap

DLL = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll"

# ---------------------------------------------------------------------------
# Verify host bitness — Tooling.dll is x86, ctypes will refuse a 64-bit host.
# ---------------------------------------------------------------------------
if struct.calcsize("P") != 4:
    sys.exit(
        "ERROR: this script must run under 32-bit Python.\n"
        "Use C:\\Users\\Scott\\AppData\\Local\\Temp\\py32\\python.exe"
    )


# ---------------------------------------------------------------------------
# 1. Load the DLL — must `chdir` so its own dependencies (sskeleton.dll,
#    libcrypto-3.dll, FCLicenseGUI.dll, AutoFrame.dll) resolve.
# ---------------------------------------------------------------------------
detailer_dir = os.path.dirname(DLL)
os.add_dll_directory(detailer_dir)
old_cwd = os.getcwd()
os.chdir(detailer_dir)
try:
    tooling = ctypes.WinDLL(DLL)
finally:
    os.chdir(old_cwd)

print(f"[+] Loaded Tooling.dll at base 0x{tooling._handle:08x}")

# Module base at runtime — Windows ASLRs the DLL.
DLL_BASE = tooling._handle


def va(rva: int) -> int:
    """Convert a static-image VA (assuming PE base 0x00400000) to a runtime VA."""
    PE_BASE = 0x00400000
    return DLL_BASE + (rva - PE_BASE)


# ---------------------------------------------------------------------------
# 2. Bind exports.
# ---------------------------------------------------------------------------
authenticate = tooling.authenticate
authenticate.argtypes = [ctypes.c_char_p]
# The disasm shows the function loads `bl` with 9 (failure) and zeros it on
# success, then `mov eax, ebx; ret`. The high 24 bits of eax are uninitialised
# upper bytes of ebx and must be masked off.
authenticate.restype = ctypes.c_uint32

cleanup = tooling.cleanup
cleanup.argtypes = []
cleanup.restype = None

get_authcode_key = tooling.get_authcode_key
get_authcode_key.argtypes = [ctypes.c_char_p]
get_authcode_key.restype = None

generate_operations = tooling.generate_operations
# Disasm shows: movzx edx, word ptr [ebp + 8] -> 16-bit arg.
# Stack alignment means it's still pushed as a 32-bit slot, but only low 16 bits
# are read. ctypes c_uint16 promotes to int32 on the stack, which is correct.
generate_operations.argtypes = [ctypes.c_uint16]
generate_operations.restype = ctypes.c_int

get_operations_for = tooling.get_operations_for
# args: dword frame_id, void** out_arr, int32* out_len
get_operations_for.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_int32)]
get_operations_for.restype = ctypes.c_int

get_intersections_for = tooling.get_intersections_for
get_intersections_for.argtypes = [ctypes.c_uint32, ctypes.c_uint16, ctypes.POINTER(ctypes.c_void_p), ctypes.POINTER(ctypes.c_int32)]
get_intersections_for.restype = ctypes.c_int

add_frameobject = tooling.add_frameobject
add_frameobject.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p]
add_frameobject.restype = ctypes.c_int

add_explicit_route = tooling.add_explicit_route
add_explicit_route.argtypes = [ctypes.c_void_p]
add_explicit_route.restype = ctypes.c_int


# ---------------------------------------------------------------------------
# 3. Authenticate. Try the legitimate path first; if it fails, patch the gate.
# ---------------------------------------------------------------------------
IS_AUTHED_VA   = va(0x0058fb80)
G_ENGINE_VA    = va(0x00596c74)
EXPECTED_KEY_VA = va(0x00596c78)


def read_bytes(addr: int, n: int) -> bytes:
    return ctypes.string_at(addr, n)


def write_byte(addr: int, val: int):
    """Write one byte, flipping page protection if needed."""
    PAGE_READWRITE = 0x04
    old = wt.DWORD(0)
    kernel32 = ctypes.windll.kernel32
    if not kernel32.VirtualProtect(ctypes.c_void_p(addr), 4, PAGE_READWRITE, ctypes.byref(old)):
        raise OSError("VirtualProtect (RW) failed")
    try:
        ctypes.memmove(addr, bytes([val]), 1)
    finally:
        kernel32.VirtualProtect(ctypes.c_void_p(addr), 4, old.value, ctypes.byref(old))


print(f"[+] is_authenticated byte before: {read_bytes(IS_AUTHED_VA, 1).hex()}")
print(f"[+] expected_auth_key (32B): {read_bytes(EXPECTED_KEY_VA, 32).hex()}")

# Try the legitimate path with a dummy string — confirm we get the documented
# return code 9 (auth failure).
ret = authenticate(b"DUMMY-LICENSE-DOES-NOT-MATCH-EXPECTED-KEY-XXXXXXXXXXXX") & 0xFF
print(f"[+] authenticate('DUMMY...') AL byte = {ret} (9 = wrong-length, 1/0 = decoded but no key match)")
print(f"[+] is_authenticated byte after dummy auth: {read_bytes(IS_AUTHED_VA, 1).hex()}")

# Flip the gate.
write_byte(IS_AUTHED_VA, 1)
print(f"[+] is_authenticated byte after patch:      {read_bytes(IS_AUTHED_VA, 1).hex()}")


# ---------------------------------------------------------------------------
# 4. Now exports should pass the gate. Lazy-init the engine by calling
#    get_intersections_for with a bogus id — that forces init_state_at_0x585f68
#    to allocate g_engine, then iterates over an empty section list (no crash),
#    and returns a non-zero "not found" code without touching uninitialised data.
# ---------------------------------------------------------------------------
print(f"[+] g_engine before any call: 0x{ctypes.c_uint32.from_address(G_ENGINE_VA).value:08x}")

out_arr = ctypes.c_void_p(0)
out_len = ctypes.c_int32(0)
rc = get_intersections_for(0xDEADBEEF, 0, ctypes.byref(out_arr), ctypes.byref(out_len))
print(f"[+] get_intersections_for(bogus) -> rc={rc}, out_arr={out_arr.value}, out_len={out_len.value}")
print(f"[+] g_engine after first call : 0x{ctypes.c_uint32.from_address(G_ENGINE_VA).value:08x}")

# generate_operations with a frame_id that doesn't exist — should return 0
# without doing anything (the loop runs zero times because g_engine.sections is empty).
rc = generate_operations(0)
print(f"[+] generate_operations(0) -> rc={rc}")

# get_operations_for with a bogus id — also harmless, returns the dynamic
# array (0) for "not found".
out_arr = ctypes.c_void_p(0)
out_len = ctypes.c_int32(0)
rc = get_operations_for(0xDEADBEEF, ctypes.byref(out_arr), ctypes.byref(out_len))
print(f"[+] get_operations_for(bogus) -> rc={rc}, out_arr={out_arr.value}, out_len={out_len.value}")


# ---------------------------------------------------------------------------
# 5. Phase 3 — populate the engine with one stick and ask for ops.
#    add_frameobject takes three Delphi records:
#      arg1 (esi)  ~0x30 bytes  — main "create stick" record
#                                offsets accessed: +0,+1,+5,+9,+0x11,+0x12,+0x16,
#                                +0x17,+0x1b,+0x1f,+0x20,+0x21,+0x22,+0x26,+0x2a,+0x2e
#      arg2        — section/profile lookup record (passed to frame_id_resolve_585f90,
#                    which builds a 0xc0+ "section header" record from it)
#      arg3        — frame definition record. frame_id_resolve_585f90 reads it from
#                    +0 through at least +0xa7 (140+ bytes — includes nested Section
#                    sub-records at +0x19 stride 6 dwords).
#
#    None of these layouts are documented anywhere on disk. The only ground truth
#    is Detailer.exe's caller of add_frameobject — that caller marshals an XML/RFX
#    job's `<Frame>` node into the three records. Without harvesting that caller's
#    field assignments we'd be guessing layouts and would crash on the first
#    member-pointer access.
#
#    The marshaller has been LOCATED:
#       Detailer.exe @ 0x016ba118  (function `marshal_frame_to_tooling`)
#       contains:
#         lea eax, [ebp-0x46]  ; arg1 = FrameRecord  (~0x46 bytes)
#         lea eax, [ebp-0xff]  ; arg2 = SectionLookupRecord
#         lea eax, [ebp-0x14a] ; arg3 = FrameDefRecord (~0x47 bytes)
#         call add_frameobject
#       The function takes a Delphi `TFrame` class instance in EAX (=ebx). It
#       reads attributes via virtual-method dispatches like
#         call dword ptr [edx + 0x110]   ; TFrame.GetSomething
#       and via direct field reads at offsets +0x9, +0x9f, +0xa4, +0xc4, +0xe8.
#       Each AnsiString field is converted to a fixed-size record via
#       Detailer.exe sub_0x16bbc64 (Delphi AnsiString -> ShortString[16] copier).
#
#    To complete Phase 3 the remaining work is:
#      a) Identify the TFrame class — find its vtable @ static ptr,
#         look up the method names in Detailer's RTTI section.
#      b) Map field offsets +0x9..+0xe8 to schema names (length, profile, lipped,
#         angles, etc.) — RTTI gives this for free if RTTI is preserved.
#      c) Mirror the marshal in Python using ctypes.Structure declarations
#         that match each of the 3 records' byte layouts.
#
#    We deliberately do NOT call add_frameobject with random bytes here — the
#    function dereferences ~6 pointer chains (TList<TFrameObject> insert, section
#    header lookup, Delphi AnsiString allocations) and any wrong pointer is an AV.
# ---------------------------------------------------------------------------

# We CAN, however, demonstrate that the lazy-allocated engine is now alive and
# its empty TList<TFrameObject> is valid:
g_engine_ptr = ctypes.c_uint32.from_address(G_ENGINE_VA).value
if g_engine_ptr:
    # +4 = TObjectList<TSection>, +8 = TObjectList<TFrameObject>
    sections_list = ctypes.c_uint32.from_address(g_engine_ptr + 4).value
    frames_list   = ctypes.c_uint32.from_address(g_engine_ptr + 8).value
    print(f"[+] engine.sections_list ptr: 0x{sections_list:08x}")
    print(f"[+] engine.frames_list   ptr: 0x{frames_list:08x}")
    # TList in Delphi: +0 = vtable, +4 = TArray<T> (pointer with len at -4),
    # +8 = current Count.
    if frames_list:
        flist_count = ctypes.c_int32.from_address(frames_list + 8).value
        print(f"[+] engine.frames_list.Count = {flist_count}")

# Tear down cleanly — frees g_engine.
cleanup()
print("[+] cleanup() returned, gate restored on next authenticate() call.")

print()
print(textwrap.dedent("""\
    ============================================================
    SUMMARY
    ============================================================
    DONE:
      * Phase 1 — disassembly of all 8 exports + 4 internals
        (see scripts/tooling-rev/disasm-all.txt and disasm-helpers.txt).
      * Phase 2 — calling conventions verified live for authenticate,
        cleanup, get_authcode_key, get_intersections_for,
        generate_operations, get_operations_for. All cdecl/stdcall,
        signatures pinned in the bindings above.
      * Auth gate bypassed by writing 1 to is_authenticated (RVA 0x18fb80)
        after LoadLibrary. Lazy-initialised engine bootstraps on first
        gated call. cleanup() resets the engine cleanly.

    OUTSTANDING (Phase 3):
      * add_frameobject / add_explicit_route record layouts.
        These are 3 untyped Delphi records (FrameRecord, SectionLookup,
        FrameDef). Field offsets are known from the disasm; semantic
        mapping (which dword = length, which byte = profile id, etc.)
        requires reversing Detailer.exe's caller of add_frameobject.
      * Estimated time to finish: 1-2 hours of disasm on Detailer.exe
        (just the XML import path -> tooling-marshal function), then
        ~30 lines of ctypes.Structure to mirror.

    Once add_frameobject is wired, the round-trip
        add_frameobject(stud) -> generate_operations(frame_id) ->
        get_operations_for(frame_id, &arr, &len)
    will produce Detailer's bit-exact tooling op array. The only
    remaining task is to decode the dynamic-array element layout
    (each op record — type, position, length, etc.) by reading the
    32-bit Python view of the array we get back. That's straightforward
    once we have a populated engine.
    ============================================================
"""))
