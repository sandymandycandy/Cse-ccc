/**
 * The v1 certificate setup (2026-09-01): one uploaded image plus one name
 * anchor, stored in `events.certificate_config`. Kept only so a v1 setup can be
 * converted into a design (`designFromLegacyConfig` in design.ts).
 *
 * Positions are PERCENTAGES of the template image. The anchor
 * (nameXPct, nameYPct) is the visual centre of the name; `align` says which
 * edge of the text sits on the anchor horizontally.
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
