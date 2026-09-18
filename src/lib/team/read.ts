import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TeamProfileRow } from "./profiles";

// ⚠️ ONE string literal, not a `+` concatenation. supabase-js parses the column
// list at the TYPE level; concatenation widens it to plain `string`, and every
// row then types as GenericStringError.
const COLS =
  "member_id, name, role, year, department, email, description, portfolio, photo_path, photo_width, photo_height, photo_blur, focal_x, focal_y";

/**
 * Every team_profiles row.
 *
 * ⚠️ Returns [] on ANY failure and never throws. That is deliberate: with no
 * rows, mergeProfiles falls back to src/data/ccc.ts, so a database outage
 * costs the page its EDITS, not the page. Turning this into a throw would make
 * /team go blank the first time Supabase hiccups — which the old DB-driven
 * roster page did.
 *
 * The trade: on an outage the page shows the file's values, which are stale
 * once anything has been edited. Stale beats blank for a public page.
 */
export async function getTeamProfileRows(): Promise<TeamProfileRow[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("team_profiles").select(COLS);
    if (error || !data) return [];
    return data.map((r) => ({
      memberId: r.member_id,
      name: r.name,
      role: r.role,
      year: r.year,
      department: r.department,
      email: r.email,
      description: r.description,
      portfolio: r.portfolio,
      photoPath: r.photo_path,
      photoWidth: r.photo_width,
      photoHeight: r.photo_height,
      photoBlur: r.photo_blur,
      focalX: r.focal_x,
      focalY: r.focal_y,
    }));
  } catch {
    return [];
  }
}
