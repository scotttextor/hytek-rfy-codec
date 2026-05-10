# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 89.02% matched** (16024/18000 ops)
Missing: 1976 (Detailer has, we lack) | Extras: 1887 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 61.9% | 617 | 997 | 380 | 410 |
| HG260001_GF-TIN-70.075.rfy | 65.7% | 663 | 1009 | 346 | 231 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 92.6% | 2455 | 2652 | 197 | 167 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 86.0% | 516 | 600 | 84 | 84 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 82.9% | 242 | 292 | 50 | 46 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 87.8% | 695 | 792 | 97 | 59 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 93.7% | 1976 | 2109 | 133 | 133 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 93.7% | 4461 | 4762 | 301 | 337 |
| HG260001_PK5-GF-LBW-70.075.rfy | 93.9% | 3350 | 3567 | 217 | 274 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 86.1% | 358 | 416 | 58 | 62 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 82.7% | 196 | 237 | 41 | 22 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 96.1% | 198 | 206 | 8 | 2 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 78.0% | 213 | 273 | 60 | 56 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 600 | 464 | 136 |
| LipNotch | 353 | 470 | -117 |
| Web | 409 | 347 | 62 |
| Swage | 277 | 316 | -39 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 84 | 96 | -12 |
| Chamfer | 35 | 82 | -47 |
| ScrewHoles | 49 | 2 | 47 |
| RightFlange | 29 | 2 | 27 |
| LeftFlange | 14 | 2 | 12 |
| Bolt | 11 | 3 | 8 |