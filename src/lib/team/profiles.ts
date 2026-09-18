import type { Member } from "@/data/ccc";

/** One `team_profiles` row, camel-cased at the query boundary. */
export type TeamProfileRow = {
  memberId: string;
  name: string;
  role: string;
  year: string | null;
  department: string | null;
  email: string;
  description: string | null;
  portfolio: string | null;
  photoPath: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  photoBlur: string | null;
  focalX: number;
  focalY: number;
};

export type TeamPhoto = {
  path: string;
  width: number;
  height: number;
  blur: string | null;
  focal: { x: number; y: number };
};

/** `??` not `||`, so an intentionally blank bio does not fall back to the file's. */
const pick = <T,>(rowValue: T | null | undefined, fileValue: T | undefined) =>
  rowValue ?? fileValue;

/**
 * The 46 members with their edited values applied.
 *
 * Three rules, each pinned by a test:
 *  1. a member WITH a row uses the row;
 *  2. a member WITHOUT one uses the file — so somebody added to ccc.ts after
 *     the last sync still renders instead of half-breaking the page;
 *  3. a row matching nobody is ignored — removing a person from ccc.ts must
 *     not resurrect them from a stale row.
 *
 * Structure (layer, club, smtGroup, vtu, id) is never taken from a row: it is
 * not editable and a second copy of it would drift.
 */
export function mergeProfiles(fileMembers: Member[], rows: TeamProfileRow[]): Member[] {
  const byId = new Map(rows.map((r) => [r.memberId, r]));
  return fileMembers.map((m) => {
    const r = byId.get(m.id);
    if (!r) return m;
    return {
      ...m,
      name: r.name,
      role: r.role,
      email: r.email,
      year: pick(r.year, m.year),
      department: pick(r.department, m.department),
      description: pick(r.description, m.description),
      portfolio: pick(r.portfolio, m.portfolio),
    };
  });
}

/**
 * Uploaded portraits, by member id. A row with no `photo_path` is absent, so
 * the bundled import in src/assets/team/ stays the default.
 *
 * A photo missing its dimensions is skipped: coverPosition() divides by
 * width/height and would produce NaN rather than a crop.
 */
export function photoOverrides(rows: TeamProfileRow[]): Record<string, TeamPhoto> {
  const out: Record<string, TeamPhoto> = {};
  for (const r of rows) {
    if (!r.photoPath || r.photoWidth == null || r.photoHeight == null) continue;
    out[r.memberId] = {
      path: r.photoPath,
      width: r.photoWidth,
      height: r.photoHeight,
      blur: r.photoBlur,
      focal: { x: r.focalX, y: r.focalY },
    };
  }
  return out;
}

/** Public URL for a council-photos object. */
export function publicPhotoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/council-photos/${path}`;
}
