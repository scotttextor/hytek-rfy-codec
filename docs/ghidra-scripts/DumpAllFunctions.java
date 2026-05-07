// Dump every non-trivial function. Filter later via grep.
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

public class DumpAllFunctions extends GhidraScript {
    @Override
    public void run() throws Exception {
        String outPath = "C:\\Users\\Scott\\CLAUDE CODE\\hytek-rfy-codec\\docs\\ghidra-out\\decompiled-all.txt";
        new java.io.File(outPath).getParentFile().mkdirs();

        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        ConsoleTaskMonitor monitor = new ConsoleTaskMonitor();

        try (PrintWriter pw = new PrintWriter(new FileWriter(outPath))) {
            FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
            int total = 0, dumped = 0, skipped = 0;
            long startMs = System.currentTimeMillis();

            while (it.hasNext()) {
                Function func = it.next();
                total++;
                long bodyLen = func.getBody().getNumAddresses();
                // Skip tiny stubs and external thunks
                if (bodyLen < 30 || func.isThunk() || func.isExternal()) { skipped++; continue; }

                String code;
                try {
                    DecompileResults res = decompiler.decompileFunction(func, 30, monitor);
                    if (res.decompileCompleted()) {
                        code = res.getDecompiledFunction().getC();
                    } else {
                        skipped++; continue;
                    }
                } catch (Exception e) {
                    skipped++; continue;
                }

                pw.println("##### FN " + func.getName() + " @ 0x" +
                           Long.toHexString(func.getEntryPoint().getOffset()) +
                           " bytes=" + bodyLen);
                pw.println(code);
                pw.println();

                dumped++;
                if (dumped % 200 == 0) {
                    long elapsed = (System.currentTimeMillis() - startMs) / 1000;
                    println("Dumped " + dumped + "/" + total + " (" + elapsed + "s)");
                }
            }

            pw.println();
            pw.println("# total: " + total + ", dumped: " + dumped + ", skipped: " + skipped);
            println("Wrote " + outPath + " (" + dumped + " functions)");
        }

        decompiler.dispose();
    }
}
