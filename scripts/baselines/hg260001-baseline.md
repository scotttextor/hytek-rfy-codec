# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 90.26% matched** (16246/18000 ops)
Missing: 1754 (Detailer has, we lack) | Extras: 1669 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 65.6% | 654 | 997 | 343 | 365 |
| HG260001_GF-TIN-70.075.rfy | 70.1% | 707 | 1009 | 302 | 202 |
| HG260001_GF-TIN-70.095.rfy | 100.0% | 88 | 88 | 0 | 0 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 92.9% | 2463 | 2652 | 189 | 169 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 94.0% | 564 | 600 | 36 | 30 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 93.5% | 273 | 292 | 19 | 10 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 89.1% | 706 | 792 | 86 | 47 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 93.7% | 1976 | 2109 | 133 | 133 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 93.7% | 4461 | 4762 | 301 | 337 |
| HG260001_PK5-GF-LBW-70.075.rfy | 93.9% | 3350 | 3567 | 217 | 274 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 88.0% | 366 | 416 | 50 | 46 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 83.5% | 198 | 237 | 39 | 22 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 98.5% | 203 | 206 | 3 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 86.8% | 237 | 273 | 36 | 32 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 589 | 453 | 136 |
| LipNotch | 317 | 444 | -127 |
| Web | 280 | 205 | 75 |
| Swage | 250 | 279 | -29 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 78 | 100 | -22 |
| Chamfer | 35 | 74 | -39 |
| ScrewHoles | 36 | 4 | 32 |
| RightFlange | 29 | 2 | 27 |
| LeftFlange | 14 | 2 | 12 |
| Bolt | 11 | 3 | 8 |