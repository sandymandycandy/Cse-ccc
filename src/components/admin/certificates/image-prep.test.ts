import { describe, it, expect } from "vitest";
import { fitSize, isAcceptedImage, planImagePrep } from "./image-prep";

const MB = 1024 * 1024;

describe("fitSize", () => {
  it("scales templates into A4 at 300 dpi in either orientation, never up", () => {
    expect(fitSize(7016, 4960, "template")).toEqual({ width: 3508, height: 2480 });
    expect(fitSize(2480, 7016, "template")).toEqual({ width: 1240, height: 3508 });
    expect(fitSize(2000, 1414, "template")).toEqual({ width: 2000, height: 1414 });
  });

  it("caps logos and signatures at a 2000 px long edge", () => {
    expect(fitSize(4000, 1000, "image")).toEqual({ width: 2000, height: 500 });
    expect(fitSize(300, 300, "image")).toEqual({ width: 300, height: 300 });
  });
});

describe("planImagePrep", () => {
  it("uploads a right-sized PNG untouched", () => {
    expect(planImagePrep({ type: "image/png", size: MB }, { width: 400, height: 400 }, "image").redraw).toBe(false);
  });

  it("always redraws JPEGs so EXIF rotation is baked in", () => {
    expect(planImagePrep({ type: "image/jpeg", size: MB }, { width: 3000, height: 2000 }, "template")).toEqual({
      redraw: true,
      width: 3000,
      height: 2000,
      output: "jpeg",
    });
  });

  it("rasterises SVG and WebP to PNG", () => {
    expect(planImagePrep({ type: "image/svg+xml", size: 2000 }, { width: 500, height: 200 }, "image")).toEqual({
      redraw: true,
      width: 500,
      height: 200,
      output: "png",
    });
  });

  it("re-encodes a heavy PNG template as JPEG when opaque", () => {
    expect(planImagePrep({ type: "image/png", size: 5 * MB }, { width: 3508, height: 2480 }, "template")).toMatchObject({
      redraw: true,
      output: "auto",
    });
  });

  it("keeps PNG output for logos so transparency survives", () => {
    expect(planImagePrep({ type: "image/png", size: 5 * MB }, { width: 4000, height: 4000 }, "image").output).toBe("png");
  });

  it("accepts only the four supported types", () => {
    expect(isAcceptedImage("image/webp")).toBe(true);
    expect(isAcceptedImage("image/gif")).toBe(false);
  });
});
