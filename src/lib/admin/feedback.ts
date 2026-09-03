import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Admin-side reads of the feedback inbox (service role — neither table has an
 *  anon grant). Council-wide: no club scope. */

export interface PeriodRow {
  id: string;
  openedAt: string;
  closedAt: string | null;
  responses: number;
}

/** Every period, newest first, with its response count. */
export async function listPeriods(): Promise<PeriodRow[]> {
  const admin = createAdminClient();
  const [{ data: periods, error: pErr }, { data: counts, error: cErr }] = await Promise.all([
    admin
      .from("feedback_periods")
      .select("id, opened_at, closed_at")
      .order("opened_at", { ascending: false }),
    // Counted in JS rather than via a nested aggregate: one row per response is
    // cheap at this scale, and it keeps the generated types straightforward.
    admin.from("feedback_responses").select("period_id"),
  ]);
  if (pErr) throw pErr;
  if (cErr) throw cErr;

  const byPeriod = new Map<string, number>();
  for (const r of counts ?? []) {
    byPeriod.set(r.period_id, (byPeriod.get(r.period_id) ?? 0) + 1);
  }

  return (periods ?? []).map((p) => ({
    id: p.id,
    openedAt: p.opened_at,
    closedAt: p.closed_at,
    responses: byPeriod.get(p.id) ?? 0,
  }));
}
