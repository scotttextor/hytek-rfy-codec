#!/usr/bin/env node
/**
 * Empirical TToolDef extraction.
 *
 * For each ToolType (LipNotch, Swage, etc.) found in the corpus of 385 Detailer
 * reference RFY files, mine the actual op records and cluster them to derive:
 *   - opType: point vs spanned vs start vs end
 *   - length: typical span (mm) for spanned ops, or 0 for points
 *   - lengthVariance: stddev of spans (low = fixed-length tool, high = adaptive)
 *
 * The corpus baseline pairs at scripts/baselines/raw-y-pairs/<job>__<plan>.json
 * give us per-frame, per-stick `extras` and `missing` fields. The MISSING list
 * is what Detailer emitted (truth) — that's our oracle.
 *
 * However, MISSING only shows ops we're missing — it doesn't show all the ops
 * we matched. To get complete Detailer output we need to RE-DECODE the original
 * .rfy files. Those live at the path under inputXml's sibling 04 ROLLFORMER
 * FILES path (already captured in the JSON's `reference` field).
 *
 * Simpler approach: parse the .txt diff files which list per-tool counts AND
 * per-stick extras/missing. The missing entries cover the ops we care about.
 * For 100% cohort behavior we'd need to decode .rfy directly — but for opType
 * inference, MISSING + EXTRAS is sufficient because all ops emitted with a
 * given verb (say `swage`) have the same opType regardless of which side
 * emits them.
 *
 * Output:
 *   docs/cracked/tooldef-empirical.json — per-toolType statistics
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..", "..");
const PAIRS_DIR = resolve(ROOT, "scripts", "baselines", "raw-y-pairs");
const OUT_JSON = resolve(ROOT, "docs", "cracked", "tooldef-empirical.json");

mkdirSync(dirname(OUT_JSON), { recursive: true });

// Each op string in the diff txt looks like:
//   "Swage 0.0..39.0"          (spanned: type + start..end)
//   "InnerDimple @16.5"        (point: type + @pos)
//   "Bolt @982.9"              (point)
//   "Chamfer @start"           (edge tool start)
//   "Chamfer @end"             (edge tool end)
const OP_RE_SPAN = /^(\w+)\s+(-?\d+\.?\d*)\.\.(-?\d+\.?\d*)$/;
const OP_RE_POINT = /^(\w+)\s+@(-?\d+\.?\d*)$/;
const OP_RE_EDGE = /^(\w+)\s+@(start|end)$/;

const tools = new Map(); // toolType -> { points: [], spans: [], starts: 0, ends: 0 }

function record(toolType, kind, payload) {
  if (!tools.has(toolType)) {
    tools.set(toolType, { points: [], spans: [], starts: 0, ends: 0, raw_examples: [] });
  }
  const t = tools.get(toolType);
  if (kind === "point") t.points.push(payload);
  else if (kind === "span") t.spans.push(payload);
  else if (kind === "start") t.starts += 1;
  else if (kind === "end") t.ends += 1;
  if (t.raw_examples.length < 5) t.raw_examples.push({ kind, payload });
}

function parseOp(opStr) {
  let m;
  m = opStr.match(OP_RE_EDGE);
  if (m) {
    const [, tt, side] = m;
    record(tt, side, null);
    return;
  }
  m = opStr.match(OP_RE_SPAN);
  if (m) {
    const [, tt, s, e] = m;
    const start = Number(s);
    const end = Number(e);
    record(tt, "span", { start, end, span: end - start });
    return;
  }
  m = opStr.match(OP_RE_POINT);
  if (m) {
    const [, tt, p] = m;
    record(tt, "point", { pos: Number(p) });
    return;
  }
}

const files = readdirSync(PAIRS_DIR).filter(f => f.endsWith(".json"));
console.log(`Scanning ${files.length} pair files...`);

let processed = 0;
let totalOps = 0;
for (const f of files) {
  const data = JSON.parse(readFileSync(resolve(PAIRS_DIR, f), "utf8"));
  if (!data.byFrame) continue;
  for (const frame of data.byFrame) {
    if (!frame.sticks) continue;
    for (const stick of frame.sticks) {
      // Process MISSING (Detailer's truth, what we should emit)
      for (const op of (stick.missing || [])) {
        parseOp(op);
        totalOps++;
      }
      // Don't process EXTRAS — those are CODEC's emit (potentially wrong)
    }
  }
  processed++;
}
console.log(`Processed ${processed} pairs, ${totalOps} total Detailer "missing" ops`);

// Cluster spans to derive typical lengths
function summarize(stats) {
  const out = {
    point_count: stats.points.length,
    span_count: stats.spans.length,
    start_count: stats.starts,
    end_count: stats.ends,
    total: stats.points.length + stats.spans.length + stats.starts + stats.ends,
    raw_examples: stats.raw_examples,
  };
  if (stats.spans.length > 0) {
    const spans = stats.spans.map(x => x.span).sort((a, b) => a - b);
    const mean = spans.reduce((a, b) => a + b, 0) / spans.length;
    const median = spans[Math.floor(spans.length / 2)];
    const min = spans[0];
    const max = spans[spans.length - 1];
    const variance = spans.reduce((a, b) => a + (b - mean) ** 2, 0) / spans.length;
    const stddev = Math.sqrt(variance);
    // Histogram of span lengths (bucket by 1mm)
    const bucketCounts = new Map();
    for (const s of spans) {
      const b = Math.round(s);
      bucketCounts.set(b, (bucketCounts.get(b) || 0) + 1);
    }
    const topBuckets = [...bucketCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([k, v]) => ({ span_mm: k, count: v, pct: +(v / spans.length * 100).toFixed(1) }));
    out.span_stats = {
      mean: +mean.toFixed(3),
      median,
      min,
      max,
      stddev: +stddev.toFixed(3),
      top_buckets: topBuckets,
      modal_pct: topBuckets[0]?.pct ?? 0,
    };
  }
  return out;
}

const summary = {};
for (const [tt, stats] of tools.entries()) {
  summary[tt] = summarize(stats);
}

// Order keys for readability
const sortedTypes = Object.keys(summary).sort();
const ordered = {};
for (const k of sortedTypes) ordered[k] = summary[k];

// Final inference: for each tool, decide opType + length
const inferred = {};
for (const [tt, s] of Object.entries(ordered)) {
  let opType = null;
  let length = null;
  let confidence = "low";
  const total = s.total;
  if (total < 5) {
    confidence = "low";
  }
  // Heuristic decision tree
  const points = s.point_count;
  const spans = s.span_count;
  const edges = s.start_count + s.end_count;
  const dominantKind = (() => {
    const pp = [["point", points], ["span", spans], ["edge", edges]];
    pp.sort((a, b) => b[1] - a[1]);
    return pp[0];
  })();

  if (dominantKind[1] / total > 0.95) {
    if (dominantKind[0] === "point") {
      opType = "otPointTool";
      confidence = total > 50 ? "high" : "medium";
    } else if (dominantKind[0] === "span") {
      opType = "otSpannedTool";
      confidence = total > 50 ? "high" : "medium";
      // If modal_pct > 90%, it's a fixed-length tool
      if (s.span_stats?.modal_pct > 90) {
        length = s.span_stats.top_buckets[0].span_mm;
      } else {
        length = s.span_stats?.median ?? null;
      }
    } else if (dominantKind[0] === "edge") {
      // Need to break out start vs end
      if (s.start_count > 0 && s.end_count === 0) opType = "otStartTool";
      else if (s.end_count > 0 && s.start_count === 0) opType = "otEndTool";
      else opType = "otStartTool/otEndTool";
      confidence = total > 5 ? "high" : "medium";
    }
  } else if (dominantKind[1] / total > 0.7) {
    opType = `${dominantKind[0]}-mostly`;
    confidence = "low";
  } else {
    opType = "mixed";
    confidence = "low";
  }

  inferred[tt] = {
    opType,
    length,
    confidence,
    total_samples: total,
    composition: {
      points,
      spans,
      starts: s.start_count,
      ends: s.end_count,
    },
    span_stats: s.span_stats,
  };
}

const result = {
  _meta: {
    source: "scripts/baselines/raw-y-pairs (Detailer 'missing' diffs)",
    pairs_processed: processed,
    total_ops: totalOps,
    note: "Each op observed is something Detailer emitted that the codec didn't. These are GROUND TRUTH for opType inference. Sample counts >50 with modal_pct>90% give high-confidence opType+length values.",
  },
  inferred_per_tooltype: inferred,
  raw_summary: ordered,
};

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
console.log(`Wrote ${OUT_JSON}`);
console.log("\n=== INFERRED ===");
for (const [tt, info] of Object.entries(inferred)) {
  const lengthStr = info.length !== null ? `${info.length}mm` : "n/a";
  console.log(`  ${tt.padEnd(22)} ${info.opType?.padEnd(20) || "n/a".padEnd(20)} length=${lengthStr.padEnd(8)} confidence=${info.confidence} samples=${info.total_samples}`);
}
