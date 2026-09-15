import { describe, it, expect } from "vitest";
import {
  BASE_ASSET_FOLDER,
  baseFieldProblem,
  baseImpactText,
  effectiveDesign,
  isBaseAsset,
  savableBases,
  summarizeBases,
  type BaseDesign,
  type BaseKind,
} from "./bases";
import { DEFAULT_STYLE, emptyDesign, type Design, type TextElement } from "./design";

const withField = (field: string): Design => {
  const el: TextElement = {
    id: "t1",
    name: "Body",
    type: "text",
    x: 10,
    y: 40,
    w: 80,
    h: 10,
    locked: false,
    hidden: false,
    align: "center",
    lineHeight: 1.2,
    fit: "wrap",
    paragraphs: [
      {
        runs: [
          { kind: "text", text: "Awarded to ", style: DEFAULT_STYLE },
          { kind: "field", field, transform: "none", style: DEFAULT_STYLE },
        ],
      },
    ],
  };
  return { ...emptyDesign(), elements: [el] };
};

const base = (kind: BaseKind, design: Design): BaseDesign => ({
  kind,
  design,
  sourceEventTitle: "Hack Night",
  updatedAt: "2026-09-12T10:00:00Z",
});

describe("effectiveDesign", () => {
  const custom = withField("person.name");
  const shared = withField("event.title");
  const bases = new Map<BaseKind, BaseDesign>([["participants", base("participants", shared)]]);

  it("uses the group's own design once it is customised", () => {
    expect(effectiveDesign({ customDesign: custom, baseKind: "participants" }, bases)).toBe(custom);
  });
  it("uses the base while the group follows it", () => {
    expect(effectiveDesign({ customDesign: null, baseKind: "participants" }, bases)).toBe(shared);
  });
  it("is an empty design when the base has not been saved yet", () => {
    expect(effectiveDesign({ customDesign: null, baseKind: "volunteers" }, bases)).toEqual(emptyDesign());
  });
});

describe("savableBases", () => {
  it("lets a council-wide admin save the enabled bases", () => {
    expect(savableBases({ role: "tech_head", clubId: null })).toEqual(["participants", "volunteers"]);
  });
  it("gives a club head nothing — they customise on their own event instead", () => {
    expect(savableBases({ role: "club_head", clubId: "c1" })).toEqual([]);
  });
});

describe("baseFieldProblem", () => {
  const label = (key: string) => (key === "form.tshirt" ? "T-shirt size" : key);

  it("accepts fields every event has", () => {
    for (const key of ["person.name", "person.roll", "team.name", "event.date", "cert.serial"]) {
      expect(baseFieldProblem(withField(key), ["participants"], label)).toBeNull();
    }
  });
  it("refuses a form answer, naming it", () => {
    expect(baseFieldProblem(withField("form.tshirt"), ["participants"], label)).toBe(
      "Remove {T-shirt size} — a base can only use fields every event has.",
    );
  });
  it("refuses a sheet column", () => {
    expect(baseFieldProblem(withField("sheet.Shift"), ["volunteers"], label)).toBe(
      "Remove {sheet.Shift} — a base can only use fields every event has.",
    );
  });
  it("keeps winner fields to the Winners base", () => {
    expect(baseFieldProblem(withField("winner.place"), ["participants", "winners"], label)).toBe(
      "Remove {winner.place} — winner fields can only go in the Winners base.",
    );
    expect(baseFieldProblem(withField("winner.place"), ["winners"], label)).toBeNull();
  });
});

describe("isBaseAsset", () => {
  it("is true only for the council folder of the asset bucket", () => {
    expect(isBaseAsset({ bucket: "certificate-assets", path: `${BASE_ASSET_FOLDER}/a.png` })).toBe(true);
    expect(isBaseAsset({ bucket: "certificate-assets", path: "11111111-1111-4111-8111-111111111111/a.png" })).toBe(false);
    expect(isBaseAsset({ bucket: "certificate-templates", path: `${BASE_ASSET_FOLDER}/a.png` })).toBe(false);
  });
});

describe("baseImpactText", () => {
  it("explains a first save", () => {
    expect(baseImpactText(undefined, false)).toBe("Every event without a custom design will use this.");
  });
  it("counts events and those with issued certificates", () => {
    expect(baseImpactText({ following: 9, withLive: 2 }, true)).toBe(
      "Used by 9 events. 2 of them have issued certificates that will show as outdated.",
    );
    expect(baseImpactText({ following: 1, withLive: 1 }, true)).toBe(
      "Used by 1 event. 1 of them has issued certificates that will show as outdated.",
    );
    expect(baseImpactText({ following: 3, withLive: 0 }, true)).toBe("Used by 3 events. None has issued certificates yet.");
    expect(baseImpactText({ following: 0, withLive: 0 }, true)).toBe("No other event follows this base right now.");
  });
});

describe("summarizeBases", () => {
  it("reports every kind, saved or not", () => {
    const out = summarizeBases(new Map<BaseKind, BaseDesign>([["volunteers", base("volunteers", emptyDesign())]]));
    expect(out.volunteers).toEqual({
      kind: "volunteers",
      label: "Volunteers",
      exists: true,
      sourceEventTitle: "Hack Night",
      updatedAt: "2026-09-12T10:00:00Z",
    });
    expect(out.participants).toEqual({
      kind: "participants",
      label: "Participants",
      exists: false,
      sourceEventTitle: null,
      updatedAt: null,
    });
    expect(out.winners.exists).toBe(false);
  });
});
