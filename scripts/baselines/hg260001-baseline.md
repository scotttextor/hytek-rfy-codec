# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 81.91% matched** (14747/18004 ops)
Missing: 3257 (Detailer has, we lack) | Extras: 3157 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 22.4% | 223 | 997 | 774 | 604 |
| HG260001_GF-TIN-70.075.rfy | 66.7% | 675 | 1012 | 337 | 219 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 90.5% | 2400 | 2652 | 252 | 277 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 76.0% | 456 | 600 | 144 | 132 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 72.6% | 212 | 292 | 80 | 70 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 80.9% | 641 | 792 | 151 | 202 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 90.0% | 1899 | 2109 | 210 | 262 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 88.2% | 4201 | 4762 | 561 | 551 |
| HG260001_PK5-GF-LBW-70.075.rfy | 86.9% | 3100 | 3567 | 467 | 455 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 78.4% | 326 | 416 | 90 | 175 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 73.5% | 175 | 238 | 63 | 108 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 81.1% | 167 | 206 | 39 | 23 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 68.9% | 188 | 273 | 85 | 75 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 992 | 653 | 339 |
| Web | 622 | 833 | -211 |
| Swage | 476 | 627 | -151 |
| LipNotch | 524 | 505 | 19 |
| InnerService | 237 | 341 | -104 |
| Chamfer | 151 | 37 | 114 |
| InnerNotch | 122 | 133 | -11 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 48 | 4 | 44 |
| LeftFlange | 31 | 4 | 27 |
| Bolt | 5 | 18 | -13 |