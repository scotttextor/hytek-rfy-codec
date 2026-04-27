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
export declare const RFY_KEY: Buffer<ArrayBuffer>;
export declare const RFY_ALGORITHM = "aes-128-cbc";
export declare const RFY_IV_LENGTH = 16;
/** Decrypt and decompress an RFY file → UTF-8 XML string. */
export declare function decryptRfy(rfyBytes: Buffer): string;
/** Compress and encrypt UTF-8 XML → RFY file bytes (random IV). */
export declare function encryptRfy(xml: string, iv?: Buffer): Buffer;
