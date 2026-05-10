# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 88.44% matched** (15920/18000 ops)
Missing: 2080 (Detailer has, we lack) | Extras: 1993 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 60.5% | 603 | 997 | 394 | 424 |
| HG260001_GF-TIN-70.075.rfy | 65.7% | 663 | 1009 | 346 | 231 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 92.6% | 2455 | 2652 | 197 | 167 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 102 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 61 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 87.8% | 695 | 792 | 97 | 59 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 93.7% | 1976 | 2109 | 133 | 133 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 93.2% | 4439 | 4762 | 323 | 359 |
| HG260001_PK5-GF-LBW-70.075.rfy | 92.9% | 3315 | 3567 | 252 | 309 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 86.1% | 358 | 416 | 58 | 62 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 82.7% | 196 | 237 | 41 | 22 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 78.0% | 213 | 273 | 60 | 58 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 626 | 490 | 136 |
| LipNotch | 363 | 480 | -117 |
| Web | 409 | 349 | 60 |
| Swage | 323 | 362 | -39 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 84 | 96 | -12 |
| Chamfer | 35 | 82 | -47 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 40 | 13 | 27 |
| LeftFlange | 25 | 13 | 12 |
| Bolt | 11 | 3 | 8 |