// Frida script to trace Tooling.dll function calls + dump Delphi class RTTI.
// Usage: frida -p <pid_of_FRAMECAD_Detailer> -l detailer-trace.js
// Or:    frida-trace -i "Tooling.dll!*GenerateRFY*" FRAMECAD_Detailer.exe

const TARGET_MODULE = "Tooling.dll";

function log(msg) {
    send({ type: "log", msg: String(msg) });
}

function tryLoadModule(name) {
    const mods = Process.enumerateModules();
    for (const m of mods) {
        if (m.name.toLowerCase() === name.toLowerCase()) return m;
    }
    return null;
}

let mod = tryLoadModule(TARGET_MODULE);
if (!mod) {
    log(`[ERR] ${TARGET_MODULE} not loaded yet — retrying in 2s`);
    setTimeout(() => {
        mod = tryLoadModule(TARGET_MODULE);
        if (!mod) {
            log(`[ERR] ${TARGET_MODULE} STILL not loaded`);
        } else {
            initHooks();
        }
    }, 2000);
} else {
    initHooks();
}

function initHooks() {
    log(`[OK] ${TARGET_MODULE} loaded at ${mod.base} (${mod.size} bytes)`);

    // 1. Enumerate exports
    const exports = Module.enumerateExports(TARGET_MODULE);
    log(`[exports] ${exports.length} exported symbols`);
    for (const e of exports.slice(0, 20)) {
        log(`  ${e.type} ${e.name} @ ${e.address}`);
    }

    // 2. Hook every export — log entry
    let hookCount = 0;
    for (const e of exports) {
        if (e.type !== "function") continue;
        try {
            Interceptor.attach(e.address, {
                onEnter(args) {
                    this.fn = e.name;
                    log(`-> ${e.name}`);
                },
                onLeave(retval) {
                    log(`<- ${e.name} = ${retval}`);
                },
            });
            hookCount++;
        } catch (err) {
            // Some exports can't be hooked
        }
    }
    log(`[hooks] attached ${hookCount} interceptors`);

    // 3. Scan memory for the Delphi RTTI class names we care about
    log("[rtti] scanning for Delphi class strings...");
    const TARGETS = ["TToolingManager", "TBoxingDimples", "TToolingClassifier",
                     "TToolingCalculator", "TTrussHoles", "TToolActionSection"];
    for (const tgt of TARGETS) {
        try {
            const pattern = Array.from(tgt).map(c => c.charCodeAt(0).toString(16).padStart(2, "0")).join(" ");
            const matches = Memory.scanSync(mod.base, mod.size, pattern);
            if (matches.length > 0) {
                log(`  '${tgt}' x${matches.length} — first match @ ${matches[0].address}`);
            } else {
                log(`  '${tgt}' NOT FOUND in ${TARGET_MODULE}`);
            }
        } catch (err) {
            log(`  '${tgt}' scan error: ${err.message}`);
        }
    }
}
