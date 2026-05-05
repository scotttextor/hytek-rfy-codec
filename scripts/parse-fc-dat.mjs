#!/usr/bin/env node
// Parse FC_Textor_Qld.decoded.dat — the third FrameCAD config file (alongside
// the two .sups already wired). Cracked 2026-05-01 (XOR cipher with 4-byte
// key 08 01 09 05, reset per CRLF). Per FrameCAD support, ALL Detailer rule
// constants live in either .sups or this .dat — the codec was previously
// missing every truss-geometry rule (cen_cen_wb_hole, end_wb_setback,
// kp_truncated etc).
//
// Inputs:
//   <decoded.dat path>   default: ../hytek-budget/scripts/FC_Textor_Qld.decoded.dat
//
// Output:
//   scripts/fc-dat-parsed.json
//
// Section format in the .dat:
//   [SECTION NAME]
//   <field0=0 field1=1 .../>             (optional field-label header)
//   <    0  1  2  3  4 ...>              (optional column-position header)
//   //comment line
//   KEY  val0 val1 val2 ...               (data row — token[0]=key)
//   ""                                    (blank line)
//
// Keys: each section has a stable prefix (GEOMETRY_, MATERIAL_, FIXING_,
//       etc). Some sections list rules by suffix (TRUC0 = profile 0 truss),
//       others by free-form ID.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_DECODED = path.resolve(
  __dirname,
  "..",
  "..",
  "hytek-budget",
  "scripts",
  "FC_Textor_Qld.decoded.dat",
);
const datPath = process.argv[2] ?? DEFAULT_DECODED;
const outPath = path.resolve(__dirname, "fc-dat-parsed.json");

if (!fs.existsSync(datPath)) {
  console.error(`Input not found: ${datPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(datPath, "utf8");
const lines = raw.split(/\r?\n/);

/** Tokenize a data row: splits on whitespace but preserves "quoted" tokens. */
function tokenize(s) {
  const out = [];
  const re = /"[^"]*"|\S+/g;
  let m;
  while ((m = re.exec(s)) !== null) out.push(m[0]);
  return out;
}

/** Parse a `<...>` field-label header. Two flavours observed:
 *    <geometry profile=0 construction_type=1 .../>   (named fields)
 *    <    0  1  2  3 ...>                             (positional indices)
 *  Returns { fields: ['name0','name1',...] } if named (positional return null
 *  — those are visual column markers, not rule structure). */
function parseFieldLabel(line) {
  const inner = line.replace(/^\s*<\s*/, "").replace(/\/?>\s*$/, "").trim();
  // "geometry profile=0 ..." → first word is a section tag. Strip if there.
  // "0 1 2 3 ..." → all numeric, positional. Skip.
  const tokens = inner.split(/\s+/);
  if (tokens.every((t) => /^\d+$/.test(t))) return null; // positional only
  const fields = {};
  let maxIdx = -1;
  let unnamed = 0;
  for (const tok of tokens) {
    const m = /^([A-Za-z_][\w]*)\s*=\s*(\d+)$/.exec(tok);
    if (!m) continue;
    const name = m[1];
    const idx = parseInt(m[2], 10);
    fields[idx] = name;
    if (idx > maxIdx) maxIdx = idx;
    unnamed++;
  }
  if (unnamed === 0) return null;
  // Convert to dense array
  const arr = [];
  for (let i = 0; i <= maxIdx; i++) arr.push(fields[i] ?? `_field${i}`);
  return { fields: arr };
}

/** A data line either commented out (`//KEY ...`) or active (`KEY ...`). The
 *  keys identify rules; the rest is whitespace-separated values. */
function parseDataLine(line) {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  if (trimmed.startsWith("[")) return null; // section header
  if (trimmed.startsWith("<")) return null; // field-label header
  // Comment-only line → record but flag
  let active = true;
  let body = trimmed;
  if (trimmed.startsWith("//")) {
    active = false;
    body = trimmed.replace(/^\/\/\s*/, "");
  }
  const tokens = tokenize(body);
  if (tokens.length === 0) return null;
  // First token MUST be a key-like identifier (UPPERCASE_WITH_UNDERSCORES).
  // Some lines (e.g. "CONTAINS WALL TRUSS FLOOR ROOF" pre-section) don't fit;
  // accept them as `key=null, raw=true`.
  const head = tokens[0];
  const isKey = /^[A-Z][A-Z0-9_]*$/.test(head);
  return {
    active,
    key: isKey ? head : null,
    values: isKey ? tokens.slice(1) : tokens,
    raw: trimmed,
  };
}

/** Coerce a token to its most-natural JS value: number if it parses, otherwise
 *  string (with quotes stripped). Special tokens: '?' → null, 'X' → "X" kept
 *  as marker. */
function coerceValue(tok) {
  if (tok === "?") return null;
  if (tok.startsWith('"') && tok.endsWith('"')) return tok.slice(1, -1);
  if (/^-?\d+$/.test(tok)) return parseInt(tok, 10);
  if (/^-?\d*\.\d+$/.test(tok)) return parseFloat(tok);
  // Multi-digit code like "044174" or "0000" — keep as string (codes, not nums)
  return tok;
}

/** Build a record by zipping field names with values. Falls back to indexed
 *  `f0, f1, ...` when no labels are known. */
function buildRecord(fields, values) {
  const rec = {};
  for (let i = 0; i < values.length; i++) {
    const name = fields && fields[i] ? fields[i] : `f${i}`;
    rec[name] = coerceValue(values[i]);
  }
  return rec;
}

const result = {
  source: path.basename(datPath),
  parsedAt: new Date().toISOString(),
  preamble: [], // // comment lines before first [SECTION]
  sections: {},
};

let currentSection = null;
let currentFields = null; // last <field=index> header within section
let preambleDone = false;

for (let lineNo = 0; lineNo < lines.length; lineNo++) {
  const line = lines[lineNo];
  const stripped = line.trim();
  if (stripped === "") continue;

  // Section header
  const sectionMatch = /^\[(.+?)\]\s*$/.exec(stripped);
  if (sectionMatch) {
    preambleDone = true;
    currentSection = sectionMatch[1].trim();
    currentFields = null;
    if (!result.sections[currentSection]) {
      result.sections[currentSection] = {
        startLine: lineNo,
        fields: null,
        comments: [],
        rules: {}, // keyed by KEY (first uppercase token)
        anonymous: [], // entries lacking a recognised KEY
      };
    }
    continue;
  }

  // Field-label header (only meaningful inside a section). Multiple
  // consecutive `<...>` lines may carry overlapping field-index ranges (e.g.
  // TRUSS GEOMETRY DATA spans 4 header lines covering fields 0..39). Merge
  // them into a single dense array per section by union-of-indices, with
  // later names overriding earlier ones (FrameCAD's pattern: label headers
  // are paginated, not exclusive). When a new label header appears AFTER
  // data lines have been seen (i.e. mid-section), we treat it as a NEW
  // sub-section: this only occurs in WALL DEFAULT DATA where each rule type
  // (WDEFAULTS, WBUILD, WNOGGS, WHEADS) has its own header line.
  if (stripped.startsWith("<")) {
    if (currentSection) {
      const parsed = parseFieldLabel(stripped);
      if (parsed) {
        const sec = result.sections[currentSection];
        if (!sec.fields) {
          sec.fields = parsed.fields.slice();
        } else {
          // Merge by index — extend if longer, override named slots
          for (let i = 0; i < parsed.fields.length; i++) {
            if (parsed.fields[i] && !parsed.fields[i].startsWith("_field")) {
              sec.fields[i] = parsed.fields[i];
            } else if (sec.fields[i] === undefined) {
              sec.fields[i] = parsed.fields[i];
            }
          }
        }
        currentFields = sec.fields;
      }
    }
    continue;
  }

  // Comment line — captured into preamble or current section
  if (stripped.startsWith("//")) {
    const text = stripped.replace(/^\/\/\s*/, "");
    if (!preambleDone) {
      result.preamble.push(text);
    } else if (currentSection) {
      result.sections[currentSection].comments.push({ lineNo, text });
    }
    // Also fall through — commented data lines may still be parseable as
    // dormant rules. Continue parsing.
  }

  if (!currentSection) continue;

  // Data line (active or commented-out)
  const data = parseDataLine(line);
  if (!data) continue;

  const sec = result.sections[currentSection];
  if (data.key) {
    const rec = buildRecord(currentFields, data.values);
    rec._active = data.active;
    rec._lineNo = lineNo;
    if (sec.rules[data.key]) {
      // Duplicate key — keep both as array
      if (!Array.isArray(sec.rules[data.key])) {
        sec.rules[data.key] = [sec.rules[data.key]];
      }
      sec.rules[data.key].push(rec);
    } else {
      sec.rules[data.key] = rec;
    }
  } else {
    sec.anonymous.push({ lineNo, raw: data.raw });
  }
}

// Stats for the report
let totalSections = 0;
let totalRules = 0;
for (const [name, sec] of Object.entries(result.sections)) {
  totalSections++;
  totalRules += Object.keys(sec.rules).length;
  void name;
}

result._stats = {
  totalLines: lines.length,
  sections: totalSections,
  rules: totalRules,
};

fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

console.log(`Parsed ${lines.length} lines into ${totalSections} sections, ${totalRules} keyed rules.`);
console.log(`Output: ${outPath}`);

// Section summary
console.log("\nSection summary:");
for (const [name, sec] of Object.entries(result.sections)) {
  const ruleCount = Object.keys(sec.rules).length;
  const fieldStr = sec.fields ? ` [${sec.fields.length} fields]` : "";
  console.log(`  ${name}: ${ruleCount} rules${fieldStr}`);
}
