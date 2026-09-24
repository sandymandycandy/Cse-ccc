import type { FormField } from "./schema";

/**
 * How one choice option reads on its card. Organisers type options like
 * "Theme-1 - AI for Sustainability – Smart solutions for water, …", which as a
 * single line is a wall of text. This pulls out the numbered tag ("Theme-1")
 * and a short title ("AI for Sustainability") so the card can set them apart.
 * Display only — the submitted value is always the option string, untouched.
 */
export type ChoiceDisplay = { tag: string | null; title: string | null; text: string };

// "Theme-1 - rest", "Track 2: rest", "Problem 3 — rest". The tag must carry a
// number, so an ordinary "Yes - I agree" is not mistaken for one.
const TAG = /^([^\s].{0,22}?\d)\s*[-–—:]\s+(.+)$/;
// "AI for Sustainability – Smart solutions…": a short lead phrase before a dash.
const TITLE = /^(.{3,48}?)\s+[-–—]\s+(.+)$/;

export function splitChoice(option: string): ChoiceDisplay {
  const raw = option.trim();
  let tag: string | null = null;
  let body = raw;
  const t = TAG.exec(raw);
  if (t) {
    tag = t[1];
    body = t[2].trim();
  }
  const ti = TITLE.exec(body);
  if (ti) return { tag, title: ti[1].trim(), text: ti[2].trim() };
  return { tag, title: null, text: body };
}

/**
 * A single-choice question short enough for a row of pills: a few one-word
 * options (Year: 1–5, Yes/No). As a dropdown they hide behind a click; as
 * cards, two full-width boxes for "Yes" and "No" are clumsy. Long lists
 * (Department) and "Other" questions keep their usual control. Same answer
 * either way — the pills are radios carrying the option value.
 */
export function isCompactChoice(field: FormField): boolean {
  const opts = field.options ?? [];
  return (
    (field.kind === "dropdown" || field.kind === "radio") &&
    !field.allowOther &&
    opts.length >= 2 &&
    opts.length <= 6 &&
    opts.every((o) => o.length <= 14)
  );
}

/**
 * A form too big for the 400px sidebar: a team roster, or a choice question
 * with enough long options that one narrow column turns into a scroll. The
 * event page gives these a wider column on a desktop.
 */
export function isLongForm(fields: FormField[] | null): boolean {
  if (!fields) return false;
  return fields.some(
    (f) =>
      f.kind === "team" ||
      ((f.kind === "radio" || f.kind === "checkboxes") &&
        (f.options?.length ?? 0) >= 4 &&
        (f.options ?? []).some((o) => o.length > 40)),
  );
}
