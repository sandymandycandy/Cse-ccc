/**
 * Geometry for the admin image editor. Pure numbers in, pure numbers out — no
 * DOM, no canvas — so every crop/rotate/zoom decision is unit-testable.
 *
 * ## The canonical frame
 *
 * All editor state is expressed against a crop frame that is always
 * `FRAME_WIDTH` units wide, with its height set by the chosen aspect. That
 * keeps the state resolution-independent: the on-screen stage can be any pixel
 * size (and can resize with the window) without the crop drifting, and the
 * exported canvas can be any size without a second coordinate system.
 *
 * `zoom` is therefore "canonical units per image pixel", and `offsetX/offsetY`
 * are a pan in canonical units, measured in *screen* space (i.e. after the
 * rotation is applied) so that dragging always follows the pointer.
 *
 * ## Why the transform order matters
 *
 * `drawPlan()` emits the ops in the exact order both the CSS live preview and
 * the canvas export replay them:
 *
 *     translate(centre) → scale(outScale) → translate(offset)
 *                       → rotate(angle) → scale(zoom·flip) → drawImage(centred)
 *
 * CSS and canvas compose transforms the same way (each new op applies to the
 * inner coordinate system), so the preview and the exported file agree to the
 * pixel. That agreement is the whole point of the editor — change this order in
 * one place and the preview quietly stops matching what uploads.
 */

export interface Size {
  width: number;
  height: number;
}

/** Clockwise 90° steps. */
export type QuarterTurns = 0 | 1 | 2 | 3;

export interface EditState {
  /** Crop aspect (w/h), or null to follow the image's own (rotated) shape. */
  aspect: number | null;
  /** Canonical units per image pixel. */
  zoom: number;
  /** Pan in canonical units, in screen space. */
  offsetX: number;
  offsetY: number;
  quarterTurns: QuarterTurns;
  /** Fine tilt correction, degrees. Added on top of the quarter turns. */
  straightenDeg: number;
  flipH: boolean;
  flipV: boolean;
}

export interface DrawPlan {
  /** Output canvas size, in pixels. */
  canvas: Size;
  /** Maps canonical units onto output pixels. */
  outScale: number;
  offsetX: number;
  offsetY: number;
  rotateRad: number;
  /** Zoom with the flip folded in as a sign. */
  scaleX: number;
  scaleY: number;
  /** Natural image size, for centring the drawImage call. */
  image: Size;
}

export const FRAME_WIDTH = 1000;

const RAD = Math.PI / 180;

/** Normalise -0 to 0 so clamped values compare cleanly. */
function clamp(value: number, limit: number): number {
  const c = Math.min(Math.max(value, -limit), limit);
  return c === 0 ? 0 : c;
}

/** The image's size after its 90° turns — odd turns swap the axes. */
export function orientedSize(natural: Size, quarterTurns: QuarterTurns): Size {
  return quarterTurns % 2 === 0
    ? { width: natural.width, height: natural.height }
    : { width: natural.height, height: natural.width };
}

/** The crop frame in canonical units. A null aspect follows the rotated image. */
export function resolveFrame(state: EditState, natural: Size): Size {
  const oriented = orientedSize(natural, state.quarterTurns);
  const aspect = state.aspect ?? oriented.width / oriented.height;
  return { width: FRAME_WIDTH, height: FRAME_WIDTH / aspect };
}

/**
 * The axis-aligned area a tilted image must span to keep `frame` fully covered.
 * Rotating by θ means the frame's corners sweep outside its own box, so cover
 * and pan limits are computed against this grown box rather than the frame.
 */
export function coverFrame(frame: Size, deg: number): Size {
  const c = Math.abs(Math.cos(deg * RAD));
  const s = Math.abs(Math.sin(deg * RAD));
  return {
    width: frame.width * c + frame.height * s,
    height: frame.width * s + frame.height * c,
  };
}

/** Largest zoom that still fits the whole image inside the frame. */
export function containZoom(oriented: Size, frame: Size): number {
  return Math.min(frame.width / oriented.width, frame.height / oriented.height);
}

/** Smallest zoom that leaves no gap in the frame. */
export function coverZoom(oriented: Size, frame: Size): number {
  return Math.max(frame.width / oriented.width, frame.height / oriented.height);
}

/**
 * How far the image may be panned before a gap would show. Zero on an axis
 * means the image is no wider/taller than the frame, so it stays centred.
 */
export function maxOffset(
  oriented: Size,
  frame: Size,
  zoom: number,
  straightenDeg = 0,
): { x: number; y: number } {
  const needed = coverFrame(frame, straightenDeg);
  return {
    x: Math.max(0, (oriented.width * zoom - needed.width) / 2),
    y: Math.max(0, (oriented.height * zoom - needed.height) / 2),
  };
}

/** Pull a pan back inside the range where the frame stays covered. */
export function clampOffset(state: EditState, natural: Size): EditState {
  const oriented = orientedSize(natural, state.quarterTurns);
  const limit = maxOffset(oriented, resolveFrame(state, natural), state.zoom, state.straightenDeg);
  return { ...state, offsetX: clamp(state.offsetX, limit.x), offsetY: clamp(state.offsetY, limit.y) };
}

/**
 * "Fit whole image": nothing cut, nothing letterboxed — the frame simply takes
 * the image's own shape.
 *
 * The straighten is deliberately reset. A rotated rectangle always leaves empty
 * wedges inside its own bounding box, so "show everything" and "no gaps" cannot
 * both hold at a tilt; dropping the tilt is the only honest reading of "fit".
 * Quarter turns and flips survive — they change the shape, not the coverage.
 */
export function fitWholeState(state: EditState, natural: Size): EditState {
  const next: EditState = {
    ...state,
    aspect: null,
    offsetX: 0,
    offsetY: 0,
    straightenDeg: 0,
  };
  const oriented = orientedSize(natural, next.quarterTurns);
  return { ...next, zoom: containZoom(oriented, resolveFrame(next, natural)) };
}

/** The smallest zoom that keeps the frame gap-free at the current tilt. */
export function minZoom(state: EditState, natural: Size): number {
  const oriented = orientedSize(natural, state.quarterTurns);
  const frame = coverFrame(resolveFrame(state, natural), state.straightenDeg);
  return coverZoom(oriented, frame);
}

/**
 * Re-settle a state after something changed the frame or the tilt.
 *
 * If the zoom was resting on the old floor, it follows the new floor — up *or
 * down* — so undoing a tilt or a turn gives the framing back rather than
 * leaving the image stranded at a zoom the user never chose. A zoom the user
 * pushed past the floor is kept, and only raised if it would open a gap.
 */
function resettle(prev: EditState, next: EditState, natural: Size): EditState {
  const restingOnFloor = Math.abs(prev.zoom - minZoom(prev, natural)) < 1e-6;
  const floor = minZoom(next, natural);
  return clampOffset(
    { ...next, zoom: restingOnFloor ? floor : Math.max(prev.zoom, floor) },
    natural,
  );
}

/** Switch crop shape. Null follows the image; a preset never opens a gap. */
export function applyAspect(state: EditState, natural: Size, aspect: number | null): EditState {
  return resettle(state, { ...state, aspect }, natural);
}

/** Turn by `delta` 90° steps, wrapping in both directions. */
export function applyQuarterTurn(state: EditState, natural: Size, delta: number): EditState {
  const quarterTurns = (((state.quarterTurns + delta) % 4) + 4) % 4;
  return resettle(state, { ...state, quarterTurns: quarterTurns as QuarterTurns }, natural);
}

/** Set the fine tilt, zooming just enough that no corner is exposed. */
export function applyStraighten(state: EditState, natural: Size, deg: number): EditState {
  return resettle(state, { ...state, straightenDeg: deg }, natural);
}

/**
 * Output pixel size for the current crop, capped on the long edge. Never
 * upscales: a tightly zoomed crop exports only the pixels actually available,
 * so a big cap can't invent detail (or file size) that isn't there.
 */
export function outputSize(frame: Size, zoom: number, longEdgeCap: number): Size {
  const srcW = frame.width / zoom;
  const srcH = frame.height / zoom;
  const scale = Math.min(1, longEdgeCap / Math.max(srcW, srcH));
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

/** The transform the CSS preview and the canvas export both replay. */
export function drawPlan(state: EditState, natural: Size, output: Size): DrawPlan {
  return {
    canvas: output,
    outScale: output.width / FRAME_WIDTH,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    rotateRad: (state.quarterTurns * 90 + state.straightenDeg) * RAD,
    scaleX: state.zoom * (state.flipH ? -1 : 1),
    scaleY: state.zoom * (state.flipV ? -1 : 1),
    image: natural,
  };
}
