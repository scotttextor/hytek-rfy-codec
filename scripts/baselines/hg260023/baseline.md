# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 83.82% matched** (16188/19312 ops)
Missing: 3124 (Detailer has, we lack) | Extras: 2965 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| NLBW | 2 | 90.6% | 5283 | 5831 | 548 | 497 |
| LBW | 4 | 90.0% | 7437 | 8263 | 826 | 913 |
| TIN | 2 | 84.1% | 811 | 964 | 153 | 147 |
| TB2B | 5 | 78.4% | 1989 | 2536 | 547 | 433 |
| RP | 1 | 38.9% | 668 | 1718 | 1050 | 975 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 38.9% | 668 | 1718 | 1050 | 975 |
| HG260023_GF-TIN-70.095.rfy | 82.0% | 656 | 800 | 144 | 138 |
| HG260023_GF-TIN-70.115.rfy | 94.5% | 155 | 164 | 9 | 9 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 93.1% | 367 | 394 | 27 | 27 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 73.2% | 344 | 470 | 126 | 97 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 74.2% | 233 | 314 | 81 | 74 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 90.4% | 4916 | 5437 | 521 | 470 |
| HG260023_PK3-GF-LBW-89.075.rfy | 93.2% | 179 | 192 | 13 | 11 |
| HG260023_PK4-GF-LBW-70.095.rfy | 87.6% | 5312 | 6063 | 751 | 816 |
| HG260023_PK5-GF-LBW-70.095.rfy | 74.0% | 71 | 96 | 25 | 25 |
| HG260023_PK6-GF-LBW-70.075.rfy | 98.1% | 1875 | 1912 | 37 | 61 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 81.2% | 319 | 393 | 74 | 60 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 78.0% | 540 | 692 | 152 | 132 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 82.9% | 553 | 667 | 114 | 70 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 1004 | 826 | 178 |
| LipNotch | 583 | 706 | -123 |
| Web | 529 | 422 | 107 |
| Swage | 492 | 492 | 0 |
| InnerService | 183 | 221 | -38 |
| InnerNotch | 121 | 144 | -23 |
| Chamfer | 109 | 122 | -13 |
| RightFlange | 47 | 5 | 42 |
| LeftFlange | 40 | 11 | 29 |
| Bolt | 16 | 16 | 0 |