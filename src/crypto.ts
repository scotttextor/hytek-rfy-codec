import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deflateSync, inflateSync } from "node:zlib";

/**
 * RFY cryptographic parameters, discovered via Frida hook of libcrypto-3.dll
 * in FRAMECAD Detailer v5.3.4.0 on 2026-04-24. Interoperability under
 * s47D Australian Copyright Act 1968.
 *
 * Discovery capture: scripts/capture-20260424-195044.jsonl
 * Reference RFY: C:\Users\ScottTextor\OneDrive...\HG260001_LOT 289....rfy
 *
 * File format:
 *   bytes 0..15  : 16-byte random IV
 *   bytes 16..end: AES-128-CBC(key, iv) of deflate(xml_utf8)
 */

export const RFY_KEY = Buffer.from("4433bea8ab8792c07f95b593a06418b0", "hex");
export const RFY_ALGORITHM = "aes-128-cbc";
export const RFY_IV_LENGTH = 16;

/** Decrypt and decompress an RFY file → UTF-8 XML string. */
export function decryptRfy(rfyBytes: Buffer): string {
  if (rfyBytes.length < RFY_IV_LENGTH + 16) {
    throw new Error(`RFY file too short: ${rfyBytes.length} bytes`);
  }
  const iv = rfyBytes.subarray(0, RFY_IV_LENGTH);
  const ciphertext = rfyBytes.subarray(RFY_IV_LENGTH);
  const decipher = createDecipheriv(RFY_ALGORITHM, RFY_KEY, iv);
  decipher.setAutoPadding(true);
  const compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return inflateSync(compressed).toString("utf-8");
}

/** Compress and encrypt UTF-8 XML → RFY file bytes (random IV). */
export function encryptRfy(xml: string, iv: Buffer = randomBytes(RFY_IV_LENGTH)): Buffer {
  if (iv.length !== RFY_IV_LENGTH) {
    throw new Error(`IV must be ${RFY_IV_LENGTH} bytes`);
  }
  const compressed = deflateSync(Buffer.from(xml, "utf-8"));
  const cipher = createCipheriv(RFY_ALGORITHM, RFY_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([iv, ciphertext]);
}
