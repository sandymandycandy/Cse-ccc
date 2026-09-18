/**
 * What a crop needs to know about a portrait: its size and where the face is.
 *
 * A bundled portrait supplies width/height from its static import; an uploaded
 * one supplies them from the team_profiles row, because a Storage URL carries
 * no dimensions. Both flow through the same math below.
 */
export type Framing = {
  width: number;
  height: number;
  /** Face position as percentages of the image, 0–100. */
  focal: { x: number; y: number };
};

/**
 * object-position keeping the face in frame inside a container wider than the
 * photo.
 *
 * Moved here verbatim from coverPosition() in src/data/ccc.ts so a bundled and
 * an uploaded portrait share ONE implementation. Deliberately dependency-free:
 * ccc.ts imports 45 JPEGs, and in vitest those resolve to URL strings rather
 * than Next's {width, height} — so this math cannot be tested through ccc.ts.
 */
export function coverPositionFrom(
  f: Framing | undefined,
  containerAspect: number,
  headroom = 4,
): string {
  if (!f) return "50% 35%";
  const imageAspect = f.width / f.height;
  if (containerAspect <= imageAspect) return `${f.focal.x}% ${f.focal.y}%`;
  const visible = imageAspect / containerAspect;
  const center = (f.focal.y - headroom) / 100;
  const start = Math.min(Math.max(center - visible / 2, 0), 1 - visible);
  return `${f.focal.x}% ${((start / (1 - visible)) * 100).toFixed(1)}%`;
}
