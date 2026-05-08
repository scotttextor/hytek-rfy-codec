# @hytek/rfy-codec

Encode and decode FrameCAD RFY files for HYTEK rollformer machines.

## Status

In development. See [the spec](../docs/superpowers/specs/2026-04-24-rfy-encoder-design.md).

## Quick commands

- `npm install` — install dependencies
- `npm run build` — compile TypeScript
- `npm test` — run test suite
- `npm run typecheck` — typecheck without emitting

## CSV exporters

Two CSV emitters live side-by-side in this package — different formats for
different downstream consumers:

| Module | Function | Output format | Consumer |
| --- | --- | --- | --- |
| `src/csv.ts` | `planToCsv`, `documentToCsvs` | HYTEK Detailer Rollforming CSV (positional cells per row) | HYTEK rollformer (F300i) |
| `src/howick-csv.ts` | `generateHowickCsv`, `documentToHowickCsvs` | Howick CSV (1 row per stick + 1 row per op) | Howick firmware + third-party CAD tools (StrucSoft MWF, AGACAD, Tekla, FrameBuilder-MRD) |

### Howick CSV usage

```ts
import { decode, generateHowickCsv } from "@hytek/rfy-codec";

const doc = decode(rfyBytes);
const csv = generateHowickCsv(doc, { variant: "v2" });
```

Options (`HowickCsvOptions`):

- `variant` — `"v1"` or `"v2"` (default `"v2"`). v1 drops the `Notes` column.
- `includeHeader` — `true` (default) emits the column-name row.
- `lineEnding` — defaults to `"\n"`; set `"\r\n"` if firmware requires CRLF.

A sample output generated from `test-corpus/HG260044` lives at
[`examples/sample-output.csv`](examples/sample-output.csv).

> **TODO-HOWICK-VERIFY**: Several op-type → Howick-token mappings (flange
> side, Chamfer, ScrewHoles, InnerService) are best-effort from public
> AGACAD/Tekla docs. Run a real Howick File Converter export against a
> known RFD to confirm these tokens before treating the output as
> production-grade.

## Legal

Reverse engineering for interoperability under Section 47D of the Australian Copyright Act 1968.
