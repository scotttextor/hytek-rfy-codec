# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 85.71% matched** (15427/18000 ops)
Missing: 2573 (Detailer has, we lack) | Extras: 2266 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 49.0% | 489 | 997 | 508 | 491 |
| HG260001_GF-TIN-70.075.rfy | 66.7% | 673 | 1009 | 336 | 221 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 91.1% | 2415 | 2652 | 237 | 223 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 102 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 61 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 87.8% | 695 | 792 | 97 | 59 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 92.5% | 1950 | 2109 | 159 | 161 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 89.9% | 4283 | 4762 | 479 | 425 |
| HG260001_PK5-GF-LBW-70.075.rfy | 88.3% | 3148 | 3567 | 419 | 375 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 86.1% | 358 | 416 | 58 | 62 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 82.7% | 196 | 237 | 41 | 22 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 78.0% | 213 | 273 | 60 | 58 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 714 | 578 | 136 |
| Web | 613 | 349 | 264 |
| LipNotch | 499 | 523 | -24 |
| Swage | 351 | 484 | -133 |
| InnerNotch | 129 | 94 | 35 |
| Chamfer | 35 | 112 | -77 |
| InnerService | 107 | 95 | 12 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 40 | 13 | 27 |
| LeftFlange | 25 | 13 | 12 |
| Bolt | 11 | 3 | 8 |