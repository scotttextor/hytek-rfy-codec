# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 90.62% matched** (16311/18000 ops)
Missing: 1689 (Detailer has, we lack) | Extras: 1651 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 65.6% | 654 | 997 | 343 | 365 |
| HG260001_GF-TIN-70.075.rfy | 70.1% | 707 | 1009 | 302 | 202 |
| HG260001_GF-TIN-70.095.rfy | 100.0% | 88 | 88 | 0 | 0 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 93.8% | 2488 | 2652 | 164 | 153 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 94.0% | 564 | 600 | 36 | 30 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 93.5% | 273 | 292 | 19 | 10 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 89.1% | 706 | 792 | 86 | 47 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 94.6% | 1995 | 2109 | 114 | 131 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 94.0% | 4478 | 4762 | 284 | 337 |
| HG260001_PK5-GF-LBW-70.075.rfy | 94.0% | 3354 | 3567 | 213 | 274 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 88.0% | 366 | 416 | 50 | 46 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 83.5% | 198 | 237 | 39 | 22 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 98.5% | 203 | 206 | 3 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 86.8% | 237 | 273 | 36 | 32 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 554 | 453 | 101 |
| LipNotch | 303 | 442 | -139 |
| Web | 280 | 205 | 75 |
| Swage | 248 | 265 | -17 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 64 | 98 | -34 |
| Chamfer | 35 | 74 | -39 |
| ScrewHoles | 36 | 4 | 32 |
| RightFlange | 29 | 2 | 27 |
| LeftFlange | 14 | 2 | 12 |
| Bolt | 11 | 3 | 8 |