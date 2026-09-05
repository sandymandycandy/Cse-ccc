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
 * ⚠️ EVERY MULTI-ROW READ HERE IS PAGINATED, AND MUST STAY THAT WAY.
 * **PostgREST caps a response at 1,000 rows and `.limit(n)` does NOT raise that
 * cap** — it only lowers it. This was not theoretical: the first version of this
 * file used `.limit(20_000)` on the marks query, silently received 1,000 of the
 * 1,379 rows, and rendered a live page on which Coding Club read 21% instead of
 * 47% and Game development read 0% instead of 40%. Typecheck, lint, the whole
 * suite and the build were all green; only diffing the rendered table against the
 * database caught it. `club_attendance` (1,379 rows) is already over the cap and
 * `club_members` (825) is approaching it, so both are read page by page, each
 * with a total order so a page boundary cannot skip or repeat a row.
 *
 * ⚠️ MARKS ARE FETCHED FOR WINDOW SESSIONS ONLY. That keeps the read proportional
 * to the window rather than to all history, and bounds the `in(...)` list to the
 * sessions a single month can hold. The filter is derived from the same
 * `windowStartKey` the pure module uses, so the two can never disagree about what
 * "the window" is.
 */

/** PostgREST's own page size. Do not raise it — the server ignores anything above. */
const PAGE_SIZE = 1000;

/**
 * Read every row a query matches, one page at a time. `page` must apply a total
 * order, otherwise Postgres may return rows in a different order per page and a
 * boundary will drop or duplicate rows.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
}

export async function getClubVitalityData(nowKey: string): Promise<ClubVitalityInput> {
  const admin = createAdminClient();

  const [clubRows, memberRows, sessionRows] = await Promise.all([
    // Bounded by the number of clubs (14), so a single page always suffices.
    fetchAll<{ id: string; name: string }>((from, to) =>
      admin.from("clubs").select("id, name").eq("is_active", true).order("name").range(from, to),
    ),
    // The marking roster, matching `rosterWithPercent`: active AND onboarded.
    // A pending self-registration is not yet a member for attendance purposes.
    fetchAll<{ id: string; club_id: string; created_at: string }>((from, to) =>
      admin
        .from("club_members")
        .select("id, club_id, created_at")
        .eq("is_active", true)
        .not("approved_at", "is", null)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      id: string;
      club_id: string;
      session_date: string | null;
      opened_at: string;
    }>((from, to) =>
      admin
        .from("club_attendance_sessions")
        .select("id, club_id, session_date, opened_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  const clubs = clubRows.map((c) => ({ id: c.id, name: c.name }));

  const members = memberRows.map((m) => ({
    clubId: m.club_id,
    memberId: m.id,
  }));

  const sessions = sessionRows.map((s) => ({
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

  // (session_id, member_id) is unique, so ordering on the pair is a total order.
  const markRows = await fetchAll<{ member_id: string; session_id: string }>((from, to) =>
    admin
      .from("club_attendance")
      .select("member_id, session_id")
      .in("session_id", windowSessionIds)
      .order("session_id")
      .order("member_id")
      .range(from, to),
  );

  return {
    clubs,
    members,
    sessions,
    marks: markRows.map((m) => ({ memberId: m.member_id, sessionId: m.session_id })),
  };
}
