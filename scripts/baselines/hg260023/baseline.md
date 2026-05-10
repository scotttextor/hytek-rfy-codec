# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 84.93% matched** (16401/19312 ops)
Missing: 2911 (Detailer has, we lack) | Extras: 2733 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| LBW | 4 | 91.2% | 7536 | 8263 | 727 | 822 |
| NLBW | 2 | 90.7% | 5290 | 5831 | 541 | 500 |
| TIN | 2 | 87.9% | 847 | 964 | 117 | 111 |
| TB2B | 5 | 78.5% | 1990 | 2536 | 546 | 408 |
| RP | 1 | 43.0% | 738 | 1718 | 980 | 892 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 43.0% | 738 | 1718 | 980 | 892 |
| HG260023_GF-TIN-70.095.rfy | 85.4% | 683 | 800 | 117 | 111 |
| HG260023_GF-TIN-70.115.rfy | 100.0% | 164 | 164 | 0 | 0 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 93.7% | 369 | 394 | 25 | 17 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 73.2% | 344 | 470 | 126 | 92 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 74.2% | 233 | 314 | 81 | 69 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 90.5% | 4921 | 5437 | 516 | 483 |
| HG260023_PK3-GF-LBW-89.075.rfy | 93.2% | 179 | 192 | 13 | 9 |
| HG260023_PK4-GF-LBW-70.095.rfy | 89.1% | 5402 | 6063 | 661 | 734 |
| HG260023_PK5-GF-LBW-70.095.rfy | 74.0% | 71 | 96 | 25 | 25 |
| HG260023_PK6-GF-LBW-70.075.rfy | 98.5% | 1884 | 1912 | 28 | 54 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 81.7% | 321 | 393 | 72 | 50 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 77.9% | 539 | 692 | 153 | 127 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 82.9% | 553 | 667 | 114 | 70 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 902 | 714 | 188 |
| LipNotch | 538 | 659 | -121 |
| Web | 528 | 397 | 131 |
| Swage | 442 | 433 | 9 |
| InnerService | 183 | 221 | -38 |
| InnerNotch | 117 | 149 | -32 |
| Chamfer | 98 | 128 | -30 |
| RightFlange | 47 | 5 | 42 |
| LeftFlange | 40 | 11 | 29 |
| Bolt | 16 | 16 | 0 |