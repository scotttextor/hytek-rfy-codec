# Diff harness smoke test (manual)

The codec ships an op-level diff harness at `scripts/diff-vs-detailer.mjs`.
Its actual signature (from the file's own usage block) is:

```
node scripts/diff-vs-detailer.mjs <input.xml> <reference.rfy> [out-prefix]
```

i.e. it takes the **plan XML** and a **Detailer-emitted reference RFY**, then
internally synthesises an RFY from the XML (via `synthesizeRfyFromPlans` in
`dist/index.js`) and reports per-(frame, stick) ops as either `extras`,
`missing`, or `drifted` against the reference. It does **not** accept an
already-simplified RFY as the first argument — there is no entry point for
diffing two RFY files directly through this harness.

## What this means for the new simplifier

The new TS module in `src/simplify-linear-truss.ts` operates on a
**post-synthesis RFY** — it reads the bytes the codec already produced and
rewrites only Web (BOLT HOLES) ops on Linear-truss frames. It is not invoked
by `synthesizeRfyFromPlans`, so the existing diff harness does not exercise
it. To run an op-level diff on simplifier output you would need to either:

1. Plumb the simplifier into the synthesis pipeline (Phase B integration),
   then run `diff-vs-detailer.mjs` as today; or
2. Write a small one-off diff script that decrypts two RFY files and walks
   their `<plan>/<frame>/<stick>/<tool_action>` trees directly.

Until (1) lands the diff harness is **not** a regression gate for the new
module. Equivalence to the standalone `simplify-rfy-direct.mjs` is asserted
instead by the deterministic 2603191 fixture test in
`src/simplify-linear-truss.test.ts` — `appliedFrames.length === 22`,
`totalNew === 750`, zero `FALLBACK` decisions. Any drift in those numbers
means an underlying constant or geometry rule has changed.

## Manual smoke test against a Detailer reference (current pipeline)

If you want to confirm the codec's existing (pre-simplifier) output still
matches a Detailer reference, the harness runs unchanged:

```bash
cd hytek-rfy-codec
node scripts/diff-vs-detailer.mjs \
  "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044 LOT 1810 (14) ELDERBERRY ST UPPER CABOOLTURE-GF-LBW-70.075.xml" \
  "C:/Users/Scott/OneDrive - Textor Metal Industries/CLAUDE DATA FILE/memory/reference_data/HG260044/HG260044#1-1_GF-LBW-70.075.rfy" \
  /tmp/diff-hg260044-lbw
```

Expected: per-stick `extras`, `missing`, `drifted` counts written to
`<out-prefix>.json` and `<out-prefix>.txt`. Used to track Detailer parity
progress (currently ~64% op-level — see RFY-codec landmark).

## Manual smoke test for the standalone simplifier

Independent of the diff harness, the pre-existing standalone simplifier is
run end-to-end like this:

```bash
cd hytek-rfy-codec
node scripts/simplify-rfy-direct.mjs \
  "test-corpus/2603191/2603191-GF-LIN-89.075.rfy" \
  "test-corpus/2603191/2603191-ROCKVILLE.xml" \
  --out "test-corpus/2603191/simplified.rfy"
```

This is the script the new TS module is asserted equivalent to. The 2603191
fixture in the test suite consumes the same two inputs; if the standalone
script's BOLT-HOLES output for that fixture ever changes, the deterministic
`totalNew === 750` assertion in the test suite will trip.
