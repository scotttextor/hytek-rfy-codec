# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 84.71% matched** (15248/18000 ops)
Missing: 2752 (Detailer has, we lack) | Extras: 2507 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 35.0% | 349 | 997 | 648 | 545 |
| HG260001_GF-TIN-70.075.rfy | 67.0% | 676 | 1009 | 333 | 218 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 91.1% | 2417 | 2652 | 235 | 216 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 120 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 62 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 87.5% | 693 | 792 | 99 | 125 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 92.4% | 1949 | 2109 | 160 | 173 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 89.8% | 4275 | 4762 | 487 | 419 |
| HG260001_PK5-GF-LBW-70.075.rfy | 88.0% | 3138 | 3567 | 429 | 369 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 84.6% | 352 | 416 | 64 | 90 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 81.9% | 194 | 237 | 43 | 49 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 35 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 72.5% | 198 | 273 | 75 | 82 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 770 | 614 | 156 |
| Web | 622 | 549 | 73 |
| LipNotch | 528 | 476 | 52 |
| Swage | 428 | 522 | -94 |
| InnerNotch | 129 | 94 | 35 |
| Chamfer | 47 | 108 | -61 |
| InnerService | 107 | 95 | 12 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 41 | 15 | 26 |
| LeftFlange | 26 | 15 | 11 |
| Bolt | 5 | 17 | -12 |