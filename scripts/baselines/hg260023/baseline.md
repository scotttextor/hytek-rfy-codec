# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 84.20% matched** (16260/19312 ops)
Missing: 3052 (Detailer has, we lack) | Extras: 2908 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| NLBW | 2 | 90.7% | 5286 | 5831 | 545 | 499 |
| LBW | 4 | 90.3% | 7459 | 8263 | 804 | 901 |
| TIN | 2 | 86.4% | 833 | 964 | 131 | 125 |
| TB2B | 5 | 78.4% | 1989 | 2536 | 547 | 433 |
| RP | 1 | 40.3% | 693 | 1718 | 1025 | 950 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 40.3% | 693 | 1718 | 1025 | 950 |
| HG260023_GF-TIN-70.095.rfy | 83.6% | 669 | 800 | 131 | 125 |
| HG260023_GF-TIN-70.115.rfy | 100.0% | 164 | 164 | 0 | 0 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 93.1% | 367 | 394 | 27 | 27 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 73.2% | 344 | 470 | 126 | 97 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 74.2% | 233 | 314 | 81 | 74 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 90.5% | 4919 | 5437 | 518 | 472 |
| HG260023_PK3-GF-LBW-89.075.rfy | 93.8% | 180 | 192 | 12 | 10 |
| HG260023_PK4-GF-LBW-70.095.rfy | 87.9% | 5328 | 6063 | 735 | 808 |
| HG260023_PK5-GF-LBW-70.095.rfy | 74.0% | 71 | 96 | 25 | 25 |
| HG260023_PK6-GF-LBW-70.075.rfy | 98.3% | 1880 | 1912 | 32 | 58 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 81.2% | 319 | 393 | 74 | 60 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 78.0% | 540 | 692 | 152 | 132 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 82.9% | 553 | 667 | 114 | 70 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 979 | 801 | 178 |
| LipNotch | 569 | 685 | -116 |
| Web | 529 | 422 | 107 |
| Swage | 470 | 470 | 0 |
| InnerService | 183 | 221 | -38 |
| InnerNotch | 121 | 144 | -23 |
| Chamfer | 98 | 133 | -35 |
| RightFlange | 47 | 5 | 42 |
| LeftFlange | 40 | 11 | 29 |
| Bolt | 16 | 16 | 0 |