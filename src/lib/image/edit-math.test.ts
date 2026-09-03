import { describe, it, expect } from "vitest";
import {
  FRAME_WIDTH,
  orientedSize,
  resolveFrame,
  coverFrame,
  containZoom,
  coverZoom,
  maxOffset,
  clampOffset,
  fitWholeState,
  minZoom,
  applyAspect,
  applyQuarterTurn,
  applyStraighten,
  outputSize,
  drawPlan,
  type EditState,
  type Size,
} from "./edit-math";

const LANDSCAPE: Size = { width: 2000, height: 1000 };
const PORTRAIT: Size = { width: 1000, height: 2000 };

function state(over: Partial<EditState> = {}): EditState {
  return {
    aspect: null,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    quarterTurns: 0,
    straightenDeg: 0,
    flipH: false,
    flipV: false,
    ...over,
  };
}

describe("orientedSize — 90° turns swap the axes", () => {
  it("leaves the size alone for 0 and 180 degrees", () => {
    expect(orientedSize(LANDSCAPE, 0)).toEqual({ width: 2000, height: 1000 });
    expect(orientedSize(LANDSCAPE, 2)).toEqual({ width: 2000, height: 1000 });
  });

  it("swaps width and height for 90 and 270 degrees", () => {
    expect(orientedSize(LANDSCAPE, 1)).toEqual({ width: 1000, height: 2000 });
    expect(orientedSize(LANDSCAPE, 3)).toEqual({ width: 1000, height: 2000 });
  });
});

describe("resolveFrame — the crop frame in canonical units", () => {
  it("is 1000 wide at the requested aspect", () => {
    const f = resolveFrame(state({ aspect: 3 / 2 }), LANDSCAPE);
    expect(f.width).toBe(FRAME_WIDTH);
    expect(f.height).toBeCloseTo(1000 / (3 / 2), 6);
  });

  it("falls back to the image's own aspect when no preset is chosen", () => {
    const f = resolveFrame(state({ aspect: null }), PORTRAIT);
    expect(f.width / f.height).toBeCloseTo(1000 / 2000, 6);
  });

  it("uses the rotated aspect when the image has been turned", () => {
    const f = resolveFrame(state({ aspect: null, quarterTurns: 1 }), LANDSCAPE);
    expect(f.width / f.height).toBeCloseTo(0.5, 6);
  });
});

describe("coverFrame — straightening needs a bigger area to stay covered", () => {
  it("returns the frame untouched at 0 degrees", () => {
    expect(coverFrame({ width: 1000, height: 500 }, 0)).toEqual({ width: 1000, height: 500 });
  });

  it("swaps the axes at 90 degrees", () => {
    const c = coverFrame({ width: 1000, height: 500 }, 90);
    expect(c.width).toBeCloseTo(500, 6);
    expect(c.height).toBeCloseTo(1000, 6);
  });

  it("grows both axes at 45 degrees", () => {
    const c = coverFrame({ width: 1000, height: 500 }, 45);
    const expected = (1000 + 500) * Math.SQRT1_2;
    expect(c.width).toBeCloseTo(expected, 4);
    expect(c.height).toBeCloseTo(expected, 4);
  });

  it("treats a tilt as the same size either way round", () => {
    expect(coverFrame({ width: 800, height: 600 }, -7)).toEqual(
      coverFrame({ width: 800, height: 600 }, 7),
    );
  });
});

describe("containZoom / coverZoom", () => {
  it("contain fits the whole image inside the frame", () => {
    expect(containZoom(LANDSCAPE, { width: 1000, height: 1000 })).toBeCloseTo(0.5, 6);
  });

  it("cover fills the frame completely", () => {
    expect(coverZoom(LANDSCAPE, { width: 1000, height: 1000 })).toBeCloseTo(1, 6);
  });

  it("agree when the frame matches the image aspect", () => {
    const frame = { width: 1000, height: 500 };
    expect(containZoom(LANDSCAPE, frame)).toBeCloseTo(coverZoom(LANDSCAPE, frame), 6);
  });
});

describe("maxOffset — you cannot drag empty space into the frame", () => {
  it("pins to the centre when the image is smaller than the frame", () => {
    expect(maxOffset(LANDSCAPE, { width: 1000, height: 1000 }, 0.4)).toEqual({ x: 0, y: 0 });
  });

  it("allows exactly the overhang on each side", () => {
    expect(maxOffset(LANDSCAPE, { width: 1000, height: 1000 }, 1)).toEqual({ x: 500, y: 0 });
  });

  it("uses the rotated size once the image has been turned", () => {
    expect(maxOffset(orientedSize(LANDSCAPE, 1), { width: 1000, height: 1000 }, 1)).toEqual({
      x: 0,
      y: 500,
    });
  });

  it("shrinks the allowance when the image is straightened", () => {
    const upright = maxOffset(LANDSCAPE, { width: 1000, height: 500 }, 1, 0);
    const tilted = maxOffset(LANDSCAPE, { width: 1000, height: 500 }, 1, 10);
    expect(tilted.x).toBeLessThan(upright.x);
  });
});

describe("clampOffset", () => {
  it("leaves an in-range pan untouched", () => {
    const s = clampOffset(state({ aspect: 1, zoom: 1, offsetX: 200 }), LANDSCAPE);
    expect(s.offsetX).toBe(200);
  });

  it("pulls an out-of-range pan back to the edge", () => {
    const s = clampOffset(state({ aspect: 1, zoom: 1, offsetX: 9999 }), LANDSCAPE);
    expect(s.offsetX).toBe(500);
  });

  it("clamps the negative direction too", () => {
    const s = clampOffset(state({ aspect: 1, zoom: 1, offsetY: -9999 }), LANDSCAPE);
    expect(s.offsetY).toBe(0);
  });
});

describe("fitWholeState — the nothing-is-cut guarantee", () => {
  it("centres the image and drops any aspect preset", () => {
    const s = fitWholeState(state({ aspect: 1, zoom: 4, offsetX: 300, offsetY: -80 }), PORTRAIT);
    expect(s.aspect).toBeNull();
    expect(s.offsetX).toBe(0);
    expect(s.offsetY).toBe(0);
  });

  it("leaves no part of the image outside the frame", () => {
    const s = fitWholeState(state({ aspect: 16 / 9, zoom: 3 }), PORTRAIT);
    const frame = resolveFrame(s, PORTRAIT);
    const oriented = orientedSize(PORTRAIT, s.quarterTurns);
    expect(oriented.width * s.zoom).toBeLessThanOrEqual(frame.width + 1e-6);
    expect(oriented.height * s.zoom).toBeLessThanOrEqual(frame.height + 1e-6);
  });

  it("keeps the quarter turns and flips the user already chose", () => {
    const s = fitWholeState(state({ quarterTurns: 3, flipH: true }), LANDSCAPE);
    expect(s.quarterTurns).toBe(3);
    expect(s.flipH).toBe(true);
  });

  it("drops any straighten, because a tilted image cannot fill its own frame", () => {
    // A rotated rectangle always leaves empty corner wedges inside its bounding
    // box, so "show everything" and "no gaps" are mutually exclusive at a tilt.
    const s = fitWholeState(state({ straightenDeg: 4 }), LANDSCAPE);
    expect(s.straightenDeg).toBe(0);
  });
});

describe("minZoom — the frame is never allowed to show a gap", () => {
  it("equals the plain cover zoom when the image is upright", () => {
    const s = state({ aspect: 1 });
    expect(minZoom(s, LANDSCAPE)).toBeCloseTo(coverZoom(LANDSCAPE, { width: 1000, height: 1000 }), 6);
  });

  it("rises once the image is straightened", () => {
    expect(minZoom(state({ aspect: 1, straightenDeg: 8 }), LANDSCAPE)).toBeGreaterThan(
      minZoom(state({ aspect: 1 }), LANDSCAPE),
    );
  });

  it("is exactly the fit-whole zoom when the frame follows the image", () => {
    const fitted = fitWholeState(state(), PORTRAIT);
    expect(minZoom(fitted, PORTRAIT)).toBeCloseTo(fitted.zoom, 6);
  });
});

describe("applyAspect — switching crop shape must not open a gap", () => {
  it("zooms in far enough to cover a tighter frame", () => {
    // A 2:1 landscape fitted to its own shape is only half as tall as a square
    // frame, so squaring the crop must zoom in to avoid bars top and bottom.
    const fitted = fitWholeState(state(), LANDSCAPE);
    const square = applyAspect(fitted, LANDSCAPE, 1);
    expect(square.zoom).toBeGreaterThan(fitted.zoom);
    expect(square.zoom).toBeCloseTo(minZoom(square, LANDSCAPE), 6);
  });

  it("needs no extra zoom when the crop only trims the long axis", () => {
    // The same move on a portrait just cuts top and bottom — already covered.
    const fitted = fitWholeState(state(), PORTRAIT);
    expect(applyAspect(fitted, PORTRAIT, 1).zoom).toBeCloseTo(fitted.zoom, 6);
  });

  it("records the chosen aspect", () => {
    expect(applyAspect(state(), PORTRAIT, 16 / 9).aspect).toBeCloseTo(16 / 9, 6);
  });

  it("keeps a zoom that already covers the new frame", () => {
    const zoomed = { ...fitWholeState(state(), LANDSCAPE), zoom: 5 };
    expect(applyAspect(zoomed, LANDSCAPE, 3 / 2).zoom).toBe(5);
  });

  it("pulls the pan back inside the new frame", () => {
    const panned = applyAspect({ ...fitWholeState(state(), LANDSCAPE), offsetX: 9999 }, LANDSCAPE, 1);
    const oriented = orientedSize(LANDSCAPE, 0);
    const limit = maxOffset(oriented, resolveFrame(panned, LANDSCAPE), panned.zoom);
    expect(panned.offsetX).toBeLessThanOrEqual(limit.x + 1e-6);
  });
});

describe("applyQuarterTurn", () => {
  it("advances clockwise and wraps past 270 degrees", () => {
    expect(applyQuarterTurn(state({ quarterTurns: 3 }), LANDSCAPE, 1).quarterTurns).toBe(0);
  });

  it("goes anticlockwise without producing a negative turn", () => {
    expect(applyQuarterTurn(state({ quarterTurns: 0 }), LANDSCAPE, -1).quarterTurns).toBe(3);
  });

  it("zooms out to fit the new orientation when the frame follows the image", () => {
    const fitted = fitWholeState(state(), LANDSCAPE);
    const turned = applyQuarterTurn(fitted, LANDSCAPE, 1);
    expect(turned.zoom).toBeCloseTo(minZoom(turned, LANDSCAPE), 6);
  });

  it("zooms in to keep a fixed aspect covered after turning", () => {
    const wide = applyAspect(fitWholeState(state(), LANDSCAPE), LANDSCAPE, 16 / 9);
    const turned = applyQuarterTurn(wide, LANDSCAPE, 1);
    expect(turned.zoom).toBeGreaterThanOrEqual(minZoom(turned, LANDSCAPE) - 1e-6);
  });
});

describe("applyStraighten", () => {
  it("records the tilt", () => {
    expect(applyStraighten(fitWholeState(state(), LANDSCAPE), LANDSCAPE, 6).straightenDeg).toBe(6);
  });

  it("zooms in so the tilt never exposes a corner", () => {
    const flat = fitWholeState(state(), LANDSCAPE);
    const tilted = applyStraighten(flat, LANDSCAPE, 6);
    expect(tilted.zoom).toBeGreaterThan(flat.zoom);
    expect(tilted.zoom).toBeGreaterThanOrEqual(minZoom(tilted, LANDSCAPE) - 1e-6);
  });

  it("returns to the flat zoom when the tilt is undone", () => {
    const flat = fitWholeState(state(), LANDSCAPE);
    const back = applyStraighten(applyStraighten(flat, LANDSCAPE, 6), LANDSCAPE, 0);
    expect(back.zoom).toBeCloseTo(flat.zoom, 6);
  });
});

describe("outputSize", () => {
  it("caps the long edge", () => {
    expect(outputSize({ width: 1000, height: 500 }, 0.25, 1600)).toEqual({
      width: 1600,
      height: 800,
    });
  });

  it("never upscales past the pixels actually available", () => {
    expect(outputSize({ width: 1000, height: 500 }, 2, 4000)).toEqual({ width: 500, height: 250 });
  });

  it("caps the long edge when the crop is portrait", () => {
    expect(outputSize({ width: 500, height: 1000 }, 0.25, 1600)).toEqual({
      width: 800,
      height: 1600,
    });
  });

  it("never returns a zero dimension", () => {
    const out = outputSize({ width: 1000, height: 1 }, 0.001, 10);
    expect(out.width).toBeGreaterThanOrEqual(1);
    expect(out.height).toBeGreaterThanOrEqual(1);
  });
});

describe("drawPlan — what render.ts replays onto the canvas", () => {
  it("maps the canonical frame onto the output canvas", () => {
    const plan = drawPlan(state(), LANDSCAPE, { width: 2000, height: 1000 });
    expect(plan.outScale).toBeCloseTo(2000 / FRAME_WIDTH, 6);
    expect(plan.canvas).toEqual({ width: 2000, height: 1000 });
  });

  it("folds zoom and flips into one signed scale", () => {
    const plan = drawPlan(state({ zoom: 0.5, flipH: true }), LANDSCAPE, {
      width: 1000,
      height: 500,
    });
    expect(plan.scaleX).toBeCloseTo(-0.5, 6);
    expect(plan.scaleY).toBeCloseTo(0.5, 6);
  });

  it("flips vertically without touching the horizontal scale", () => {
    const plan = drawPlan(state({ zoom: 2, flipV: true }), LANDSCAPE, { width: 100, height: 50 });
    expect(plan.scaleX).toBeCloseTo(2, 6);
    expect(plan.scaleY).toBeCloseTo(-2, 6);
  });

  it("adds the straighten angle to the quarter turns", () => {
    const plan = drawPlan(state({ quarterTurns: 1, straightenDeg: 5 }), LANDSCAPE, {
      width: 100,
      height: 100,
    });
    expect(plan.rotateRad).toBeCloseTo(((90 + 5) * Math.PI) / 180, 6);
  });

  it("passes the pan through in canonical units", () => {
    const plan = drawPlan(state({ offsetX: 120, offsetY: -40 }), LANDSCAPE, {
      width: 100,
      height: 50,
    });
    expect(plan.offsetX).toBe(120);
    expect(plan.offsetY).toBe(-40);
  });

  it("carries the natural image size for centring the drawImage call", () => {
    const plan = drawPlan(state(), LANDSCAPE, { width: 100, height: 50 });
    expect(plan.image).toEqual(LANDSCAPE);
  });
});

/**
 * These replay drawPlan's numbers through the same matrix the canvas builds, so
 * the WYSIWYG contract is checked as arithmetic rather than by eye: where does
 * an image corner actually land on the exported canvas?
 */
describe("drawPlan — where the image lands on the canvas", () => {
  type Pt = { x: number; y: number };

  /** Compose T(centre)·S(outScale)·T(offset)·R(θ)·S(zoom·flip), then apply. */
  function project(plan: ReturnType<typeof drawPlan>, p: Pt): Pt {
    let { x, y } = p;
    x *= plan.scaleX;
    y *= plan.scaleY;
    const cos = Math.cos(plan.rotateRad);
    const sin = Math.sin(plan.rotateRad);
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
    x += plan.offsetX;
    y += plan.offsetY;
    x *= plan.outScale;
    y *= plan.outScale;
    return { x: x + plan.canvas.width / 2, y: y + plan.canvas.height / 2 };
  }

  function corners(size: Size): Pt[] {
    return [
      { x: -size.width / 2, y: -size.height / 2 },
      { x: size.width / 2, y: -size.height / 2 },
      { x: size.width / 2, y: size.height / 2 },
      { x: -size.width / 2, y: size.height / 2 },
    ];
  }

  it("lands the image exactly on the canvas edges when fitted whole", () => {
    const s = fitWholeState(state(), PORTRAIT);
    const frame = resolveFrame(s, PORTRAIT);
    const out = outputSize(frame, s.zoom, 1600);
    const plan = drawPlan(s, PORTRAIT, out);
    const [tl, , br] = corners(PORTRAIT).map((c) => project(plan, c));

    expect(tl.x).toBeCloseTo(0, 4);
    expect(tl.y).toBeCloseTo(0, 4);
    expect(br.x).toBeCloseTo(out.width, 4);
    expect(br.y).toBeCloseTo(out.height, 4);
  });

  it("covers every canvas pixel when a landscape is cropped square", () => {
    const s = applyAspect(fitWholeState(state(), LANDSCAPE), LANDSCAPE, 1);
    const frame = resolveFrame(s, LANDSCAPE);
    const out = outputSize(frame, s.zoom, 1600);
    const plan = drawPlan(s, LANDSCAPE, out);
    const pts = corners(LANDSCAPE).map((c) => project(plan, c));
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);

    // The drawn image must extend past every edge — no transparent gap.
    expect(Math.min(...xs)).toBeLessThanOrEqual(1e-4);
    expect(Math.min(...ys)).toBeLessThanOrEqual(1e-4);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(out.width - 1e-4);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(out.height - 1e-4);
  });

  it("still covers the canvas at the pan limit", () => {
    const base = applyAspect(fitWholeState(state(), LANDSCAPE), LANDSCAPE, 1);
    const s = clampOffset({ ...base, offsetX: 99999 }, LANDSCAPE);
    const frame = resolveFrame(s, LANDSCAPE);
    const out = outputSize(frame, s.zoom, 1600);
    const plan = drawPlan(s, LANDSCAPE, out);
    const xs = corners(LANDSCAPE).map((c) => project(plan, c).x);

    expect(Math.min(...xs)).toBeLessThanOrEqual(1e-4);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(out.width - 1e-4);
  });

  it("still covers the canvas at full straighten", () => {
    const base = applyAspect(fitWholeState(state(), LANDSCAPE), LANDSCAPE, 3 / 2);
    const s = applyStraighten(base, LANDSCAPE, 15);
    const frame = resolveFrame(s, LANDSCAPE);
    const out = outputSize(frame, s.zoom, 1600);
    const plan = drawPlan(s, LANDSCAPE, out);
    const pts = corners(LANDSCAPE).map((c) => project(plan, c));

    // Every canvas corner must be inside the rotated image quad.
    for (const corner of [
      { x: 0, y: 0 },
      { x: out.width, y: 0 },
      { x: out.width, y: out.height },
      { x: 0, y: out.height },
    ]) {
      const inside = pts.every((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return (q.x - p.x) * (corner.y - p.y) - (q.y - p.y) * (corner.x - p.x) >= -1e-3;
      });
      expect(inside).toBe(true);
    }
  });

  it("mirrors horizontally without moving the image off the canvas", () => {
    const s = { ...fitWholeState(state(), LANDSCAPE), flipH: true };
    const frame = resolveFrame(s, LANDSCAPE);
    const out = outputSize(frame, s.zoom, 1600);
    const plan = drawPlan(s, LANDSCAPE, out);
    const xs = corners(LANDSCAPE).map((c) => project(plan, c).x);

    expect(Math.min(...xs)).toBeCloseTo(0, 4);
    expect(Math.max(...xs)).toBeCloseTo(out.width, 4);
  });
});
