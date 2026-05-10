# HG260001 Baseline — Per-Plan Op-Level Diff vs Detailer

**Overall: 92.89% matched** (16721/18000 ops)
Missing: 1279 (Detailer has, we lack) | Extras: 1242 (we emit, Detailer doesn't)

## Per-plan parity
| RFY | Parity | Matched | Ref | Missing | Extras |
|---|---:|---:|---:|---:|---:|
| HG260001_GF-RP-70.075.rfy | 70.5% | 703 | 997 | 294 | 292 |
| HG260001_GF-TIN-70.075.rfy | 83.5% | 843 | 1009 | 166 | 104 |
| HG260001_GF-TIN-70.095.rfy | 100.0% | 88 | 88 | 0 | 0 |
| HG260001_PK1-GF-NLBW-70.075.rfy | 94.6% | 2509 | 2652 | 143 | 101 |
| HG260001_PK10-GF-TB2B-70.075.rfy | 96.0% | 576 | 600 | 24 | 24 |
| HG260001_PK11-GF-TB2B-70.075.rfy | 93.5% | 273 | 292 | 19 | 12 |
| HG260001_PK12-GF-TB2B-70.075.rfy | 90.8% | 719 | 792 | 73 | 40 |
| HG260001_PK2-GF-NLBW-70.075.rfy | 94.7% | 1998 | 2109 | 111 | 114 |
| HG260001_PK3-GF-NLBW-89.075.rfy | — | — | — | — | — |
| HG260001_PK4-GF-LBW-70.075.rfy | 95.8% | 4560 | 4762 | 202 | 270 |
| HG260001_PK5-GF-LBW-70.075.rfy | 95.0% | 3388 | 3567 | 179 | 229 |
| HG260001_PK6-GF-TB2B-70.075.rfy | 98.6% | 410 | 416 | 6 | 2 |
| HG260001_PK7-GF-TB2B-70.075.rfy | 87.3% | 207 | 237 | 30 | 23 |
| HG260001_PK8-GF-TB2B-70.075.rfy | 99.5% | 205 | 206 | 1 | 1 |
| HG260001_PK9-GF-TB2B-70.075.rfy | 88.6% | 242 | 273 | 31 | 30 |

## Aggregate divergence by tool
| Tool | Missing (Detailer has) | Extras (we emit) | Net we lack |
|---|---:|---:|---:|
| InnerDimple | 420 | 373 | 47 |
| LipNotch | 204 | 264 | -60 |
| Swage | 198 | 213 | -15 |
| Web | 188 | 130 | 58 |
| InnerService | 115 | 103 | 12 |
| InnerNotch | 66 | 89 | -23 |
| Chamfer | 35 | 50 | -15 |
| RightFlange | 17 | 11 | 6 |
| ScrewHoles | 13 | 4 | 9 |
| LeftFlange | 12 | 2 | 10 |
| Bolt | 11 | 3 | 8 |