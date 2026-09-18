import "server-only";
import { members as fileMembers, type Member } from "@/data/ccc";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeProfiles, type TeamProfileRow } from "@/lib/team/profiles";
import { getTeamProfileRows } from "@/lib/team/read";

/** A team_profiles insert, built from the file's values. */
export type TeamProfileInsert = {
  member_id: string;
  name: string;
  role: string;
  year: string | null;
  department: string | null;
  email: string;
  description: string | null;
  portfolio: string | null;
};

/** One row of /admin/team. */
export type TeamProfileAdminRow = {
  /** Merged: shows the edit if there is one, the file's value if not. */
  member: Member;
  /** False = still showing src/data/ccc.ts values; saving creates the row. */
  hasRow: boolean;
  photoPath: string | null;
  focalX: number;
  focalY: number;
};

/**
 * Every member in src/data/ccc.ts with no team_profiles row yet, as an insert
 * carrying the file's values.
 *
 * ⚠️ Members that already have a row are SKIPPED, never updated. The sync must
 * not be able to overwrite somebody's edit with the file's stale value — that
 * is the whole reason it is an insert-missing and not an upsert.
 */
export function rowsToSeed(file: Member[], rows: TeamProfileRow[]): TeamProfileInsert[] {
  const have = new Set(rows.map((r) => r.memberId));
  return file
    .filter((m) => !have.has(m.id))
    .map((m) => ({
      member_id: m.id,
      name: m.name,
      role: m.role,
      year: m.year ?? null,
      department: m.department ?? null,
      email: m.email,
      description: m.description ?? null,
      portfolio: m.portfolio ?? null,
    }));
}

/**
 * All 46 for the admin list — merged, so it is never empty and every person is
 * editable before anybody has pressed Sync.
 */
export async function listTeamProfiles(): Promise<TeamProfileAdminRow[]> {
  const rows = await getTeamProfileRows();
  const byId = new Map(rows.map((r) => [r.memberId, r]));
  return mergeProfiles(fileMembers, rows).map((member) => {
    const r = byId.get(member.id);
    return {
      member,
      hasRow: r != null,
      photoPath: r?.photoPath ?? null,
      focalX: r?.focalX ?? 50,
      focalY: r?.focalY ?? 50,
    };
  });
}

/**
 * Creates rows for every file member that has none. Returns how many were
 * actually created.
 *
 * ⚠️ "Never overwrite an edit" is enforced by the DATABASE, not by the read.
 * getTeamProfileRows() returns [] on a failed read, which would make all 46
 * look missing. A plain insert would then only be saved by Postgres happening
 * to reject the batch. `ignoreDuplicates` is ON CONFLICT DO NOTHING, so an
 * existing row is skipped at the database even when the read was wrong.
 *
 * rowsToSeed still filters first — it keeps the payload small — but
 * correctness no longer depends on it. The count comes from the rows Postgres
 * reports inserting, so a stale read cannot inflate it either.
 */
export async function syncTeamProfiles(): Promise<number> {
  const rows = await getTeamProfileRows();
  const seed = rowsToSeed(fileMembers, rows);
  if (seed.length === 0) return 0;
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("team_profiles")
    .upsert(seed, { onConflict: "member_id", ignoreDuplicates: true })
    .select("member_id");
  if (error) throw new Error(`Could not sync team profiles: ${error.message}`);
  return data?.length ?? 0;
}

/** Current photo object for one member, or null. Used to delete a replaced one. */
export async function getTeamProfilePhoto(memberId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("team_profiles")
    .select("photo_path")
    .eq("member_id", memberId)
    .maybeSingle();
  return data?.photo_path ?? null;
}
