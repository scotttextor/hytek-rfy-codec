# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 90.69% matched** (16325/18000 ops)
Missing: 1675 (Detailer has, we lack) | Extras: 1649 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 65.6% | 654 | 997 | 343 | 365 |
| HG260001_GF-TIN-70.075.rfy | 70.1% | 707 | 1009 | 302 | 202 |
| HG260001_GF-TIN-70.095.rfy | 100.0% | 88 | 88 | 0 | 0 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 94.0% | 2492 | 2652 | 160 | 139 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 95.0% | 570 | 600 | 30 | 30 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 93.5% | 273 | 292 | 19 | 12 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 88.3% | 699 | 792 | 93 | 55 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 94.6% | 1996 | 2109 | 113 | 129 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 94.0% | 4478 | 4762 | 284 | 337 |
| HG260001_PK5-GF-LBW-70.075.rfy | 94.0% | 3354 | 3567 | 213 | 274 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 88.0% | 366 | 416 | 50 | 46 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 87.3% | 207 | 237 | 30 | 23 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 99.0% | 204 | 206 | 2 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 86.8% | 237 | 273 | 36 | 35 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 554 | 453 | 101 |
| LipNotch | 305 | 435 | -130 |
| Web | 281 | 204 | 77 |
| Swage | 239 | 267 | -28 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 66 | 89 | -23 |
| Chamfer | 35 | 74 | -39 |
| ScrewHoles | 36 | 4 | 32 |
| RightFlange | 19 | 13 | 6 |
| LeftFlange | 14 | 4 | 10 |
| Bolt | 11 | 3 | 8 |