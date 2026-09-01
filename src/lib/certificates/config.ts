/**
 * Certificate name-placement config — pure, shared by the admin positioner
 * preview and the server-side PDF renderer so the two agree pixel-for-pixel.
 *
 * All positions are PERCENTAGES of the template image (not pixels), so a preview
 * rendered at any display size maps to the full-resolution PDF unchanged. The
 * anchor (nameXPct, nameYPct) is the VISUAL CENTRE of the name; `align` says
 * which edge of the text sits on the anchor horizontally.
 */
import { z } from "zod";

export interface CertificateConfig {
  /** Anchor X, 0–100, % of image width. */
  nameXPct: number;
  /** Anchor Y (from the top), 0–100, % of image height. */
  nameYPct: number;
  /** Font height as a % of image height (e.g. 4 = 4%). */
  fontPct: number;
  /** Which edge of the text sits on the anchor. */
  align: "left" | "center" | "right";
  /** Ink colour, #rrggbb. */
  color: string;
}

export const DEFAULT_CERTIFICATE_CONFIG: CertificateConfig = {
  nameXPct: 60,
  nameYPct: 47,
  fontPct: 4,
  align: "center",
  color: "#1a1a1a",
};

const Schema = z.object({
  nameXPct: z.coerce.number().min(0).max(100),
  nameYPct: z.coerce.number().min(0).max(100),
  fontPct: z.coerce.number().min(0.5).max(30),
  align: z.enum(["left", "center", "right"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .transform((s) => s.toLowerCase()),
});

/** Parse+clamp a stored/submitted config, falling back to the default on junk. */
export function validateCertificateConfig(raw: unknown): CertificateConfig {
  const parsed = Schema.safeParse(raw);
  return parsed.success ? parsed.data : { ...DEFAULT_CERTIFICATE_CONFIG };
}

/**
 * Map the config + the measured drawn-text width to pdf-lib draw coordinates.
 * pdf-lib's origin is the BOTTOM-left and `drawText` positions the baseline, so
 * we convert the top-anchored visual centre to a bottom-left baseline. The 0.35
 * factor lifts the baseline to put the cap-height's midpoint on the anchor.
 */
export function computeNamePlacement(
  imgW: number,
  imgH: number,
  cfg: CertificateConfig,
  textWidth: number,
): { x: number; y: number; size: number } {
  const size = (cfg.fontPct / 100) * imgH;
  const anchorX = (cfg.nameXPct / 100) * imgW;
  const centerYFromTop = (cfg.nameYPct / 100) * imgH;
  const baselineFromTop = centerYFromTop + size * 0.35;
  const y = imgH - baselineFromTop;
  const x =
    cfg.align === "center"
      ? anchorX - textWidth / 2
      : cfg.align === "right"
        ? anchorX - textWidth
        : anchorX;
  return { x, y, size };
}
