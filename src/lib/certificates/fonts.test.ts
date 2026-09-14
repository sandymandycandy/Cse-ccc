import { describe, it, expect } from "vitest";
import {
  ALL_FACES,
  faceFor,
  familyFromCss,
  fontFaceCss,
  hasVariant,
  variantOf,
  cssFamily,
} from "./fonts";

describe("fonts registry", () => {
  it("lists 24 faces across the 8 families", () => {
    expect(ALL_FACES).toHaveLength(24);
    expect(ALL_FACES).toContain("playfair-bi");
    expect(ALL_FACES).toContain("pinyon-r");
  });

  it("maps bold/italic to a variant", () => {
    expect(variantOf(false, false)).toBe("r");
    expect(variantOf(true, false)).toBe("b");
    expect(variantOf(false, true)).toBe("i");
    expect(variantOf(true, true)).toBe("bi");
  });

  it("knows which families lack bold or italic", () => {
    expect(hasVariant("lora", true, true)).toBe(true);
    expect(hasVariant("cinzel", true, false)).toBe(true);
    expect(hasVariant("cinzel", false, true)).toBe(false);
    expect(hasVariant("greatvibes", true, false)).toBe(false);
  });

  it("falls back to the regular face for an unavailable combination", () => {
    expect(faceFor("montserrat", true, true)).toBe("montserrat-bi");
    expect(faceFor("greatvibes", true, true)).toBe("greatvibes-r");
  });

  it("round-trips the CSS family name", () => {
    expect(familyFromCss(cssFamily("poppins"))).toBe("poppins");
    expect(familyFromCss('"cert-lora", serif')).toBe("lora");
    expect(familyFromCss("Arial")).toBeNull();
  });

  it("emits one @font-face per face", () => {
    const css = fontFaceCss();
    expect(css.match(/@font-face/g)).toHaveLength(24);
    expect(css).toContain('src:url("/fonts/cert/cinzel-b.ttf")');
    expect(css).toContain("font-weight:700;font-style:italic");
  });
});
