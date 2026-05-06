#!/usr/bin/env node
// A/B test the simplifier post-passes to find which one(s) are hurting parity.
//
// For each scenario (baseline, each simplifier disabled, all disabled):
//   1. Set env vars
//   2. Re-import the codec dist
//   3. Run codec on the same set of XMLs
//   4. Compare per-op-type to Detailer reference RFYs on Y: drive
//
// Note: env vars are read at function-call time in synthesize-plans.ts, so
// we set them BEFORE each codec call. No re-import needed.
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEC_ROOT = dirname(__dirname);
const TOOLS_ROOT = join(dirname(CODEC_ROOT), "hytek-rfy-tools");

// Path to tools' framecad-import (compiled to JS via vitest, but for Node we need TS)
// Approach: import from CODEC dist. Use synthesizeRfyFromPlans + framecadImportToParsedProject
// from tools — but tools is TypeScript. So we'll build a simple parser inline.

import { decryptRfy } from "../dist/index.js";
import { synthesizeRfyFromPlans } from "../dist/synthesize-plans.js";

// We need framecadImportToParsedProject from tools. Since it's TypeScript, we
// import the compiled output that vitest produces in tools/.next or dist.
// Simpler: shell out to a tools test that runs codec; OR re-implement minimal parsing.
//
// SIMPLEST: have tools' framecad-import compile to a JS file we can require.
// For now, use a wrapper pattern — call the tools-compiled JS.

// Inline a quick XML→ParsedProject by importing the framecad-import.ts via
// transpile. Easiest: spawn a node-with-tsx subprocess.
//
// REVISED APPROACH: Since framecad-import.ts is in tools and pulls in the codec,
// we'll use a vitest test in tools instead of a Node script in codec.
// This file is a placeholder — see scripts/ab-test-simplifiers-tools.test.ts in tools.
console.error("Use scripts/ab-test-simplifiers.test.ts in hytek-rfy-tools instead.");
process.exit(2);
