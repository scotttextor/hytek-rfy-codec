# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 85.29% matched** (15353/18000 ops)
Missing: 2647 (Detailer has, we lack) | Extras: 2404 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 42.9% | 428 | 997 | 569 | 540 |
| HG260001_GF-TIN-70.075.rfy | 66.7% | 673 | 1009 | 336 | 221 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 91.1% | 2415 | 2652 | 237 | 223 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 96 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 51 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 88.3% | 699 | 792 | 93 | 96 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 92.5% | 1950 | 2109 | 159 | 161 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 89.9% | 4283 | 4762 | 479 | 425 |
| HG260001_PK5-GF-LBW-70.075.rfy | 88.3% | 3148 | 3567 | 419 | 375 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 86.1% | 358 | 416 | 58 | 76 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 81.9% | 194 | 237 | 43 | 39 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 27 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 72.5% | 198 | 273 | 75 | 70 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 754 | 606 | 148 |
| Web | 611 | 432 | 179 |
| Swage | 371 | 544 | -173 |
| LipNotch | 512 | 497 | 15 |
| InnerNotch | 129 | 94 | 35 |
| InnerService | 107 | 95 | 12 |
| Chamfer | 36 | 101 | -65 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 41 | 15 | 26 |
| LeftFlange | 26 | 15 | 11 |
| Bolt | 11 | 3 | 8 |