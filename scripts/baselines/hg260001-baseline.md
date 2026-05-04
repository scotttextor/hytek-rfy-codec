# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 82.82% matched** (14085/17007 ops)
Missing: 2922 (Detailer has, we lack) | Extras: 3311 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | — | — | — | — | — |
| HG260001_GF-TIN-70.075.rfy | 63.1% | 639 | 1012 | 373 | 304 |
| HG260001_GF-TIN-70.095.rfy | 95.5% | 84 | 88 | 4 | 4 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 90.3% | 2396 | 2652 | 256 | 277 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 76.0% | 456 | 600 | 144 | 186 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 70.2% | 205 | 292 | 87 | 128 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 54.2% | 429 | 792 | 363 | 534 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 89.9% | 1897 | 2109 | 212 | 262 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 88.0% | 4189 | 4762 | 573 | 527 |
| HG260001_PK5-GF-LBW-70.075.rfy | 86.6% | 3089 | 3567 | 478 | 432 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 53.8% | 224 | 416 | 192 | 311 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 68.1% | 162 | 238 | 76 | 143 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 78.2% | 161 | 206 | 45 | 56 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 56.4% | 154 | 273 | 119 | 147 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| Web | 924 | 1565 | -641 |
| InnerDimple | 678 | 328 | 350 |
| Swage | 369 | 450 | -81 |
| LipNotch | 391 | 425 | -34 |
| InnerService | 257 | 329 | -72 |
| InnerNotch | 80 | 105 | -25 |
| Chamfer | 42 | 83 | -41 |
| RightFlange | 72 | 0 | 72 |
| LeftFlange | 55 | 0 | 55 |
| ScrewHoles | 49 | 8 | 41 |
| Bolt | 5 | 18 | -13 |