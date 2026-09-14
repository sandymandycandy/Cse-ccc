/**
 * Pure canvas geometry for the certificate editor: moving, resizing and
 * snapping boxes. Works in PAGE PIXELS; the canvas converts pointer deltas by
 * dividing by the zoom, and converts results back to % when dispatching.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface Guide {
  axis: "x" | "y";
  /** Position of the guide line in page px. */
  at: number;
}

export const MIN_BOX_PX = 8;

/**
 * Resize from a handle by a pointer delta. `keepAspect` preserves the starting
 * ratio (images by default); the opposite edge or corner stays pinned.
 */
export function resizeRect(start: Rect, handle: Handle, dx: number, dy: number, keepAspect: boolean): Rect {
  let { x, y, w, h } = start;
  const east = handle.includes("e");
  const west = handle.includes("w");
  const north = handle.includes("n");
  const south = handle.includes("s");

  if (east) w = start.w + dx;
  if (west) w = start.w - dx;
  if (south) h = start.h + dy;
  if (north) h = start.h - dy;
  w = Math.max(MIN_BOX_PX, w);
  h = Math.max(MIN_BOX_PX, h);

  if (keepAspect && start.h > 0) {
    const ratio = start.w / start.h;
    const horizontalOnly = (east || west) && !(north || south);
    const verticalOnly = (north || south) && !(east || west);
    if (horizontalOnly) h = w / ratio;
    else if (verticalOnly) w = h * ratio;
    else if (w / h > ratio) h = w / ratio; // corner: follow the larger change
    else w = h * ratio;
  }

  if (west) x = start.x + start.w - w;
  if (north) y = start.y + start.h - h;
  // Edge handles on an aspect-locked box grow the other axis around its centre.
  if (keepAspect && (east || west) && !(north || south)) y = start.y + (start.h - h) / 2;
  if (keepAspect && (north || south) && !(east || west)) x = start.x + (start.w - w) / 2;
  return { x, y, w, h };
}

/** Snap targets: page edges and centre lines plus every other box's edges and centres. */
export function snapTargets(page: { widthPx: number; heightPx: number }, others: Rect[]): { xs: number[]; ys: number[] } {
  const xs = [0, page.widthPx / 2, page.widthPx];
  const ys = [0, page.heightPx / 2, page.heightPx];
  for (const r of others) {
    xs.push(r.x, r.x + r.w / 2, r.x + r.w);
    ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { xs, ys };
}

function nearest(candidates: number[], targets: number[], threshold: number): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const c of candidates) {
    for (const t of targets) {
      const delta = t - c;
      if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t };
    }
  }
  return best;
}

/** Snap a moving box's left/centre/right and top/middle/bottom to the closest targets. */
export function snapMove(
  rect: Rect,
  targets: { xs: number[]; ys: number[] },
  threshold: number,
): { rect: Rect; guides: Guide[] } {
  const guides: Guide[] = [];
  const sx = nearest([rect.x, rect.x + rect.w / 2, rect.x + rect.w], targets.xs, threshold);
  const sy = nearest([rect.y, rect.y + rect.h / 2, rect.y + rect.h], targets.ys, threshold);
  const out = { ...rect };
  if (sx) {
    out.x += sx.delta;
    guides.push({ axis: "x", at: sx.at });
  }
  if (sy) {
    out.y += sy.delta;
    guides.push({ axis: "y", at: sy.at });
  }
  return { rect: out, guides };
}

export const pctToPx = (r: Rect, page: { widthPx: number; heightPx: number }): Rect => ({
  x: (r.x / 100) * page.widthPx,
  y: (r.y / 100) * page.heightPx,
  w: (r.w / 100) * page.widthPx,
  h: (r.h / 100) * page.heightPx,
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Keep a % box inside what design validation accepts (position −50…150, size 0.5…200). */
export const clampPct = (r: Rect): Rect => ({
  x: Math.min(150, Math.max(-50, r.x)),
  y: Math.min(150, Math.max(-50, r.y)),
  w: Math.min(200, Math.max(0.5, r.w)),
  h: Math.min(200, Math.max(0.5, r.h)),
});

/**
 * Font sizes are stored as % of page height but shown in points, as they will
 * print: the PDF page's long edge is 842 pt (A4), so an A4-landscape page is
 * 595 pt tall and 4 % ≈ 23.8 pt.
 */
export function pctToPt(sizePct: number, page: { widthPx: number; heightPx: number }): number {
  const pageHeightPt = (page.heightPx * 842) / Math.max(page.widthPx, page.heightPx);
  return Math.round(((sizePct / 100) * pageHeightPt) * 10) / 10;
}

export function ptToPct(pt: number, page: { widthPx: number; heightPx: number }): number {
  const pageHeightPt = (page.heightPx * 842) / Math.max(page.widthPx, page.heightPx);
  return Math.round((pt / pageHeightPt) * 100 * 100) / 100;
}

export const pxToPct = (r: Rect, page: { widthPx: number; heightPx: number }): Rect => ({
  x: r3((r.x / page.widthPx) * 100),
  y: r3((r.y / page.heightPx) * 100),
  w: r3((r.w / page.widthPx) * 100),
  h: r3((r.h / page.heightPx) * 100),
});
