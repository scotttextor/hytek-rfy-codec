"""Walk the vftable function-pointer arrays to extract method VAs for key classes.

The vftable layout in modern Delphi is:
  [vmtSelfPtr][vmtIntfTable][vmtAutoTable][vmtInitTable][vmtTypeInfo]
  [vmtFieldTable][vmtMethodTable][vmtDynamicTable][vmtClassName][vmtInstanceSize][vmtParent]
  [vmtEquals][vmtGetHashCode][vmtToString]
  [common 8 functions: SafeCallException, AfterConstruction, BeforeDestruction, ...]
  [class-specific virtual function pointers]  ← these are our rule functions

For each target class, dump the function VA list starting at offset 0x58 (where the
class-specific vfunctions begin) up to a reasonable bound.

We also try to parse the vmtMethodTable struct manually since pythia's parser fails
on modern Delphi method entries.
"""
import json, sys, struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent
import pefile

DLL = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Scott\tools\detailer-bins\Tooling.dll"
CLASSES_JSON = sys.argv[2] if len(sys.argv) > 2 else "tooling-classes.json"
OUT = sys.argv[3] if len(sys.argv) > 3 else "tooling-methods.json"

pe = pefile.PE(DLL)
img = pe.get_memory_mapped_image()
image_base = pe.OPTIONAL_HEADER.ImageBase

def read_dword(va):
    rva = va - image_base
    if rva < 0 or rva + 4 > len(img):
        return None
    return struct.unpack_from("<I", img, rva)[0]

def read_word(va):
    rva = va - image_base
    if rva < 0 or rva + 2 > len(img):
        return None
    return struct.unpack_from("<H", img, rva)[0]

def read_byte(va):
    rva = va - image_base
    if rva < 0 or rva + 1 > len(img):
        return None
    return img[rva]

def read_pascal_string(va):
    n = read_byte(va)
    if n is None or n > 200:
        return None
    rva = va - image_base + 1
    if rva + n > len(img):
        return None
    return img[rva:rva+n].decode("ascii", errors="replace")

def is_in_text(va):
    for s in pe.sections:
        if s.Name.startswith(b".text") or s.Name.startswith(b".itext"):
            base = image_base + s.VirtualAddress
            size = s.Misc_VirtualSize
            if base <= va < base + size:
                return True
    return False

# ---- Method table parser ----
# Modern Delphi method entry: Size:u16, FuncPtr:u32, NameLen:u8, Name:bytes[NameLen]
def parse_method_table(va):
    """Returns list of {Name, FuncPtr, Size}."""
    n = read_word(va)
    if n is None or n > 1000:
        return None
    methods = []
    cursor = va + 2
    for i in range(n):
        size = read_word(cursor)
        if size is None or size < 7 or size > 200:
            return methods if methods else None
        func_ptr = read_dword(cursor + 2)
        name_len = read_byte(cursor + 6)
        if name_len is None or name_len == 0 or name_len > 100:
            return methods if methods else None
        name_va = cursor + 7
        rva = name_va - image_base
        if rva + name_len > len(img):
            return methods if methods else None
        name = img[rva:rva+name_len].decode("ascii", errors="replace")
        methods.append({"Name": name, "FuncPtr": f"0x{func_ptr:x}", "Size": size})
        cursor += size
    return methods

# Load classes
with open(CLASSES_JSON, encoding="utf-8") as f:
    classes_data = json.load(f)

class_methods = {}
for c in classes_data["classes"]:
    name = c.get("class_name")
    mt_va = c.get("vmtMethodTable")
    if not mt_va or not name:
        continue
    methods = parse_method_table(mt_va)
    if methods:
        class_methods[name] = methods

# Save
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(class_methods, f, indent=2)

print(f"Wrote {OUT}")
print(f"Classes with parsed methods: {len(class_methods)}")
total_methods = sum(len(m) for m in class_methods.values())
print(f"Total methods extracted: {total_methods}")

# Print headline rule classes
print("\n=== KEY RULE CLASSES ===")
keywords = ["TToolingClassifier", "TToolingManager", "TBoxingDimples", "ToolingCalculator",
            "TFrame", "TStick", "TTrussHoles", "TFrameObject", "TOperation"]
for name in sorted(class_methods.keys()):
    if not any(k in name for k in keywords): continue
    methods = class_methods[name]
    print(f"\n## {name} ({len(methods)} methods)")
    for m in methods[:30]:
        print(f"   {m['Name']:<45} @ {m['FuncPtr']}")
