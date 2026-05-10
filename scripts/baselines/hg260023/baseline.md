# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 86.19% matched** (16645/19312 ops)
Missing: 2667 (Detailer has, we lack) | Extras: 2593 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| LBW | 4 | 92.6% | 7654 | 8263 | 609 | 730 |
| NLBW | 2 | 91.1% | 5310 | 5831 | 521 | 496 |
| TIN | 2 | 87.9% | 847 | 964 | 117 | 111 |
| TB2B | 5 | 82.7% | 2098 | 2536 | 438 | 383 |
| RP | 1 | 42.8% | 736 | 1718 | 982 | 873 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 42.8% | 736 | 1718 | 982 | 873 |
| HG260023_GF-TIN-70.095.rfy | 85.4% | 683 | 800 | 117 | 111 |
| HG260023_GF-TIN-70.115.rfy | 100.0% | 164 | 164 | 0 | 0 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 94.9% | 374 | 394 | 20 | 17 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 77.4% | 364 | 470 | 106 | 82 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 79.6% | 250 | 314 | 64 | 60 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 90.8% | 4936 | 5437 | 501 | 479 |
| HG260023_PK3-GF-LBW-89.075.rfy | 96.4% | 185 | 192 | 7 | 5 |
| HG260023_PK4-GF-LBW-70.095.rfy | 90.7% | 5502 | 6063 | 561 | 652 |
| HG260023_PK5-GF-LBW-70.095.rfy | 74.0% | 71 | 96 | 25 | 25 |
| HG260023_PK6-GF-LBW-70.075.rfy | 99.2% | 1896 | 1912 | 16 | 48 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 84.7% | 333 | 393 | 60 | 54 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 81.4% | 563 | 692 | 129 | 107 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 88.2% | 588 | 667 | 79 | 80 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 840 | 725 | 115 |
| LipNotch | 436 | 543 | -107 |
| Web | 460 | 347 | 113 |
| Swage | 443 | 437 | 6 |
| InnerService | 183 | 221 | -38 |
| InnerNotch | 117 | 147 | -30 |
| Chamfer | 112 | 121 | -9 |
| LeftFlange | 30 | 19 | 11 |
| RightFlange | 30 | 17 | 13 |
| Bolt | 16 | 16 | 0 |