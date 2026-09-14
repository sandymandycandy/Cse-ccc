import { cssFamily, familyFromCss, hasVariant } from "./fonts";
import { LIMITS, type Design, type FieldTransform, type Paragraph, type Run, type Style } from "./design";

/**
 * Pure conversions between a text element's `Paragraph[]` and the TipTap
 * (ProseMirror) JSON the in-place editor works on (spec §6.3), plus the
 * whole-box style helpers the properties panel uses. No TipTap import here —
 * only its JSON shape — so this stays unit-testable.
 *
 * Inside the editor, sizes are CSS px in PAGE pixels (the overlay sits in the
 * page-scaled container), fonts are the `cert-<id>` CSS families.
 */

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: PMMark[];
  content?: PMNode[];
}

export const FIELD_NODE = "certField";

const round2 = (n: number) => Math.round(n * 100) / 100;

function marksFor(style: Style, pageHeightPx: number): PMMark[] {
  const marks: PMMark[] = [];
  if (style.bold) marks.push({ type: "bold" });
  if (style.italic) marks.push({ type: "italic" });
  if (style.underline) marks.push({ type: "underline" });
  marks.push({
    type: "textStyle",
    attrs: {
      fontFamily: cssFamily(style.font),
      fontSize: `${round2((style.sizePct / 100) * pageHeightPx)}px`,
      color: style.color,
    },
  });
  return marks;
}

export function paragraphsToDoc(paragraphs: Paragraph[], pageHeightPx: number): PMNode {
  return {
    type: "doc",
    content: paragraphs.map((p) => {
      const content: PMNode[] = [];
      for (const run of p.runs) {
        const marks = marksFor(run.style, pageHeightPx);
        if (run.kind === "text") {
          if (run.text) content.push({ type: "text", text: run.text, marks });
        } else {
          content.push({ type: FIELD_NODE, attrs: { field: run.field, transform: run.transform }, marks });
        }
      }
      return content.length ? { type: "paragraph", content } : { type: "paragraph" };
    }),
  };
}

function toHex(color: unknown): string | null {
  if (typeof color !== "string") return null;
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(c)) return c;
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${[...c.slice(1)].map((d) => d + d).join("")}`;
  const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (m) return `#${m.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

function styleFrom(marks: PMMark[] | undefined, pageHeightPx: number, inherit: Style): Style {
  const has = (t: string) => !!marks?.some((m) => m.type === t);
  const ts = marks?.find((m) => m.type === "textStyle")?.attrs ?? {};
  const font = typeof ts.fontFamily === "string" ? (familyFromCss(ts.fontFamily) ?? inherit.font) : inherit.font;
  const px = typeof ts.fontSize === "string" ? parseFloat(ts.fontSize) : NaN;
  const sizePct = Number.isFinite(px)
    ? Math.min(LIMITS.sizePct[1], Math.max(LIMITS.sizePct[0], round2((px / pageHeightPx) * 100)))
    : inherit.sizePct;
  let bold = has("bold");
  let italic = has("italic");
  // Never emit a face the family lacks (validation would reject the save).
  if (!hasVariant(font, bold, italic)) {
    if (hasVariant(font, bold, false)) italic = false;
    else if (hasVariant(font, false, italic)) bold = false;
    else {
      bold = false;
      italic = false;
    }
  }
  return {
    font,
    sizePct,
    bold,
    italic,
    underline: has("underline"),
    color: toHex(ts.color) ?? inherit.color,
  };
}

const sameStyle = (a: Style, b: Style) =>
  a.font === b.font &&
  a.sizePct === b.sizePct &&
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.color === b.color;

/**
 * Editor JSON → paragraphs. Unstyled text inherits the previous run's style
 * (or `fallback`); adjacent text runs with identical styles merge.
 */
export function docToParagraphs(doc: PMNode, pageHeightPx: number, fallback: Style): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let inherit = fallback;
  for (const block of doc.content ?? []) {
    if (block.type !== "paragraph") continue;
    let runs: Run[] = [];
    for (const node of block.content ?? []) {
      if (node.type === "hardBreak") {
        paragraphs.push({ runs });
        runs = [];
        continue;
      }
      const style = styleFrom(node.marks, pageHeightPx, inherit);
      inherit = style;
      if (node.type === "text" && node.text) {
        const last = runs[runs.length - 1];
        if (last?.kind === "text" && sameStyle(last.style, style)) last.text += node.text;
        else runs.push({ kind: "text", text: node.text, style });
      } else if (node.type === FIELD_NODE && typeof node.attrs?.field === "string") {
        const t = node.attrs.transform;
        const transform: FieldTransform = t === "title" || t === "upper" ? t : "none";
        runs.push({ kind: "field", field: node.attrs.field, transform, style });
      }
    }
    paragraphs.push({ runs });
  }
  return paragraphs.length ? paragraphs : [{ runs: [] }];
}

// ── whole-box helpers (properties panel, not editing) ────────────────────────

/** The style shown in the panel for a box: its first run's, else the default. */
export function primaryStyle(paragraphs: Paragraph[], fallback: Style): Style {
  return paragraphs.flatMap((p) => p.runs)[0]?.style ?? fallback;
}

/** Apply a style change to every run in the box, keeping faces valid. */
export function applyStyleToAll(paragraphs: Paragraph[], patch: Partial<Style>): Paragraph[] {
  return paragraphs.map((p) => ({
    runs: p.runs.map((r) => {
      const next = { ...r.style, ...patch };
      if (!hasVariant(next.font, next.bold, next.italic)) {
        next.bold = hasVariant(next.font, next.bold, false) ? next.bold : false;
        next.italic = hasVariant(next.font, next.bold, next.italic) ? next.italic : false;
      }
      return { ...r, style: next };
    }),
  }));
}

export interface FieldRunRef {
  paragraph: number;
  run: number;
  field: string;
  transform: FieldTransform;
}

export function listFieldRuns(paragraphs: Paragraph[]): FieldRunRef[] {
  const out: FieldRunRef[] = [];
  paragraphs.forEach((p, pi) =>
    p.runs.forEach((r, ri) => {
      if (r.kind === "field") out.push({ paragraph: pi, run: ri, field: r.field, transform: r.transform });
    }),
  );
  return out;
}

export function setFieldTransform(
  paragraphs: Paragraph[],
  ref: { paragraph: number; run: number },
  transform: FieldTransform,
): Paragraph[] {
  return paragraphs.map((p, pi) =>
    pi !== ref.paragraph
      ? p
      : { runs: p.runs.map((r, ri) => (ri === ref.run && r.kind === "field" ? { ...r, transform } : r)) },
  );
}

/** Replace field runs the design context no longer knows with visible text, e.g. "{Project title}". */
export function replaceUnknownFields(
  paragraphs: Paragraph[],
  known: (key: string) => boolean,
  label: (key: string) => string,
): Paragraph[] {
  return paragraphs.map((p) => ({
    runs: p.runs.map((r): Run =>
      r.kind === "field" && !known(r.field) ? { kind: "text", text: `{${label(r.field)}}`, style: r.style } : r,
    ),
  }));
}

/** replaceUnknownFields across every text element of a design. */
export function designWithUnknownFieldsAsText(
  design: Design,
  known: (key: string) => boolean,
  label: (key: string) => string,
): Design {
  return {
    ...design,
    elements: design.elements.map((el) =>
      el.type === "text" ? { ...el, paragraphs: replaceUnknownFields(el.paragraphs, known, label) } : el,
    ),
  };
}
