import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  designFromLegacyConfig,
  emptyDesign,
  isKnownField,
  validateDesign,
  DEFAULT_STYLE,
  assetRefsOf,
  newElementId,
  parseStoredDesign,
  assetKey,
  rewriteAssetRefs,
  type AssetRef,
  type Design,
  type DesignContext,
  type TextElement,
} from "./design";

const ctx: DesignContext = { formFieldIds: new Set(["project"]), sheetColumns: new Set() };

const text = (over: Partial<TextElement> = {}): TextElement => ({
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
  lineHeight: 1.3,
  fit: "wrap",
  paragraphs: [
    {
      runs: [
        { kind: "text", text: "This is to certify that ", style: DEFAULT_STYLE },
        { kind: "field", field: "person.name", transform: "title", style: { ...DEFAULT_STYLE, bold: true } },
      ],
    },
  ],
  ...over,
});

const withElements = (...elements: Design["elements"]): Design => ({ ...emptyDesign(), elements });

const UUID_A = "0b7c7c9e-8a51-4c43-9c8e-1f6f0d1c2b3a";
const UUID_B = "9d3e1f0a-1b2c-4d5e-8f90-a1b2c3d4e5f6";

describe("validateDesign", () => {
  it("accepts a well-formed design and lowercases colours", () => {
    const el = text();
    el.paragraphs[0].runs[0] = { kind: "text", text: "Hi ", style: { ...DEFAULT_STYLE, color: "#AABBCC" } };
    const res = validateDesign(withElements(el), ctx);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const run = (res.design.elements[0] as TextElement).paragraphs[0].runs[0];
      expect(run.style.color).toBe("#aabbcc");
    }
  });

  it("rejects junk with a readable message", () => {
    const res = validateDesign({ v: 2 }, ctx);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/^Design is invalid at /);
  });

  it("rejects a bold/italic combination the family lacks", () => {
    const el = text();
    el.paragraphs[0].runs[0] = { kind: "text", text: "Hi", style: { ...DEFAULT_STYLE, font: "greatvibes", bold: true } };
    expect(validateDesign(withElements(el), ctx)).toEqual({
      ok: false,
      error: `"Body" uses a bold/italic style its font doesn't have.`,
    });
  });

  it("rejects unknown fields but accepts this event's form answers", () => {
    const field = (key: string) =>
      text({ paragraphs: [{ runs: [{ kind: "field", field: key, transform: "none", style: DEFAULT_STYLE }] }] });
    expect(validateDesign(withElements(field("form.project")), ctx).ok).toBe(true);
    expect(validateDesign(withElements(field("form.gone")), ctx)).toEqual({
      ok: false,
      error: `"Body" uses a field that no longer exists (form.gone).`,
    });
  });

  it("rejects duplicate element ids and over-long text", () => {
    expect(validateDesign(withElements(text(), text()), ctx)).toEqual({
      ok: false,
      error: `Two elements share the id "t1".`,
    });
    const long = text({
      paragraphs: [
        {
          runs: [
            { kind: "text", text: "a".repeat(1500), style: DEFAULT_STYLE },
            { kind: "text", text: "b".repeat(600), style: DEFAULT_STYLE },
          ],
        },
      ],
    });
    expect(validateDesign(withElements(long), ctx)).toEqual({
      ok: false,
      error: `"Body" has more than 2000 characters.`,
    });
  });

  it("only accepts asset paths of the expected shape", () => {
    const design = emptyDesign();
    design.page.template = { bucket: "certificate-assets", path: "../x.png", type: "png", widthPx: 10, heightPx: 10 };
    expect(validateDesign(design, ctx).ok).toBe(false);
    design.page.template = { ...design.page.template, path: `${UUID_A}/${UUID_B}.png` };
    expect(validateDesign(design, ctx).ok).toBe(true);
    design.page.template = { ...design.page.template, path: `${UUID_A}/${UUID_B}.jpg` };
    expect(validateDesign(design, ctx).ok).toBe(false); // extension must match type
  });
});

describe("isKnownField", () => {
  it("knows the fixed catalogue and checks form/sheet keys against context", () => {
    for (const k of ["person.name", "person.role", "team.members", "event.date", "cert.serial"]) {
      expect(isKnownField(k, ctx)).toBe(true);
    }
    expect(isKnownField("person.password", ctx)).toBe(false);
    expect(isKnownField("sheet.Role", ctx)).toBe(false);
    expect(isKnownField("sheet.Role", { ...ctx, sheetColumns: new Set(["Role"]) })).toBe(true);
  });
});

describe("canonicalJson", () => {
  it("is independent of key order and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe("designFromLegacyConfig", () => {
  it("turns the v1 anchor into a centred shrink-to-fit name box", () => {
    const d = designFromLegacyConfig(
      { path: `${UUID_A}.png`, type: "png", widthPx: 2000, heightPx: 1414 },
      { nameXPct: 60, nameYPct: 47, fontPct: 4, align: "center", color: "#112233" },
    );
    expect(d.page).toMatchObject({ widthPx: 2000, heightPx: 1414, template: { bucket: "certificate-templates" } });
    const el = d.elements[0] as TextElement;
    expect(el).toMatchObject({ x: 30, w: 60, y: 43, h: 8, fit: "shrink", align: "center" });
    expect(el.paragraphs[0].runs[0]).toMatchObject({
      kind: "field",
      field: "person.name",
      style: { font: "playfair", bold: true, sizePct: 4, color: "#112233" },
    });
    expect(validateDesign(d, ctx).ok).toBe(true);
  });

  it("anchors left- and right-aligned names at the old edge", () => {
    const tpl = { path: `${UUID_A}.jpg`, type: "jpg" as const, widthPx: 100, heightPx: 100 };
    const base = { nameYPct: 50, fontPct: 5, color: "#000000" };
    expect(designFromLegacyConfig(tpl, { ...base, nameXPct: 20, align: "left" }).elements[0].x).toBe(20);
    expect(designFromLegacyConfig(tpl, { ...base, nameXPct: 90, align: "right" }).elements[0].x).toBe(30);
  });
});

describe("parseStoredDesign", () => {
  it("keeps a stored design whose form field was deleted since, rejects a broken shape", () => {
    const d = withElements(
      text({ paragraphs: [{ runs: [{ kind: "field", field: "form.deleted", transform: "none", style: DEFAULT_STYLE }] }] }),
    );
    expect(parseStoredDesign(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(parseStoredDesign({ v: 1 })).toBeNull();
    expect(parseStoredDesign(null)).toBeNull();
  });
});

describe("helpers", () => {
  it("keys assets by bucket and path", () => {
    expect(assetKey({ bucket: "certificate-assets", path: "e/a.png" })).toBe("certificate-assets/e/a.png");
  });

  it("lists asset refs, template first", () => {
    const d = emptyDesign();
    d.page.template = { bucket: "certificate-assets", path: "a", type: "png", widthPx: 1, heightPx: 1 };
    d.elements.push({
      id: "i1",
      name: "Logo",
      type: "image",
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      locked: false,
      hidden: false,
      opacity: 1,
      asset: { bucket: "certificate-assets", path: "b", type: "png", widthPx: 1, heightPx: 1 },
    });
    expect(assetRefsOf(d).map((r) => r.path)).toEqual(["a", "b"]);
  });

  it("makes short lowercase ids", () => {
    expect(newElementId()).toMatch(/^[a-z0-9]{10}$/);
  });
});

describe("qr elements", () => {
  const qr = { id: "qr1", name: "Verification QR", type: "qr", x: 82, y: 70, w: 12, h: 17, locked: false, hidden: false, color: "#1A1A1A" };

  it("accepts a qr element and lowercases its colour", () => {
    const res = validateDesign({ ...emptyDesign(), elements: [qr] }, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.design.elements[0]).toMatchObject({ type: "qr", color: "#1a1a1a" });
  });

  it("rejects a bad colour", () => {
    expect(validateDesign({ ...emptyDesign(), elements: [{ ...qr, color: "red" }] }, ctx).ok).toBe(false);
  });

  it("carries no asset", () => {
    expect(assetRefsOf({ ...emptyDesign(), elements: [qr] } as Design)).toEqual([]);
  });
});

describe("rewriteAssetRefs", () => {
  it("swaps the template and every image, leaving other elements alone", () => {
    const t: AssetRef = { bucket: "certificate-assets", path: "a/t.png", type: "png", widthPx: 10, heightPx: 10 };
    const logo: AssetRef = { ...t, path: "a/logo.png" };
    const design: Design = {
      v: 1,
      page: { template: t, widthPx: 10, heightPx: 10 },
      elements: [
        { id: "logo", name: "Logo", type: "image", x: 0, y: 0, w: 5, h: 5, locked: false, hidden: false, opacity: 1, asset: logo },
        { id: "qr", name: "QR", type: "qr", x: 0, y: 0, w: 5, h: 5, locked: false, hidden: false, color: "#000000" },
      ],
    };
    const out = rewriteAssetRefs(design, (ref) => ({ ...ref, path: ref.path.replace("a/", "b/") }));
    expect(out.page.template?.path).toBe("b/t.png");
    expect(out.elements[0].type === "image" && out.elements[0].asset.path).toBe("b/logo.png");
    expect(out.elements[1]).toBe(design.elements[1]);
    expect(design.page.template?.path).toBe("a/t.png");
  });

  it("keeps a missing template missing", () => {
    expect(rewriteAssetRefs(emptyDesign(), (r) => r).page.template).toBeNull();
  });
});
