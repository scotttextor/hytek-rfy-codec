/**
 * Synthesize an RFY from STRUCTURED frame data (with real 3D envelope and
 * stick coordinates) — bypasses the CSV intermediate that strips geometry.
 *
 * This is the path used by the framecad_import.xml → RFY pipeline. The
 * older CSV-only path (`synthesize-rfy-from-csv`) is preserved for callers
 * that don't have envelope data, but it cannot produce correct elevation
 * graphics (every stick collapses to y=0).
 *
 * Coordinate convention (matches FRAMECAD Detailer's RFY output, verified
 * 2026-04-30 against `Y:\(17) 2026 HYTEK PROJECTS\CORAL HOMES\HG260001
 * LOT 289 (29) COORA CRESENT CURRIMUNDI\06 MANUFACTURING\04 ROLLFORMER
 * FILES\Split_HG260001\HG260001_PK5-GF-LBW-70.075.rfy`):
 *
 *   World 3D:        x = horizontal, y = horizontal, z = up (vertical)
 *   Frame envelope:  4 vertices (V0..V3) of a planar rectangle, CCW from
 *                    bottom-left. V0 = bottom-left corner, V1 = bottom-right,
 *                    V2 = top-right, V3 = top-left.
 *   Frame-local 2D:  origin at V0, x along (V1-V0), y along (V3-V0).
 *
 * transformationmatrix is row-major with translation in row 4 (DirectX
 * row-vector form: world = local · M). Critically: ROWS hold the local
 * axes in world coords, NOT columns. (The mathematician's review caught
 * this — column form rotates every frame 90° on the rollformer.)
 */
import { encryptRfy } from "./crypto.js";
import { buildXml } from "./encode.js";
import { getMachineSetupForProfile, getDefaultMachineSetup, } from "./machine-setups.js";
const COPLANARITY_TOLERANCE_MM = 1.0;
const ORTHOGONALITY_TOLERANCE = 1e-6;
const STICK_PLANAR_TOLERANCE_MM = 1.0;
/**
 * Derive the frame's local 2D basis from its 4-vertex envelope.
 *
 * Steps:
 *   right = (V1 - V0).normalised
 *   up    = (V3 - V0) Gram-Schmidt'd against right, normalised
 *   normal = right × up  (right-handed)
 *
 * Validations (throw unless options.lenient):
 *   - V1 != V0, V3 != V0 (degenerate envelope)
 *   - V3 - V0 not parallel to right (would zero out 'up')
 *   - V2 ≈ V1 + (V3 - V0) within 1mm (envelope must be a planar parallelogram;
 *     in practice every Detailer envelope is a true rectangle with ‖right ⊥ up)
 */
export function deriveFrameBasis(envelope, lenient = false) {
    const [V0, V1, V2, V3] = envelope;
    const e1 = subtract(V1, V0);
    const e2raw = subtract(V3, V0);
    const widthRaw = magnitude(e1);
    const heightRaw = magnitude(e2raw);
    if (widthRaw < ORTHOGONALITY_TOLERANCE) {
        throw new Error(`Degenerate envelope: |V1-V0| = ${widthRaw.toExponential(2)}mm`);
    }
    if (heightRaw < ORTHOGONALITY_TOLERANCE) {
        throw new Error(`Degenerate envelope: |V3-V0| = ${heightRaw.toExponential(2)}mm`);
    }
    const right = scale(e1, 1 / widthRaw);
    // Gram-Schmidt: project out the component of e2 along right, then normalise.
    const e2alongRight = scale(right, dot(e2raw, right));
    const e2orth = subtract(e2raw, e2alongRight);
    const heightOrth = magnitude(e2orth);
    if (heightOrth < ORTHOGONALITY_TOLERANCE) {
        throw new Error(`Degenerate envelope: V3-V0 collinear with right axis`);
    }
    const up = scale(e2orth, 1 / heightOrth);
    const normal = cross(right, up);
    // Coplanarity: V2 must equal V1 + (V3 - V0) for a true parallelogram.
    const expectedV2 = add(V1, e2raw);
    const residual = magnitude(subtract(V2, expectedV2));
    if (residual > COPLANARITY_TOLERANCE_MM) {
        const msg = `Non-planar envelope: V2 deviates ${residual.toFixed(3)}mm from V1+(V3-V0)`;
        if (lenient)
            console.warn(msg);
        else
            throw new Error(msg);
    }
    return {
        origin: V0,
        right,
        up,
        normal,
        width: widthRaw,
        height: heightOrth, // use Gram-Schmidt'd height (= true elevation-y span)
    };
}
/** Project a world-3D point into the frame's local 2D elevation coordinates. */
export function projectToFrameLocal(p, basis) {
    const d = subtract(p, basis.origin);
    return { x: dot(d, basis.right), y: dot(d, basis.up) };
}
/**
 * Build the transformationmatrix string for a frame's basis.
 *
 * Convention (row-vector / DirectX, verified against Detailer L32 reference):
 *   row1 = (right.x, right.y, right.z, 0)     ← local +X axis in world
 *   row2 = (up.x,    up.y,    up.z,    0)     ← local +Y axis in world
 *   row3 = (normal.x,normal.y,normal.z,0)     ← local +Z axis in world
 *   row4 = (origin.x,origin.y,origin.z,1)     ← translation
 *
 * This is the matrix M such that  world = local · M  (row-vector multiplication).
 * Verified by decomposing Detailer's L32 matrix:
 *   right=(0,-1,0)  up=(0,0,1)  normal=(-1,0,0)  origin=(59147.54,20557.25,0)
 * → up is vertical (correct). Column form would give up=(-1,0,0) (wrong).
 */
export function transformationMatrixString(basis) {
    const fmt = (n) => formatFiveDecimal(n);
    const { right, up, normal, origin } = basis;
    return `((${fmt(right.x)},${fmt(right.y)},${fmt(right.z)},${fmt(0)}),` +
        `(${fmt(up.x)},${fmt(up.y)},${fmt(up.z)},${fmt(0)}),` +
        `(${fmt(normal.x)},${fmt(normal.y)},${fmt(normal.z)},${fmt(0)}),` +
        `(${fmt(origin.x)},${fmt(origin.y)},${fmt(origin.z)},${fmt(1)}))`;
}
/** Format with exactly 5 decimal places to match Detailer's "0.00000" / "59147.53906" style. */
function formatFiveDecimal(n) {
    // Use toFixed(5) and strip negative zero.
    let s = (Math.abs(n) < 1e-9 ? 0 : n).toFixed(5);
    if (s === "-0.00000")
        s = "0.00000";
    return s;
}
// ---------------------------------------------------------------------------
// Vector helpers (Vec3)
// ---------------------------------------------------------------------------
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function subtract(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function scale(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; }
function magnitude(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}
// ---------------------------------------------------------------------------
// Synthesize entry point
// ---------------------------------------------------------------------------
export function synthesizeRfyFromPlans(project, options = {}) {
    const projectName = options.projectName ?? project.name ?? "UNTITLED";
    const jobNum = options.jobNum ?? project.jobNum ?? projectName;
    const client = options.client ?? project.client ?? "";
    const date = options.date ?? project.date ?? new Date().toISOString().slice(0, 10);
    const projectGuid = deterministicGuid(`project:${projectName}:${jobNum}`);
    // Resolve machine setup. Auto-pick from first stick's profile web if not
    // explicitly provided. This drives every tooling tolerance: ChamferTolerance,
    // EndClearance, DimpleToEnd, BraceToDimple, etc.
    const firstStickWeb = project.plans?.[0]?.frames?.[0]?.sticks?.[0]?.profile?.web;
    const setup = options.machineSetup ??
        (firstStickWeb !== undefined ? getMachineSetupForProfile(firstStickWeb) : undefined) ??
        getDefaultMachineSetup();
    let planCount = 0;
    let frameCount = 0;
    let stickCount = 0;
    const planNodes = [];
    for (const plan of project.plans) {
        planCount++;
        const frameNodes = [];
        for (const frame of plan.frames) {
            frameCount++;
            let basis;
            try {
                basis = deriveFrameBasis(frame.envelope, options.lenient);
            }
            catch (e) {
                throw new Error(`Frame "${frame.name}": ${e.message}`);
            }
            const sticks = [];
            for (const stick of frame.sticks) {
                stickCount++;
                sticks.push(buildStickXml(stick, basis, frame.name, options.lenient ?? false));
            }
            const frameGuid = deterministicGuid(`frame:${plan.name}:${frame.name}`);
            const frameWeight = computeFrameWeight(frame.sticks);
            // Wall thickness in plan view = web depth of the first stick's profile
            // (assumes uniform profile per frame, which is the HYTEK norm).
            const wallThickness = frame.sticks[0]?.profile.web ?? 70;
            frameNodes.push({
                frame: [
                    { transformationmatrix: [{ "#text": transformationMatrixString(basis) }] },
                    buildFramePlanGraphicsWorld(frame.name, basis, wallThickness),
                    buildFrameElevationGraphicsLocal(frame.name, basis),
                    ...sticks,
                ],
                ":@": {
                    "@_name": frame.name,
                    "@_design_id": frameGuid,
                    "@_weight": String(Math.round(frameWeight * 1e10) / 1e10),
                    "@_length": String(roundN(basis.width, 4)),
                    "@_height": String(roundN(basis.height, 4)),
                },
            });
        }
        // Plan name: prefix with PK1- if not already PKn-prefixed (we don't split into multiple packs yet).
        const planName = /^PK\d+-/i.test(plan.name) ? plan.name : `PK1-${plan.name}`;
        const planGuid = deterministicGuid(`plan:${planName}`);
        planNodes.push({
            plan: [
                { elevation: [{ "#text": "0" }] },
                { "plan-graphics": [] },
                ...frameNodes,
            ],
            ":@": {
                "@_name": planName,
                "@_design_id": planGuid,
            },
        });
    }
    const xmlTree = [
        {
            schedule: [
                {
                    project: planNodes,
                    ":@": {
                        "@_name": projectName,
                        "@_design_id": projectGuid,
                        "@_client": client,
                        "@_jobnum": jobNum,
                        "@_date": date,
                    },
                },
            ],
            ":@": { "@_version": "2" },
        },
    ];
    const body = buildXml(xmlTree).replace(/^\s+/, "");
    const xml = `<?xml version="1.0" encoding="utf-8"?>\r\n` + body;
    const rfy = encryptRfy(xml);
    return { rfy, xml, planCount, frameCount, stickCount };
}
// ---------------------------------------------------------------------------
// Per-stick XML builders
// ---------------------------------------------------------------------------
function buildStickXml(stick, basis, frameName, lenient) {
    // Project to frame-local 2D
    const startL = projectToFrameLocal(stick.start, basis);
    const endL = projectToFrameLocal(stick.end, basis);
    // Stick length: 3D distance (preserve real length, not 2D projected length).
    const dirWorld = subtract(stick.end, stick.start);
    const len3D = magnitude(dirWorld);
    // Validate stick lies in the elevation plane (within tolerance).
    // Out-of-plane sticks would project to a too-short 2D line.
    const normalComponent = Math.abs(dot(dirWorld, basis.normal));
    if (normalComponent > STICK_PLANAR_TOLERANCE_MM) {
        const msg = `Stick "${frameName}/${stick.name}": ${normalComponent.toFixed(3)}mm out of frame's elevation plane`;
        if (!lenient)
            throw new Error(msg);
        console.warn(msg + " (continuing in lenient mode)");
    }
    // Thickness perpendicular to stick (visible width in elevation).
    //
    // Empirical rule (verified 2026-04-30 against PK5-DETAILER-RAW.xml):
    // Detailer ALWAYS uses the larger flange dimension, regardless of `flipped`.
    // Both L32/T1 (flipped=false, r_flange=41 → width 41) and L32/B1
    // (flipped=true, l_flange=38, r_flange=41 → width 41) confirm this.
    //
    // The math-agent's speculation that flipped selects between l_flange and
    // r_flange was not borne out by the data. If a future job has l_flange >
    // r_flange and exhibits a discrepancy, revisit this rule.
    const thickness = Math.max(stick.profile.lFlange, stick.profile.rFlange);
    const elevationGraphics = buildStickElevationGraphics(stick.name, startL, endL, thickness);
    const data3d = buildData3dStub(stick, startL, endL, thickness);
    const profile = buildProfileNode(stick);
    const tooling = buildToolingNode(stick.tooling);
    // Stick "type" attribute: Detailer schema only allows "stud" or "plate".
    // Plates = top/bottom plates only. Nogs/sills/braces/studs are all "stud".
    const stickType = inferStickType(stick.usage);
    // design_hash: deterministic placeholder. Detailer's real algorithm is
    // unknown — F300i doesn't validate it.
    const seed = `${stick.name}|${len3D}|${stick.profile.web}S${stick.profile.rFlange}|${stick.profile.gauge}|${stick.usage}`;
    const designHash = `${stableSha1(seed + ":1")}-${stableSha1(seed + ":2")}-${stableSha1(seed + ":3")}`;
    return {
        stick: [elevationGraphics, data3d, profile, tooling],
        ":@": {
            "@_name": stick.name,
            "@_design_hash": designHash,
            "@_length": String(roundN(len3D, 4)),
            "@_type": stickType,
            "@_flipped": stick.flipped ? "1" : "0",
        },
    };
}
/**
 * Build the stick's elevation-graphics with REAL projected coordinates.
 *
 * Outline is a rectangle of [stickLength × thickness], rotated to align with
 * the stick's 2D direction in the frame:
 *   - For a vertical stud: rectangle at x=stud_x ± thickness/2, y=stud_y..stud_y+length
 *   - For a horizontal plate: rectangle at x=plate_x..plate_x+length, y=plate_y ± thickness/2
 *   - For a diagonal brace: rotated rectangle aligned with the brace direction
 *
 * Corner order is CCW from the start-side near-corner (matching Detailer):
 *   c0 = startL + perp × half  (start-side, +perp side)
 *   c1 = endL   + perp × half  (end-side,   +perp side)
 *   c2 = endL   - perp × half  (end-side,   -perp side)
 *   c3 = startL - perp × half  (start-side, -perp side)
 */
function buildStickElevationGraphics(name, startL, endL, thickness) {
    const dx = endL.x - startL.x;
    const dy = endL.y - startL.y;
    const len2D = Math.hypot(dx, dy);
    // Degenerate (zero-length 2D) — emit a tiny rectangle to avoid NaN.
    // This shouldn't happen for in-plane sticks but is defensive.
    const safeLen = len2D > 1e-9 ? len2D : 1;
    const dirX = dx / safeLen;
    const dirY = dy / safeLen;
    // Perpendicular: 90° CCW rotation of the direction vector.
    const perpX = -dirY;
    const perpY = dirX;
    const half = thickness / 2;
    const corners = [
        { x: startL.x + perpX * half, y: startL.y + perpY * half },
        { x: endL.x + perpX * half, y: endL.y + perpY * half },
        { x: endL.x - perpX * half, y: endL.y - perpY * half },
        { x: startL.x - perpX * half, y: startL.y - perpY * half },
    ];
    const pts = corners.map(c => ({
        pt: [],
        ":@": { "@_x": roundN(c.x, 4).toFixed(4), "@_y": roundN(c.y, 4).toFixed(4) },
    }));
    // Mid-stick text (stick name) and end anchor circles — match Detailer's pattern.
    const midX = (startL.x + endL.x) / 2;
    const midY = (startL.y + endL.y) / 2;
    // For sticks with predominantly vertical 2D direction, rotate text 90° (matches Detailer S1).
    const textAngle = Math.abs(dirY) > Math.abs(dirX) ? "90" : "0";
    return {
        "elevation-graphics": [
            {
                poly: pts,
                ":@": {
                    "@_closed": "1",
                    "@_pencolor": "00000000",
                    "@_brushcolor": "00FFFFFF",
                    "@_penstyle": "psSolid",
                    "@_brushstyle": "bsClear",
                },
            },
            {
                text: [{ pt: [], ":@": { "@_x": roundN(midX, 4).toFixed(4), "@_y": roundN(midY, 4).toFixed(4) } }],
                ":@": {
                    "@_string": name,
                    "@_angle": textAngle,
                    "@_size": "60",
                    "@_fillbg": "1",
                    "@_pencolor": "00000000",
                    "@_brushcolor": "00FFFFFF",
                    "@_penstyle": "psSolid",
                    "@_brushstyle": "bsSolid",
                },
            },
            // Anchor circles at start and end — paired large+small (matches Detailer).
            ...buildAnchorCircles(startL.x + perpX * half, startL.y + perpY * half),
            ...buildAnchorCircles(endL.x + perpX * half, endL.y + perpY * half),
        ],
    };
}
function buildAnchorCircles(x, y) {
    const fmt = (n) => roundN(n, 4).toFixed(4);
    return [
        {
            circle: [{ pt: [], ":@": { "@_x": fmt(x), "@_y": fmt(y) } }],
            ":@": {
                "@_radius": "5",
                "@_pencolor": "00000000",
                "@_brushcolor": "00FFFFFF",
                "@_penstyle": "psSolid",
                "@_brushstyle": "bsClear",
            },
        },
        {
            circle: [{ pt: [], ":@": { "@_x": fmt(x), "@_y": fmt(y) } }],
            ":@": {
                "@_radius": "1.9",
                "@_pencolor": "00000000",
                "@_brushcolor": "00FFFFFF",
                "@_penstyle": "psSolid",
                "@_brushstyle": "bsClear",
            },
        },
    ];
}
/**
 * Stub data3d mesh for the stick. Detailer emits a real C-section extrusion
 * in frame-local 3D, but the F300i firmware does not use data3d for cutting
 * (verified — our pre-fix files cut correctly when loaded). Shape doesn't
 * matter, presence does. We emit a 24-vertex / 60-tri-index placeholder
 * scaled to the stick's bounding box so it at least matches expected size.
 */
function buildData3dStub(stick, startL, endL, thickness) {
    const dx = endL.x - startL.x;
    const dy = endL.y - startL.y;
    const len2D = Math.hypot(dx, dy);
    const safeLen = len2D > 1e-9 ? len2D : 1;
    // Cross-section: a simple rectangle 41x70 (flange × web).
    // Local axis: y runs along stick length, x and z form cross-section.
    const w = stick.profile.web;
    const f = thickness;
    const cs = [
        [0, 0], [f, 0], [f, -w], [0, -w], // 4 outer corners
        [0.75, -0.75], [f - 0.75, -0.75], // 2 inner top
        [f - 0.75, -(w - 0.75)], [0.75, -(w - 0.75)], // 2 inner bot
        [0, -10], [f, -10], // 2 mid-points (just to hit 12 verts)
        [f / 2, -w / 4], [f / 2, -3 * w / 4],
    ];
    const vertices = [];
    for (const yEnd of [0, safeLen]) {
        for (const [x, z] of cs) {
            vertices.push({
                vertex: [
                    { x: [{ "#text": String(roundN(x, 4)) }] },
                    { y: [{ "#text": String(roundN(yEnd, 4)) }] },
                    { z: [{ "#text": String(roundN(z, 4)) }] },
                ],
            });
        }
    }
    const tris = [];
    for (let i = 0; i < 12; i++) {
        const a = i, b = (i + 1) % 12;
        const c2 = b + 12, d = a + 12;
        tris.push(a, b, c2, c2, d, a);
    }
    return {
        data3d: [
            { vertices },
            { triangles: [{ "#text": tris.join(",") }] },
        ],
    };
}
function buildProfileNode(stick) {
    const p = stick.profile;
    // Imperial label: web ≈ 1/100 inch, same for flange. Detailer convention.
    const imperialWeb = Math.round(p.web * 3.937);
    const imperialFlange = Math.round(p.rFlange * 3.937);
    const imperialLabel = `${imperialWeb} ${p.shape || "S"} ${imperialFlange}`;
    const metricLabel = `${p.web} ${p.shape || "S"} ${p.rFlange}`;
    return {
        profile: [
            { shape: [{ "#text": p.shape || "S" }] },
            { web: [{ "#text": String(p.web) }] },
            { "l-flange": [{ "#text": String(p.lFlange) }] },
            { "r-flange": [{ "#text": String(p.rFlange) }] },
            { lip: [{ "#text": String(p.rLip || p.lLip || 12) }] },
        ],
        ":@": {
            "@_metric-label": metricLabel,
            "@_imperial-label": imperialLabel,
            "@_gauge": p.gauge,
            "@_yield": "550",
            "@_machine-series": "F300i",
        },
    };
}
function buildToolingNode(ops) {
    const children = [];
    for (const op of ops) {
        switch (op.kind) {
            case "start":
                children.push({ "start-tool": [], ":@": { "@_type": op.type } });
                break;
            case "end":
                children.push({ "end-tool": [], ":@": { "@_type": op.type } });
                break;
            case "point":
                children.push({ "point-tool": [], ":@": { "@_type": op.type, "@_pos": String(op.pos) } });
                break;
            case "spanned":
                children.push({
                    "spanned-tool": [],
                    ":@": { "@_type": op.type, "@_start-pos": String(op.startPos), "@_end-pos": String(op.endPos) },
                });
                break;
        }
    }
    return { tooling: children };
}
// ---------------------------------------------------------------------------
// Frame-level graphics
// ---------------------------------------------------------------------------
/**
 * Frame plan-graphics — drawn in WORLD coords, shows the wall's footprint
 * in the building floor plan view.
 *
 * Detailer convention (verified against L32 reference):
 *   - Closed poly: 4 corners forming the wall's plan footprint
 *     (length × wall_thickness, where wall_thickness = web depth)
 *   - Wall extends in the -normal direction (into the wall body, away from
 *     the visible elevation face)
 *   - Filled gray (brushcolor 00C0C0C0)
 *   - Text label with frame name, rotated to match wall orientation
 */
function buildFramePlanGraphicsWorld(name, basis, wallThickness) {
    const fmt = (n) => roundN(n, 4).toFixed(4);
    const { origin, right, normal, width } = basis;
    // 4 corners in world coords (we drop Z — plan view is X-Y).
    const c0 = origin;
    const c1 = add(origin, scale(right, width));
    // Wall thickness extends in -normal direction.
    const c2 = subtract(c1, scale(normal, wallThickness));
    const c3 = subtract(c0, scale(normal, wallThickness));
    // Text label position: midpoint of the wall, offset slightly outward (-normal direction).
    const textPos = subtract(add(origin, scale(right, width / 2)), scale(normal, wallThickness / 2));
    // Text rotation: angle of right axis in X-Y plane.
    const textAngle = Math.round(Math.atan2(right.y, right.x) * 180 / Math.PI);
    return {
        "plan-graphics": [
            {
                poly: [
                    { pt: [], ":@": { "@_x": fmt(c0.x), "@_y": fmt(c0.y) } },
                    { pt: [], ":@": { "@_x": fmt(c1.x), "@_y": fmt(c1.y) } },
                    { pt: [], ":@": { "@_x": fmt(c2.x), "@_y": fmt(c2.y) } },
                    { pt: [], ":@": { "@_x": fmt(c3.x), "@_y": fmt(c3.y) } },
                ],
                ":@": {
                    "@_closed": "1",
                    "@_pencolor": "00000000",
                    "@_brushcolor": "00C0C0C0",
                    "@_penstyle": "psSolid",
                    "@_brushstyle": "bsSolid",
                },
            },
            {
                text: [{ pt: [], ":@": { "@_x": fmt(textPos.x), "@_y": fmt(textPos.y) } }],
                ":@": {
                    "@_string": name,
                    "@_angle": String(textAngle),
                    "@_size": "200",
                    "@_fillbg": "0",
                    "@_pencolor": "00000000",
                    "@_brushcolor": "00FFFFFF",
                    "@_penstyle": "psSolid",
                    "@_brushstyle": "bsClear",
                },
            },
        ],
    };
}
/**
 * Frame elevation-graphics — frame-local rectangle outlining the wall's
 * elevation. Drawn in frame-local 2D coords (origin at V0).
 *
 * Note: Detailer also emits decorative X-marks and gauge labels here, but
 * the F300i renders correctly without them. Defer to v2.
 */
function buildFrameElevationGraphicsLocal(name, basis) {
    const fmt = (n) => roundN(n, 4).toFixed(4);
    return {
        "elevation-graphics": [
            {
                poly: [
                    { pt: [], ":@": { "@_x": "0.0000", "@_y": "0.0000" } },
                    { pt: [], ":@": { "@_x": fmt(basis.width), "@_y": "0.0000" } },
                    { pt: [], ":@": { "@_x": fmt(basis.width), "@_y": fmt(basis.height) } },
                    { pt: [], ":@": { "@_x": "0.0000", "@_y": fmt(basis.height) } },
                ],
                ":@": {
                    "@_closed": "1",
                    "@_pencolor": "00000000",
                    "@_brushcolor": "00FFFFFF",
                    "@_penstyle": "psSolid",
                    "@_brushstyle": "bsClear",
                },
            },
            {
                text: [{ pt: [], ":@": { "@_x": fmt(basis.width / 2), "@_y": fmt(basis.height / 2) } }],
                ":@": {
                    "@_string": name,
                    "@_angle": "0",
                    "@_size": "200",
                    "@_fillbg": "0",
                    "@_pencolor": "00000000",
                    "@_brushcolor": "00FFFFFF",
                    "@_penstyle": "psSolid",
                    "@_brushstyle": "bsClear",
                },
            },
        ],
    };
}
// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------
function inferStickType(usage) {
    // Detailer schema: "plate" = top/bottom plates only. Nogs/sills/braces/studs are "stud".
    const u = usage.toLowerCase();
    if (u === "topplate" || u === "bottomplate" || u === "headplate" || u === "head")
        return "plate";
    return "stud";
}
function computeFrameWeight(sticks) {
    let total = 0;
    for (const s of sticks) {
        const len3D = magnitude(subtract(s.end, s.start));
        const gauge = parseFloat(s.profile.gauge) || 0.75;
        // Approximate cross-section perimeter: web + 2 flanges + 2 lips
        const perimeter = s.profile.web + s.profile.lFlange + s.profile.rFlange + (s.profile.lLip || 12) + (s.profile.rLip || 12);
        const massPerMm = perimeter * gauge * 7.85e-6; // kg per mm of stick
        total += len3D * massPerMm;
    }
    return total;
}
function roundN(n, decimals) {
    const f = 10 ** decimals;
    return Math.round(n * f) / f;
}
/** Deterministic v4-style GUID from a seed. */
function deterministicGuid(seed) {
    const bytes = new Uint8Array(16);
    let h1 = 0x811c9dc5, h2 = 0xdeadbeef, h3 = 0x9e3779b1, h4 = 0x85ebca6b;
    for (const ch of seed) {
        const c = ch.charCodeAt(0);
        h1 = ((h1 ^ c) * 0x01000193) >>> 0;
        h2 = ((h2 ^ c) * 0xa3ffd6ad) >>> 0;
        h3 = ((h3 ^ c) * 0x9e3779b1) >>> 0;
        h4 = ((h4 ^ c) * 0xc2b2ae35) >>> 0;
    }
    const u32 = [h1, h2, h3, h4];
    for (let i = 0; i < 4; i++) {
        bytes[i * 4] = (u32[i] >>> 24) & 0xff;
        bytes[i * 4 + 1] = (u32[i] >>> 16) & 0xff;
        bytes[i * 4 + 2] = (u32[i] >>> 8) & 0xff;
        bytes[i * 4 + 3] = (u32[i]) & 0xff;
    }
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0").toUpperCase()).join("");
    return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}}`;
}
/** 40-char SHA-1-style digest deterministic from seed. */
function stableSha1(seed) {
    let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476, e = 0xc3d2e1f0;
    for (const ch of seed) {
        const k = ch.charCodeAt(0);
        a = ((a ^ k) * 0x85ebca6b) >>> 0;
        b = ((b ^ k) * 0xc2b2ae35) >>> 0;
        c = ((c ^ k) * 0x9e3779b1) >>> 0;
        d = ((d ^ k) * 0x6a09e667) >>> 0;
        e = ((e ^ k) * 0xbb67ae85) >>> 0;
        [a, b, c, d, e] = [b, c, d, e, a];
    }
    const hex = (n) => n.toString(16).padStart(8, "0").toUpperCase();
    return (hex(a) + hex(b) + hex(c) + hex(d) + hex(e)).slice(0, 40);
}
