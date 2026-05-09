# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 84.01% matched** (15122/18000 ops)
Missing: 2878 (Detailer has, we lack) | Extras: 3013 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 35.0% | 349 | 997 | 648 | 545 |
| HG260001_GF-TIN-70.075.rfy | 67.0% | 676 | 1009 | 333 | 218 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 90.7% | 2406 | 2652 | 246 | 273 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 120 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 62 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 84.6% | 670 | 792 | 122 | 237 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 91.7% | 1933 | 2109 | 176 | 230 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 88.4% | 4209 | 4762 | 553 | 537 |
| HG260001_PK5-GF-LBW-70.075.rfy | 88.0% | 3138 | 3567 | 429 | 403 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 85.1% | 354 | 416 | 62 | 150 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 81.9% | 194 | 237 | 43 | 101 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 35 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 68.1% | 186 | 273 | 87 | 98 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 809 | 653 | 156 |
| Web | 617 | 777 | -160 |
| LipNotch | 521 | 515 | 6 |
| Swage | 472 | 520 | -48 |
| InnerService | 193 | 257 | -64 |
| InnerNotch | 122 | 133 | -11 |
| Chamfer | 23 | 108 | -85 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 41 | 15 | 26 |
| LeftFlange | 26 | 15 | 11 |
| Bolt | 5 | 18 | -13 |