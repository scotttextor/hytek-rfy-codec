# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 76.32% matched** (12979/17007 ops)
Missing: 4028 (Detailer has, we lack) | Extras: 3477 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | — | — | — | — | — |
| HG260001_GF-TIN-70.075.rfy | 62.0% | 627 | 1012 | 385 | 358 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 12 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 86.2% | 2286 | 2652 | 366 | 302 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 51.0% | 306 | 600 | 294 | 234 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 58.2% | 170 | 292 | 122 | 101 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 44.9% | 356 | 792 | 436 | 366 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 87.2% | 1838 | 2109 | 271 | 305 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 81.5% | 3883 | 4762 | 879 | 715 |
| HG260001_PK5-GF-LBW-70.075.rfy | 80.0% | 2855 | 3567 | 712 | 593 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 44.5% | 185 | 416 | 231 | 227 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 58.0% | 138 | 238 | 100 | 103 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 68.0% | 140 | 206 | 66 | 24 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 40.7% | 111 | 273 | 162 | 137 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| Web | 1295 | 1252 | 43 |
| InnerDimple | 884 | 350 | 534 |
| LipNotch | 646 | 543 | 103 |
| Swage | 412 | 439 | -27 |
| InnerService | 257 | 329 | -72 |
| Chamfer | 42 | 291 | -249 |
| InnerNotch | 117 | 182 | -65 |
| Bolt | 141 | 83 | 58 |
| LeftFlange | 99 | 0 | 99 |
| RightFlange | 86 | 0 | 86 |
| ScrewHoles | 49 | 8 | 41 |