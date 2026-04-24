import { randomBytes } from "node:crypto";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { encryptRfy } from "./crypto.js";

/**
 * Lossless XML tree used internally by decode/encode. fast-xml-parser's
 * preserveOrder format: each node is {tag: [children...], ":@": {attrs}}.
 * Text nodes are {"#text": "..."}.
 */
export type XmlNode = Record<string, unknown>;

const preserveOrderParserOpts = {
  preserveOrder: true as const,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  allowBooleanAttributes: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
};

const preserveOrderBuilderOpts = {
  preserveOrder: true as const,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  format: false as const,
  suppressEmptyNode: false,
  suppressBooleanAttributes: false,
};

export const xmlParser = new XMLParser(preserveOrderParserOpts);
export const xmlBuilder = new XMLBuilder(preserveOrderBuilderOpts);

/** Parse XML into the preserve-order tree. */
export function parseXmlTree(xml: string): XmlNode[] {
  return xmlParser.parse(xml) as XmlNode[];
}

/** Serialise the preserve-order tree back to an XML string. */
export function buildXml(tree: XmlNode[]): string {
  return xmlBuilder.build(tree) as string;
}

/** Encode an XML string to RFY bytes (deflate + encrypt with optional IV). */
export function encodeXml(xml: string, iv?: Buffer): Buffer {
  return encryptRfy(xml, iv ?? randomBytes(16));
}

/** Encode a preserve-order XML tree to RFY bytes. */
export function encodeTree(tree: XmlNode[], iv?: Buffer): Buffer {
  const xml = buildXml(tree);
  return encodeXml(xml, iv);
}
