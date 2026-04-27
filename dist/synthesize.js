import { encryptRfy } from "./crypto.js";
import { buildXml } from "./encode.js";
import { parseCsv } from "./csv-parse.js";
export function synthesizeRfyFromCsv(csv, options = {}) {
    const csvPlans = parseCsv(csv);
    if (csvPlans.length === 0)
        throw new Error("No DETAILS/plan rows found in CSV");
    const projectName = options.projectName ?? csvPlans[0].jobNum.replace(/^"\s*|\s*"$/g, "").trim() ?? "UNTITLED";
    const jobNum = options.jobNum ?? projectName;
    const client = options.client ?? "";
    const date = options.date ?? new Date().toISOString().slice(0, 10);
    const byPack = new Map();
    for (const p of csvPlans) {
        const arr = byPack.get(p.packId) ?? [];
        arr.push(p);
        byPack.set(p.packId, arr);
    }
    let planCount = 0;
    let frameCount = 0;
    let stickCount = 0;
    const planNodes = [];
    for (const [packId, packPlans] of byPack) {
        planCount++;
        // Combine all DETAILS sections with the same packId into one <plan>, one frame per DETAILS block.
        const frameNodes = [];
        for (const plan of packPlans) {
            // Group this plan's components by frameName
            const byFrame = new Map();
            for (const c of plan.components) {
                if (c.role === "FILLER" || c.stickName.toUpperCase().startsWith("FIL"))
                    continue;
                const arr = byFrame.get(c.frameName) ?? [];
                arr.push(c);
                byFrame.set(c.frameName, arr);
            }
            for (const [frameName, comps] of byFrame) {
                frameCount++;
                const sticks = [];
                for (const c of comps) {
                    stickCount++;
                    sticks.push(buildStickNode(c));
                }
                frameNodes.push({
                    frame: sticks,
                    ":@": {
                        "@_name": frameName,
                        "@_weight": "0",
                        "@_length": String(Math.max(...comps.map(c => c.lengthA), 0)),
                        "@_height": "0",
                    },
                });
            }
        }
        planNodes.push({
            plan: [
                { elevation: [{ "#text": "0" }] },
                ...frameNodes,
            ],
            ":@": { "@_name": packId },
        });
    }
    const xmlTree = [
        {
            schedule: [
                {
                    project: planNodes,
                    ":@": {
                        "@_name": projectName,
                        "@_jobnum": jobNum,
                        "@_client": client,
                        "@_date": date,
                    },
                },
            ],
            ":@": { "@_version": "2" },
        },
    ];
    // Detailer emits a UTF-8 BOM + <?xml?> prolog; we prepend the prolog manually
    // since fast-xml-parser's builder doesn't round-trip PI nodes cleanly here.
    const xml = `<?xml version="1.0" encoding="utf-8"?>\r\n` + buildXml(xmlTree);
    const rfy = encryptRfy(xml);
    return { rfy, xml, planCount, frameCount, stickCount };
}
function buildStickNode(c) {
    const stickType = inferStickType(c.role);
    const elevationGraphics = buildElevationGraphics(c);
    const profile = buildProfileNode(c);
    const tooling = buildToolingNode(c.tooling);
    return {
        stick: [elevationGraphics, profile, tooling],
        ":@": {
            "@_name": c.stickName,
            "@_length": String(c.lengthA),
            "@_type": stickType,
            "@_flipped": c.orientation === "RIGHT" ? "1" : "0",
        },
    };
}
/**
 * Reconstruct the stick's elevation outline polygon from the CSV's 6
 * dimension columns — (length, startX, startY, endX, endY, thickness) —
 * which describe the midline and cross-section thickness. We compute
 * the 4 corner points by offsetting start and end perpendicularly by
 * thickness/2.
 *
 * This gives the decoded RfyStick.outlineCorners a shape consistent
 * with the original Detailer RFY, so round-trip through this codec
 * produces byte-correct dimension columns.
 */
function buildElevationGraphics(c) {
    // CsvComponent's 6 dim columns:
    //   widthA = startX, heightA = startY, widthB = endX, heightB = endY, pitch = thickness
    const startX = c.widthA;
    const startY = c.heightA;
    const endX = c.widthB;
    const endY = c.heightB;
    const thickness = c.pitch;
    // Direction vector along the midline
    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular unit vector (rotated 90° CCW), scaled to thickness/2
    const px = (-dy / len) * (thickness / 2);
    const py = (dx / len) * (thickness / 2);
    const corners = [
        { x: startX + px, y: startY + py },
        { x: endX + px, y: endY + py },
        { x: endX - px, y: endY - py },
        { x: startX - px, y: startY - py },
    ];
    const pts = corners.map(c => ({
        pt: [],
        ":@": { "@_x": c.x.toFixed(4), "@_y": c.y.toFixed(4) },
    }));
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
        ],
    };
}
function inferStickType(role) {
    // Plates = TOPPLATE / BOTTOMPLATE. Everything else (STUD / NOG / BRACE /
    // TOPCHORD / BOTTOMCHORD / WEB / FILLER) is "stud" in the XML schema.
    return /PLATE/i.test(role) ? "plate" : "stud";
}
function buildProfileNode(c) {
    const shape = c.metricLabel.match(/[A-Z]+/)?.[0] ?? "S";
    const webVal = parseWebFromMetricLabel(c.metricLabel);
    const lFlangeVal = parseLFlangeFromMetricLabel(c.metricLabel);
    return {
        profile: [
            { shape: [{ "#text": shape }] },
            { web: [{ "#text": String(webVal) }] },
            { "l-flange": [{ "#text": String(lFlangeVal) }] },
            { "r-flange": [{ "#text": String(Math.max(lFlangeVal - 3, 0)) }] },
            { lip: [{ "#text": "12" }] },
        ],
        ":@": {
            "@_metric-label": c.metricLabel,
            "@_gauge": c.gauge,
        },
    };
}
function parseWebFromMetricLabel(label) {
    // "70 S 41" -> 70; "89 S 41" -> 89
    const m = label.match(/^(\d+)\s/);
    return m ? parseInt(m[1], 10) : 70;
}
function parseLFlangeFromMetricLabel(label) {
    // "70 S 41" -> 41
    const m = label.match(/\s(\d+)$/);
    return m ? parseInt(m[1], 10) : 41;
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
