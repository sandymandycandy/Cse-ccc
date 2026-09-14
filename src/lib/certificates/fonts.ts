import familyData from "./font-families.json";

/**
 * The bundled certificate fonts (spec §6.1). Static TTF instances live in
 * public/fonts/cert/<faceId>.ttf. The editor loads them with @font-face and
 * the PDF renderer reads the same files from disk, so both draw with identical
 * glyphs. font-families.json is the single list, shared with the two scripts.
 */

export type FontFamilyId =
  | "playfair"
  | "cormorant"
  | "lora"
  | "cinzel"
  | "montserrat"
  | "poppins"
  | "greatvibes"
  | "pinyon";

/** r = regular, b = bold, i = italic, bi = bold italic. */
export type FaceVariant = "r" | "b" | "i" | "bi";

/** Every face that actually ships (must match font-families.json). */
export type FaceId =
  | "playfair-r" | "playfair-b" | "playfair-i" | "playfair-bi"
  | "cormorant-r" | "cormorant-b" | "cormorant-i" | "cormorant-bi"
  | "lora-r" | "lora-b" | "lora-i" | "lora-bi"
  | "cinzel-r" | "cinzel-b"
  | "montserrat-r" | "montserrat-b" | "montserrat-i" | "montserrat-bi"
  | "poppins-r" | "poppins-b" | "poppins-i" | "poppins-bi"
  | "greatvibes-r"
  | "pinyon-r";

export interface FontFamily {
  id: FontFamilyId;
  label: string;
  googleName: string;
  oflDir: string;
  variants: readonly FaceVariant[];
}

/** Advance widths + vertical metrics for one face, in font units. */
export interface FaceMetrics {
  unitsPerEm: number;
  ascent: number;
  /** Negative: distance below the baseline. */
  descent: number;
  /** Negative: underline offset below the baseline. */
  underlinePosition: number;
  underlineThickness: number;
  /** Codepoint (decimal string) → advance width. A missing key = no glyph. */
  widths: Record<string, number>;
}

export const FONT_FAMILIES = familyData as readonly FontFamily[];

export const FONT_FAMILY_IDS: readonly FontFamilyId[] = FONT_FAMILIES.map((f) => f.id);

export const DEFAULT_FONT: FontFamilyId = "playfair";

export function familyById(id: FontFamilyId): FontFamily {
  const family = FONT_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error(`Unknown font family "${id}"`);
  return family;
}

export function variantOf(bold: boolean, italic: boolean): FaceVariant {
  if (bold && italic) return "bi";
  if (bold) return "b";
  if (italic) return "i";
  return "r";
}

/** Does this family ship the requested weight/style? (No synthetic faces.) */
export function hasVariant(id: FontFamilyId, bold: boolean, italic: boolean): boolean {
  return familyById(id).variants.includes(variantOf(bold, italic));
}

/**
 * The face to draw with. Validation rejects unavailable combinations, so the
 * regular fallback only guards against a stale design reaching the renderer.
 */
export function faceFor(id: FontFamilyId, bold: boolean, italic: boolean): FaceId {
  return (hasVariant(id, bold, italic) ? `${id}-${variantOf(bold, italic)}` : `${id}-r`) as FaceId;
}

export const faceFile = (face: FaceId): string => `${face}.ttf`;

/** CSS font-family name the editor registers each family under. */
export const cssFamily = (id: FontFamilyId): string => `cert-${id}`;

export function familyFromCss(css: string): FontFamilyId | null {
  const clean = css.replace(/["']/g, "").split(",")[0].trim();
  const id = clean.startsWith("cert-") ? clean.slice(5) : "";
  return (FONT_FAMILY_IDS as readonly string[]).includes(id) ? (id as FontFamilyId) : null;
}

/** @font-face rules for every bundled face, for the editor page. */
export function fontFaceCss(baseUrl = "/fonts/cert"): string {
  return FONT_FAMILIES.flatMap((family) =>
    family.variants.map((variant) => {
      const bold = variant === "b" || variant === "bi";
      const italic = variant === "i" || variant === "bi";
      return (
        `@font-face{font-family:"${cssFamily(family.id)}";` +
        `src:url("${baseUrl}/${family.id}-${variant}.ttf") format("truetype");` +
        `font-weight:${bold ? 700 : 400};font-style:${italic ? "italic" : "normal"};font-display:block}`
      );
    }),
  ).join("\n");
}

/** Every face id, in family order. */
export const ALL_FACES: readonly FaceId[] = FONT_FAMILIES.flatMap((f) =>
  f.variants.map((v) => `${f.id}-${v}` as FaceId),
);
