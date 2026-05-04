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
      const byte = Memory.readU8(ptr.add(i));
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

      console.log(`\n========================= add_frameobject call #${callCount} =========================`);
      console.log(`  FrameRecord*       = ${frameRec}`);
      console.log(`  SectionLookupRec*  = ${sectLookup}`);
      console.log(`  FrameDefRecord*    = ${frameDef}`);

      // Dump all 3 records as hex
      console.log(hexDump(frameRec, 0x32, 'FrameRecord'));
      console.log(hexDump(sectLookup, 0xb9, 'SectionLookupRecord (CATALOG PAYLOAD)'));
      console.log(hexDump(frameDef, 0x4b, 'FrameDefRecord'));

      // Decode key fields for human readability
      console.log('Decoded:');
      // FrameRecord +0x12 = frame_id (int32)
      const frameId = Memory.readU32(frameRec.add(0x12));
      console.log(`  frame_id = ${frameId}`);

      // FrameRecord +0x22..0x29 = endpoint1.x (double)
      const ep1x = Memory.readDouble(frameRec.add(0x22));
      const ep1y = Memory.readDouble(frameRec.add(0x2a));
      console.log(`  endpoint1 = (${ep1x.toFixed(3)}, ${ep1y.toFixed(3)})`);

      // FrameRecord +0x01..0x08 = endpoint2.x (double)
      const ep2x = Memory.readDouble(frameRec.add(0x01));
      const ep2y = Memory.readDouble(frameRec.add(0x09));
      console.log(`  endpoint2 = (${ep2x.toFixed(3)}, ${ep2y.toFixed(3)})`);

      // SectionLookupRecord +0x9f = pointer/offset to rule data (TList)
      // SectionLookupRecord +0xa3 = count
      const ruleCount = Memory.readU32(sectLookup.add(0xa3));
      console.log(`  SectionLookupRecord rule_count @ +0xa3 = ${ruleCount}`);
    },
    onLeave: function (retval) {
      // retval is in EAX, low byte is the result code (0=ok)
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
      const rc = retval.toInt32() & 0xff;
      const arrPtr = Memory.readPointer(this.outArr);
      const len = Memory.readS32(this.outLen);
      console.log(`\n  get_operations_for(frame_id=${this.frameId}) → rc=${rc}, len=${len}`);
      if (rc === 0 && len > 0 && !arrPtr.isNull()) {
        // Each op is presumably a fixed struct — dump first few to learn layout
        for (let i = 0; i < Math.min(len, 10); i++) {
          // TODO: confirm op struct size from RE; tentative 16 bytes
          const opOffset = arrPtr.add(i * 16);
          let opHex = '';
          for (let j = 0; j < 16; j++) {
            opHex += Memory.readU8(opOffset.add(j)).toString(16).padStart(2, '0') + ' ';
          }
          console.log(`    op[${i}]: ${opHex}`);
        }
      }
    }
  });
}
