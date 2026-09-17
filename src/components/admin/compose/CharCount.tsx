/**
 * Counts up, not down: a limit only matters as you approach it, so this is
 * silent until four fifths of the way there.
 *
 * ⚠️ Counts RAW characters, unlike the older sibling in `FeedbackForm.tsx`
 * which trims. The fields here carry a `maxLength`, and a trimmed count would
 * read "118 / 120" on a subject the browser has already stopped accepting.
 */
export function CharCount({ value, max }: { value: string; max: number }) {
  const n = value.length;
  if (n < max * 0.8) return null;
  return (
    <span className="hint counter" data-near-limit={n > max ? "over" : "near"}>
      {n} / {max}
    </span>
  );
}
