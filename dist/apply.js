import { decryptRfy, encryptRfy } from "./crypto.js";
import { parseXmlTree, buildXml } from "./encode.js";
import { parseCsv } from "./csv-parse.js";
export function applyCsvToRfy(seedRfy, csv, iv) {
    const xml = decryptRfy(seedRfy);
    const tree = parseXmlTree(xml);
    const plans = parseCsv(csv);
    const unmatchedComponents = [];
    let touched = 0;
    for (const csvPlan of plans) {
        const planNode = findChildByNameAttr(findRoot(tree, "schedule"), "plan", csvPlan.packId)
            ?? findPlanInProject(tree, csvPlan.packId);
        if (!planNode) {
            for (const c of csvPlan.components)
                unmatchedComponents.push(`${csvPlan.packId}:${c.frameName}:${c.stickName}`);
            continue;
        }
        const planChildren = childArray(planNode, "plan");
        for (const csvComp of csvPlan.components) {
            // FILLER rows are synthesised by Detailer's CSV exporter — they
            // don't correspond to a <stick> in the RFY XML. Skip silently.
            if (csvComp.role === "FILLER" || csvComp.stickName.toUpperCase().startsWith("FIL"))
                continue;
            const frameNode = findChildByNameAttr(planChildren, "frame", csvComp.frameName);
            if (!frameNode) {
                unmatchedComponents.push(`${csvPlan.packId}:${csvComp.frameName}:${csvComp.stickName}`);
                continue;
            }
            const frameChildren = childArray(frameNode, "frame");
            const stickNode = findChildByNameAttr(frameChildren, "stick", csvComp.stickName);
            if (!stickNode) {
                unmatchedComponents.push(`${csvPlan.packId}:${csvComp.frameName}:${csvComp.stickName}`);
                continue;
            }
            updateStickInPlace(stickNode, csvComp);
            touched++;
        }
    }
    const newXml = buildXml(tree);
    const rfy = encryptRfy(newXml, iv ?? seedRfy.subarray(0, 16));
    return { rfy, unmatchedComponents, touched };
}
// ---------- tree helpers ----------
/** Find the root element matching tag name (e.g. "schedule"). */
function findRoot(tree, tag) {
    for (const node of tree) {
        if (Object.prototype.hasOwnProperty.call(node, tag)) {
            return node[tag];
        }
    }
    return [];
}
/** For a node whose tag-value is an array, return the children array. */
function childArray(node, tag) {
    const v = node[tag];
    return Array.isArray(v) ? v : [];
}
/** Look through an array of sibling nodes for one whose tag matches AND whose attribute @_name equals value. */
function findChildByNameAttr(siblings, tag, nameValue) {
    for (const sib of siblings) {
        if (Object.prototype.hasOwnProperty.call(sib, tag)) {
            const attrs = sib[":@"];
            if (attrs && attrs["@_name"] === nameValue)
                return sib;
        }
    }
    return null;
}
/** schedule > project > plan path — handle the two-level case when top-level search missed. */
function findPlanInProject(tree, planName) {
    const schedule = findRoot(tree, "schedule");
    for (const s of schedule) {
        if (Object.prototype.hasOwnProperty.call(s, "project")) {
            const project = s["project"];
            return findChildByNameAttr(project, "plan", planName);
        }
    }
    return null;
}
/** Overwrite a stick's <profile> and <tooling> children with CSV-derived values. */
function updateStickInPlace(stickNode, csv) {
    const kids = childArray(stickNode, "stick");
    // Update stick's own attributes (length, type, flipped)
    const stickAttrs = stickNode[":@"] ?? {};
    stickAttrs["@_length"] = String(csv.lengthA);
    stickAttrs["@_flipped"] = csv.orientation === "RIGHT" ? "1" : "0";
    stickNode[":@"] = stickAttrs;
    // Replace <profile>
    const profileIdx = kids.findIndex(k => Object.prototype.hasOwnProperty.call(k, "profile"));
    const newProfile = buildProfileNode(csv);
    if (profileIdx >= 0)
        kids[profileIdx] = newProfile;
    else
        kids.push(newProfile);
    // Replace <tooling>
    const toolingIdx = kids.findIndex(k => Object.prototype.hasOwnProperty.call(k, "tooling"));
    const newTooling = buildToolingNode(csv.tooling);
    if (toolingIdx >= 0)
        kids[toolingIdx] = newTooling;
    else
        kids.push(newTooling);
}
function buildProfileNode(csv) {
    return {
        profile: [
            { shape: [{ "#text": csv.metricLabel.match(/[A-Z]+/)?.[0] ?? "S" }] },
            { web: [{ "#text": String(csv.pitch) }] },
            { "l-flange": [{ "#text": String(csv.widthA) }] },
            { "r-flange": [{ "#text": String(csv.widthB) }] },
            { lip: [{ "#text": "12" }] },
        ],
        ":@": {
            "@_metric-label": csv.metricLabel,
            "@_gauge": csv.gauge,
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
