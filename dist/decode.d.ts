import type { RfyDocument } from "./format.js";
/** Decode an RFY file (encrypted bytes) to a structured document. */
export declare function decode(rfyBytes: Buffer): RfyDocument;
/** Decode already-decrypted XML (useful for tests). */
export declare function decodeXml(xml: string): RfyDocument;
