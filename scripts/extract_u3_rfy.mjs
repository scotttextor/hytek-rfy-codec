// Extract U3-1 only from the simplified RFY for direct comparison vs FrameCAD's
// per-truss output. Uses the codec's decrypt/encrypt + fast-xml-parser.
import { readFileSync, writeFileSync } from "node:fs";
import { decryptRfy, encryptRfy } from "../dist/crypto.js";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const SIMPLIFIED_RFY = "C:/Users/Scott/OneDrive - Textor Metal Industries/Desktop/2603191-GF-LIN-89.075.simplified.rfy";
const OUT = "C:/Users/Scott/OneDrive - Textor Metal Industries/Desktop/HYTEK_U3-1_OUR_simplified.rfy";
const KEEP_FRAME = "U3-1";

// Decrypt
const buf = readFileSync(SIMPLIFIED_RFY);
const xml = decryptRfy(buf);

// Parse with preserveOrder so we keep original document layout exactly
const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: "@_",
  preserveOrder: true, allowBooleanAttributes: true, parseAttributeValue: false,
});
const builder = new XMLBuilder({
  ignoreAttributes: false, attributeNamePrefix: "@_",
  preserveOrder: true, format: true, indentBy: "  ",
  suppressBooleanAttributes: false,
});

const tree = parser.parse(xml);

// Walk the tree and remove any frame whose name != KEEP_FRAME
function filterFrames(node) {
  if (!Array.isArray(node)) {
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) {
        if (Array.isArray(node[k])) filterFrames(node[k]);
      }
    }
    return;
  }
  // Remove items whose top-level key is "frame" but name attr != KEEP_FRAME
  for (let i = node.length - 1; i >= 0; i--) {
    const item = node[i];
    if (item && typeof item === "object" && item.frame && Array.isArray(item.frame)) {
      const name = item[":@"]?.["@_name"];
      if (name && name !== KEEP_FRAME) {
        node.splice(i, 1);
        continue;
      }
    }
    if (item && typeof item === "object") {
      for (const k of Object.keys(item)) {
        if (Array.isArray(item[k])) filterFrames(item[k]);
      }
    }
  }
}
filterFrames(tree);

const newXml = builder.build(tree);
const newRfy = encryptRfy(newXml);
writeFileSync(OUT, newRfy);
console.log(`Wrote ${OUT}`);
console.log(`Size: ${newRfy.length} bytes (was ${buf.length})`);
