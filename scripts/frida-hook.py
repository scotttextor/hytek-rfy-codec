"""
Frida hook that attaches to FRAMECAD Detailer.exe and logs every call
to libcrypto-3.dll's encryption API. Output is a newline-delimited
JSON log suitable for later analysis.

Usage:
    1. Start FRAMECAD Detailer from Start menu. Leave it open at the
       main screen.
    2. In a terminal: python scripts/frida-hook.py
    3. In Detailer: open a test project and do File -> Export ->
       Rollforming CSV for one or more panels, save to a known location.
    4. Ctrl+C this script to stop capture.
    5. The log file will be at scripts/capture-YYYYMMDD-HHMMSS.jsonl.
"""

import frida
import sys
import json
import time
from pathlib import Path
from datetime import datetime

# OpenSSL 3.x EVP functions we want to intercept.
# Covers symmetric encryption + PBKDF/HMAC paths.
HOOK_FUNCS = [
    "EVP_CIPHER_CTX_new",
    "EVP_CIPHER_CTX_free",
    "EVP_EncryptInit_ex",
    "EVP_EncryptInit_ex2",
    "EVP_CipherInit_ex",
    "EVP_CipherInit_ex2",
    "EVP_EncryptUpdate",
    "EVP_CipherUpdate",
    "EVP_EncryptFinal_ex",
    "EVP_CipherFinal_ex",
    "EVP_MD_CTX_new",
    "EVP_DigestInit_ex",
    "EVP_DigestInit_ex2",
    "EVP_DigestUpdate",
    "EVP_DigestFinal_ex",
    "HMAC_Init_ex",
    "HMAC_Update",
    "HMAC_Final",
    "RAND_bytes",
    "PKCS5_PBKDF2_HMAC",
    "EVP_PBE_scrypt",
    "EVP_CIPHER_CTX_get0_cipher",
    "EVP_CIPHER_get0_name",
]

JS_TEMPLATE = r"""
function bufHex(ptr, len) {
    if (ptr.isNull() || len === 0) return "";
    try { return Memory.readByteArray(ptr, len); }
    catch (e) { return "<READ_ERROR:" + e.message + ">"; }
}

function cipherName(ctx) {
    if (ctx.isNull()) return null;
    try {
        const cipher = Module.findExportByName("libcrypto-3.dll", "EVP_CIPHER_CTX_get0_cipher");
        const getName = Module.findExportByName("libcrypto-3.dll", "EVP_CIPHER_get0_name");
        if (!cipher || !getName) return null;
        const c = new NativeFunction(cipher, "pointer", ["pointer"])(ctx);
        if (c.isNull()) return null;
        const n = new NativeFunction(getName, "pointer", ["pointer"])(c);
        return n.isNull() ? null : n.readCString();
    } catch (e) { return "<NAME_ERROR:" + e.message + ">"; }
}

const targets = __TARGETS__;
for (const fn of targets) {
    const addr = Module.findExportByName("libcrypto-3.dll", fn);
    if (!addr) { send({ warn: "not_found", fn: fn }); continue; }

    Interceptor.attach(addr, {
        onEnter: function(args) {
            this.fn = fn;
            if (fn === "EVP_EncryptInit_ex" || fn === "EVP_CipherInit_ex" ||
                fn === "EVP_EncryptInit_ex2" || fn === "EVP_CipherInit_ex2") {
                // ctx, cipher, engine/params, key, iv, [enc]
                this.ctx = args[0];
                this.keyPtr = args[3];
                this.ivPtr = args[4];
                // Capture up to 32 bytes of key material and 16 bytes of IV.
                // Post-process can truncate to correct size once algorithm is known.
                this.keyBytes = bufHex(this.keyPtr, 32);
                this.ivBytes = bufHex(this.ivPtr, 16);
            } else if (fn === "EVP_EncryptUpdate" || fn === "EVP_CipherUpdate") {
                // ctx, out, outlen*, in, inlen
                this.ctx = args[0];
                this.outPtr = args[1];
                this.outLenPtr = args[2];
                this.inPtr = args[3];
                this.inLen = args[4].toInt32();
                this.plaintext = bufHex(this.inPtr, Math.min(this.inLen, 65536));
            } else if (fn === "EVP_EncryptFinal_ex" || fn === "EVP_CipherFinal_ex") {
                this.ctx = args[0];
                this.outPtr = args[1];
                this.outLenPtr = args[2];
            } else if (fn === "RAND_bytes") {
                this.buf = args[0];
                this.num = args[1].toInt32();
            } else if (fn === "PKCS5_PBKDF2_HMAC") {
                // pass, passlen, salt, saltlen, iter, digest, keylen, out
                this.passPtr = args[0];
                this.passLen = args[1].toInt32();
                this.saltPtr = args[2];
                this.saltLen = args[3].toInt32();
                this.iter = args[4].toInt32();
                this.keyLen = args[6].toInt32();
                this.outPtr = args[7];
                this.passBytes = bufHex(this.passPtr, Math.min(this.passLen, 256));
                this.saltBytes = bufHex(this.saltPtr, Math.min(this.saltLen, 64));
            } else if (fn === "HMAC_Init_ex") {
                // ctx, key, keylen, md, engine
                this.keyPtr = args[1];
                this.keyLen = args[2].toInt32();
                this.keyBytes = bufHex(this.keyPtr, Math.min(this.keyLen, 128));
            } else if (fn === "HMAC_Update") {
                this.inPtr = args[1];
                this.inLen = args[2].toInt32();
                this.dataBytes = bufHex(this.inPtr, Math.min(this.inLen, 65536));
            }
        },
        onLeave: function(retval) {
            const ev = { fn: this.fn, ret: retval.toInt32() };
            if (this.fn.startsWith("EVP_EncryptInit") || this.fn.startsWith("EVP_CipherInit")) {
                ev.ctx = this.ctx ? this.ctx.toString() : null;
                ev.cipher_name = this.ctx ? cipherName(this.ctx) : null;
                ev.key_32 = this.keyBytes;
                ev.iv_16 = this.ivBytes;
            } else if (this.fn === "EVP_EncryptUpdate" || this.fn === "EVP_CipherUpdate") {
                ev.ctx = this.ctx.toString();
                ev.in_len = this.inLen;
                ev.plaintext = this.plaintext;
                const outLen = this.outLenPtr.readInt();
                ev.out_len = outLen;
                ev.ciphertext = bufHex(this.outPtr, outLen);
            } else if (this.fn === "EVP_EncryptFinal_ex" || this.fn === "EVP_CipherFinal_ex") {
                ev.ctx = this.ctx.toString();
                const outLen = this.outLenPtr.readInt();
                ev.out_len = outLen;
                ev.ciphertext_final = bufHex(this.outPtr, outLen);
            } else if (this.fn === "RAND_bytes") {
                ev.num = this.num;
                ev.random_bytes = bufHex(this.buf, Math.min(this.num, 64));
            } else if (this.fn === "PKCS5_PBKDF2_HMAC") {
                ev.password = this.passBytes;
                ev.salt = this.saltBytes;
                ev.iterations = this.iter;
                ev.keylen = this.keyLen;
                ev.derived_key = bufHex(this.outPtr, this.keyLen);
            } else if (this.fn === "HMAC_Init_ex") {
                ev.key_len = this.keyLen;
                ev.key_bytes = this.keyBytes;
            } else if (this.fn === "HMAC_Update") {
                ev.data_len = this.inLen;
                ev.data = this.dataBytes;
            }
            send(ev);
        }
    });
}
send({ info: "hooks_installed", count: targets.length });
"""


def main():
    process_name = "FRAMECAD Detailer.exe"
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    out_path = Path(__file__).parent / f"capture-{ts}.jsonl"

    print(f"Attaching to '{process_name}'...")
    try:
        session = frida.attach(process_name)
    except frida.ProcessNotFoundError:
        print(f"ERROR: '{process_name}' not running.")
        print("Start FRAMECAD Detailer from the Start menu first, then re-run this script.")
        sys.exit(1)

    print(f"Attached. Writing capture to {out_path}")
    out_file = out_path.open("w", encoding="utf-8")
    event_count = 0

    def on_message(message, data):
        nonlocal event_count
        if message.get("type") == "send":
            payload = message["payload"]
            # Frida sends bytes buffers alongside `data`; when we use
            # Memory.readByteArray, the bytes land in the `data` parameter.
            # Our JS inlines hex via bufHex, so `data` is None — payload
            # already has hex strings.
            for k, v in list(payload.items()):
                if isinstance(v, bytes):
                    payload[k] = v.hex()
            out_file.write(json.dumps(payload) + "\n")
            out_file.flush()
            event_count += 1
            fn = payload.get("fn", payload.get("info", payload.get("warn", "?")))
            if event_count <= 20 or event_count % 50 == 0:
                print(f"  [{event_count}] {fn}")
        elif message.get("type") == "error":
            print(f"  HOOK ERROR: {message.get('stack', message)}")

    js = JS_TEMPLATE.replace("__TARGETS__", json.dumps(HOOK_FUNCS))
    script = session.create_script(js)
    script.on("message", on_message)
    script.load()

    print("\n--- Hook active ---")
    print("In Detailer, open a test project and do File -> Export -> Rollforming CSV.")
    print("Press Ctrl+C when the export completes to stop and save the capture.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        print(f"\nCaptured {event_count} events. Detaching...")
        session.detach()
        out_file.close()
        print(f"Saved: {out_path}")


if __name__ == "__main__":
    main()
