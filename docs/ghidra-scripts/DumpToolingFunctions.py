"""Ghidra Python script — dump decompiled C-like source for every function
whose containing class name matches one of our targets.

Run via: analyzeHeadless ... -postScript DumpToolingFunctions.py
Output:  <project>/decompiled-tooling.txt
"""
# @category HYTEK
# @runtime Python

import os
from ghidra.app.decompiler import DecompInterface, DecompileOptions
from ghidra.util.task import ConsoleTaskMonitor

TARGETS = [
    "ToolingManager",
    "ToolingClassifier",
    "ToolingCalculator",
    "BoxingDimples",
    "TrussHoles",
    "ToolActionSection",
    "ToolData",
    "FrameBuilder",
    "Boxing",
    "Chamfer",
    "Dimple",
    "Service",
    "Header",
    "Cripple",
    "Bolt",
    "Web",
]

OUT_PATH = os.path.join(getProjectRootFolder().getPathToRoot(), "decompiled-tooling.txt")
program = currentProgram

decompiler = DecompInterface()
opts = DecompileOptions()
decompiler.setOptions(opts)
decompiler.openProgram(program)
monitor = ConsoleTaskMonitor()

with open(OUT_PATH, "w") as f:
    f.write("# Decompiled functions matching targets\n")
    f.write("# Targets: " + ", ".join(TARGETS) + "\n\n")
    fm = program.getFunctionManager()
    funcs = list(fm.getFunctions(True))
    f.write("# Total functions: %d\n\n" % len(funcs))
    matched = 0
    for func in funcs:
        name = func.getName()
        # match if any target appears
        if not any(t.lower() in name.lower() for t in TARGETS):
            continue
        matched += 1
        try:
            res = decompiler.decompileFunction(func, 60, monitor)
            code = res.getDecompiledFunction().getC() if res.decompileCompleted() else "(decompile failed)"
        except Exception as e:
            code = "(error: %s)" % e
        f.write("=" * 78 + "\n")
        f.write("FUNCTION: %s @ 0x%x\n" % (name, func.getEntryPoint().getOffset()))
        f.write("=" * 78 + "\n")
        f.write(code + "\n\n")
    f.write("\n# %d / %d functions matched and dumped\n" % (matched, len(funcs)))
print("Wrote %s" % OUT_PATH)
