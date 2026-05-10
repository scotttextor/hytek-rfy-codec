# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 88.03% matched** (15846/18000 ops)
Missing: 2154 (Detailer has, we lack) | Extras: 2068 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 58.5% | 583 | 997 | 414 | 444 |
| HG260001_GF-TIN-70.075.rfy | 66.7% | 673 | 1009 | 336 | 221 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 91.5% | 2427 | 2652 | 225 | 195 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 102 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 61 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 87.8% | 695 | 792 | 97 | 59 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 93.0% | 1961 | 2109 | 148 | 148 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 93.0% | 4427 | 4762 | 335 | 371 |
| HG260001_PK5-GF-LBW-70.075.rfy | 92.7% | 3306 | 3567 | 261 | 319 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 86.1% | 358 | 416 | 58 | 62 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 82.7% | 196 | 237 | 41 | 22 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 78.0% | 213 | 273 | 60 | 58 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 667 | 531 | 136 |
| LipNotch | 392 | 510 | -118 |
| Web | 409 | 349 | 60 |
| Swage | 317 | 356 | -39 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 94 | 106 | -12 |
| Chamfer | 35 | 82 | -47 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 40 | 13 | 27 |
| LeftFlange | 25 | 13 | 12 |
| Bolt | 11 | 3 | 8 |