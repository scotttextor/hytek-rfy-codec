# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 85.47% matched** (15384/18000 ops)
Missing: 2616 (Detailer has, we lack) | Extras: 2312 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 44.8% | 447 | 997 | 550 | 556 |
| HG260001_GF-TIN-70.075.rfy | 66.7% | 673 | 1009 | 336 | 221 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 91.1% | 2415 | 2652 | 237 | 223 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 78 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 41 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 88.3% | 699 | 792 | 93 | 59 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 92.5% | 1950 | 2109 | 159 | 161 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 89.9% | 4283 | 4762 | 479 | 425 |
| HG260001_PK5-GF-LBW-70.075.rfy | 88.3% | 3148 | 3567 | 419 | 375 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 86.1% | 358 | 416 | 58 | 62 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 84.4% | 200 | 237 | 37 | 30 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 22 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 74.7% | 204 | 273 | 69 | 55 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 710 | 627 | 83 |
| Web | 611 | 342 | 269 |
| Swage | 379 | 557 | -178 |
| LipNotch | 514 | 474 | 40 |
| InnerNotch | 129 | 94 | 35 |
| InnerService | 107 | 95 | 12 |
| Chamfer | 39 | 100 | -61 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 41 | 9 | 32 |
| LeftFlange | 26 | 9 | 17 |
| Bolt | 11 | 3 | 8 |