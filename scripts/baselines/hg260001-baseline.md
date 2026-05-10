# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 92.53% matched** (16656/18000 ops)
Missing: 1344 (Detailer has, we lack) | Extras: 1302 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 70.5% | 703 | 997 | 294 | 292 |
| HG260001_GF-TIN-70.075.rfy | 83.5% | 843 | 1009 | 166 | 104 |
| HG260001_GF-TIN-70.095.rfy | 100.0% | 88 | 88 | 0 | 0 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 94.6% | 2508 | 2652 | 144 | 123 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 95.0% | 570 | 600 | 30 | 30 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 93.5% | 273 | 292 | 19 | 12 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 89.9% | 712 | 792 | 80 | 47 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 94.7% | 1998 | 2109 | 111 | 127 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 95.1% | 4527 | 4762 | 235 | 276 |
| HG260001_PK5-GF-LBW-70.075.rfy | 94.6% | 3376 | 3567 | 191 | 229 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 98.6% | 410 | 416 | 6 | 2 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 87.3% | 207 | 237 | 30 | 23 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 99.0% | 204 | 206 | 2 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 86.8% | 237 | 273 | 36 | 35 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 465 | 373 | 92 |
| LipNotch | 204 | 289 | -85 |
| Swage | 199 | 229 | -30 |
| Web | 207 | 149 | 58 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 66 | 89 | -23 |
| Chamfer | 35 | 50 | -15 |
| RightFlange | 17 | 11 | 6 |
| ScrewHoles | 13 | 4 | 9 |
| LeftFlange | 12 | 2 | 10 |
| Bolt | 11 | 3 | 8 |