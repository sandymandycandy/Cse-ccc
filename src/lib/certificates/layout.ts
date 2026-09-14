import { faceFor, type FaceId, type FaceMetrics, type FontFamilyId } from "./fonts";
import { applyTransform } from "./fields";
import type { Paragraph, Style, TextElement } from "./design";

/**
 * The rich-text layout engine (spec §6.2) — pure and shared. The editor draws
 * its output as SVG <text> and the renderer draws the same output into the PDF,
 * so line breaks and positions are decided exactly once. All output is in
 * PAGE PIXELS with a top-left origin.
 */

export type MetricsTable = Record<FaceId, FaceMetrics>;

export interface PageSize {
  widthPx: number;
  heightPx: number;
}

export interface LaidRun {
  x: number;
  width: number;
  text: string;
  face: FaceId;
  family: FontFamilyId;
  bold: boolean;
  italic: boolean;
  /** Font size in page px (after any shrink). */
  size: number;
  color: string;
  /** Underline bar in page px (y = top edge of the bar); null when not underlined. */
  underline: { y: number; thickness: number } | null;
}

export interface LaidLine {
  baseline: number;
  width: number;
  runs: LaidRun[];
}

export interface TextLayout {
  lines: LaidLine[];
  left: number;
  top: number;
  width: number;
  height: number;
  /** Shrink scale applied (1 = none). */
  scale: number;
  /** Did not fit: a shrink box still too wide at MIN_SHRINK, or a wrap box running off the page. */
  overflow: boolean;
  /** Characters dropped because the chosen face has no glyph for them. */
  missingGlyphs: string[];
}

/** A shrink box never scales its text below 40 %. */
export const MIN_SHRINK = 0.4;

interface Glyph {
  ch: string;
  style: Style;
  face: FaceId;
  /** Advance at scale 1, page px. */
  advance: number;
  space: boolean;
}

/** A word: its characters (width) plus the spaces that follow it (trailing). */
interface Word {
  glyphs: Glyph[];
  width: number;
  trailing: number;
}

function toGlyphs(
  paragraph: Paragraph,
  valueFor: (field: string) => string,
  page: PageSize,
  metrics: MetricsTable,
  missing: Set<string>,
): Glyph[] {
  const out: Glyph[] = [];
  for (const run of paragraph.runs) {
    const raw = run.kind === "text" ? run.text : applyTransform(valueFor(run.field), run.transform);
    const face = faceFor(run.style.font, run.style.bold, run.style.italic);
    const m = metrics[face];
    const size = (run.style.sizePct / 100) * page.heightPx;
    for (const ch of raw.replace(/[\r\n\t]+/g, " ")) {
      const units = m.widths[ch.codePointAt(0)!];
      if (units === undefined) {
        missing.add(ch);
        continue;
      }
      out.push({ ch, style: run.style, face, advance: (units / m.unitsPerEm) * size, space: ch === " " });
    }
  }
  return out;
}

function toWords(glyphs: Glyph[]): Word[] {
  const words: Word[] = [];
  let word: Word | null = null;
  let ink = false; // has the current word seen a non-space yet?
  for (const g of glyphs) {
    if (!word || (!g.space && word.trailing > 0)) {
      word = { glyphs: [], width: 0, trailing: 0 };
      words.push(word);
      ink = false;
    }
    word.glyphs.push(g);
    if (g.space && ink) word.trailing += g.advance;
    else {
      word.width += g.advance; // ink, or indentation before any ink
      if (!g.space) ink = true;
    }
  }
  return words;
}

/** Split a word wider than the box into character chunks that each fit. */
function breakWord(word: Word, maxWidth: number, scale: number): Word[] {
  const pieces: Word[] = [];
  let piece: Word = { glyphs: [], width: 0, trailing: 0 };
  for (const g of word.glyphs) {
    if (g.space) {
      piece.glyphs.push(g);
      piece.trailing += g.advance;
      continue;
    }
    if (piece.glyphs.length > 0 && (piece.width + g.advance) * scale > maxWidth) {
      pieces.push(piece);
      piece = { glyphs: [], width: 0, trailing: 0 };
    }
    piece.glyphs.push(g);
    piece.width += g.advance;
  }
  if (piece.glyphs.length > 0) pieces.push(piece);
  return pieces;
}

/** Greedy line fill. `maxWidth` null = one line per paragraph. */
function fillLines(words: Word[], maxWidth: number | null, scale: number): Word[][] {
  const lines: Word[][] = [];
  let line: Word[] = [];
  let width = 0; // unscaled: every word's width + trailing so far
  const place = (w: Word) => {
    if (maxWidth !== null && line.length > 0 && (width + w.width) * scale > maxWidth) {
      lines.push(line);
      line = [];
      width = 0;
    }
    line.push(w);
    width += w.width + w.trailing;
  };
  for (const word of words) {
    if (maxWidth !== null && word.width * scale > maxWidth) breakWord(word, maxWidth, scale).forEach(place);
    else place(word);
  }
  lines.push(line);
  return lines;
}

const sameStyle = (a: Style, b: Style) =>
  a.font === b.font &&
  a.sizePct === b.sizePct &&
  a.bold === b.bold &&
  a.italic === b.italic &&
  a.underline === b.underline &&
  a.color === b.color;

/** Width of a paragraph set on one line, ignoring its final trailing spaces. */
const naturalWidth = (words: Word[]) =>
  words.reduce((sum, w, i) => sum + w.width + (i < words.length - 1 ? w.trailing : 0), 0);

export function layoutText(
  el: TextElement,
  valueFor: (field: string) => string,
  page: PageSize,
  metrics: MetricsTable,
): TextLayout {
  const boxLeft = (el.x / 100) * page.widthPx;
  const boxTop = (el.y / 100) * page.heightPx;
  const boxW = (el.w / 100) * page.widthPx;
  const boxH = (el.h / 100) * page.heightPx;
  const missing = new Set<string>();
  const firstStyle = el.paragraphs.flatMap((p) => p.runs)[0]?.style ?? null;

  const paragraphs = el.paragraphs.map((p) => ({
    words: toWords(toGlyphs(p, valueFor, page, metrics, missing)),
    // An empty paragraph still takes a line, sized by its own (or the box's first) style.
    emptyStyle: p.runs[0]?.style ?? firstStyle,
  }));

  let scale = 1;
  let overflow = false;
  if (el.fit === "shrink") {
    const natural = Math.max(0, ...paragraphs.map((p) => naturalWidth(p.words)));
    if (natural > boxW) {
      scale = Math.max(MIN_SHRINK, boxW / natural);
      overflow = natural * scale > boxW + 0.01;
    }
  }

  const lines: LaidLine[] = [];
  let cursor = 0; // top of the next line box, relative to the block top
  for (const p of paragraphs) {
    for (const words of fillLines(p.words, el.fit === "wrap" ? boxW : null, scale)) {
      const glyphs = words.flatMap((w) => w.glyphs);
      let end = glyphs.length;
      while (end > 0 && glyphs[end - 1].space) end--; // no trailing spaces at line end
      const drawn = glyphs.slice(0, end);

      const sized = drawn.length
        ? drawn.map((g) => ({ style: g.style, face: g.face }))
        : p.emptyStyle
          ? [{ style: p.emptyStyle, face: faceFor(p.emptyStyle.font, p.emptyStyle.bold, p.emptyStyle.italic) }]
          : [];
      let ascent = 0;
      let descent = 0;
      let maxSize = 0;
      for (const { style, face } of sized) {
        const m = metrics[face];
        const size = (style.sizePct / 100) * page.heightPx * scale;
        maxSize = Math.max(maxSize, size);
        ascent = Math.max(ascent, (m.ascent / m.unitsPerEm) * size);
        descent = Math.max(descent, (-m.descent / m.unitsPerEm) * size);
      }
      const lineBox = maxSize * el.lineHeight;
      const baseline = cursor + (lineBox - (ascent + descent)) / 2 + ascent;
      cursor += lineBox;

      const width = drawn.reduce((sum, g) => sum + g.advance * scale, 0);
      let x =
        el.align === "center" ? boxLeft + (boxW - width) / 2 : el.align === "right" ? boxLeft + boxW - width : boxLeft;

      const runs: LaidRun[] = [];
      const runStyles: Style[] = [];
      for (const g of drawn) {
        const adv = g.advance * scale;
        const i = runs.length - 1;
        if (i >= 0 && sameStyle(runStyles[i], g.style)) {
          runs[i].text += g.ch;
          runs[i].width += adv;
        } else {
          const m = metrics[g.face];
          const size = (g.style.sizePct / 100) * page.heightPx * scale;
          runs.push({
            x,
            width: adv,
            text: g.ch,
            face: g.face,
            family: g.style.font,
            bold: g.style.bold,
            italic: g.style.italic,
            size,
            color: g.style.color,
            underline: g.style.underline
              ? {
                  y: -(m.underlinePosition / m.unitsPerEm) * size, // offset below baseline; made absolute below
                  thickness: (m.underlineThickness / m.unitsPerEm) * size,
                }
              : null,
          });
          runStyles.push(g.style);
        }
        x += adv;
      }
      lines.push({ baseline, width, runs });
    }
  }

  const height = cursor;
  const top = el.fit === "shrink" ? boxTop + (boxH - height) / 2 : boxTop;
  for (const line of lines) {
    line.baseline += top;
    for (const run of line.runs) {
      if (run.underline) run.underline.y = line.baseline + run.underline.y - run.underline.thickness / 2;
    }
  }
  if (el.fit === "wrap" && top + height > page.heightPx + 0.5) overflow = true;

  return { lines, left: boxLeft, top, width: boxW, height, scale, overflow, missingGlyphs: [...missing] };
}
