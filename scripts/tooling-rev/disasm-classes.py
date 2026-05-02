"""Dump the class vtables relevant to add_frameobject's flow.

  - 0x5482fc : TFrameObject class (ctor 0x54d884)
  - 0x52fcb8 : some object class (instantiated in add_frameobject middle)
  - 0x52fe9c : another class instantiated near frames_list.Add
  - 0x4f7e68 : class for the two big objects @ ebp-0x1c / ebp-0x2c
  - 0x52f158 : TSection class (ctor wrapper 0x585f90)
"""
import sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

DLL = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\Tooling.dll"

CLASS_PTRS = {
    "0x5482fc TFrameObject": 0x1482fc,
    "0x52fcb8 ?ListOfX":     0x12fcb8,
    "0x52fe9c ?BuilderX":    0x12fe9c,
    "0x4f7e68 ?Tools":       0xf7e68,
    "0x52f158 TSection":     0x12f158,
}

with open(DLL, "rb") as f:
    pe_data = f.read()
pe = pefile.PE(data=pe_data, fast_load=True)
image_base = pe.OPTIONAL_HEADER.ImageBase
md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True

mapped = pe.get_memory_mapped_image()


def dword_at(rva):
    return int.from_bytes(mapped[rva:rva+4], "little")


def explore(name, class_ptr_rva):
    print(f"\n=== {name} @ data RVA 0x{class_ptr_rva:08x} (VA 0x{image_base+class_ptr_rva:08x}) ===")
    # The DATA at this RVA is a POINTER to the actual class vmt.
    class_vmt_va = dword_at(class_ptr_rva)
    if class_vmt_va == 0:
        print("  ! data is zero")
        return
    class_vmt_rva = class_vmt_va - image_base
    print(f"  classvmt VA=0x{class_vmt_va:08x}  RVA=0x{class_vmt_rva:08x}")
    # Delphi VMT layout (negative offsets are RTTI metadata):
    #   [vmt - 0x4c] = class name (pointer to short string)
    #   [vmt - 0x44] = parent class pointer
    #   [vmt - 0x10] = type info pointer
    # Forward (positive) offsets are virtual methods.
    # Try common Delphi VMT class-name offsets.
    for cn_off in (-0x38, -0x4c, -0x40, -0x44, -0x48, -0x3c, -0x34):
        try:
            name_ptr_va = dword_at(class_vmt_rva + cn_off)
            name_ptr = name_ptr_va - image_base
            if not (0 <= name_ptr < len(mapped) - 64):
                continue
            name_len = mapped[name_ptr]
            if 0 < name_len < 64:
                candidate = mapped[name_ptr + 1:name_ptr + 1 + name_len]
                if all(32 <= b < 127 for b in candidate):
                    print(f"  class name (vmt{cn_off:+#04x}): {candidate.decode('ascii')!r}")
                    break
        except Exception:
            continue

    try:
        parent_va = dword_at(class_vmt_rva - 0x24)
        if parent_va:
            parent_rva = parent_va - image_base
            try:
                parent_class_va = dword_at(parent_rva)
                if parent_class_va:
                    parent_class_rva = parent_class_va - image_base
                    pname_ptr = dword_at(parent_class_rva - 0x4c) - image_base
                    pname_len = mapped[pname_ptr]
                    pname_str = mapped[pname_ptr + 1:pname_ptr + 1 + pname_len].decode("ascii", "replace")
                    print(f"  parent class: {pname_str!r}")
            except Exception:
                pass
    except Exception:
        pass

    # Virtual method table (positive offsets from class_vmt)
    print(f"  virtual methods:")
    for off in range(0, 0x80, 4):
        try:
            method_va = dword_at(class_vmt_rva + off)
            if method_va == 0:
                continue
            print(f"    [vmt + 0x{off:02x}] = 0x{method_va:08x}")
        except Exception:
            break


for name, rva in CLASS_PTRS.items():
    explore(name, rva)
