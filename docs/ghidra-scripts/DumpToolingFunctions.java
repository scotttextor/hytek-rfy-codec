// Ghidra Java script — dump decompiled C-like source for every function whose
// name matches one of our targets.
//
// Run via: analyzeHeadless ... -postScript DumpToolingFunctions.java
//@category HYTEK
//@runtime Java

import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.util.task.ConsoleTaskMonitor;

import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.Arrays;
import java.util.List;

public class DumpToolingFunctions extends GhidraScript {

    private static final List<String> TARGETS = Arrays.asList(
        "ToolingManager",
        "ToolingClassifier",
        "ToolingCalculator",
        "BoxingDimples",
        "TrussHoles",
        "TrussHole",
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
        "RecalcTooling",
        "GetTrussHole",
        "CanPlaceLargeService",
        "IsTrussOp",
        "IsExtraWebHole",
        "IsWebCut",
        "IsWebHole",
        "IsWebLipCut",
        "ChamferEnds",
        "ChamferLength",
        "ChamferShapes",
        "ChamferTolerance",
        "EndToEndChamfers",
        "ExtraFlangeChamfers",
        "ExtraWebHoles",
        "FlangeChamferDetail",
        "GetChamfer",
        "ClearChamfers",
        "CreateBoxedSectionDimples",
        "FindFlangeOperations",
        "CreateDimpleOffsets",
        "GenerateRFY",
        "HandleExtraHoles",
        "RClassification"
    );

    @Override
    public void run() throws Exception {
        String outPath = "C:\\Users\\Scott\\CLAUDE CODE\\hytek-rfy-codec\\docs\\ghidra-out\\decompiled-tooling.txt";
        new java.io.File(outPath).getParentFile().mkdirs();

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        ConsoleTaskMonitor monitor = new ConsoleTaskMonitor();

        try (PrintWriter pw = new PrintWriter(new FileWriter(outPath))) {
            pw.println("# Decompiled functions matching targets");
            pw.println("# Targets: " + String.join(", ", TARGETS));
            pw.println();

            FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
            int total = 0;
            int matched = 0;
            int dumped = 0;

            while (it.hasNext()) {
                Function func = it.next();
                total++;
                String name = func.getName();
                String parent = func.getParentNamespace() != null ? func.getParentNamespace().getName() : "";

                boolean hit = false;
                for (String t : TARGETS) {
                    if (name.toLowerCase().contains(t.toLowerCase()) ||
                        parent.toLowerCase().contains(t.toLowerCase())) {
                        hit = true;
                        break;
                    }
                }
                if (!hit) continue;
                matched++;

                String code;
                try {
                    DecompileResults res = decompiler.decompileFunction(func, 60, monitor);
                    if (res.decompileCompleted()) {
                        code = res.getDecompiledFunction().getC();
                        dumped++;
                    } else {
                        code = "(decompile failed: " + res.getErrorMessage() + ")";
                    }
                } catch (Exception e) {
                    code = "(error: " + e.getMessage() + ")";
                }

                pw.println("=".repeat(78));
                pw.println("FUNCTION: " + parent + "::" + name + " @ 0x" +
                           Long.toHexString(func.getEntryPoint().getOffset()));
                pw.println("Signature: " + func.getSignature());
                pw.println("=".repeat(78));
                pw.println(code);
                pw.println();
            }

            pw.println();
            pw.println("# total functions: " + total);
            pw.println("# matched: " + matched);
            pw.println("# decompiled: " + dumped);
            println("Wrote " + outPath + " (" + dumped + " functions)");
        }

        decompiler.dispose();
    }
}
