# 5 reference samples for Scott to review

Open in any markdown viewer or paste into Excel for ops lists. Each sample has a manufacturing PDF link + .fcp link so you can navigate to the same stick in Detailer.

---

## Sample 1: NLBW Raised B-plate slab anchors

**Job / plan / frame / stick:** `HG260001` / `GF-NLBW-70.075` / `N14` / `B1`
**Stick length:** 1872.0mm
**Matched ops:** 8, extras: 1, missing: 0

### My question
Why does this NLBW raised B-plate (sill above an opening) get slab anchor bolts when an LBW raised B doesn't?

### Context
This is a raised B-plate (Bh) sitting at z=61.5mm — i.e. it's the sill above a door opening, not on the slab itself. In Detailer's reference, it has Web@8 + Bolt@62 (slab anchor pattern). LBW raised B-plates (e.g. PK4 L4 B2) at the same elevation do NOT have these. We want to know what makes Detailer fire slab anchors here.

### Open the same stick in Detailer
- Manufacturing PDF: [HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-NLBW-70.075.pdf](file:///Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/06 MANUFACTURING/02 DRAWINGS MANUFACTURING/01 LGS/HG260001 LOT 289 COORA CRESCENT CURRIMUNDI 4551-GF-NLBW-70.075.pdf)
- Detailer project: [HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI.fcp](file:///Y:/(17) 2026 HYTEK PROJECTS/CORAL HOMES/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI/03 DETAILING/03 FRAMECAD DETAILER/HG260001 LOT 289 (29) COORA CRESENT CURRIMUNDI.fcp)

### Codec emits (ops we generate)
```
  + Bolt @1810.0
```

### Detailer reference (ops missing from codec)
```
  (no missing ops — codec matches reference for this stick)
```

---

## Sample 2: Truss panel-point dimples (the pair next to each web crossing)

**Job / plan / frame / stick:** `HG250011` / `GF-TIN-70.075` / `PC1-1` / `T2`
**Stick length:** 2408.3mm
**Matched ops:** 3, extras: 11, missing: 16

### My question
At each panel-point on this TopChord, look at the InnerDimple PAIRS in the ref ops. Each pair sits to ONE SIDE of the web-stick projection by ~25mm. What determines which side?

### Context
T2 is a top chord. The ref has multiple InnerDimple PAIRS in the body — these are panel-point markers. Each pair (e.g. InnerDimple @550 + @601) sits offset from where the diagonal web stick projects onto the chord. Sometimes the pair is BEFORE the projection point, sometimes AFTER. Looking for the rule that determines the side.

### Open the same stick in Detailer
- Manufacturing PDF: [HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1-GF-TIN-70.075.pdf](file:///Y:/(14) 2025 HYTEK PROJECTS/CORAL HOMES/HG250011 LOT 57 (5) NEVIS COURT D'AGUILAR/06 MANUFACTURING/02 DRAWINGS MANUFACTURING/01 LGS/SS 20250801/HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1-GF-TIN-70.075.pdf)
- Detailer project: [HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1.fcp](file:///Y:/(14) 2025 HYTEK PROJECTS/CORAL HOMES/HG250011 LOT 57 (5) NEVIS COURT D'AGUILAR/03 DETAILING/03 FRAMECAD DETAILER/HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1.fcp)

### Codec emits (ops we generate)
```
  + InnerDimple @16.5
  + InnerDimple @1110.9
  + InnerDimple @1550.6
  + InnerDimple @1657.9
  + InnerDimple @2181.4
  + InnerDimple @2385.9
  + LipNotch 1088.4..1133.4
  + LipNotch 1393.9..1440.3
  + LipNotch 1635.4..1680.4
  + LipNotch 1871.1..1917.4
  + LipNotch 2158.9..2203.9
```

### Detailer reference (ops missing from codec)
```
  - InnerDimple @10.0
  - InnerDimple @64.1
  - InnerDimple @562.3
  - InnerDimple @613.5
  - InnerDimple @1165.8
  - InnerDimple @1217.1
  - InnerDimple @1820.6
  - InnerDimple @1871.9
  - InnerDimple @2146.1
  - InnerDimple @2398.3
  - InnerDimple @2398.3
  - LipNotch 512.9..629.2
  - LipNotch 1117.7..1232.7
  - LipNotch 1723.6..1890.8
  - LipNotch 2135.2..2243.3
  - Chamfer @end
```

---

## Sample 3: Truss chord 'cap notches' at start and end (clarifying my term)

**Job / plan / frame / stick:** `HG250011` / `GF-TIN-70.075` / `PC1-1` / `T2`
**Stick length:** 2408.3mm
**Matched ops:** 3, extras: 11, missing: 16

### My question
When I said 'cap notch', I meant the InnerNotch + LipNotch span at the very start (0..39mm) and very end (length-39..length) of a chord stick. In TIN trusses ~80% of chord sticks have these caps; ~20% have only LipNotches without InnerNotches. Look at this T2 stick — what physically distinguishes a chord that gets the InnerNotch cap vs one that doesn't?

### Context
Same stick as #2 but looking at the START and END ops only. The InnerNotch+LipNotch cap is for connecting to another chord segment OR to a heel/apex piece. The 20% without InnerNotch may be the ones that connect to nothing (free end) or to a different chord type.

### Open the same stick in Detailer
- Manufacturing PDF: [HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1-GF-TIN-70.075.pdf](file:///Y:/(14) 2025 HYTEK PROJECTS/CORAL HOMES/HG250011 LOT 57 (5) NEVIS COURT D'AGUILAR/06 MANUFACTURING/02 DRAWINGS MANUFACTURING/01 LGS/SS 20250801/HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1-GF-TIN-70.075.pdf)
- Detailer project: [HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1.fcp](file:///Y:/(14) 2025 HYTEK PROJECTS/CORAL HOMES/HG250011 LOT 57 (5) NEVIS COURT D'AGUILAR/03 DETAILING/03 FRAMECAD DETAILER/HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1.fcp)

### Codec emits (ops we generate)
```
  + InnerDimple @16.5
  + InnerDimple @1110.9
  + InnerDimple @1550.6
  + InnerDimple @1657.9
  + InnerDimple @2181.4
  + InnerDimple @2385.9
  + LipNotch 1088.4..1133.4
  + LipNotch 1393.9..1440.3
  + LipNotch 1635.4..1680.4
  + LipNotch 1871.1..1917.4
  + LipNotch 2158.9..2203.9
```

### Detailer reference (ops missing from codec)
```
  - InnerDimple @10.0
  - InnerDimple @64.1
  - InnerDimple @562.3
  - InnerDimple @613.5
  - InnerDimple @1165.8
  - InnerDimple @1217.1
  - InnerDimple @1820.6
  - InnerDimple @1871.9
  - InnerDimple @2146.1
  - InnerDimple @2398.3
  - InnerDimple @2398.3
  - LipNotch 512.9..629.2
  - LipNotch 1117.7..1232.7
  - LipNotch 1723.6..1890.8
  - LipNotch 2135.2..2243.3
  - Chamfer @end
```

---

## Sample 4: Br/R stick tooling (decoded ops with HYTEK codes)

**Job / plan / frame / stick:** `HG250011` / `GF-TIN-70.095` / `TGI1-1` / `R6`
**Stick length:** 396.9mm
**Matched ops:** 3, extras: 1, missing: 11

### My question
What is an R6 stick on this TGI1-1 frame, and what are these tooling codes? Are they ribbons, lateral braces, or something else? And confirm the 41mm Swage span / 11mm dimple offset is correct (vs studs' 39 + 16.5).

### Context
R6 is 399mm long. Detailer's reference has: Chamfer@start, InnerDimple @99.5, @198.5, @281.5 (3 dimples in the body), LipNotch 77..122, InnerNotch 176..221, LipNotch 176..221, InnerNotch 259..304. Codec only emits Swage 357.9..398.9. Want to confirm what type of stick this is in HYTEK terms and what these ops represent.

### Open the same stick in Detailer
- Manufacturing PDF: [HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1-GF-TIN-70.095.pdf](file:///Y:/(14) 2025 HYTEK PROJECTS/CORAL HOMES/HG250011 LOT 57 (5) NEVIS COURT D'AGUILAR/06 MANUFACTURING/02 DRAWINGS MANUFACTURING/01 LGS/SS 20250801/HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1-GF-TIN-70.095.pdf)
- Detailer project: [HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1.fcp](file:///Y:/(14) 2025 HYTEK PROJECTS/CORAL HOMES/HG250011 LOT 57 (5) NEVIS COURT D'AGUILAR/03 DETAILING/03 FRAMECAD DETAILER/HG250011 LOT 57 (5) NEVIS COURT D AGUILAR Rev 1.fcp)

### Codec emits (ops we generate)
```
  + Swage 357.9..398.9
```

### Detailer reference (ops missing from codec)
```
  - Chamfer @start
  - InnerDimple @99.5
  - InnerDimple @198.5
  - InnerDimple @281.5
  - LipNotch 77.0..122.0
  - InnerNotch 176.0..221.0
  - LipNotch 176.0..221.0
  - InnerNotch 259.0..304.0
  - LipNotch 259.0..304.0
  - Swage 289.7..396.9
  - Chamfer @end
```

---

## Sample 5: Long top plate with InnerNotch in body

**Job / plan / frame / stick:** `HG250085` / `GF-TIN-70.095` / `TN4-1` / `T4`
**Stick length:** 4189.8mm
**Matched ops:** 1, extras: 20, missing: 38

### My question
This 4190mm long top plate has an InnerNotch span 192..279 in the BODY (not at the ends). What triggers this — is it above an opening? At a king-stud crossing? At a plate joint? Where in this frame would I look to find the cause?

### Context
T4 is a 4190mm top chord on a TIN truss. Ref has the standard caps at 0..39 and 4151..4190, PLUS an InnerNotch span 192..279 sitting in the body. That second InnerNotch is what we need to understand — most long T plates have ONLY the cap notches; ~5% have a body notch like this. Looking for the geometric or structural trigger.

### Open the same stick in Detailer
- Manufacturing PDF: [—]((not available))
- Detailer project: [—]((not available))

### Codec emits (ops we generate)
```
  + InnerDimple @16.5
  + InnerDimple @2263.8
  + InnerDimple @2353.3
  + InnerDimple @2761.5
  + InnerDimple @3279.1
  + InnerDimple @3489.6
  + InnerDimple @3798.6
  + InnerDimple @4037.2
  + InnerDimple @4107.2
  + InnerDimple @4163.6
  + LipNotch 0.0..39.0
  + LipNotch 1881.3..1942.4
  + LipNotch 2330.8..2375.8
  + LipNotch 2439.2..2495.9
  + LipNotch 2898.9..2943.9
  + LipNotch 2999.8..3053.7
  + LipNotch 3467.1..3512.1
  + LipNotch 3560.6..3612.0
  + LipNotch 4014.7..4059.7
  + LipNotch 4084.7..4180.1
```

### Detailer reference (ops missing from codec)
```
  - Chamfer @start
  - InnerDimple @10.0
  - ScrewHoles @80.8
  - ScrewHoles @206.3
  - InnerDimple @211.5
  - ScrewHoles @248.0
  - InnerDimple @253.1
  - ScrewHoles @290.6
  - InnerDimple @295.7
  - ScrewHoles @341.5
  - ScrewHoles @560.1
  - ScrewHoles @602.2
  - InnerDimple @613.8
  - ScrewHoles @660.0
  - InnerDimple @665.1
  - InnerDimple @1190.7
  - InnerDimple @1242.0
  - InnerDimple @1767.6
  - InnerDimple @1818.9
  - InnerDimple @2344.5
  - InnerDimple @2395.8
  - InnerDimple @2972.7
  - InnerDimple @3498.3
  - InnerDimple @3549.5
  - InnerDimple @4054.4
  - InnerDimple @4105.6
  - InnerDimple @4176.7
  - Swage 0.0..114.5
  - LipNotch 185.0..315.1
  - InnerNotch 192.1..279.5
```

---
