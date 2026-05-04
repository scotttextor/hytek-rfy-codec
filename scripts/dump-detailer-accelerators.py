"""
Dump menu / accelerator resources from FRAMECAD Detailer.exe so we can find
the right keyboard shortcuts for File → Build / File → Export RFY without
relying on pywinauto's menu enumeration (which fails on custom-painted Delphi
menus).
"""
import sys
import struct
from pathlib import Path

EXE = Path(r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe")


def main():
    if not EXE.exists():
        print(f"[!] {EXE} not found")
        sys.exit(1)

    try:
        import pefile
    except ImportError:
        print("[!] pefile not installed; pip install pefile")
        sys.exit(1)

    pe = pefile.PE(str(EXE))
    print(f"loaded {EXE.name} ({pe.OPTIONAL_HEADER.SizeOfImage} bytes)")

    res = getattr(pe, "DIRECTORY_ENTRY_RESOURCE", None)
    if not res:
        print("[!] no resources")
        return

    # Map resource type id → name
    types = {
        4: "MENU",
        9: "ACCELERATOR",
        16: "VERSION",
        2: "BITMAP",
        3: "ICON",
        14: "GROUP_ICON",
        6: "STRING",
        5: "DIALOG",
        24: "MANIFEST",
    }

    for entry in res.entries:
        tid = entry.struct.Id if hasattr(entry, "struct") and entry.struct else None
        if entry.id is not None:
            tid = entry.id
        tname = types.get(tid, f"<{tid}>")
        print(f"\n=== Resource type {tid} ({tname}) ===")
        if tname == "STRING":
            # Walk strings
            count = 0
            for sub in entry.directory.entries:
                for lang in sub.directory.entries:
                    rva = lang.data.struct.OffsetToData
                    size = lang.data.struct.Size
                    data = pe.get_memory_mapped_image()[rva:rva + size]
                    # String table: 16 strings packed as length-prefixed UTF-16
                    pos = 0
                    bid = (sub.id - 1) * 16
                    for i in range(16):
                        if pos + 2 > len(data):
                            break
                        n = struct.unpack_from("<H", data, pos)[0]
                        pos += 2
                        if n:
                            try:
                                s = data[pos:pos + n * 2].decode("utf-16le", "replace")
                                lower = s.lower()
                                if any(k in lower for k in ("build", "export", "rebuild", "rfy", "rollform", "process", "open", "import")):
                                    print(f"  STR[{bid+i}] = {s!r}")
                                    count += 1
                            except Exception:
                                pass
                        pos += n * 2
            print(f"  ...{count} matches")
        elif tname == "ACCELERATOR":
            # ACCELERATOR table = sequence of 8-byte ACCEL records
            for sub in entry.directory.entries:
                for lang in sub.directory.entries:
                    rva = lang.data.struct.OffsetToData
                    size = lang.data.struct.Size
                    data = pe.get_memory_mapped_image()[rva:rva + size]
                    pos = 0
                    n = 0
                    print(f"  Table id {sub.id}, lang {lang.id}, size {size}")
                    while pos + 8 <= len(data):
                        flags, key, cmd, _ = struct.unpack_from("<HHHH", data, pos)
                        pos += 8
                        n += 1
                        # Decode common keys
                        ks = ""
                        if flags & 0x10: ks += "Alt+"
                        if flags & 0x08: ks += "Ctrl+"
                        if flags & 0x04: ks += "Shift+"
                        if flags & 0x01:  # FVIRTKEY
                            vk_names = {
                                0x70: "F1", 0x71: "F2", 0x72: "F3", 0x73: "F4",
                                0x74: "F5", 0x75: "F6", 0x76: "F7", 0x77: "F8",
                                0x78: "F9", 0x79: "F10", 0x7A: "F11", 0x7B: "F12",
                                0x1B: "Esc", 0x0D: "Enter", 0x09: "Tab",
                                0x2D: "Insert", 0x2E: "Delete",
                                0x21: "PgUp", 0x22: "PgDn", 0x24: "Home", 0x23: "End",
                            }
                            if key in vk_names:
                                ks += vk_names[key]
                            elif 0x30 <= key <= 0x39:
                                ks += chr(key)
                            elif 0x41 <= key <= 0x5A:
                                ks += chr(key)
                            else:
                                ks += f"VK_{key:#x}"
                        else:
                            ks += chr(key) if 32 <= key < 127 else f"K_{key:#x}"
                        if flags & 0x80:
                            print(f"    {ks:20s} cmd={cmd} (last)")
                        else:
                            print(f"    {ks:20s} cmd={cmd}")
                    if n == 0:
                        print(f"    (empty)")


if __name__ == "__main__":
    main()
