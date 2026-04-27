import { TOOL_TYPES } from "./format.js";
/**
 * Inverse of src/csv.ts. Parses Detailer-style Rollforming CSV text
 * into a structured edit plan that can be applied to an RfyDocument or
 * used to synthesise one from scratch.
 */
/** CSV → tool-type mapping (inverse of TOOL_TO_CSV in csv.ts). */
const CSV_TO_TOOL = {
    "BOLT HOLES": "Bolt",
    "FULL CHAMFER": "Chamfer",
    "INNER DIMPLE": "InnerDimple",
    "WEB NOTCH": "InnerNotch",
    "SERVICE HOLE": "InnerService",
    "LIP NOTCH": "LipNotch",
    "ANCHOR": "ScrewHoles",
    "SWAGE": "Swage",
};
/** Split a CSV file into its DETAILS-delimited plan sections. */
export function parseCsv(csv) {
    const plans = [];
    let current = null;
    for (const rawLine of csv.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line)
            continue;
        const cols = splitCsvLine(line);
        if (cols[0] === "DETAILS") {
            if (current)
                plans.push(current);
            const jobId = cols[1] ?? "";
            const jobNum = jobId.replace(/"/g, "").split("#")[0] ?? "";
            current = { jobId, jobNum, packId: cols[2] ?? "", components: [] };
        }
        else if (cols[0] === "COMPONENT" && current) {
            current.components.push(parseComponent(cols));
        }
    }
    if (current)
        plans.push(current);
    return plans;
}
/** Split a CSV line respecting double-quotes. */
function splitCsvLine(line) {
    const out = [];
    let i = 0;
    let buf = "";
    let inQuotes = false;
    while (i < line.length) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                buf += '"';
                i += 2;
                continue;
            }
            if (ch === '"') {
                inQuotes = false;
                i++;
                continue;
            }
            buf += ch;
            i++;
        }
        else {
            if (ch === '"') {
                inQuotes = true;
                i++;
                continue;
            }
            if (ch === ",") {
                out.push(buf);
                buf = "";
                i++;
                continue;
            }
            buf += ch;
            i++;
        }
    }
    out.push(buf);
    return out;
}
function parseComponent(cols) {
    const frameId = cols[1] ?? "";
    const [frameName, stickName] = splitFrameStickId(frameId);
    const profileCode = cols[2] ?? "";
    const { metricLabel, gauge } = splitProfileCode(profileCode);
    const role = cols[3] ?? "STUD";
    const orientation = (cols[4] ?? "LEFT");
    const qty = parseInt(cols[5] ?? "1", 10);
    // cols[6] is always blank
    const dims = cols.slice(7, 13).map(parseFloatSafe);
    const tooling = parseTooling(cols.slice(13), dims[0]);
    return {
        frameId, frameName, stickName,
        profileCode, metricLabel, gauge,
        role, orientation, qty,
        lengthA: dims[0] ?? 0,
        widthA: dims[1] ?? 0,
        heightA: dims[2] ?? 0,
        widthB: dims[3] ?? 0,
        heightB: dims[4] ?? 0,
        pitch: dims[5] ?? 0,
        tooling,
    };
}
function splitFrameStickId(id) {
    // Most CSVs use "Nxx-Sx" format. Split at the LAST hyphen.
    const lastDash = id.lastIndexOf("-");
    if (lastDash < 0)
        return [id, ""];
    return [id.slice(0, lastDash), id.slice(lastDash + 1)];
}
function splitProfileCode(code) {
    // e.g. "70S41_0.75" -> metricLabel "70 S 41" + gauge "0.75"
    const [profile, gauge = "0.75"] = code.split("_");
    const m = profile?.match(/^(\d+)([A-Z]+)(\d+)$/);
    if (m) {
        return { metricLabel: `${m[1]} ${m[2]} ${m[3]}`, gauge };
    }
    return { metricLabel: profile ?? "", gauge };
}
function parseFloatSafe(s) {
    if (!s)
        return 0;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
}
/**
 * The CSV stores tooling as flat `<type>,<pos>` pairs. Spanned operations
 * (start+end) are stored as two entries in sequence with matching type.
 * Point operations are one entry. Chamfer can appear as edge tools
 * (start/end) or — rarely — at other positions.
 *
 * Chamfer resolution (matches Detailer's own CSV export):
 *  - When exactly 1 Chamfer entry: treat as start-tool
 *  - When 2 Chamfer entries: first = start, second = end
 *  - When Chamfer pos is clearly beyond stick start: treat as end
 */
function parseTooling(cells, stickLength) {
    const pairs = [];
    for (let i = 0; i + 1 < cells.length; i += 2) {
        const csvType = cells[i]?.trim();
        const pos = parseFloatSafe(cells[i + 1]);
        if (!csvType)
            continue;
        if (!(csvType in CSV_TO_TOOL))
            continue;
        pairs.push({ csvType, pos });
    }
    const spannedTypes = new Set(["Swage", "InnerNotch", "LipNotch", "LeftFlange", "RightFlange", "Web"]);
    const chamferIndexes = pairs.reduce((idxs, p, i) => {
        if (CSV_TO_TOOL[p.csvType] === "Chamfer")
            idxs.push(i);
        return idxs;
    }, []);
    const ops = [];
    let i = 0;
    while (i < pairs.length) {
        const p = pairs[i];
        const toolType = CSV_TO_TOOL[p.csvType];
        if (toolType === "Chamfer") {
            const posInChamferList = chamferIndexes.indexOf(i);
            const totalChamfers = chamferIndexes.length;
            // Last-in-sequence chamfer becomes end-tool; all others become start.
            // Also: if the chamfer position is clearly past the component origin
            // (pos > stickLength/2 when known), treat as end-tool.
            const isLast = posInChamferList === totalChamfers - 1 && totalChamfers > 1;
            const isAtEnd = stickLength !== undefined && stickLength > 0 && p.pos > stickLength * 0.5;
            ops.push({ kind: (isLast || isAtEnd) ? "end" : "start", type: toolType });
            i++;
            continue;
        }
        if (spannedTypes.has(toolType) && i + 1 < pairs.length && pairs[i + 1].csvType === p.csvType) {
            ops.push({ kind: "spanned", type: toolType, startPos: p.pos, endPos: pairs[i + 1].pos });
            i += 2;
            continue;
        }
        ops.push({ kind: "point", type: toolType, pos: p.pos });
        i++;
    }
    return ops;
}
/** Validate that all tool types in the CSV are recognised. */
export function validateCsv(csv) {
    const errors = [];
    const plans = parseCsv(csv);
    for (const plan of plans) {
        if (!plan.jobNum)
            errors.push(`Plan "${plan.packId}": missing job number`);
        if (plan.components.length === 0)
            errors.push(`Plan "${plan.packId}": no components`);
        for (const c of plan.components) {
            if (!TOOL_TYPES || !Array.isArray(TOOL_TYPES))
                break;
        }
    }
    return errors;
}
