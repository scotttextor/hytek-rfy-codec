# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 78.64% matched** (15187/19312 ops)
Missing: 4125 (Detailer has, we lack) | Extras: 3699 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| NLBW | 2 | 85.7% | 4997 | 5831 | 834 | 735 |
| TIN | 2 | 84.5% | 815 | 964 | 149 | 143 |
| LBW | 4 | 84.5% | 6985 | 8263 | 1278 | 1120 |
| TB2B | 5 | 78.7% | 1996 | 2536 | 540 | 754 |
| RP | 1 | 22.9% | 394 | 1718 | 1324 | 947 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 22.9% | 394 | 1718 | 1324 | 947 |
| HG260023_GF-TIN-70.095.rfy | 82.5% | 660 | 800 | 140 | 134 |
| HG260023_GF-TIN-70.115.rfy | 94.5% | 155 | 164 | 9 | 9 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 86.5% | 341 | 394 | 53 | 48 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 74.0% | 348 | 470 | 122 | 136 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 76.1% | 239 | 314 | 75 | 101 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 85.6% | 4656 | 5437 | 781 | 687 |
| HG260023_PK3-GF-LBW-89.075.rfy | 84.9% | 163 | 192 | 29 | 23 |
| HG260023_PK4-GF-LBW-70.095.rfy | 81.5% | 4943 | 6063 | 1120 | 960 |
| HG260023_PK5-GF-LBW-70.095.rfy | 57.3% | 55 | 96 | 41 | 41 |
| HG260023_PK6-GF-LBW-70.075.rfy | 95.4% | 1824 | 1912 | 88 | 96 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 80.9% | 318 | 393 | 75 | 114 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 78.5% | 543 | 692 | 149 | 182 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 82.2% | 548 | 667 | 119 | 221 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 1172 | 933 | 239 |
| LipNotch | 733 | 655 | 78 |
| Web | 673 | 715 | -42 |
| Swage | 695 | 687 | 8 |
| InnerService | 459 | 354 | 105 |
| InnerNotch | 183 | 129 | 54 |
| Chamfer | 113 | 147 | -34 |
| RightFlange | 49 | 17 | 32 |
| LeftFlange | 40 | 25 | 15 |
| Bolt | 8 | 37 | -29 |