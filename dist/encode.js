import { randomBytes } from "node:crypto";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { encryptRfy } from "./crypto.js";
const preserveOrderParserOpts = {
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
};
const preserveOrderBuilderOpts = {
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true, // pretty-print (Detailer style: indented, multi-line)
    indentBy: "  ", // 2-space indent (matches Detailer)
    suppressEmptyNode: false,
    suppressBooleanAttributes: false,
};
export const xmlParser = new XMLParser(preserveOrderParserOpts);
export const xmlBuilder = new XMLBuilder(preserveOrderBuilderOpts);
/** Parse XML into the preserve-order tree. */
export function parseXmlTree(xml) {
    return xmlParser.parse(xml);
}
/** Serialise the preserve-order tree back to an XML string. */
export function buildXml(tree) {
    let xml = xmlBuilder.build(tree);
    // Detailer collapses empty elements to self-closing <tag/>. The fast-xml-parser
    // builder produces <tag></tag>. Some legacy XML parsers (including the one
    // inside HYTEK rollformer firmware) reject the verbose form, so we
    // post-process empty elements into the self-closing form.
    xml = xml.replace(/<([A-Za-z][\w\-]*)((?:\s+[\w\-:]+="[^"]*")*)\s*>(\s*)<\/\1>/g, "<$1$2/>");
    // Detailer uses CRLF line endings — match for byte-equivalent output.
    if (!xml.includes("\r\n"))
        xml = xml.replace(/\n/g, "\r\n");
    return xml;
}
/** Encode an XML string to RFY bytes (deflate + encrypt with optional IV). */
export function encodeXml(xml, iv) {
    return encryptRfy(xml, iv ?? randomBytes(16));
}
/** Encode a preserve-order XML tree to RFY bytes. */
export function encodeTree(tree, iv) {
    const xml = buildXml(tree);
    return encodeXml(xml, iv);
}
