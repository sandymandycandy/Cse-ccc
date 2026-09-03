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

export interface FeedbackResponseRow {
  id: string;
  clubId: string;
  vtu: string;
  studentName: string;
  headName: string | null;
  headRating: number | null;
  headComment: string | null;
  viceName: string | null;
  viceRating: number | null;
  viceComment: string | null;
  clubRating: number;
  activities: string;
  suggestions: string | null;
  createdAt: string;
}

/** Every response in one period, newest first. */
export async function listResponses(periodId: string): Promise<FeedbackResponseRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("feedback_responses")
    // Must stay ONE string literal: concatenating with `+` widens it to
    // `string` and PostgREST can no longer infer the row shape from the
    // generated types (every column then types as GenericStringError).
    .select("id, club_id, vtu, student_name, head_name, head_rating, head_comment, vice_name, vice_rating, vice_comment, club_rating, activities_feedback, suggestions, created_at")
    .eq("period_id", periodId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    clubId: r.club_id,
    vtu: r.vtu,
    studentName: r.student_name,
    headName: r.head_name,
    headRating: r.head_rating,
    headComment: r.head_comment,
    viceName: r.vice_name,
    viceRating: r.vice_rating,
    viceComment: r.vice_comment,
    clubRating: r.club_rating,
    activities: r.activities_feedback,
    suggestions: r.suggestions,
    createdAt: r.created_at,
  }));
}

/** club id → name, for labelling summaries. */
export async function clubNames(): Promise<Map<string, string>> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("clubs").select("id, name");
  if (error) throw error;
  return new Map((data ?? []).map((c) => [c.id, c.name]));
}
