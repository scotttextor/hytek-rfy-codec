# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 85.39% matched** (16490/19312 ops)
Missing: 2822 (Detailer has, we lack) | Extras: 2739 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| LBW | 4 | 91.4% | 7549 | 8263 | 714 | 825 |
| NLBW | 2 | 91.1% | 5310 | 5831 | 521 | 496 |
| TIN | 2 | 87.9% | 847 | 964 | 117 | 111 |
| TB2B | 5 | 80.8% | 2048 | 2536 | 488 | 433 |
| RP | 1 | 42.8% | 736 | 1718 | 982 | 874 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 42.8% | 736 | 1718 | 982 | 874 |
| HG260023_GF-TIN-70.095.rfy | 85.4% | 683 | 800 | 117 | 111 |
| HG260023_GF-TIN-70.115.rfy | 100.0% | 164 | 164 | 0 | 0 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 94.9% | 374 | 394 | 20 | 17 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 74.9% | 352 | 470 | 118 | 94 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 76.1% | 239 | 314 | 75 | 71 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 90.8% | 4936 | 5437 | 501 | 479 |
| HG260023_PK3-GF-LBW-89.075.rfy | 94.3% | 181 | 192 | 11 | 9 |
| HG260023_PK4-GF-LBW-70.095.rfy | 89.1% | 5405 | 6063 | 658 | 737 |
| HG260023_PK5-GF-LBW-70.095.rfy | 74.0% | 71 | 96 | 25 | 25 |
| HG260023_PK6-GF-LBW-70.075.rfy | 99.0% | 1892 | 1912 | 20 | 54 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 84.7% | 333 | 393 | 60 | 54 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 78.2% | 541 | 692 | 151 | 129 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 87.4% | 583 | 667 | 84 | 85 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 880 | 726 | 154 |
| LipNotch | 501 | 638 | -137 |
| Web | 510 | 397 | 113 |
| Swage | 443 | 436 | 7 |
| InnerService | 183 | 221 | -38 |
| InnerNotch | 117 | 147 | -30 |
| Chamfer | 112 | 122 | -10 |
| LeftFlange | 30 | 19 | 11 |
| RightFlange | 30 | 17 | 13 |
| Bolt | 16 | 16 | 0 |