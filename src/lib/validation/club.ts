import { z } from "zod";

/**
 * Club form input (admin CRUD). Split into the profile fields a club head may
 * edit on their own club, and the structural / identity fields that are
 * council-only (creating a club, or an org-wide admin editing one). Kept free of
 * `server-only` so the form component can import the category list.
 */

/** `club_category` enum values (DB: create type club_category as enum …). */
export const CLUB_CATEGORIES = ["tech", "media", "cultural", "wellness", "career"] as const;
export type ClubCategory = (typeof CLUB_CATEGORIES)[number];

/** Human labels for the category picker. */
export const CLUB_CATEGORY_LABELS: Record<ClubCategory, string> = {
  tech: "Technology",
  media: "Media",
  cultural: "Cultural",
  wellness: "Wellness",
  career: "Career",
};

/** URL slug: lowercase words joined by single hyphens (feeds /clubs/[slug]). */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Calendar colour: a 6-digit hex like #1f7a4d. */
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Empty text is stored as NULL, not "".
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional();

/** Fields a club head may edit on their own club. */
export const ClubProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  shortName: z.string().trim().min(1).max(40),
  tagline: optionalText(160),
  description: optionalText(2000),
});

/** Structural / identity fields — council-only (create + org-wide edit). */
export const ClubStructuralSchema = z.object({
  slug: z.string().trim().toLowerCase().min(2).max(60).regex(SLUG_RE, "lowercase-hyphen"),
  category: z.enum(CLUB_CATEGORIES),
  color: z.string().trim().regex(HEX_COLOR_RE, "hex"),
  isActive: z.boolean(),
  isPublic: z.boolean(),
  sort: z.coerce.number().int().min(0).max(9999),
});

/** Everything, for creating a brand-new club. */
export const ClubCreateSchema = ClubProfileSchema.merge(ClubStructuralSchema);

export type ClubProfileInput = z.infer<typeof ClubProfileSchema>;
export type ClubStructuralInput = z.infer<typeof ClubStructuralSchema>;
export type ClubCreateInput = z.infer<typeof ClubCreateSchema>;
