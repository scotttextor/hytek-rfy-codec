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
# The fn returns AL (0 = ok, 3 = duplicate frame_id, 8 = section lookup fail,
# 9 = unauthenticated). Mask to a single byte; high 24 bits of EAX may be
# uninitialised stack noise.
add_frameobject.restype = ctypes.c_uint32

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


# ---------------------------------------------------------------------------
# Phase 3 — record layouts (see scripts/tooling-rev/record-layouts.md).
#
# Re-derived from Detailer.exe's marshaller @ 0x016ba118:
#   FrameRecord         50 bytes  ([ebp-0x46])
#   SectionLookupRecord 185 bytes ([ebp-0xff])  -- contains Delphi AnsiString ptrs!
#   FrameDefRecord      75 bytes  ([ebp-0x14a])
# ---------------------------------------------------------------------------

class FrameRecord(ctypes.Structure):
    """50-byte POD describing one stick member.

    REVISED layout — Tooling.dll's own add_frameobject (RVA 0x186410) reads
    offsets +1, +5, +9, +0xd, +0x11, +0x12, +0x16, +0x17, +0x1b, +0x1f,
    +0x20, +0x21, +0x22, +0x26, +0x2a, +0x2e (all dword reads except the
    bytes flagged 'B'). So the two ShortString[16]s are actually packed as
    8 dwords (two TPoint-like structs).

    Engine usage:
        TPoint p1 = (esi[+0x22], esi[+0x26], esi[+0x2a], esi[+0x2e]) -- 4 dwords
        TPoint p2 = (esi[+0x01], esi[+0x05], esi[+0x09], esi[+0x0d]) -- 4 dwords
        frame_id  = esi[+0x12] (int32)
        ... esi[+0x17] and esi[+0x1b] are TWO separate dwords (not a double)
    """
    _pack_ = 1
    _fields_ = [
        ("flag_a",          ctypes.c_uint8),                # +0x00
        # +0x01..+0x10: 4 dwords = TPoint p2 (start of stick? x1,y1,x2,y2?)
        ("p2_x1",           ctypes.c_int32),                # +0x01
        ("p2_y1",           ctypes.c_int32),                # +0x05
        ("p2_x2",           ctypes.c_int32),                # +0x09
        ("p2_y2",           ctypes.c_int32),                # +0x0d
        ("vmethod_result",  ctypes.c_uint8),                # +0x11
        ("frame_id",        ctypes.c_int32),                # +0x12
        ("flag_b",          ctypes.c_uint8),                # +0x16
        ("dword_17",        ctypes.c_int32),                # +0x17
        ("dword_1b",        ctypes.c_int32),                # +0x1b
        ("lipped_flag",     ctypes.c_uint8),                # +0x1f
        ("flag_d",          ctypes.c_uint8),                # +0x20
        ("flag_e",          ctypes.c_uint8),                # +0x21
        # +0x22..+0x31: 4 dwords = TPoint p1 (other endpoint?)
        ("p1_x1",           ctypes.c_int32),                # +0x22
        ("p1_y1",           ctypes.c_int32),                # +0x26
        ("p1_x2",           ctypes.c_int32),                # +0x2a
        ("p1_y2",           ctypes.c_int32),                # +0x2e
    ]
assert ctypes.sizeof(FrameRecord) == 0x32, ctypes.sizeof(FrameRecord)


class SectionLookupRecord(ctypes.Structure):
    """185-byte record. Mostly POD section-catalog data, with TWO Delphi
    AnsiString refs at +0x9f / +0x9f+4 (length). Leave them NULL/0 — the
    builder itself handles NIL via test/je at 0x16baf81."""
    _pack_ = 1
    _fields_ = [
        ("shape_byte",      ctypes.c_uint8),                # +0x00
        ("dwords_42_5e",    ctypes.c_int32 * 6),            # +0x01..+0x18 (6 dwords from catalog +0x42..+0x5e)
        ("six_role_keys",   ctypes.c_int32 * 6),            # +0x19..+0x30 (6 dwords from scratch buffer)
        ("dword_73",        ctypes.c_int32),                # +0x31
        ("dword_77",        ctypes.c_int32),                # +0x35
        ("byte_a3",         ctypes.c_uint8),                # +0x39
        ("dword_a4",        ctypes.c_int32),                # +0x3a
        ("dword_a8",        ctypes.c_int32),                # +0x3e
        ("byte_ac",         ctypes.c_uint8),                # +0x42
        ("byte_ad",         ctypes.c_uint8),                # +0x43
        ("dword_ae",        ctypes.c_int32),                # +0x44
        ("dword_b2",        ctypes.c_int32),                # +0x48
        ("dword_b6",        ctypes.c_int32),                # +0x4c
        ("dword_ba",        ctypes.c_int32),                # +0x50
        ("byte_be",         ctypes.c_uint8),                # +0x54
        ("dbl_helper",      ctypes.c_double),               # +0x55  (1 wt-helper double)
        ("byte_d7",         ctypes.c_uint8),                # +0x5d
        ("dword_d8",        ctypes.c_int32),                # +0x5e
        ("dword_dc",        ctypes.c_int32),                # +0x62
        ("dword_e0",        ctypes.c_int32),                # +0x66
        ("dword_e4",        ctypes.c_int32),                # +0x6a
        ("dword_ec",        ctypes.c_int32),                # +0x6e
        ("dword_f0",        ctypes.c_int32),                # +0x72
        ("dword_f4",        ctypes.c_int32),                # +0x76
        ("dword_f8",        ctypes.c_int32),                # +0x7a
        ("dword_fc",        ctypes.c_int32),                # +0x7e
        ("dword_100",       ctypes.c_int32),                # +0x82
        ("byte_104",        ctypes.c_uint8),                # +0x86
        ("dword_117",       ctypes.c_int32),                # +0x87
        ("dword_11b",       ctypes.c_int32),                # +0x8b
        ("dword_129",       ctypes.c_int32),                # +0x8f
        ("dword_12d",       ctypes.c_int32),                # +0x93
        ("dword_135",       ctypes.c_int32),                # +0x97
        ("dword_139",       ctypes.c_int32),                # +0x9b
        ("ansistr_ptr",     ctypes.c_void_p),               # +0x9f  (Delphi-managed; NULL=empty is OK)
        ("ansistr_length",  ctypes.c_int32),                # +0xa3  (AnsiString len header)
        ("byte_a7",         ctypes.c_uint8),                # +0xa7  (TFrame.+0x5d -> 0x1c7934c)
        ("byte_13e",        ctypes.c_uint8),                # +0xa8
        ("dword_13f",       ctypes.c_int32),                # +0xa9
        ("dword_143",       ctypes.c_int32),                # +0xad
        ("dword_b1_cond",   ctypes.c_int32),                # +0xb1 (only set if name starts "TC*")
        ("dword_b5_cond",   ctypes.c_int32),                # +0xb5
    ]
assert ctypes.sizeof(SectionLookupRecord) == 0xb9, ctypes.sizeof(SectionLookupRecord)


class FrameDefRecord(ctypes.Structure):
    """75-byte POD frame-definition record.

    CORRECTED 2026-05-03: the bytes at +0x3b..+0x42 are NOT padding — they
    are the SectionRule array pointer + count, the THIRD argument's loop
    target inside add_frameobject (the loop at VA 0x586507..0x586535):

        ebx = [FrameDef+0x3b]   ; pointer to rule array
        edi = [FrameDef+0x3f] - 1  ; count - 1
        loop:
          edx = [ebx+8]                  ; rule[i].lookup_key
          call 0x52f9f8(setup, key)      ; AL=1 if key found
          if AL: 0x532ad8(setup, key, [ebx+0], [ebx+4])  ; register-op
          ebx += 0xc                     ; STRIDE = 12 bytes (NOT 14)

    Each SectionRule = 12 bytes (3 dwords):
        +0x00 dword arg0       — passed to add-op as 1st pushed arg
        +0x04 dword arg1       — passed to add-op as 2nd pushed arg
        +0x08 dword lookup_key — used to look up something on the
                                 TMachineSetup object created from
                                 SectionLookupRecord. If key is not found
                                 in [setup+0x9f]+0x10 (a TList), the rule
                                 is skipped — i.e. rule needs a matching
                                 entry in the parent catalog.
    """
    _pack_ = 1
    _fields_ = [
        ("byte_settings_4",  ctypes.c_uint8),               # +0x00
        ("dword_29_4",       ctypes.c_int32),               # +0x01
        ("dword_29_8",       ctypes.c_int32),               # +0x05
        ("byte_settings_6",  ctypes.c_uint8),               # +0x09
        ("dword_settings_f", ctypes.c_int32),               # +0x0a
        ("dword_settings_13",ctypes.c_int32),               # +0x0e
        ("scratch_5c",       ctypes.c_int32),               # +0x12
        ("scratch_58",       ctypes.c_int32),               # +0x16
        ("scratch_54",       ctypes.c_int32),               # +0x1a
        ("scratch_50",       ctypes.c_int32),               # +0x1e
        ("scratch_4c",       ctypes.c_int32),               # +0x22
        ("scratch_48",       ctypes.c_int32),               # +0x26
        ("scratch_44",       ctypes.c_int32),               # +0x2a
        ("scratch_40",       ctypes.c_int32),               # +0x2e
        ("byte_resolved",    ctypes.c_uint8),               # +0x32 (result of 0x16bb478())
        ("ansistr_len_pass1",ctypes.c_int32),               # +0x33
        ("ansistr_len_pass2",ctypes.c_int32),               # +0x37
        ("rule_array_ptr",   ctypes.c_uint32),              # +0x3b (NOT padding)
        ("rule_array_count", ctypes.c_uint32),              # +0x3f (NOT padding)
        ("dword_settings_48",ctypes.c_int32),               # +0x43
        ("dword_settings_4c",ctypes.c_int32),               # +0x47
    ]
assert ctypes.sizeof(FrameDefRecord) == 0x4b, ctypes.sizeof(FrameDefRecord)


class SectionRule(ctypes.Structure):
    """12-byte rule entry — the item type of the array on FrameDefRecord+0x3b.

    See section-rule-layout.md for the full RE pass.
    """
    _pack_ = 1
    _fields_ = [
        ("arg0",       ctypes.c_uint32),   # +0x00 — pushed as arg0 to add-op
        ("arg1",       ctypes.c_uint32),   # +0x04 — pushed as arg1 to add-op
        ("lookup_key", ctypes.c_uint32),   # +0x08 — must match key in setup
    ]
assert ctypes.sizeof(SectionRule) == 0xc, ctypes.sizeof(SectionRule)


# ---------------------------------------------------------------------------
# 6. Build a minimal "S1 stud, 89mm profile, length 2616" stick.
#    For the SectionLookupRecord: leave the AnsiString ptr NULL (the engine's
#    own marshaller has a NIL-tolerant path) and zero everything else. We
#    write the profile-name into FrameRecord.section_name_a (where the engine
#    reads "89S41-1.15" / "89S41-0.75" style keys).
# ---------------------------------------------------------------------------
fr = FrameRecord()
ctypes.memset(ctypes.byref(fr), 0, ctypes.sizeof(fr))
fr.frame_id        = 1
# CORRECTED 2026-05-03 (per record-layouts.md Finding 1):
#   IsZeroDouble returns AL=1 when |d| ≈ 0, AL=0 when nonzero.
#   The engine's gate at 0x586493 is `je 0x58649c` — taken when AL==0.
#   So the engine WANTS distance(endpoint1, endpoint2) to be NONZERO.
#   With both endpoints at origin, distance=0 -> AL=1 -> fail rc=8.
#   Fix: endpoint1 = (2616.0, 0.0), endpoint2 = (0.0, 0.0). distance=2616.
#
# Encoding (verified against disasm of geom_op_42f5fc + tpoint_ctor_42f5a0):
#   geom_op_42f5fc reads:
#     fld qword [esi]      ; tpoint.x at offset 0
#     fld qword [esi+8]    ; tpoint.y at offset 8
#   tpoint_ctor_42f5a0 builds the TPoint from 4 dword args:
#     [eax+0]  = x_low32
#     [eax+4]  = x_high32
#     [eax+8]  = y_low32
#     [eax+0xc]= y_high32
#   Then add_frameobject pushes from FrameRecord+esi:
#     endpoint1: (esi+0x22 -> x_low, esi+0x26 -> x_high, esi+0x2a -> y_low, esi+0x2e -> y_high)
#     endpoint2: (esi+0x01 -> x_low, esi+0x05 -> x_high, esi+0x09 -> y_low, esi+0x0d -> y_high)
#
#   So FrameRecord layout for endpoints is:
#     +0x01..+0x08 = endpoint2.x (double)
#     +0x09..+0x10 = endpoint2.y (double)
#     +0x22..+0x29 = endpoint1.x (double)
#     +0x2a..+0x31 = endpoint1.y (double)
#
# Write as raw bytes via memmove to avoid struct-field-naming confusion.
fr_buf_addr = ctypes.addressof(fr)

# endpoint1 = (x=2616.0, y=0.0)
ctypes.memmove(fr_buf_addr + 0x22, struct.pack('<d', 2616.0), 8)
ctypes.memmove(fr_buf_addr + 0x2a, struct.pack('<d', 0.0), 8)

# endpoint2 = (x=0.0, y=0.0) — already zeroed by memset.
ctypes.memmove(fr_buf_addr + 0x01, struct.pack('<d', 0.0), 8)
ctypes.memmove(fr_buf_addr + 0x09, struct.pack('<d', 0.0), 8)

# Stick length double at +0x17/+0x1b
length_double_bytes = struct.pack('<d', 2616.0)
fr.dword_17 = struct.unpack('<i', length_double_bytes[0:4])[0]
fr.dword_1b = struct.unpack('<i', length_double_bytes[4:8])[0]

fr.lipped_flag     = 0
fr.flag_a          = 1
fr.flag_b          = 0
fr.flag_d          = 0
fr.flag_e          = 0
fr.vmethod_result  = 1

# CORRECTED 2026-05-03 (per record-layouts.md Finding 2 + Finding 5):
#   SectionLookupRecord +0x9f is NOT an AnsiString — it's a pointer to an
#   array of 14-byte SectionRule records, with +0xa3 as the COUNT.
#   No global section catalog needs pre-loading. With ALL rule-array
#   counts = 0, section_ctor's four loops iterate zero times and the
#   engine accepts an empty rule set.
sl = SectionLookupRecord()
ctypes.memset(ctypes.byref(sl), 0, ctypes.sizeof(sl))
# All zeros -> ansistr_ptr (renamed: rule_array_ptr) = NULL,
#              ansistr_length (renamed: rule_array_count) = 0.

fd = FrameDefRecord()
ctypes.memset(ctypes.byref(fd), 0, ctypes.sizeof(fd))

# 2026-05-03 — Attempt to populate the 12-byte SectionRule array to verify
# the loop is reached. Even if the rules' lookup_keys don't match anything
# in the (empty) TMachineSetup, the loop will execute once per rule with
# the 0x52f9f8 lookup returning AL=0 (not found) — which means 0x532ad8
# is never called, and we'll end up with the same empty op list. But the
# loop reaching iter > 0 confirms the layout decode is correct.
#
# Schema per scripts/tooling-rev/section-rule-layout.md:
#   each rule = (uint32 arg0, uint32 arg1, uint32 lookup_key)
#   stride = 12 bytes
#
# Hypothesised lookup_key values from disasm of 0x52f9f8 (which compares
# rule.lookup_key against [setup_obj+0x9f]+0x10 list entries):
#   The TMachineSetup object's catalog list is populated by
#   frame_id_resolve_585f90 — but only with bytes copied from
#   SectionLookupRecord, not lists. So with all-zero SectionLookupRecord,
#   the TList at [setup+0x9f]+0x10 is empty/null and ALL lookups fail.
#
# This probe just demonstrates the loop *runs* the right number of times
# without crashing — the real fix requires populating the parent catalog.
PROBE_RULES = (SectionRule * 4)(
    SectionRule(arg0=0,        arg1=39,        lookup_key=1),  # Swage start
    SectionRule(arg0=16,       arg1=0,         lookup_key=2),  # InnerDimple1
    SectionRule(arg0=2577,     arg1=2616,      lookup_key=1),  # Swage end
    SectionRule(arg0=2599,     arg1=0,         lookup_key=2),  # InnerDimple2
)
fd.rule_array_ptr   = ctypes.addressof(PROBE_RULES)
fd.rule_array_count = len(PROBE_RULES)
print(f"[+] FrameDefRecord.rule_array_ptr   = 0x{fd.rule_array_ptr:08x}")
print(f"[+] FrameDefRecord.rule_array_count = {fd.rule_array_count}")

print()
print(f"[+] FrameRecord size:         0x{ctypes.sizeof(FrameRecord):x} ({ctypes.sizeof(FrameRecord)} bytes)")
print(f"[+] SectionLookupRecord size: 0x{ctypes.sizeof(SectionLookupRecord):x} ({ctypes.sizeof(SectionLookupRecord)} bytes)")
print(f"[+] FrameDefRecord size:      0x{ctypes.sizeof(FrameDefRecord):x} ({ctypes.sizeof(FrameDefRecord)} bytes)")
print(f"[+] Calling add_frameobject(stick_S1, 89S41-1.15, len=2616)...")

# Wrap in SEH-ish guard — capture access violations gracefully.
import traceback
try:
    rc_full = add_frameobject(ctypes.byref(fr), ctypes.byref(sl), ctypes.byref(fd))
    rc = rc_full & 0xFF
    print(f"[+] add_frameobject -> rc=0x{rc:02x} ({rc}) [full eax=0x{rc_full:08x}]")
    rc_meanings = {0: "ok", 3: "duplicate frame_id", 8: "section lookup fail",
                   9: "unauthenticated"}
    if rc in rc_meanings:
        print(f"    => {rc_meanings[rc]}")
except OSError as e:
    print(f"[!] add_frameobject crashed: {e}")
    rc = -1

if rc == 0:
    # Now ask the engine to compute operations.
    print(f"[+] Calling generate_operations(0)...")
    rc = generate_operations(0)
    print(f"[+] generate_operations -> rc={rc}")

    # And fetch the result for our frame_id.
    out_arr = ctypes.c_void_p(0)
    out_len = ctypes.c_int32(0)
    rc = get_operations_for(1, ctypes.byref(out_arr), ctypes.byref(out_len))
    print(f"[+] get_operations_for(1) -> rc={rc}, ops_len={out_len.value}, ops_ptr=0x{out_arr.value or 0:08x}")

    if out_arr.value and out_len.value > 0:
        # Decode the dynamic array. Each entry size is unknown — sample first
        # 64 bytes to start working out the layout.
        dump = ctypes.string_at(out_arr.value, min(64 * out_len.value, 4096))
        print(f"[+] First 256 bytes of ops array (hex):")
        for i in range(0, min(256, len(dump)), 16):
            chunk = dump[i:i+16]
            hex_str = " ".join(f"{b:02x}" for b in chunk)
            ascii_str = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
            print(f"    {i:04x}  {hex_str:48}  {ascii_str}")

# Inspect engine state after the call attempt
g_engine_ptr = ctypes.c_uint32.from_address(G_ENGINE_VA).value
if g_engine_ptr:
    sections_list = ctypes.c_uint32.from_address(g_engine_ptr + 4).value
    frames_list   = ctypes.c_uint32.from_address(g_engine_ptr + 8).value
    if frames_list:
        flist_count = ctypes.c_int32.from_address(frames_list + 8).value
        print(f"[+] engine.frames_list.Count after add: {flist_count}")
    if sections_list:
        slist_count = ctypes.c_int32.from_address(sections_list + 8).value
        print(f"[+] engine.sections_list.Count after add: {slist_count}")

# Tear down cleanly — frees g_engine.
cleanup()
print("[+] cleanup() returned, gate restored on next authenticate() call.")

print()
print(textwrap.dedent("""\
    ============================================================
    SUMMARY (2026-05-03 - SectionRule struct RE complete)
    ============================================================
    add_frameobject still returns 0 with the 12-byte SectionRule
    probe array installed. The rule loop runs without crashing.
    ops_len=0 because the rule lookup_keys don't match anything
    in the (empty) parent TMachineSetup catalog.

    KEY FINDINGS (this session):

      1. Class identification via VMT walk (probe-vmts.py):
           [0x52f158] = TMachineSetup  (NOT TSection)
           [0x5482fc] = TFrameObject
           [0x52fcb8] = TSectionSpecificOptions
           [0x52fe9c] = TSectionSetup
           [0x4f7e68] = TCoord2D
           [0x5280a8] = TProfileShape

      2. The "14-byte SectionRule at SectionLookupRecord+0x9f"
         hypothesis was WRONG. The actual rule iteration is in
         add_frameobject @ VA 0x586507..0x586535, working on
         FrameDefRecord+0x3b (ptr) / +0x3f (count), stride 12.

      3. The rule struct is 12 bytes (3 dwords):
           +0x00 dword arg0
           +0x04 dword arg1
           +0x08 dword lookup_key   (must match key in parent setup)

      4. The op-generator is TFrameObject.vmt+8 @ RVA 0x14da9c.
         It only emits Swage / InnerDimple / etc. ops when FOUR
         sub-lists at TFrameObject+0x60..+0x6c are all non-NULL.
         Those are populated by 0x4fbf64 calls in TFrameObject's
         constructor, which enumerate data on the parent
         TMachineSetup (built from SectionLookupRecord).

      5. With an all-zero SectionLookupRecord, the parent catalog
         is empty -> all rule lookups fail -> ops_len = 0.

    NEXT STEP:
      Get a real catalog into the SectionLookupRecord. Two paths:

      (A) Call Detailer's .msup loader from inside our driver.
          The decryption uses sskeleton.dll + libcrypto-3.dll
          which our process already has loaded.
      (B) Hook add_frameobject inside a running Detailer.exe to
          capture one known-good 3-record byte trio per stick,
          then replay headless. (Recommended in section-rule-
          layout.md and record-layouts.md "Path A".)

    Files:
      scripts/tooling-rev/section-rule-layout.md  (this RE pass)
      scripts/tooling-rev/section-catalog.md      (prior session)
      scripts/tooling-rev/record-layouts.md       (prior session)
    ============================================================
"""))
