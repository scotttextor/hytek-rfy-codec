import { describe, it, expect } from "vitest";

import {
  getActionSection,
  listSectionNames,
  preloadActionDefs,
  KNOWN_CONDITIONS,
  KNOWN_VERBS,
} from "./action-defs.js";

describe("action-defs.ts — loader", () => {
  it("loads the JSON file", () => {
    const defs = preloadActionDefs();
    expect(defs).toBeDefined();
    expect(defs.sections).toBeDefined();
  });

  it("exposes 27 sections (matches classifier minus 'None')", () => {
    const names = listSectionNames();
    expect(names.length).toBe(27);
  });

  it("returns undefined for the 'None' sentinel", () => {
    expect(getActionSection("None")).toBeUndefined();
  });

  it("returns a section for OnFlat - Standard", () => {
    const s = getActionSection("OnFlat - Standard");
    expect(s).toBeDefined();
    expect(s!.slot_count).toBe(16);
    expect(s!.slots.length).toBe(16);
  });

  it("returns a section for OnEdge - LipNotchedStandard", () => {
    const s = getActionSection("OnEdge - LipNotchedStandard");
    expect(s).toBeDefined();
    expect(s!.slots[0]).toBeDefined();
    // Slot 0 raw string starts with "ee:null@wend-wend"
    expect(s!.slots[0]!.raw).toMatch(/ee:null@wend-wend/);
  });

  it("returns a section for OnFlat - DualTrack PlateToStud", () => {
    const s = getActionSection("OnFlat - DualTrack PlateToStud");
    expect(s).toBeDefined();
  });

  it("alternatives are parsed into structured records", () => {
    const s = getActionSection("OnEdge - LipNotchedStandard")!;
    const slot0 = s.slots[0]!;
    expect(slot0.alternatives.length).toBeGreaterThan(0);
    const first = slot0.alternatives[0]!;
    expect(first.conditions).toEqual(["ee"]);
    expect(first.ops.length).toBe(1);
    expect(first.ops[0]!.action).toBe("null");
    expect(first.ops[0]!.src).toBe("wend");
    expect(first.ops[0]!.dst).toBe("wend");
    expect(first.ops[0]!.rel).toBe("-");
  });

  it("'>' relation parsed correctly", () => {
    const s = getActionSection("OnEdge - LipNotchedStandard")!;
    // OnEdge - LipNotchedStandard slot 1 has "lipnotch@ll_rf>lend"
    const found = s.slots
      .flatMap((sl) => sl.alternatives)
      .flatMap((a) => a.ops)
      .find((op) => op.rel === ">");
    expect(found).toBeDefined();
  });

  it("KNOWN_CONDITIONS contains the 21 mined tokens", () => {
    expect(KNOWN_CONDITIONS.size).toBe(21);
    expect(KNOWN_CONDITIONS.has("ee")).toBe(true);
    expect(KNOWN_CONDITIONS.has("box_l")).toBe(true);
    expect(KNOWN_CONDITIONS.has("t_tchord")).toBe(true);
  });

  it("KNOWN_VERBS contains the 15 mined verbs", () => {
    // 15 verbs as documented in action-defs.json _meta.actions
    expect(KNOWN_VERBS.size).toBe(15);
    expect(KNOWN_VERBS.has("lipnotch")).toBe(true);
    expect(KNOWN_VERBS.has("swage")).toBe(true);
    expect(KNOWN_VERBS.has("WebTabHoles")).toBe(true);
  });

  it("loader is idempotent (singleton-cached)", () => {
    const a = preloadActionDefs();
    const b = preloadActionDefs();
    expect(a).toBe(b);
  });
});
