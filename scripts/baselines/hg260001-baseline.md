# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 91.71% matched** (16508/18000 ops)
Missing: 1492 (Detailer has, we lack) | Extras: 1497 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 69.9% | 697 | 997 | 300 | 302 |
| HG260001_GF-TIN-70.075.rfy | 80.3% | 810 | 1009 | 199 | 146 |
| HG260001_GF-TIN-70.095.rfy | 100.0% | 88 | 88 | 0 | 0 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 94.6% | 2508 | 2652 | 144 | 123 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 95.0% | 570 | 600 | 30 | 30 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 93.5% | 273 | 292 | 19 | 12 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 89.4% | 708 | 792 | 84 | 50 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 94.7% | 1998 | 2109 | 111 | 127 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 94.2% | 4484 | 4762 | 278 | 331 |
| HG260001_PK5-GF-LBW-70.075.rfy | 94.1% | 3358 | 3567 | 209 | 270 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 88.0% | 366 | 416 | 50 | 46 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 87.3% | 207 | 237 | 30 | 23 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 99.0% | 204 | 206 | 2 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 86.8% | 237 | 273 | 36 | 35 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 496 | 404 | 92 |
| LipNotch | 269 | 402 | -133 |
| Web | 255 | 196 | 59 |
| Swage | 203 | 229 | -26 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 66 | 89 | -23 |
| Chamfer | 35 | 54 | -19 |
| RightFlange | 17 | 11 | 6 |
| ScrewHoles | 13 | 4 | 9 |
| LeftFlange | 12 | 2 | 10 |
| Bolt | 11 | 3 | 8 |