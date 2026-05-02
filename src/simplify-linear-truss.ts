// Linear-truss RFY simplifier — replaces FrameCAD's BOLT HOLES on -LIN- truss
// web members with a centreline-intersection rule (3 holes per stick at every
// pairwise crossing). See spec at docs/superpowers/specs/2026-05-02-...
import { decryptRfy, encryptRfy } from "./crypto.js";
import type { ParsedFrame } from "./synthesize-plans.js";
import { XMLParser, XMLBuilder } from "fast-xml-parser";

export type {};
