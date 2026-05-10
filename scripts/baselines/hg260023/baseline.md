# HG260023 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 85.12% matched** (16439/19312 ops)
Missing: 2873 (Detailer has, we lack) | Extras: 2728 (we emit, Detailer doesn't)

## Per-frame-type parity (14 plans grouped)
| Frame type | Plans | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|---:|
| LBW | 4 | 91.4% | 7552 | 8263 | 711 | 822 |
| NLBW | 2 | 91.1% | 5312 | 5831 | 519 | 495 |
| TIN | 2 | 87.9% | 847 | 964 | 117 | 111 |
| TB2B | 5 | 78.5% | 1990 | 2536 | 546 | 408 |
| RP | 1 | 43.0% | 738 | 1718 | 980 | 892 |

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260023_GF-RP-70.075.rfy | 43.0% | 738 | 1718 | 980 | 892 |
| HG260023_GF-TIN-70.095.rfy | 85.4% | 683 | 800 | 117 | 111 |
| HG260023_GF-TIN-70.115.rfy | 100.0% | 164 | 164 | 0 | 0 |
| HG260023_PK1-GF-NLBW-89.075.rfy | 94.9% | 374 | 394 | 20 | 17 |
| HG260023_PK10-GF-TB2B-70.075.rfy | 73.2% | 344 | 470 | 126 | 92 |
| HG260023_PK11-GF-TB2B-70.075.rfy | 74.2% | 233 | 314 | 81 | 69 |
| HG260023_PK2-GF-NLBW-70.075.rfy | 90.8% | 4938 | 5437 | 499 | 478 |
| HG260023_PK3-GF-LBW-89.075.rfy | 94.3% | 181 | 192 | 11 | 9 |
| HG260023_PK4-GF-LBW-70.095.rfy | 89.2% | 5408 | 6063 | 655 | 734 |
| HG260023_PK5-GF-LBW-70.095.rfy | 74.0% | 71 | 96 | 25 | 25 |
| HG260023_PK6-GF-LBW-70.075.rfy | 99.0% | 1892 | 1912 | 20 | 54 |
| HG260023_PK7-GF-TB2B-70.075.rfy | 81.7% | 321 | 393 | 72 | 50 |
| HG260023_PK8-GF-TB2B-70.075.rfy | 77.9% | 539 | 692 | 153 | 127 |
| HG260023_PK9-GF-TB2B-70.075.rfy | 82.9% | 553 | 667 | 114 | 70 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 868 | 714 | 154 |
| LipNotch | 537 | 657 | -120 |
| Web | 528 | 397 | 131 |
| Swage | 440 | 432 | 8 |
| InnerService | 183 | 221 | -38 |
| InnerNotch | 116 | 147 | -31 |
| Chamfer | 98 | 128 | -30 |
| RightFlange | 47 | 5 | 42 |
| LeftFlange | 40 | 11 | 29 |
| Bolt | 16 | 16 | 0 |