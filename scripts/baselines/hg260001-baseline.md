# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 62.79% matched** (10679/17007 ops)
Missing: 6328 (Detailer has, we lack) | Extras: 6720 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | — | — | — | — | — |
| HG260001_GF-TIN-70.075.rfy | 62.0% | 627 | 1012 | 385 | 358 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 12 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 84.1% | 2230 | 2652 | 422 | 401 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 0.0% | 0 | 600 | 600 | 732 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 0.0% | 0 | 292 | 292 | 433 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 1.9% | 15 | 792 | 777 | 1181 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 85.9% | 1811 | 2109 | 298 | 339 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 71.0% | 3381 | 4762 | 1381 | 882 |
| HG260001_PK5-GF-LBW-70.075.rfy | 70.4% | 2512 | 3567 | 1055 | 682 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 1.9% | 8 | 416 | 408 | 708 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 1.3% | 3 | 238 | 235 | 359 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 2.4% | 5 | 206 | 201 | 313 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 1.1% | 3 | 273 | 270 | 320 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| Web | 2701 | 60 | 2641 |
| InnerDimple | 1354 | 2559 | -1205 |
| Swage | 520 | 1559 | -1039 |
| LipNotch | 729 | 1235 | -506 |
| InnerService | 257 | 580 | -323 |
| Chamfer | 148 | 515 | -367 |
| InnerNotch | 244 | 121 | 123 |
| Bolt | 141 | 83 | 58 |
| LeftFlange | 99 | 0 | 99 |
| RightFlange | 86 | 0 | 86 |
| ScrewHoles | 49 | 8 | 41 |