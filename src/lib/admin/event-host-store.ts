import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HostPlan } from "@/lib/admin/event-hosts";

/**
 * Carries out a `planHostChanges` plan. WHAT changes is decided and tested in
 * `event-hosts.ts`; this file only does it, in the one order that never leaves
 * an event with two primaries or a primary-key clash:
 *
 * 1. delete co-host rows, including a co-host about to become primary, which
 *    frees its (event_id, club_id) key;
 * 2. insert the primary, or repoint the existing primary row in place, so the
 *    event always has exactly one primary (`event_clubs_one_primary_idx`);
 * 3. insert new co-hosts, including a former primary kept on as a co-host.
 *
 * Not transactional, like every other multi-step write in the events actions.
 * Returns false on the first failure so the caller can say so.
 */
export async function applyHostPlan(eventId: string, plan: HostPlan): Promise<boolean> {
  const admin = createAdminClient();

  if (plan.removeCohosts.length > 0) {
    const { error } = await admin
      .from("event_clubs")
      .delete()
      .eq("event_id", eventId)
      // Never the primary row, whatever the plan says.
      .eq("is_primary", false)
      .in("club_id", plan.removeCohosts);
    if (error) return false;
  }

  if (plan.primary?.op === "insert") {
    const { error } = await admin
      .from("event_clubs")
      .insert({ event_id: eventId, club_id: plan.primary.clubId, is_primary: true });
    if (error) return false;
  } else if (plan.primary?.op === "move") {
    const { data, error } = await admin
      .from("event_clubs")
      .update({ club_id: plan.primary.clubId })
      .eq("event_id", eventId)
      .eq("is_primary", true)
      .select("club_id");
    // Zero rows means there was no primary row to move: a failure, not a no-op.
    if (error || !data || data.length === 0) return false;
  }

  if (plan.addCohosts.length > 0) {
    const { error } = await admin
      .from("event_clubs")
      .insert(plan.addCohosts.map((club_id) => ({ event_id: eventId, club_id, is_primary: false })));
    if (error) return false;
  }

  return true;
}

/**
 * The ids here that are not an active club. Checked before anything is
 * written, so a tampered or stale id is refused rather than half-saved.
 */
export async function notActiveClubIds(ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data, error } = await createAdminClient()
    .from("clubs")
    .select("id")
    .in("id", [...ids])
    .eq("is_active", true);
  if (error) throw error;
  const active = new Set((data ?? []).map((c) => c.id));
  return ids.filter((id) => !active.has(id));
}
