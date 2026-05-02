"""Dump the bytes around the .msup string and the .sct/.sct strings to see
which file extension Detailer's actual filter dialog uses, vs which is RTTI."""
import pefile

PE_PATH = r"C:\Program Files (x86)\FRAMECAD\Detailer\Version 5\FRAMECAD Detailer.exe"
pe = pefile.PE(PE_PATH, fast_load=False)

needles = [
    (".msup".encode("utf-16-le"), "utf16:.msup"),
    ("Machine Setups".encode("utf-16-le"), "utf16:Machine Setups"),
    (".msup".encode("ascii"), "ascii:.msup"),
    ("*.msup".encode("utf-16-le"), "utf16:*.msup"),
    ("*.msup".encode("ascii"), "ascii:*.msup"),
    ("*.fst".encode("ascii"), "ascii:*.fst"),
    ("*.fst".encode("utf-16-le"), "utf16:*.fst"),
    ("*.sct".encode("ascii"), "ascii:*.sct"),
    ("*.sct".encode("utf-16-le"), "utf16:*.sct"),
    ("*.sup".encode("ascii"), "ascii:*.sup"),
    ("*.sup".encode("utf-16-le"), "utf16:*.sup"),
    ("Setup".encode("utf-16-le"), "utf16:Setup"),
    ("setup".encode("utf-16-le"), "utf16:setup"),
    ("\\Machine Setups\\".encode("utf-16-le"), "utf16:\\Machine Setups\\"),
    ("FRAMECAD".encode("utf-16-le"), "utf16:FRAMECAD"),
]

for sect in pe.sections:
    sname = sect.Name.rstrip(b"\x00").decode("ascii", errors="replace")
    data = sect.get_data()
    base_va = pe.OPTIONAL_HEADER.ImageBase + sect.VirtualAddress
    for n, descr in needles:
        i = 0
        while True:
            j = data.find(n, i)
            if j < 0:
                break
            va = base_va + j
            start = max(0, j - 32)
            end = min(len(data), j + len(n) + 64)
            chunk = data[start:end]
            print(f"\n[{descr}] @ 0x{va:08x} (sect={sname})")
            # Print as hex+ascii
            for k in range(0, len(chunk), 16):
                row = chunk[k:k+16]
                hex_part = " ".join(f"{b:02x}" for b in row)
                ascii_part = "".join(chr(b) if 32 <= b < 127 else "." for b in row)
                tag = " <-" if start + k <= j < start + k + 16 else ""
                print(f"  {start+k:08x}  {hex_part:<48}  {ascii_part}{tag}")
            # Try utf-16 decode of the section centered on the hit
            try:
                t = data[j:j+200].decode('utf-16-le', errors='replace')
                print(f"   utf16-decoded: {t!r}")
            except Exception as e:
                pass
            i = j + 1
