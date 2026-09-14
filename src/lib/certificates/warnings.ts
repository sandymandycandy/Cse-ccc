import { type Design, type Run } from "./design";
import { layoutText, type MetricsTable } from "./layout";

/**
 * What will look wrong on this person's certificate before anyone sends it
 * (spec §3.2): a field their record has no value for, text too long for its
 * box, or characters the chosen font cannot print. Pure — it lays the design
 * out with their values and reports what the layout engine found.
 */

export interface RecipientWarnings {
  /** Field keys the design prints but this person has no value for. */
  emptyFields: string[];
  /** Names of text boxes whose content does not fit. */
  overflow: string[];
  /** Characters dropped because no chosen face has a glyph for them. */
  missingGlyphs: string[];
}

export const NO_WARNINGS: RecipientWarnings = { emptyFields: [], overflow: [], missingGlyphs: [] };

export function hasWarnings(w: RecipientWarnings): boolean {
  return w.emptyFields.length > 0 || w.overflow.length > 0 || w.missingGlyphs.length > 0;
}

export function recipientWarnings(
  design: Design,
  valueFor: (field: string) => string,
  metrics: MetricsTable,
): RecipientWarnings {
  const emptyFields = new Set<string>();
  const overflow: string[] = [];
  const missingGlyphs = new Set<string>();

  for (const element of design.elements) {
    if (element.type !== "text" || element.hidden) continue;
    for (const run of element.paragraphs.flatMap((p): Run[] => p.runs)) {
      if (run.kind === "field" && valueFor(run.field).trim() === "") emptyFields.add(run.field);
    }
    const layout = layoutText(element, valueFor, design.page, metrics);
    if (layout.overflow) overflow.push(element.name);
    for (const ch of layout.missingGlyphs) missingGlyphs.add(ch);
  }

  return { emptyFields: [...emptyFields], overflow: [...new Set(overflow)], missingGlyphs: [...missingGlyphs] };
}

/**
 * The warnings as short lines for the Recipients table. `label` turns a field
 * key into the name the organiser knows it by.
 */
export function warningLines(w: RecipientWarnings, label: (field: string) => string): string[] {
  const lines: string[] = [];
  for (const field of w.emptyFields) lines.push(`${label(field)} is empty`);
  for (const name of w.overflow) lines.push(`"${name}" doesn't fit its box`);
  if (w.missingGlyphs.length > 0) lines.push(`Font can't print: ${w.missingGlyphs.join(" ")}`);
  return lines;
}
