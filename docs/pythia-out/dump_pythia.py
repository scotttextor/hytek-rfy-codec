"""Dump every Delphi vftable + class name from a PE binary using pythia internals.

Bypasses pythia's broken analyse() (which conflicts when both profiles match)
by directly invoking _find_vftables on a section with the modern profile only.
"""
import json, sys, os, logging
from pathlib import Path

sys.path.insert(0, r"C:\Users\Scott\tools\pythia")
from pythia.core.windows import PEHandler
from pythia.core.structures import vftable_modern, vftable_legacy

if len(sys.argv) < 3:
    print("usage: dump_pythia.py <input.dll> <output.json>")
    sys.exit(1)

dll = sys.argv[1]
out = sys.argv[2]

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pythia")

h = PEHandler(logger=logger, filename=dll)
# Force modern profile only — Tooling.dll uses Delphi modern (XE+)
h.profiles = {
    "delphi_modern": {
        "description": "Delphi (modern)",
        "distance": 0x58,
        "vftable_struct": vftable_modern,
    },
}
h.chosen_profile = None

sections = h._find_code_sections()
all_classes = []
section_data = {}

for s in sections:
    vftables = h._find_vftables(s)
    if not vftables:
        continue
    section_data[s["name"]] = {"base_va": s["base_va"], "size": s["size"], "vftable_count": len(vftables)}
    for offset, data in vftables.items():
        try:
            name_off = data["vmtClassName"] - s["base_va"]
            class_name_raw = h._extract_pascal_string(s["data"], name_off)
            class_name = class_name_raw.decode("ascii", errors="replace") if isinstance(class_name_raw, bytes) else str(class_name_raw)
        except Exception as e:
            class_name = f"<err:{e}>"
        all_classes.append({
            "va": offset,
            "section": s["name"],
            "class_name": class_name,
            "vmtSelfPtr": data.get("vmtSelfPtr"),
            "vmtMethodTable": data.get("vmtMethodTable"),
            "vmtFieldTable": data.get("vmtFieldTable"),
            "vmtIntfTable": data.get("vmtIntfTable"),
            "vmtAutoTable": data.get("vmtAutoTable"),
            "vmtInitTable": data.get("vmtInitTable"),
            "vmtTypeInfo": data.get("vmtTypeInfo"),
            "vmtDynamicTable": data.get("vmtDynamicTable"),
            "vmtInstanceSize": data.get("vmtInstanceSize"),
            "vmtParent": data.get("vmtParent"),
            "vmtClassName": data.get("vmtClassName"),
        })

# Resolve parent class names (vmtParent → vmtSelfPtr - 0x58)
by_self_ptr = {c["vmtSelfPtr"]: c["class_name"] for c in all_classes}
for c in all_classes:
    pp = c.get("vmtParent")
    if pp and pp in by_self_ptr:
        c["parent_class_name"] = by_self_ptr[pp]

all_classes.sort(key=lambda c: c.get("class_name") or "")

# Now extract method tables — for each class with vmtMethodTable, parse the method_table struct
from pythia.core.structures import method_table

method_lookup = {}  # class_name -> [method names]
for c in all_classes:
    mt_va = c.get("vmtMethodTable")
    if not mt_va:
        continue
    # Find which section contains it
    for s in sections:
        base = s["base_va"]
        size = s["size"]
        if base <= mt_va < base + size:
            offset = mt_va - base
            try:
                s["data"].seek(offset)
                mt = method_table.parse_stream(s["data"])
                names = [m["Name"].decode("ascii", errors="replace") if isinstance(m["Name"], bytes) else str(m["Name"]) for m in mt["Methods"]]
                method_lookup[c["class_name"]] = [{"name": n, "fn_va": m["Function_ptr"]} for n, m in zip(names, mt["Methods"])]
            except Exception as e:
                method_lookup[c["class_name"]] = f"<err:{e}>"
            break

# Stamp methods onto classes
for c in all_classes:
    methods = method_lookup.get(c["class_name"])
    if methods is not None:
        c["methods"] = methods

result = {
    "input": dll,
    "section_data": section_data,
    "total_classes": len(all_classes),
    "classes": all_classes,
}

with open(out, "w", encoding="utf-8") as f:
    json.dump(result, f, indent=2, default=str)

print(f"\n=== SUMMARY ===")
print(f"Total classes: {len(all_classes)}")
print(f"Classes with method tables: {sum(1 for c in all_classes if isinstance(c.get('methods'), list))}")
total_methods = sum(len(c.get("methods", [])) for c in all_classes if isinstance(c.get("methods"), list))
print(f"Total methods extracted: {total_methods}")

keywords = ["Tooling", "Boxing", "Truss", "Frame", "Stick", "Op", "Rule", "Dimple", "Notch", "Swage", "Web", "Bolt", "Service", "Chamfer", "Lip", "Flange", "Hole", "Plate", "Punch", "Calc", "Generate", "Recalc"]
matches = [c for c in all_classes if c["class_name"] and any(k.lower() in c["class_name"].lower() for k in keywords)]
print(f"Tooling-related classes: {len(matches)}")
for c in matches:
    parent = c.get("parent_class_name", "?")
    methods = c.get("methods", [])
    method_names = [m["name"] if isinstance(m, dict) else m for m in (methods if isinstance(methods, list) else [])]
    print(f"  {c['class_name']:<55} parent={parent:<35} {len(method_names)} methods")
    for m in method_names[:8]:
        print(f"      - {m}")

print(f"\nWrote {out}")
