import { XMLBuilder, XMLParser } from "fast-xml-parser";
/**
 * Lossless XML tree used internally by decode/encode. fast-xml-parser's
 * preserveOrder format: each node is {tag: [children...], ":@": {attrs}}.
 * Text nodes are {"#text": "..."}.
 */
export type XmlNode = Record<string, unknown>;
export declare const xmlParser: XMLParser;
export declare const xmlBuilder: XMLBuilder;
/** Parse XML into the preserve-order tree. */
export declare function parseXmlTree(xml: string): XmlNode[];
/** Serialise the preserve-order tree back to an XML string. */
export declare function buildXml(tree: XmlNode[]): string;
/** Encode an XML string to RFY bytes (deflate + encrypt with optional IV). */
export declare function encodeXml(xml: string, iv?: Buffer): Buffer;
/** Encode a preserve-order XML tree to RFY bytes. */
export declare function encodeTree(tree: XmlNode[], iv?: Buffer): Buffer;
