import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLeaders, type ClubLeaders, type LeaderCandidate } from "./leaders";
import { resolveSocialLead, type ResolvedSocialLead } from "./social-lead";

/**
 * Service-role reads/writes for the public feedback surface. Neither feedback
 * table has an anon grant, so every access goes through here — including the
 * "is the window open?" check, which is safe because /feedback and the root
 * layout are Server Components.
 */

export interface OpenPeriod {
  id: string;
  openedAt: string;
}

export interface ClubOption {
  id: string;
  name: string;
  head: ClubLeaders["head"];
  viceHead: ClubLeaders["viceHead"];
}

/**
 * The open window, or null. Wrapped in React `cache()` because the ROOT LAYOUT
 * calls it on every public page render — the cache collapses that to one query
 * per request, the same way getAdminSession does.
 *
 * Fails CLOSED: on any error we report "no window open". A broken nav on every
 * page of the site is a worse outcome than a missed feedback window.
 */
export const getOpenPeriod = cache(async function getOpenPeriod(): Promise<OpenPeriod | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null; // service key absent (e.g. a misconfigured preview env)
  }
  const { data, error } = await admin
    .from("feedback_periods")
    .select("id, opened_at")
    .is("closed_at", null)
    .maybeSingle();
  if (error) {
    console.error("feedback: open-period lookup failed", error.message);
    return null;
  }
  return data ? { id: data.id, openedAt: data.opened_at } : null;
});

/** Every active club with its resolved head + vice head, for the form's dropdown. */
export async function listClubsWithLeaders(): Promise<ClubOption[]> {
  const admin = createAdminClient();

  const [{ data: clubs, error: clubsError }, { data: admins, error: adminsError }] =
    await Promise.all([
      admin
        .from("clubs")
        .select("id, name, feedback_head_id, feedback_vice_head_id, feedback_head_name, feedback_vice_head_name")
        .eq("is_active", true)
        .order("name"),
      admin
        .from("admin_users")
        .select("id, full_name, role, club_id, is_active")
        .in("role", ["club_head", "vice_head"]),
    ]);
  if (clubsError) throw clubsError;
  if (adminsError) throw adminsError;

  const byClub = new Map<string, LeaderCandidate[]>();
  for (const a of admins ?? []) {
    if (!a.club_id) continue;
    if (a.role !== "club_head" && a.role !== "vice_head") continue;
    const entry: LeaderCandidate = {
      id: a.id,
      name: a.full_name,
      role: a.role,
      isActive: a.is_active,
    };
    const list = byClub.get(a.club_id);
    if (list) list.push(entry);
    else byClub.set(a.club_id, [entry]);
  }

  return (clubs ?? []).map((c) => {
    const { head, viceHead } = resolveLeaders(byClub.get(c.id) ?? [], {
      headId: c.feedback_head_id,
      viceHeadId: c.feedback_vice_head_id,
      headName: c.feedback_head_name,
      viceHeadName: c.feedback_vice_head_name,
    });
    return { id: c.id, name: c.name, head, viceHead };
  });
}

/**
 * The council's Social Media Head, or null when there is not exactly one active
 * account for the role. Council-wide, so there is nothing to scope by.
 */
export async function getSocialLead(): Promise<ResolvedSocialLead | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_users")
    .select("id, full_name, is_active")
    .eq("role", "social_media_head");
  if (error) {
    console.error("feedback: social lead lookup failed", error.message);
    return null;
  }
  return resolveSocialLead(
    (data ?? []).map((a) => ({ id: a.id, name: a.full_name, isActive: a.is_active })),
  );
}

/** One club's leaders, re-resolved server-side at submit time. */
export async function getClubLeaders(clubId: string): Promise<ClubLeaders | null> {
  const clubs = await listClubsWithLeaders();
  const club = clubs.find((c) => c.id === clubId);
  return club ? { head: club.head, viceHead: club.viceHead } : null;
}

export interface InsertFeedbackInput {
  periodId: string;
  vtu: string;
  studentName: string;
  clubId: string;
  leaders: ClubLeaders;
  headRating: number | null;
  headComment: string;
  viceRating: number | null;
  viceComment: string;
  clubRating: number;
  activities: string;
  suggestions: string;
  socialLead: ResolvedSocialLead | null;
  socialTeamRating: number | null;
  socialTeamComment: string;
  socialLeadRating: number | null;
  socialLeadComment: string;
}

/** Store one response. Returns false on a DB error (the caller answers 500). */
export async function insertFeedbackResponse(input: InsertFeedbackInput): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.from("feedback_responses").insert({
    period_id: input.periodId,
    vtu: input.vtu,
    student_name: input.studentName,
    club_id: input.clubId,
    // Names are SNAPSHOTS taken now — never re-derived from the id later.
    // If a club has no resolvable leader, a rating aimed at one is discarded
    // rather than stored against nobody.
    head_admin_id: input.leaders.head?.id ?? null,
    head_name: input.leaders.head?.name ?? null,
    head_rating: input.leaders.head ? input.headRating : null,
    head_comment: input.leaders.head && input.headComment ? input.headComment : null,
    vice_admin_id: input.leaders.viceHead?.id ?? null,
    vice_name: input.leaders.viceHead?.name ?? null,
    vice_rating: input.leaders.viceHead ? input.viceRating : null,
    vice_comment: input.leaders.viceHead && input.viceComment ? input.viceComment : null,
    club_rating: input.clubRating,
    activities_feedback: input.activities,
    suggestions: input.suggestions || null,
    // Council-wide social media. Same snapshot rule as the leader names above:
    // a rating aimed at a head nobody could resolve is discarded, not stored
    // against nobody. The TEAM rating stands on its own and needs no name.
    social_team_rating: input.socialTeamRating,
    social_team_comment: input.socialTeamComment || null,
    social_lead_admin_id: input.socialLead?.id ?? null,
    social_lead_name: input.socialLead?.name ?? null,
    social_lead_rating: input.socialLead ? input.socialLeadRating : null,
    social_lead_comment:
      input.socialLead && input.socialLeadComment ? input.socialLeadComment : null,
  });
  if (error) {
    console.error("feedback insert failed", error);
    return false;
  }
  return true;
}
