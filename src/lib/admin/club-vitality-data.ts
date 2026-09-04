import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { windowStartKey, type ClubVitalityInput } from "./club-vitality";

/**
 * The one impure read behind the council's Club health page. Four cross-club
 * queries, aggregated in JS by `computeClubVitality` — the house pattern
 * documented in `feedback.ts` ("counted in JS rather than via a nested
 * aggregate … cheap at this scale, and it keeps the generated types
 * straightforward").
 *
 * ⚠️ This is far heavier than the dashboard's `head`-only counts (~816 member
 * rows and ~54 session rows today). It is acceptable ONLY because this is a
 * council-only page reached deliberately, never a landing page. If club
 * membership grows an order of magnitude, move the aggregation into SQL.
 *
 * ⚠️ MARKS ARE FETCHED FOR WINDOW SESSIONS ONLY. `club_attendance` holds ~1,379
 * rows and grows with every meeting; a bare select would be both wasteful and
 * exposed to PostgREST's row cap, and a silently truncated read would understate
 * every club's attendance on a page the council acts on. The window filter is
 * derived from the same `windowStartKey` the pure module uses, so the two can
 * never disagree about what "the window" is.
 */

/** Explicit ceiling so a truncated page of rows can never pass silently. */
const ROW_CAP = 20_000;

export async function getClubVitalityData(nowKey: string): Promise<ClubVitalityInput> {
  const admin = createAdminClient();

  const [clubsRes, membersRes, sessionsRes] = await Promise.all([
    admin.from("clubs").select("id, name").eq("is_active", true).order("name"),
    // The marking roster, matching `rosterWithPercent`: active AND onboarded.
    // A pending self-registration is not yet a member for attendance purposes.
    admin
      .from("club_members")
      .select("id, club_id, created_at")
      .eq("is_active", true)
      .not("approved_at", "is", null)
      .limit(ROW_CAP),
    admin
      .from("club_attendance_sessions")
      .select("id, club_id, session_date, opened_at")
      .limit(ROW_CAP),
  ]);
  if (clubsRes.error) throw clubsRes.error;
  if (membersRes.error) throw membersRes.error;
  if (sessionsRes.error) throw sessionsRes.error;

  const clubs = (clubsRes.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const members = (membersRes.data ?? []).map((m) => ({
    clubId: m.club_id,
    memberId: m.id,
    joinedDate: m.created_at.slice(0, 10),
  }));

  const sessions = (sessionsRes.data ?? []).map((s) => ({
    id: s.id,
    clubId: s.club_id,
    // Same rule as `attendance-club.ts#sessionDateOf`: the scheduled date, or
    // the open date for legacy rows that predate `session_date`.
    date: (s.session_date ?? s.opened_at).slice(0, 10),
  }));

  const start = windowStartKey(nowKey);
  const windowSessionIds = sessions
    .filter((s) => s.date >= start && s.date <= nowKey)
    .map((s) => s.id);

  if (windowSessionIds.length === 0) {
    return { clubs, members, sessions, marks: [] };
  }

  const { data: markRows, error: marksError } = await admin
    .from("club_attendance")
    .select("member_id, session_id")
    .in("session_id", windowSessionIds)
    .limit(ROW_CAP);
  if (marksError) throw marksError;

  return {
    clubs,
    members,
    sessions,
    marks: (markRows ?? []).map((m) => ({ memberId: m.member_id, sessionId: m.session_id })),
  };
}
