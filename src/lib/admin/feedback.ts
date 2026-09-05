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
  socialTeamRating: number | null;
  socialTeamComment: string | null;
  socialLeadName: string | null;
  socialLeadRating: number | null;
  socialLeadComment: string | null;
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
    .select("id, club_id, vtu, student_name, head_name, head_rating, head_comment, vice_name, vice_rating, vice_comment, club_rating, activities_feedback, suggestions, social_team_rating, social_team_comment, social_lead_name, social_lead_rating, social_lead_comment, created_at")
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
    socialTeamRating: r.social_team_rating,
    socialTeamComment: r.social_team_comment,
    socialLeadName: r.social_lead_name,
    socialLeadRating: r.social_lead_rating,
    socialLeadComment: r.social_lead_comment,
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

export interface ClubLeaderChoice {
  clubId: string;
  clubName: string;
  curatedHeadId: string | null;
  curatedViceHeadId: string | null;
  /** Hand-typed fallbacks, for a leader with no admin account. */
  typedHeadName: string | null;
  typedViceHeadName: string | null;
  heads: { id: string; name: string }[];
  viceHeads: { id: string; name: string }[];
}

/**
 * Every active club with its curated pick and the candidate accounts. Used by
 * the picker — clubs with 0 or 1 candidate for a role need no decision, but
 * they're listed anyway so the President can see who the form is naming.
 */
export async function listLeaderChoices(): Promise<ClubLeaderChoice[]> {
  const admin = createAdminClient();
  const [{ data: clubs, error: cErr }, { data: admins, error: aErr }] = await Promise.all([
    admin
      .from("clubs")
      .select("id, name, feedback_head_id, feedback_vice_head_id, feedback_head_name, feedback_vice_head_name")
      .eq("is_active", true)
      .order("name"),
    admin
      .from("admin_users")
      .select("id, full_name, role, club_id, is_active")
      .in("role", ["club_head", "vice_head"])
      .eq("is_active", true),
  ]);
  if (cErr) throw cErr;
  if (aErr) throw aErr;

  return (clubs ?? []).map((c) => {
    const mine = (admins ?? []).filter((a) => a.club_id === c.id);
    return {
      clubId: c.id,
      clubName: c.name,
      curatedHeadId: c.feedback_head_id,
      curatedViceHeadId: c.feedback_vice_head_id,
      typedHeadName: c.feedback_head_name,
      typedViceHeadName: c.feedback_vice_head_name,
      heads: mine
        .filter((a) => a.role === "club_head")
        .map((a) => ({ id: a.id, name: a.full_name })),
      viceHeads: mine
        .filter((a) => a.role === "vice_head")
        .map((a) => ({ id: a.id, name: a.full_name })),
    };
  });
}

/**
 * Active clubs only — the universe the analytics "silent clubs" list is drawn
 * from. `clubNames` deliberately includes inactive clubs so an old response
 * still resolves to a name; using it here would report retired clubs as
 * silent every period.
 */
export async function listActiveClubs(): Promise<{ id: string; name: string }[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("clubs")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name }));
}

/** Active club members on the roster — the denominator for analytics reach. */
export async function memberCount(): Promise<number> {
  const admin = createAdminClient();
  const { count, error } = await admin
    .from("club_members")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}
