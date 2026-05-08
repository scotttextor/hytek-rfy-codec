# HD1 — HYTEK DETAILER 1 (frozen 2026-05-09)

> Single-file resume doc. If you're a future Claude agent picking this up,
> read this top-to-bottom before doing anything else. ~2 min.

---

## What is HD1

**HD1 is a frozen, working checkpoint of HYTEK's reverse-engineered FrameCAD
Detailer pipeline.** Detailer is the proprietary Windows program (Embarcadero
Delphi 10.4, signed by FrameCAD) that turns an XML job description into an
encrypted `.rfy` file the F300i rollformer eats. Scott has burned several
nights extracting Detailer's rule dictionary from `Tooling.dll` and rebuilding
the encoder in TypeScript so the workflow survives without Detailer.

**Numbers at freeze time:** ~79.6 % wide-corpus parity (op-level diff vs.
real Detailer outputs across HG260001 + HG260044), 623/623 unit tests
passing, build clean, master at `17bc45b`. The +14.65 pp RP cohort fix
landed yesterday (`8fafb7f`); the Kb Chamfer @end fix the day before
(`7fdb025`). `action-defs.json` (the Tooling.dll-derived rule dictionary,
27 sections / 346 slots) is wired into the encoder and committed.

**Why HD1 exists:** the Detailer license expires **14 May 2026** (5 days
from this freeze). Scott is pivoting to a fresh agent thread tomorrow and
needs a "use-as-is" checkpoint he can return to if anything goes sideways.

---

## How to use HD1 right now

### Encode one XML to RFY

```powershell
cd "C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec"
node scripts/csv-to-rfy.mjs <input.csv> <output.rfy>
```

The pure-codec path: takes a CSV plan, runs `synthesizeRfyFromCsv`, writes the
encrypted RFY. Round-trip is bit-exact for cached jobs.

### Sweep a corpus and compare against real Detailer outputs

```powershell
# Diff every XML/RFY pair in HG260044
node scripts/diff-sweep.mjs

# Or point at a folder of your own pairs
node scripts/diff-sweep.mjs "C:\path\to\folder\with\xml-and-rfy\pairs"
```

Output: per-stick op-level diff, per-cohort match %, and a summary table.
Use this to confirm parity hasn't regressed before/after any change.

### Use the cached oracle pipeline (100 % match for cached jobs)

The cache lives at:

```
C:\Users\Scott\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\detailer-oracle-cache\
```

30 jobs × (RFY + meta JSON) = 60 files (plus extra meta variants = 66
total). For any job whose XML hash is in the cache, the codec returns the
cached Detailer output verbatim — guaranteed F300i-compatible.

```powershell
node scripts/diff-vs-forge-cache.mjs <input.xml>
```

### Decode an RFY back to inspectable text

```powershell
node scripts/decode-frame.mjs <input.rfy>
```

Decrypts with `RFY_KEY`/`RFY_IV_LENGTH` (see `src/crypto.ts`) and prints
the plaintext op stream.

---

## State of play (numbers)

### Cohort parity (op-level, last measured 2026-05-08 → 09)

| Cohort                     | Parity   | Notes                                                |
|----------------------------|----------|------------------------------------------------------|
| HG260001 (truth corpus)    | 82.82 %  | Frida-captured, used as primary regression baseline |
| HG260044 (cross-corpus)    | 80.27 %  | Independent corpus — no overfit                     |
| RP cohort                  | +14.65 pp post-`8fafb7f` (rotated-frame coord offset fix) |
| Wide corpus (combined)     | ~79.6 %  | Up from 77.45 % at start of this session            |
| LBW                        | +0.65 pp post-`7fdb025` (Kb Chamfer @end fix)       |
| NLBW                       | +0.22 pp post-`7fdb025`                              |
| Cached jobs (30 jobs)      | 100 %    | Oracle cache, byte-exact                            |

### What works

- **Encoding pipeline end-to-end:** XML → tree → frame basis → per-stick op
  generation (rules pass + action-defs pass) → CSV view → RFY bytes. All
  unit-tested.
- **Crypto:** RFY encrypt/decrypt round-trips bit-exact (`src/crypto.ts`).
- **Action-defs wired in:** the 346-slot rule dictionary from `Tooling.dll`
  is loaded at runtime and applied to ops (commits `34f7f4e`, `88ac2d1`,
  `d1ddb0e`).
- **Linear-truss simplifier:** 61 tests passing, ITM-procedure aware
  (post-processor at `scripts/simplify-rfy-direct.mjs`).
- **Wall-service simplifier:** ships gated behind `CODEC_DISABLE_WALL_SERVICE`
  (bimodal: +0.6 pp net but over-emits on small jobs — see
  `docs/simplifier-scoping-investigation.md`).
- **Oracle cache:** 30 cached pairs serve byte-exact for those jobs.

### What doesn't (open gaps to ~100 %)

- **InnerDimple paired-pattern at crossings** — listed as the next
  highest-ROI op in the previous landmark. Detailer emits paired Inner
  Dimples on truss panel-points; codec currently emits singles in some
  configurations.
- **TB2B / RP simplifiers** — `simplify-rp.ts` shipped but is net negative
  (-0.8 pp) on the wide corpus and gated by `CODEC_DISABLE_RP`. Need
  scoping work to determine which plans benefit.
- **B2B-boxed Web emission** — false-positive prone, reverted in `f66bc81`.
  Needs revisiting with stricter conditions.
- **T-plate InnerService rule** — disabled in `cb45f5c` (-257 extras, no
  parity gain); revisit if parity stalls below 85 %.

---

## Where everything is

### The codec (this repo)

- **Local:** `C:\Users\Scott\CLAUDE CODE\hytek-rfy-codec\`
- **GitHub:** https://github.com/scotttextor/hytek-rfy-codec (master, tag `HD1`)
- **Built output:** `dist/` (committed; ~900 KB)
- **Tests:** colocated with source (`src/**/*.test.ts`), 623 total

Layout:

```
hytek-rfy-codec/
├── src/                          # TS source
│   ├── encode.ts                 # XML → tree → RFY
│   ├── decode.ts                 # RFY → tree
│   ├── crypto.ts                 # RFY encrypt/decrypt
│   ├── synthesize.ts             # high-level: CSV → RFY
│   ├── synthesize-plans.ts       # plan-level synthesis
│   ├── machine-setups.ts         # F300i tool/profile config
│   ├── simplify-linear-truss.ts  # ITM linear-truss post-processor
│   ├── simplify-wall-service.ts  # wall-service Z-line simplifier
│   ├── simplify-rp.ts            # RP simplifier (gated)
│   ├── simplify-tb2b-truss.ts    # tin-truss simplifier
│   ├── fc-dat-rules.ts           # FC_Textor_Qld.dat decoded rules
│   └── rules/
│       ├── action-defs.json      # 777 KB rule dictionary (canonical)
│       ├── action-defs-pass.ts   # action-defs runtime
│       ├── classify-joint.ts     # joint classifier
│       ├── condition-eval.ts     # rule predicate evaluator
│       └── tooldef-table.ts      # TToolDef metadata wireup
├── dist/                         # tsc output
├── scripts/                      # diff/sweep/cache utilities
├── test-corpus/                  # local test fixtures
├── docs/
│   ├── HD1-RESUME.md             # ← you are here
│   ├── detailer-rule-decoded.md  # 702-line decode of the rule format
│   ├── action-defs-final-wireup.md
│   ├── action-defs-input-pipeline-2026-05-08.md
│   ├── rule-fixes-from-dt-miner-2026-05-08.md
│   ├── simplifier-scoping-investigation.md
│   ├── jailbreak/                # Tooling.dll RE artifacts (see README)
│   └── cracked/                  # tooldef-table extraction reports
└── package.json
```

### Detailer oracle cache (cloud-backed via OneDrive)

```
C:\Users\Scott\OneDrive - Textor Metal Industries\CLAUDE DATA FILE\detailer-oracle-cache\
```

30 jobs (HG250009 … HG250101 etc.), 66 files total. Each job folder
contains the XML hash → RFY + meta.json mapping the codec's cache layer
reads at lookup time.

### RE-tool installs (for future re-extraction work)

| Tool                | Path                                                                                          |
|---------------------|-----------------------------------------------------------------------------------------------|
| Ghidra 12.0.4       | `C:\Users\Scott\tools\ghidra\ghidra_12.0.4_PUBLIC\`                                            |
| Ghidra project      | `C:\Users\Scott\tools\ghidra-projects\DetailerCrack\`                                          |
| GhidraMCP plugin    | `C:\Users\Scott\tools\ghidra\...\Extensions\GhidraMCP\`                                        |
| IDA Free 9.2        | `C:\Program Files\IDA Free 9.2\` (license at same dir)                                         |
| DelphiHelper plugin | `C:\Users\Scott\AppData\Roaming\Hex-Rays\IDA Pro\plugins\DelphiHelper\`                        |
| IDR Knowledge Base  | (same plugin dir as DelphiHelper)                                                              |
| Frida 17.9.5        | pip-installed (`pip show frida` to verify)                                                     |
| pythia              | `C:\Users\Scott\tools\pythia\`                                                                 |
| Tool installers     | `C:\Users\Scott\tools\_downloads\` (ProcessMonitor, DIE, SystemInformer, x64dbg, etc.) |

### HD1 backups

| Location                                                      | Contents                              |
|---------------------------------------------------------------|---------------------------------------|
| GitHub `scotttextor/hytek-rfy-codec` tag `HD1`                | full source + dist + docs + jailbreak |
| `C:\Users\Scott\HD1-2026-05-09.zip`                            | repo + cache + tool installers + this doc |
| OneDrive `CLAUDE DATA FILE\detailer-oracle-cache\`             | the 30 cached pairs (cloud-synced)    |

---

## How to resume work in a new agent session

Paste this prompt into a fresh Claude session (or a fresh agent thread):

```
HYTEK RFY codec — HD1 resume.

Repo: https://github.com/scotttextor/hytek-rfy-codec  (master, tag HD1, frozen 2026-05-09)
State: ~79.6% wide-corpus parity, 623/623 tests passing. Read docs/HD1-RESUME.md
first — it has the full status, file map, and open problems. Detailer license
dies 14 May 2026; the codec is the long-term replacement.
```

That's it. Three lines. The new agent reads this doc and is up to speed.

### To clone fresh on another machine

```bash
git clone https://github.com/scotttextor/hytek-rfy-codec.git
cd hytek-rfy-codec
git checkout HD1            # tag, not a branch
npm install
npm run build && npm test   # confirm 623/623
```

### Where to pick up next (highest ROI first)

1. **InnerDimple paired-pattern at crossings** — flagged in the previous
   RFY-codec landmark as the next priority. Truss panel-points show
   single Inner Dimples in codec output where Detailer emits pairs. Look
   in `src/rules/action-defs-pass.ts` + the `findCrossings` extension in
   `66dcce0`.
2. **Re-validate parity after every change with `scripts/diff-sweep.mjs`**
   — never push without running this.
3. **F300i frame test** — Scott was waiting on a steel-cut test from the
   previous landmark. If that worked, RP cohort is ready to ship; if not,
   investigate the offset mismatch reported in the test rig.

---

## Open problems / next moves

| Item                                  | Status        | Blocker / next step                                |
|---------------------------------------|---------------|----------------------------------------------------|
| InnerDimple paired-pattern            | Open          | Need rule wireup in `action-defs-pass.ts`          |
| TB2B / RP simplifier scoping          | Deferred      | Run A/B test on 9-job set; see `simplifier-scoping-investigation.md` |
| B2B-boxed Web emission                | Reverted      | Stricter condition needed before re-enable         |
| T-plate InnerService                  | Disabled      | Revisit only if parity stalls below 85 %           |
| Get to 100 % wide-corpus parity       | ~20 pp to go  | Mostly long-tail; oracle cache covers the gap for production today |
| Wall-service over-emit on small jobs  | Known         | Gated behind env var, ship-blocking only at scale  |

---

## Critical commits (top 10)

| Hash      | Description                                                          |
|-----------|----------------------------------------------------------------------|
| `17bc45b` | HD1 freeze: import jailbreak artifacts (this commit)                |
| `cb45f5c` | lbw/nlbw: disable T-plate InnerService rule (extras -257)            |
| `f66bc81` | lbw: revert experimental B2B-boxed Web emission (false positives)    |
| `8fafb7f` | rp: fix rotated-frame coord offset (+14.65 pp on RP cohort)          |
| `34f7f4e` | action-defs: anchored-fixed-length emit for spanned tools           |
| `7fdb025` | lbw/nlbw: fix Kb Chamfer @end (+0.65/+0.22 pp)                       |
| `66dcce0` | action-defs: extend findCrossings + deriveStickProps for truss panel-points |
| `ef5c983` | docs: add commit hash to action-defs final wireup report             |
| `d1ddb0e` | action-defs: wire TToolDef table into action-emit (default OFF)      |
| `88ac2d1` | (action-defs wire-up — referenced in brief)                         |

(Run `git log --oneline -20` for the live list.)

---

## Backups (canonical recovery paths)

### From GitHub (preferred)

```bash
git clone https://github.com/scotttextor/hytek-rfy-codec.git
cd hytek-rfy-codec
git checkout HD1
npm install && npm run build && npm test
```

### From local zip

```powershell
Expand-Archive C:\Users\Scott\HD1-2026-05-09.zip -DestinationPath C:\HD1-restored\
cd C:\HD1-restored\hytek-rfy-codec
npm install && npm run build && npm test
```

### Read this doc remotely (raw)

```bash
curl -fsSL https://raw.githubusercontent.com/scotttextor/hytek-rfy-codec/HD1/docs/HD1-RESUME.md
```

---

## License + IP boundaries

- **What's in this repo:** decompilation byproducts (rule dictionary as
  JSON, parsed strings, DIE output), our TypeScript reimplementation, our
  tests, our docs.
- **What's NEVER in this repo:** `Tooling.dll` or any other FrameCAD
  binary, FrameCAD's branded UI assets (logos, splash screens), license
  files. See `docs/jailbreak/README.md` for the full exclusion list and
  re-derivation steps.

---

*Frozen 2026-05-09 by the HD1 release-engineer pass. Question? Read this
doc first. Still stuck? Read `docs/detailer-rule-decoded.md` (702 lines,
the deep dive on the rule format).*
