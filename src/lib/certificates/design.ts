import { z } from "zod";
import { DEFAULT_FONT, FONT_FAMILY_IDS, hasVariant, type FontFamilyId } from "./fonts";
import type { CertificateConfig } from "./config";

/**
 * The certificate design document (spec §4.1). Pure and shared: the editor
 * edits it, a server action validates and stores it, the layout engine and
 * PDF renderer read it. Positions are PERCENTAGES of the page (x, w of its
 * width; y, h of its height), so a design survives a template swap and renders
 * at any size.
 */

export type Hex = string;

export const CERT_ASSET_BUCKET = "certificate-assets";
export const LEGACY_TEMPLATE_BUCKET = "certificate-templates";
export type AssetBucket = typeof CERT_ASSET_BUCKET | typeof LEGACY_TEMPLATE_BUCKET;

export interface AssetRef {
  bucket: AssetBucket;
  path: string;
  type: "png" | "jpg";
  widthPx: number;
  heightPx: number;
}

export interface Style {
  font: FontFamilyId;
  /** Font size as a % of the page height. */
  sizePct: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: Hex;
}

export type FieldTransform = "none" | "title" | "upper";

export type Run =
  | { kind: "text"; text: string; style: Style }
  | { kind: "field"; field: string; transform: FieldTransform; style: Style };

export interface Paragraph {
  runs: Run[];
}

interface ElementBase {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  hidden: boolean;
}

export interface ImageElement extends ElementBase {
  type: "image";
  asset: AssetRef;
  opacity: number;
}

export interface TextElement extends ElementBase {
  type: "text";
  align: "left" | "center" | "right";
  lineHeight: number;
  fit: "wrap" | "shrink";
  paragraphs: Paragraph[];
}

/** The verification QR. Always drawn square, centred in its box (spec §2.2). */
export interface QrElement extends ElementBase {
  type: "qr";
  color: Hex;
}

export type DesignElement = ImageElement | TextElement | QrElement;

export interface Design {
  v: 1;
  page: { template: AssetRef | null; widthPx: number; heightPx: number };
  /** Array order is z-order: first is the bottom layer. */
  elements: DesignElement[];
}

/** A4 landscape at 300 dpi — the page size before any template is uploaded. */
export const DEFAULT_PAGE = { widthPx: 3508, heightPx: 2480 } as const;

export const DEFAULT_STYLE: Style = {
  font: DEFAULT_FONT,
  sizePct: 4,
  bold: false,
  italic: false,
  underline: false,
  color: "#1a1a1a",
};

export const LIMITS = {
  elements: 60,
  textChars: 2000,
  runs: 200,
  sizePct: [0.5, 30] as const,
  lineHeight: [0.8, 3] as const,
  pos: [-50, 150] as const,
  size: [0.5, 200] as const,
  assetPx: 20000,
};

/** Field keys the catalogue can produce (spec §2.3). `form.*` / `sheet.*` / `winner.*` are checked against context. */
const FIXED_FIELD = /^(person\.(name|roll|department|year|email|phone|role)|team\.(name|members|size)|event\.(title|date|venue|club)|cert\.(serial|issueDate|group))$/;

/** Only a winners group (and the Winners base) prints a placing. */
const WINNER_FIELD = /^winner\.(place|placeWords)$/;

export function emptyDesign(): Design {
  return { v: 1, page: { template: null, ...DEFAULT_PAGE }, elements: [] };
}

// ── validation ───────────────────────────────────────────────────────────────

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((s) => s.toLowerCase());

const assetPath: Record<AssetBucket, RegExp> = {
  [CERT_ASSET_BUCKET]: /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg)$/,
  [LEGACY_TEMPLATE_BUCKET]: /^[0-9a-f-]{36}\.(png|jpg)$/,
};

const assetRef = z
  .object({
    bucket: z.enum([CERT_ASSET_BUCKET, LEGACY_TEMPLATE_BUCKET]),
    path: z.string(),
    type: z.enum(["png", "jpg"]),
    widthPx: z.number().int().min(1).max(LIMITS.assetPx),
    heightPx: z.number().int().min(1).max(LIMITS.assetPx),
  })
  .refine((a) => assetPath[a.bucket].test(a.path) && a.path.endsWith(`.${a.type}`), {
    message: "Bad asset path.",
  });

const style = z.object({
  font: z.enum(FONT_FAMILY_IDS as [FontFamilyId, ...FontFamilyId[]]),
  sizePct: z.number().min(LIMITS.sizePct[0]).max(LIMITS.sizePct[1]),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  color: hex,
});

const run = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().max(LIMITS.textChars), style }),
  z.object({
    kind: z.literal("field"),
    field: z.string().min(1).max(90),
    transform: z.enum(["none", "title", "upper"]),
    style,
  }),
]);

const base = {
  id: z.string().regex(/^[a-z0-9]{1,24}$/),
  name: z.string().trim().min(1).max(60),
  x: z.number().min(LIMITS.pos[0]).max(LIMITS.pos[1]),
  y: z.number().min(LIMITS.pos[0]).max(LIMITS.pos[1]),
  w: z.number().min(LIMITS.size[0]).max(LIMITS.size[1]),
  h: z.number().min(LIMITS.size[0]).max(LIMITS.size[1]),
  locked: z.boolean(),
  hidden: z.boolean(),
};

const element = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("image"), asset: assetRef, opacity: z.number().min(0).max(1) }),
  z.object({
    ...base,
    type: z.literal("text"),
    align: z.enum(["left", "center", "right"]),
    lineHeight: z.number().min(LIMITS.lineHeight[0]).max(LIMITS.lineHeight[1]),
    fit: z.enum(["wrap", "shrink"]),
    paragraphs: z.array(z.object({ runs: z.array(run) })).min(1).max(LIMITS.runs),
  }),
  z.object({ ...base, type: z.literal("qr"), color: hex }),
]);

const designSchema = z.object({
  v: z.literal(1),
  page: z.object({
    template: assetRef.nullable(),
    widthPx: z.number().int().min(1).max(LIMITS.assetPx),
    heightPx: z.number().int().min(1).max(LIMITS.assetPx),
  }),
  elements: z.array(element).max(LIMITS.elements),
});

export interface DesignContext {
  /** Ids of the event form's non-identity answer fields (valid `form.<id>` keys). */
  formFieldIds: ReadonlySet<string>;
  /** The group's sheet columns (valid `sheet.<column>` keys). */
  sheetColumns: ReadonlySet<string>;
  /** True on a winners group, where `winner.*` may be printed. */
  winnerFields?: boolean;
}

export function isKnownField(key: string, ctx: DesignContext): boolean {
  if (FIXED_FIELD.test(key)) return true;
  if (WINNER_FIELD.test(key)) return ctx.winnerFields === true;
  if (key.startsWith("form.")) return ctx.formFieldIds.has(key.slice(5));
  if (key.startsWith("sheet.")) return ctx.sheetColumns.has(key.slice(6));
  return false;
}

export type DesignResult = { ok: true; design: Design } | { ok: false; error: string };

/** Parse + check a submitted design. Returns the first human-readable problem. */
export function validateDesign(raw: unknown, ctx: DesignContext): DesignResult {
  const parsed = designSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `Design is invalid at ${issue.path.join(".") || "root"}: ${issue.message}` };
  }
  const design = parsed.data as Design;

  const ids = new Set<string>();
  for (const el of design.elements) {
    if (ids.has(el.id)) return { ok: false, error: `Two elements share the id "${el.id}".` };
    ids.add(el.id);
    if (el.type !== "text") continue;

    let chars = 0;
    let runs = 0;
    for (const p of el.paragraphs) {
      for (const r of p.runs) {
        runs++;
        if (r.kind === "text") chars += r.text.length;
        if (!hasVariant(r.style.font, r.style.bold, r.style.italic)) {
          return { ok: false, error: `"${el.name}" uses a bold/italic style its font doesn't have.` };
        }
        if (r.kind === "field" && !isKnownField(r.field, ctx)) {
          return { ok: false, error: `"${el.name}" uses a field that no longer exists (${r.field}).` };
        }
      }
    }
    if (chars > LIMITS.textChars) return { ok: false, error: `"${el.name}" has more than ${LIMITS.textChars} characters.` };
    if (runs > LIMITS.runs) return { ok: false, error: `"${el.name}" has too many style changes.` };
  }
  return { ok: true, design };
}

/**
 * Read a design already stored by a save (so it passed validation then). Only
 * the shape is checked — a form question deleted since must not wipe the
 * design; the editor shows it as text instead (designWithUnknownFieldsAsText).
 */
export function parseStoredDesign(raw: unknown): Design | null {
  const parsed = designSchema.safeParse(raw);
  return parsed.success ? (parsed.data as Design) : null;
}

// ── helpers ──────────────────────────────────────────────────────────────────

/** Largest asset upload accepted (spec §6.4). */
export const MAX_ASSET_BYTES = 8 * 1024 * 1024;

/** Map key for an asset: "<bucket>/<path>". */
export const assetKey = (ref: Pick<AssetRef, "bucket" | "path">): string => `${ref.bucket}/${ref.path}`;

/** Every stored asset the design points at (template first). */
export function assetRefsOf(design: Design): AssetRef[] {
  const refs: AssetRef[] = design.page.template ? [design.page.template] : [];
  for (const el of design.elements) if (el.type === "image") refs.push(el.asset);
  return refs;
}

/** The same design with every stored asset reference (template and images) passed through `swap`. */
export function rewriteAssetRefs(design: Design, swap: (ref: AssetRef) => AssetRef): Design {
  return {
    ...design,
    page: { ...design.page, template: design.page.template ? swap(design.page.template) : null },
    elements: design.elements.map((el) => (el.type === "image" ? { ...el, asset: swap(el.asset) } : el)),
  };
}

/** Deterministic JSON (sorted keys) — the input to a design version's hash. */
export { canonicalJson } from "@/lib/json";

/**
 * Convert a v1 setup (one uploaded image + one name anchor) into a design:
 * the image becomes the template and the name a shrink-to-fit text box centred
 * on the old anchor. v1 used Times-Bold; Playfair Display bold is the closest
 * bundled face.
 */
export function designFromLegacyConfig(
  template: { path: string; type: "png" | "jpg"; widthPx: number; heightPx: number },
  config: CertificateConfig,
): Design {
  const w = 60;
  const h = Math.min(LIMITS.size[1], Math.max(LIMITS.size[0], config.fontPct * 2));
  const x = config.align === "center" ? config.nameXPct - w / 2 : config.align === "right" ? config.nameXPct - w : config.nameXPct;
  return {
    v: 1,
    page: {
      template: { bucket: LEGACY_TEMPLATE_BUCKET, ...template },
      widthPx: template.widthPx,
      heightPx: template.heightPx,
    },
    elements: [
      {
        id: "name",
        name: "Name",
        type: "text",
        x: clampPos(x),
        y: clampPos(config.nameYPct - h / 2),
        w,
        h,
        locked: false,
        hidden: false,
        align: config.align,
        lineHeight: 1.2,
        fit: "shrink",
        paragraphs: [
          {
            runs: [
              {
                kind: "field",
                field: "person.name",
                transform: "none",
                style: {
                  ...DEFAULT_STYLE,
                  font: "playfair",
                  bold: true,
                  sizePct: Math.min(LIMITS.sizePct[1], Math.max(LIMITS.sizePct[0], config.fontPct)),
                  color: config.color,
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

const clampPos = (n: number) => Math.min(LIMITS.pos[1], Math.max(LIMITS.pos[0], n));

/** Short random element id (a–z, 0–9). */
export function newElementId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 10; i++) id += "abcdefghijklmnopqrstuvwxyz0123456789"[Math.floor(random() * 36)];
  return id;
}
