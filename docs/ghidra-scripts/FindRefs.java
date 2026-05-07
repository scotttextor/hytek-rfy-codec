// Find functions that reference our target Delphi class/method strings.
//@category HYTEK
//@runtime Java

import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.util.DefinedDataIterator;
import ghidra.util.task.ConsoleTaskMonitor;

import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class FindRefs extends GhidraScript {

    private static final List<String> TARGETS = Arrays.asList(
        "GetTrussHolePosition",
        "CanPlaceLargeService",
        "TBoxingDimples",
        "ChamferTolerance",
        "RecalcTooling",
        "CreateDimpleOffsets",
        "AutomaticChamfer",
        "TToolingManager",
        "TToolActionSection",
        "TTrussHoles",
        "HandleExtraHoles",
        "FindFlangeOperations",
        "TToolingClassifier",
        "TToolingCalculator"
    );

    @Override
    public void run() throws Exception {
        String outPath = "C:\\Users\\Scott\\CLAUDE CODE\\hytek-rfy-codec\\docs\\ghidra-out\\delphi-rule-functions.txt";

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        ConsoleTaskMonitor monitor = new ConsoleTaskMonitor();

        // Walk all defined strings, match against targets
        try (PrintWriter pw = new PrintWriter(new FileWriter(outPath))) {
            pw.println("# Functions referencing Delphi class/method strings\n");

            DefinedDataIterator stringIter = DefinedDataIterator.definedStrings(currentProgram);
            int totalStrings = 0;
            int matched = 0;
            Set<Address> functionAddresses = new HashSet<>();

            while (stringIter.hasNext()) {
                ghidra.program.model.listing.Data data = stringIter.next();
                totalStrings++;
                String value = data.getValue() != null ? data.getValue().toString() : "";
                if (value.length() < 4) continue;

                String matchedTarget = null;
                for (String t : TARGETS) {
                    if (value.contains(t)) { matchedTarget = t; break; }
                }
                if (matchedTarget == null) continue;
                matched++;

                Address strAddr = data.getAddress();
                pw.println("=".repeat(78));
                pw.println("STRING '" + value + "' @ " + strAddr);
                pw.println("=".repeat(78));

                ReferenceIterator refs = currentProgram.getReferenceManager().getReferencesTo(strAddr);
                int refCount = 0;
                while (refs.hasNext()) {
                    Reference ref = refs.next();
                    Address from = ref.getFromAddress();
                    Function func = currentProgram.getFunctionManager().getFunctionContaining(from);
                    if (func == null) continue;
                    refCount++;
                    String fnKey = func.getEntryPoint().toString();
                    pw.println("  REF from " + from + " in function " + func.getName() + " @ " + fnKey);
                    if (functionAddresses.contains(func.getEntryPoint())) continue;
                    functionAddresses.add(func.getEntryPoint());

                    // Decompile the function
                    try {
                        DecompileResults res = decompiler.decompileFunction(func, 30, monitor);
                        if (res.decompileCompleted()) {
                            pw.println("  --- decompile of " + func.getName() + " ---");
                            pw.println(res.getDecompiledFunction().getC());
                            pw.println("  --- end ---\n");
                        } else {
                            pw.println("  (decompile failed)");
                        }
                    } catch (Exception e) {
                        pw.println("  (decompile error: " + e.getMessage() + ")");
                    }
                }
                pw.println("  Total refs: " + refCount + "\n");
            }

            pw.println("\n# Total strings scanned: " + totalStrings);
            pw.println("# Strings matching targets: " + matched);
            pw.println("# Unique functions decompiled: " + functionAddresses.size());
            println("Wrote " + outPath + " (" + functionAddresses.size() + " unique functions)");
        }

        decompiler.dispose();
    }
}
