/*
 * Frida hook for FRAMECAD Detailer.
 *
 * Captures the 3 records passed to Tooling.dll!add_frameobject for every stick
 * in a loaded project. The 185-byte SectionLookupRecord is the catalog payload
 * we cannot reproduce statically — once captured, our headless driver can
 * replay it to get bit-exact tooling ops.
 *
 * USAGE (when Detailer is running with HG260012 or HG260044 loaded):
 *   pip install frida-tools
 *   frida -p <DETAILER_PID> -l scripts/frida-capture-records.js -o capture.log
 *
 * Then in Detailer: File → Open → load test XML, wait for build to complete.
 * The hook fires on every add_frameobject call, dumping records to capture.log.
 *
 * VERIFIED ADDRESSES (Tooling.dll 5.3.4.0):
 *   add_frameobject  RVA 0x186410   args: (FrameRecord*, SectionLookupRecord*, FrameDefRecord*)
 *   FrameRecord size  50 bytes (0x32)
 *   SectionLookupRecord size 185 bytes (0xb9)  ← THE CATALOG PAYLOAD
 *   FrameDefRecord size 75 bytes (0x4b)
 */

'use strict';

const TOOLING = 'Tooling.dll';
const ADD_FRAMEOBJECT_RVA = 0x186410;

let tooling = null;
try { tooling = Process.getModuleByName(TOOLING).base; } catch (e) {}
if (!tooling) {
  console.error(`[!] ${TOOLING} not loaded yet — start Detailer first`);
} else {
  console.log(`[+] ${TOOLING} base = ${tooling}`);
  const addFrameAddr = tooling.add(ADD_FRAMEOBJECT_RVA);
  console.log(`[+] add_frameobject @ ${addFrameAddr}`);

  let callCount = 0;

  function hexDump(ptr, length, label) {
    let hex = '';
    for (let i = 0; i < length; i++) {
      const byte = ptr.add(i).readU8();
      hex += byte.toString(16).padStart(2, '0');
      if ((i + 1) % 16 === 0) hex += '\n  ';
      else if ((i + 1) % 8 === 0) hex += ' | ';
      else hex += ' ';
    }
    return `${label} (${length} bytes):\n  ${hex}`;
  }

  Interceptor.attach(addFrameAddr, {
    onEnter: function (args) {
      callCount++;
      const frameRec = args[0];
      const sectLookup = args[1];
      const frameDef = args[2];

      try {
        console.log(`\n========================= add_frameobject call #${callCount} =========================`);
        console.log(`  FrameRecord*       = ${frameRec}`);
        console.log(`  SectionLookupRec*  = ${sectLookup}`);
        console.log(`  FrameDefRecord*    = ${frameDef}`);

        console.log(hexDump(frameRec, 0x32, 'FrameRecord'));
        console.log(hexDump(sectLookup, 0xb9, 'SectionLookupRecord (CATALOG PAYLOAD)'));
        console.log(hexDump(frameDef, 0x4b, 'FrameDefRecord'));

        console.log('Decoded:');
        const frameId = frameRec.add(0x12).readU32();
        console.log(`  frame_id = ${frameId}`);

        const ep1x = frameRec.add(0x22).readDouble();
        const ep1y = frameRec.add(0x2a).readDouble();
        console.log(`  endpoint1 = (${ep1x.toFixed(3)}, ${ep1y.toFixed(3)})`);

        const ep2x = frameRec.add(0x01).readDouble();
        const ep2y = frameRec.add(0x09).readDouble();
        console.log(`  endpoint2 = (${ep2x.toFixed(3)}, ${ep2y.toFixed(3)})`);

        const ruleCount = sectLookup.add(0xa3).readU32();
        console.log(`  SectionLookupRecord rule_count @ +0xa3 = ${ruleCount}`);
      } catch (e) {
        console.log(`  [decode-error] ${e.message}`);
      }
    },
    onLeave: function (retval) {
      const rc = retval.toInt32() & 0xff;
      console.log(`  → rc = 0x${rc.toString(16).padStart(2, '0')} (${rc === 0 ? 'OK' : 'FAIL'})`);
    }
  });

  console.log(`[+] Hook installed. Open a project in Detailer to capture records.\n`);
}

// Also hook get_operations_for to capture the resulting ops array
const GET_OPS_RVA = 0x1867d4;
if (tooling) {
  const getOpsAddr = tooling.add(GET_OPS_RVA);
  Interceptor.attach(getOpsAddr, {
    onEnter: function (args) {
      this.frameId = args[0].toInt32();
      this.outArr = args[1];
      this.outLen = args[2];
    },
    onLeave: function (retval) {
      try {
        const rc = retval.toInt32() & 0xff;
        const arrPtr = this.outArr.readPointer();
        const len = this.outLen.readS32();
        console.log(`\n  get_operations_for(frame_id=${this.frameId}) → rc=${rc}, len=${len}`);
        if (rc === 0 && len > 0 && !arrPtr.isNull()) {
          for (let i = 0; i < Math.min(len, 10); i++) {
            const opOffset = arrPtr.add(i * 16);
            let opHex = '';
            for (let j = 0; j < 16; j++) {
              opHex += opOffset.add(j).readU8().toString(16).padStart(2, '0') + ' ';
            }
            console.log(`    op[${i}]: ${opHex}`);
          }
        }
      } catch (e) {
        console.log(`  [getops-error] ${e.message}`);
      }
    }
  });
}
