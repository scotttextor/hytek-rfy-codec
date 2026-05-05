# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 82.66% matched** (14879/18000 ops)
Missing: 3121 (Detailer has, we lack) | Extras: 3014 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 22.4% | 223 | 997 | 774 | 604 |
| HG260001_GF-TIN-70.075.rfy | 67.0% | 676 | 1009 | 333 | 218 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 90.5% | 2400 | 2652 | 252 | 277 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 83.0% | 498 | 600 | 102 | 96 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 77.7% | 227 | 292 | 65 | 51 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 84.2% | 667 | 792 | 125 | 185 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 90.0% | 1899 | 2109 | 210 | 262 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 88.2% | 4201 | 4762 | 561 | 551 |
| HG260001_PK5-GF-LBW-70.075.rfy | 86.9% | 3100 | 3567 | 467 | 455 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 83.7% | 348 | 416 | 68 | 138 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 78.9% | 187 | 237 | 50 | 86 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 88.3% | 182 | 206 | 24 | 11 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 68.5% | 187 | 273 | 86 | 76 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 855 | 687 | 168 |
| Web | 628 | 657 | -29 |
| Swage | 472 | 627 | -155 |
| LipNotch | 525 | 504 | 21 |
| InnerService | 237 | 341 | -104 |
| Chamfer | 151 | 37 | 114 |
| InnerNotch | 122 | 133 | -11 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 46 | 4 | 42 |
| LeftFlange | 31 | 4 | 27 |
| Bolt | 5 | 18 | -13 |