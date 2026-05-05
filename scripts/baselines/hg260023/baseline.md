# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 80.34% matched** (15515/19312 ops)
Missing: 3797 (Detailer has, we lack) | Extras: 3499 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| NLBW | 2 | 88.2% | 5145 | 5831 | 686 | 657 |
| LBW | 4 | 86.7% | 7165 | 8263 | 1098 | 998 |
| TIN | 2 | 84.5% | 815 | 964 | 149 | 143 |
| TB2B | 5 | 78.7% | 1996 | 2536 | 540 | 754 |
| RP | 1 | 22.9% | 394 | 1718 | 1324 | 947 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 22.9% | 394 | 1718 | 1324 | 947 |
| HG260023_GF-TIN-70.095.rfy | 82.5% | 660 | 800 | 140 | 134 |
| HG260023_GF-TIN-70.115.rfy | 94.5% | 155 | 164 | 9 | 9 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 91.6% | 361 | 394 | 33 | 33 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 74.0% | 348 | 470 | 122 | 136 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 76.1% | 239 | 314 | 75 | 101 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 88.0% | 4784 | 5437 | 653 | 624 |
| HG260023_PK3-GF-LBW-89.075.rfy | 89.1% | 171 | 192 | 21 | 11 |
| HG260023_PK4-GF-LBW-70.095.rfy | 84.0% | 5095 | 6063 | 968 | 888 |
| HG260023_PK5-GF-LBW-70.095.rfy | 69.8% | 67 | 96 | 29 | 29 |
| HG260023_PK6-GF-LBW-70.075.rfy | 95.8% | 1832 | 1912 | 80 | 70 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 80.9% | 318 | 393 | 75 | 114 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 78.5% | 543 | 692 | 149 | 182 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 82.2% | 548 | 667 | 119 | 221 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 1172 | 933 | 239 |
| LipNotch | 733 | 655 | 78 |
| Web | 676 | 714 | -38 |
| Swage | 625 | 617 | 8 |
| InnerService | 195 | 233 | -38 |
| InnerNotch | 183 | 129 | 54 |
| Chamfer | 113 | 147 | -34 |
| RightFlange | 49 | 17 | 32 |
| LeftFlange | 40 | 25 | 15 |
| Bolt | 11 | 29 | -18 |