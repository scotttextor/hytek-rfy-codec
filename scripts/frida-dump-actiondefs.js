/*
 * frida-dump-actiondefs.js
 *
 * Captures the FRAMECAD Detailer ActionDefsManager dictionary at runtime.
 * Hooks Tooling.dll's TToolActionSection lookup and rule-walker to dump
 * every classification name + per-edge-mask action recipe.
 *
 * BACKGROUND
 * ----------
 * `ActionDefsManager` is the runtime-populated TObjectDictionary<string,
 * TToolActionSection> at Tooling.dll!DAT_005968d0. It holds the ~28 named
 * tooling-op recipe sections (e.g. "OnFlat - Standard", "OnEdge -
 * LipNotchedStandard") that the rule executor walks for every stick-stick
 * intersection. The recipes are NOT baked into the DLL — they live entirely
 * in this in-memory dictionary, populated at startup from external config.
 *
 * Reverse-engineering source: docs/detailer-rule-decoded.md (2026-05-08).
 *
 * CAPTURE STRATEGY (defence in depth)
 * -----------------------------------
 * 1. Hook FUN_00520cc8 (LookupActionSection): every named lookup that
 *    Detailer performs at rule-execution time. onEnter logs the key string;
 *    onLeave logs the resolved TToolActionSection pointer + walks all 16
 *    FToolActions[] arrays.
 *
 * 2. Hook FUN_00521280 (Dictionary.Add internal): every (hash, key, value)
 *    bucket-insert when the dictionary is being populated at startup.
 *    Captures keys we'd never see via lookup (cold paths).
 *
 * 3. Hook FUN_00545b94 (ApplyRule, the rule executor): every per-stick rule
 *    walk. We don't have the section name here, but we DO have the precise
 *    FToolActions[mask] pointer + the intersection record + the walker's
 *    selected slot. Cross-correlated with #1's section dumps for ground
 *    truth.
 *
 * 4. On first ApplyRule fire (and on demand from Python), do a one-shot
 *    direct walk of DAT_005968d0 — read every bucket, dump the full
 *    dictionary at once. This is the belt-and-braces capture.
 *
 * Each log line is JSON, one record per line (JSONL). The Python launcher
 * streams these to disk.
 *
 * TARGETED ADDRESSES (Tooling.dll, Ghidra image base 0x00400000)
 * ----------------------------------------------------------------
 *  RVA 0x120cc8  FUN_00520cc8  LookupActionSection(name: UnicodeString) -> TToolActionSection*
 *  RVA 0x12118c  FUN_0052118c  Dictionary.GetValueByKey
 *  RVA 0x121280  FUN_00521280  Dictionary.Add internal (per-bucket fill)
 *  RVA 0x121c50  FUN_00521c50  Dictionary.ContainsKey
 *  RVA 0x145b94  FUN_00545b94  ApplyRule(actionsArray, intersection, ops, swageL, swageR)
 *  RVA 0x145af8  FUN_00545af8  MakeOperations
 *  RVA 0x1968d0  DAT_005968d0  ActionDefsManager (the dictionary instance)
 *  RVA 0x120d0c  LAB_00520d0c  "None" key fallback
 *
 * DELPHI ABI REFERENCE
 * --------------------
 *   UnicodeString:
 *     ptr     -> UTF-16 string data (null-terminated)
 *     ptr-4   -> i32 length in chars
 *     ptr-8   -> codepage:u16, elemSize:u16 (always 1200, 2 for UnicodeString)
 *     ptr-12  -> i32 refcount
 *
 *   TArray<T> (Delphi dynamic array):
 *     ptr     -> element 0
 *     ptr-4   -> i32 length (in elements, not bytes)
 *
 *   TDictionary<TKey,TValue> (Generics.Collections, RTL):
 *     self+0x04 -> buckets pointer (TArray of bucket entries)
 *     self+0x08 -> item count i32
 *     self+0x0c -> comparer object (with hash + equality vtable)
 *     bucket layout (12 bytes): [hash:u32][key:u32][value:u32]
 *     empty bucket has hash == 0xFFFFFFFF
 *
 *   TToolActionSection layout (inferred from FUN_00545af8):
 *     +0x00 -> ?
 *     +0x08 -> SwageClearance left (u32)
 *     +0x0c -> SwageClearance right (u32)
 *     +0x10 + mask*4 -> FToolActions[mask], a TArray of (filterEdges, actions) slot pairs
 *
 *   FToolActions[mask] entry (8 bytes per slot):
 *     +0x00 -> filterEdges: TArray<u8>  (each byte = edgeIndex & 0x7f, high bit = flag)
 *     +0x04 -> actions:     TArray<RAction[5]>
 *
 *   RAction (5 bytes):
 *     byte 0 -> ToolName  (index/code into section's tool list)
 *     byte 1 -> ActionType (0=atAToB, 1=atATowardsB, 2=atBTowardsA)
 *     byte 2 -> CopyType  (corner: 0..3, octDefault/octLeftLow/octLeftHigh/octRightLow/octRightHigh)
 *     byte 3 -> EdgeIndex (0..3, picks connector intersection edge)
 *     byte 4 -> CounterpartEdgeIndex (picks connectee intersection edge)
 */

'use strict';

const TOOLING = 'Tooling.dll';

// All RVAs are relative to Tooling.dll's load base. Ghidra image base 0x00400000.
const RVA = {
    LookupActionSection: 0x120cc8,
    DictionaryAdd:       0x121280,
    DictionaryContains:  0x121c50,
    DictionaryGetByKey:  0x12118c,
    ApplyRule:           0x145b94,
    MakeOperations:      0x145af8,
    ActionDefsManager:   0x1968d0,
    NoneStringConst:     0x120d0c,
};

// Hard caps to prevent runaway memory walks if a struct pointer is corrupt.
const MAX_BUCKETS          = 4096;
const MAX_SLOTS_PER_MASK   = 256;
const MAX_FILTER_BYTES     = 64;
const MAX_ACTIONS_PER_SLOT = 256;
const MAX_STRING_CHARS     = 512;
const MAX_APPLY_RULE_LOG   = 2000;     // suppress further per-call apply_rule events past this

let toolingBase     = null;
let dumpedSections  = new Set();   // section pointers already fully dumped, to dedupe
let dumpedKeys      = new Set();   // key strings already dumped
let firstApplyRule  = false;       // flag to trigger one-shot full-dictionary walk
let applyRuleCalls  = 0;           // running counter
let lookupCalls     = 0;
let addCalls        = 0;

// JSONL emit helper. Frida's `send()` accepts any JSON-serializable object;
// the Python launcher receives it as a dict via script.on('message', ...).
function emit(rec) {
    try {
        send(rec);
    } catch (e) {
        // last-resort fallback — should never happen if rec is JSON-clean
        try { console.log('EMIT_FAILED ' + e); } catch (e2) {}
    }
}

// Read a Delphi UnicodeString. Returns null if pointer looks invalid.
function readDelphiString(ptr) {
    if (ptr === null || ptr.isNull === undefined || ptr.isNull()) return null;
    try {
        const lenPtr = ptr.sub(4);
        const len = lenPtr.readS32();
        if (len < 0 || len > MAX_STRING_CHARS) return null;
        if (len === 0) return '';
        return ptr.readUtf16String(len);
    } catch (e) {
        return null;
    }
}

// Read a Delphi dynamic-array length (stored at ptr - 4).
function delphiArrayLen(ptr) {
    if (ptr === null || ptr.isNull === undefined || ptr.isNull()) return 0;
    try {
        return ptr.sub(4).readS32();
    } catch (e) {
        return -1;
    }
}

// Read N bytes as a hex string (lowercase, no separator).
function readHex(ptr, len) {
    if (!ptr || ptr.isNull() || len <= 0) return '';
    try {
        const bytes = new Uint8Array(ptr.readByteArray(len));
        let h = '';
        for (let i = 0; i < bytes.length; i++) {
            h += bytes[i].toString(16).padStart(2, '0');
        }
        return h;
    } catch (e) {
        return null;
    }
}

// Decode a single 5-byte RAction record.
function decodeRAction(ptr) {
    try {
        const b0 = ptr.add(0).readU8();
        const b1 = ptr.add(1).readU8();
        const b2 = ptr.add(2).readU8();
        const b3 = ptr.add(3).readU8();
        const b4 = ptr.add(4).readU8();
        return {
            raw: [b0, b1, b2, b3, b4].map(v => v.toString(16).padStart(2, '0')).join(''),
            ToolName: b0,
            ActionType: b1,           // 0=atAToB, 1=atATowardsB, 2=atBTowardsA
            CopyType: b2,             // corner index 0..3
            EdgeIndex: b3,            // connector edge 0..3
            CounterpartEdge: b4,      // connectee edge 0..3
        };
    } catch (e) {
        return { decode_error: String(e) };
    }
}

// Walk a TArray<u8> filter-edge list.
function dumpFilterEdges(ptr) {
    if (!ptr || ptr.isNull()) return { ptr: '0x0', length: 0, bytes: [], raw: '' };
    const len = delphiArrayLen(ptr);
    const out = { ptr: ptr.toString(), length: len, bytes: [], raw: '' };
    if (len <= 0 || len > MAX_FILTER_BYTES) return out;
    try {
        const buf = new Uint8Array(ptr.readByteArray(len));
        for (let i = 0; i < buf.length; i++) {
            out.bytes.push(buf[i]);
            out.raw += buf[i].toString(16).padStart(2, '0');
        }
    } catch (e) {
        out.read_error = String(e);
    }
    return out;
}

// Walk a TArray<RAction[5]> action list.
function dumpActions(ptr) {
    if (!ptr || ptr.isNull()) return { ptr: '0x0', length: 0, actions: [] };
    const len = delphiArrayLen(ptr);
    const out = { ptr: ptr.toString(), length: len, actions: [] };
    if (len <= 0 || len > MAX_ACTIONS_PER_SLOT) return out;
    for (let i = 0; i < len; i++) {
        out.actions.push(decodeRAction(ptr.add(i * 5)));
    }
    // Also dump raw hex of the entire packed array for round-trip safety.
    out.raw_hex = readHex(ptr, len * 5);
    return out;
}

// Walk a single FToolActions[mask] TArray of (filterEdges, actions) slot pairs.
function dumpMaskSlots(maskArrPtr) {
    if (!maskArrPtr || maskArrPtr.isNull()) {
        return { ptr: '0x0', length: 0, slots: [] };
    }
    const len = delphiArrayLen(maskArrPtr);
    const out = { ptr: maskArrPtr.toString(), length: len, slots: [] };
    if (len <= 0 || len > MAX_SLOTS_PER_MASK) return out;
    for (let i = 0; i < len; i++) {
        const slotBase = maskArrPtr.add(i * 8);
        let filterPtr = NULL, actionsPtr = NULL;
        try {
            filterPtr = slotBase.add(0).readPointer();
            actionsPtr = slotBase.add(4).readPointer();
        } catch (e) {
            out.slots.push({ slot_index: i, slot_addr: slotBase.toString(), read_error: String(e) });
            continue;
        }
        out.slots.push({
            slot_index: i,
            slot_addr: slotBase.toString(),
            filter_edges: dumpFilterEdges(filterPtr),
            actions: dumpActions(actionsPtr),
        });
    }
    return out;
}

// Dump a complete TToolActionSection: 16 mask entries + clearance fields.
function dumpSection(sectionPtr, contextLabel) {
    if (!sectionPtr || sectionPtr.isNull()) {
        emit({
            type: 'section_dump',
            context: contextLabel,
            section_ptr: '0x0',
            err: 'null_section',
        });
        return;
    }
    const sectionAddr = sectionPtr.toString();
    if (dumpedSections.has(sectionAddr)) {
        emit({ type: 'section_skip', context: contextLabel, section_ptr: sectionAddr, reason: 'already_dumped' });
        return;
    }
    dumpedSections.add(sectionAddr);

    let swageL = null, swageR = null;
    let head_hex = null;
    try {
        swageL = sectionPtr.add(0x08).readU32();
        swageR = sectionPtr.add(0x0c).readU32();
        head_hex = readHex(sectionPtr, 0x10 + 16 * 4); // header + 16 mask pointers
    } catch (e) {
        // ignore — section may be small or layout slightly different
    }

    const masks = [];
    for (let m = 0; m < 16; m++) {
        let maskArrPtr = NULL;
        try {
            maskArrPtr = sectionPtr.add(0x10 + m * 4).readPointer();
        } catch (e) {
            masks.push({ mask: m, read_error: String(e) });
            continue;
        }
        const dumped = dumpMaskSlots(maskArrPtr);
        masks.push(Object.assign({ mask: m }, dumped));
    }

    emit({
        type: 'section_dump',
        context: contextLabel,
        section_ptr: sectionAddr,
        swage_clearance_left: swageL,
        swage_clearance_right: swageR,
        header_hex: head_hex,
        masks: masks,
    });
}

// Walk the ActionDefsManager dictionary directly. One-shot dump.
function walkDictionary(reason) {
    const dictSlotPtr = toolingBase.add(RVA.ActionDefsManager);
    let dictObj;
    try {
        dictObj = dictSlotPtr.readPointer();
    } catch (e) {
        emit({ type: 'dict_walk_error', reason: 'read_dict_obj_ptr', err: String(e) });
        return;
    }
    if (dictObj.isNull()) {
        emit({ type: 'dict_walk_error', reason: 'dict_null', trigger: reason });
        return;
    }
    let bucketsPtr, count;
    try {
        bucketsPtr = dictObj.add(0x04).readPointer();
        count      = dictObj.add(0x08).readS32();
    } catch (e) {
        emit({ type: 'dict_walk_error', reason: 'read_dict_fields', err: String(e) });
        return;
    }
    const bucketCount = delphiArrayLen(bucketsPtr);
    emit({
        type: 'dict_walk_start',
        trigger: reason,
        dict_obj: dictObj.toString(),
        buckets_ptr: bucketsPtr.toString(),
        item_count: count,
        bucket_count: bucketCount,
    });
    if (bucketCount <= 0 || bucketCount > MAX_BUCKETS) {
        emit({ type: 'dict_walk_error', reason: 'bucket_count_out_of_range', n: bucketCount });
        return;
    }
    let dumped = 0;
    for (let i = 0; i < bucketCount; i++) {
        const bucketAddr = bucketsPtr.add(i * 12);
        let hash, keyPtr, valuePtr;
        try {
            hash     = bucketAddr.add(0).readU32();
            keyPtr   = bucketAddr.add(4).readPointer();
            valuePtr = bucketAddr.add(8).readPointer();
        } catch (e) {
            continue;
        }
        if (hash === 0xffffffff) continue;     // empty bucket
        if (keyPtr.isNull()) continue;
        const keyStr = readDelphiString(keyPtr);
        emit({
            type: 'dict_entry',
            trigger: reason,
            bucket_index: i,
            hash: hash,
            key: keyStr,
            key_ptr: keyPtr.toString(),
            section_ptr: valuePtr.toString(),
        });
        if (keyStr !== null) dumpedKeys.add(keyStr);
        dumpSection(valuePtr, 'dict_walk:' + (keyStr || '<unreadable>'));
        dumped++;
    }
    emit({ type: 'dict_walk_done', trigger: reason, entries_dumped: dumped });
}

// ----------- Hooks -----------

function installHook_LookupActionSection() {
    const addr = toolingBase.add(RVA.LookupActionSection);
    Interceptor.attach(addr, {
        onEnter(args) {
            // Belt-and-braces: capture both args[0] AND this.context.eax,
            // since Borland's register-fastcall passes param_1 in EAX. Frida
            // SHOULD auto-translate, but if args[0] is wrong we still have
            // EAX as fallback.
            this.keyArg = args[0];
            this.eaxAtEntry = this.context.eax;
            let key1 = null, key2 = null, key3 = null;
            try { key1 = readDelphiString(args[0]); } catch (e) {}
            try { key2 = readDelphiString(args[0].readPointer()); } catch (e) {}
            try { key3 = readDelphiString(this.context.eax); } catch (e) {}
            this.key = key1 || key2 || key3;
        },
        onLeave(retval) {
            lookupCalls++;
            const sectionPtr = retval; // EAX = section pointer
            // Only emit the first ~200 lookup events to avoid log spam — same
            // ~28 keys repeat thousands of times during a job. Section_dump
            // is deduplicated separately by pointer.
            if (lookupCalls <= 200) {
                emit({
                    type: 'lookup_action_section',
                    call_index: lookupCalls,
                    key_arg_raw: this.keyArg.toString(),
                    eax_at_entry: this.eaxAtEntry.toString(),
                    key: this.key,
                    section_ptr: sectionPtr.toString(),
                });
            } else if (lookupCalls === 201) {
                emit({ type: 'lookup_action_section_truncated', note: 'further lookup events suppressed' });
            }
            if (this.key && !dumpedKeys.has(this.key)) {
                dumpedKeys.add(this.key);
                emit({ type: 'new_key_seen', key: this.key, section_ptr: sectionPtr.toString() });
            }
            dumpSection(sectionPtr, 'lookup:' + (this.key || '<unknown>'));
        },
    });
    emit({ type: 'hook_installed', name: 'FUN_00520cc8', addr: addr.toString() });
}

function installHook_DictionaryAdd() {
    const addr = toolingBase.add(RVA.DictionaryAdd);
    Interceptor.attach(addr, {
        onEnter(args) {
            // Delphi's TDictionary.DoAdd register/fastcall: 5 params.
            // Borland register convention: param_1=EAX, param_2=EDX,
            // param_3=ECX, params_4+ on stack. Frida's args[] should auto-
            // translate, but we capture raw context as backup.
            const self      = args[0];
            const hash      = args[1];
            const bucketIdx = args[2];
            const value     = args[3];
            const keyPP     = args[4];
            const ctx = this.context;

            addCalls++;

            // Only log entries to ActionDefsManager (DAT_005968d0).
            const dictSlotPtr = toolingBase.add(RVA.ActionDefsManager);
            let dictObj = NULL;
            try { dictObj = dictSlotPtr.readPointer(); } catch (e) {}

            // Test both args[0] and EAX/ECX for "is this our dict".
            const eaxIsDict = !dictObj.isNull() && ctx.eax.equals(dictObj);
            const a0IsDict  = !dictObj.isNull() && self.equals(dictObj);
            const isOurDict = eaxIsDict || a0IsDict;

            // The 'key' arg is a pointer-to-string var. Try various reads.
            let keyStr = null;
            try { keyStr = readDelphiString(keyPP); } catch (e) {}
            if (keyStr === null) { try { keyStr = readDelphiString(keyPP.readPointer()); } catch (e) {} }

            // Cap dict_add events to keep log bounded. Most adds happen at
            // startup and we expect only ~28 of them touching ActionDefsManager.
            if (addCalls <= 1000) {
                emit({
                    type: 'dict_add',
                    call_index: addCalls,
                    self: self.toString(),
                    eax: ctx.eax.toString(),
                    edx: ctx.edx.toString(),
                    ecx: ctx.ecx.toString(),
                    is_actiondefs: isOurDict,
                    hash: hash.toString(),
                    bucket_idx: bucketIdx.toString(),
                    value_ptr: value.toString(),
                    key_pp: keyPP.toString(),
                    key: keyStr,
                });
            }

            // If this is our dict, record + dump the section.
            if (isOurDict && keyStr) {
                dumpedKeys.add(keyStr);
                // value is the stack arg. If args[] was wrong, sniff stack manually.
                let valuePtr = value;
                try { dumpSection(valuePtr, 'dict_add:' + keyStr); } catch (e) {
                    emit({ type: 'dict_add_dump_err', err: String(e), key: keyStr });
                }
            }
        },
    });
    emit({ type: 'hook_installed', name: 'FUN_00521280', addr: addr.toString() });
}

function installHook_ApplyRule() {
    const addr = toolingBase.add(RVA.ApplyRule);
    Interceptor.attach(addr, {
        onEnter(args) {
            // Borland register: param_1=EAX (actionsArr), param_2=EDX
            // (intersection), param_3=ECX (opsList), params 4+ stack.
            this.actionsArrPtr = args[0];
            this.intersection  = args[1];
            this.opsList       = args[2];
            this.swageL        = args[3];
            this.swageR        = args[4];
            // Backup capture from registers + stack peek.
            this.eax = this.context.eax;
            this.edx = this.context.edx;
            this.ecx = this.context.ecx;
            this.callIndex = applyRuleCalls++;
        },
        onLeave(retval) {
            // Trigger one-shot full-dictionary walk on first ApplyRule call.
            if (!firstApplyRule) {
                firstApplyRule = true;
                emit({ type: 'first_apply_rule_fire', call_index: this.callIndex });
                walkDictionary('first_apply_rule');
            }

            // Always log a snapshot of the slot list this call walked. We
            // don't have the section name here, but the actions array
            // pointer can be cross-correlated with the section_dump entries
            // emitted by lookup hook.
            //
            // Try both args[0] and EAX in case Frida didn't translate the
            // Borland fastcall correctly.
            let slotsDump = null;
            try {
                slotsDump = dumpMaskSlots(this.actionsArrPtr);
                if (slotsDump.length === 0 && !this.eax.equals(this.actionsArrPtr)) {
                    const slotsViaEax = dumpMaskSlots(this.eax);
                    if (slotsViaEax.length > 0) slotsDump = slotsViaEax;
                }
            } catch (e) {
                slotsDump = { read_error: String(e) };
            }

            // Try to read intersection edge bytes (offsets 0x1e/0x32/0x46/0x5a).
            let edgeBytes = null;
            try {
                edgeBytes = {
                    LL: this.intersection.add(0x1e).readU8(),
                    LW: this.intersection.add(0x32).readU8(),
                    WL: this.intersection.add(0x46).readU8(),
                    WW: this.intersection.add(0x5a).readU8(),
                };
            } catch (e) {
                edgeBytes = { read_error: String(e) };
            }

            // Cap detailed apply_rule logging to MAX_APPLY_RULE_LOG calls.
            if (this.callIndex < MAX_APPLY_RULE_LOG) {
                emit({
                    type: 'apply_rule',
                    call_index: this.callIndex,
                    actions_arr_ptr: this.actionsArrPtr.toString(),
                    eax: this.eax.toString(),
                    edx: this.edx.toString(),
                    ecx: this.ecx.toString(),
                    intersection_ptr: this.intersection.toString(),
                    edge_intersect_bytes: edgeBytes,
                    swage_l: this.swageL.toString(),
                    swage_r: this.swageR.toString(),
                    actions_walk: slotsDump,
                });
            } else if (this.callIndex === MAX_APPLY_RULE_LOG) {
                emit({ type: 'apply_rule_truncated', note: 'further apply_rule events suppressed', cap: MAX_APPLY_RULE_LOG });
            }
        },
    });
    emit({ type: 'hook_installed', name: 'FUN_00545b94', addr: addr.toString() });
}

function installHook_MakeOperations() {
    const addr = toolingBase.add(RVA.MakeOperations);
    Interceptor.attach(addr, {
        onEnter(args) {
            this.intersection = args[0];
            this.opsList      = args[1];
            this.flags        = args[2];
        },
        onLeave(retval) {
            // Lightweight — no per-call emission. The detailed work happens
            // in the inner ApplyRule hook.
        },
    });
    emit({ type: 'hook_installed', name: 'FUN_00545af8', addr: addr.toString() });
}

// ----------- Initialisation -----------

function init() {
    const mod = Process.findModuleByName(TOOLING);
    if (!mod) {
        return false; // try again
    }
    toolingBase = mod.base;
    emit({
        type: 'init',
        tooling_base: toolingBase.toString(),
        tooling_size: mod.size,
        path: mod.path,
        rvas: RVA,
    });

    installHook_LookupActionSection();
    installHook_DictionaryAdd();
    installHook_ApplyRule();
    installHook_MakeOperations();

    return true;
}

// recv() loop — Python launcher can request on-demand actions.
function setupRecv() {
    function listen() {
        recv('cmd', function (msg) {
            try {
                if (!msg || !msg.cmd) {
                    emit({ type: 'recv_invalid', msg: msg });
                } else if (msg.cmd === 'force_dump') {
                    emit({ type: 'force_dump_triggered' });
                    if (toolingBase) walkDictionary('force_dump');
                } else if (msg.cmd === 'shutdown') {
                    emit({ type: 'shutdown_walk_triggered' });
                    if (toolingBase) walkDictionary('shutdown');
                } else if (msg.cmd === 'stats') {
                    emit({
                        type: 'stats',
                        lookup_calls: lookupCalls,
                        add_calls: addCalls,
                        apply_rule_calls: applyRuleCalls,
                        keys_seen: Array.from(dumpedKeys),
                        sections_dumped: dumpedSections.size,
                    });
                } else {
                    emit({ type: 'unknown_cmd', cmd: msg.cmd });
                }
            } catch (e) {
                emit({ type: 'recv_error', err: String(e) });
            }
            // Re-arm to receive the next command.
            listen();
        });
    }
    listen();
}

emit({ type: 'script_loaded', target_module: TOOLING });
setupRecv();

// Init — retry every 500 ms until Tooling.dll is loaded (Detailer's loader
// can take a couple of seconds to map all DLLs).
let initAttempts = 0;
const initTimer = setInterval(() => {
    initAttempts++;
    const ok = init();
    if (ok) {
        clearInterval(initTimer);
        emit({ type: 'init_success', attempts: initAttempts });
    } else if (initAttempts >= 60) { // 30 seconds
        clearInterval(initTimer);
        emit({ type: 'init_giveup', attempts: initAttempts });
    } else if (initAttempts === 1) {
        emit({ type: 'init_waiting', target_module: TOOLING });
    }
}, 500);
