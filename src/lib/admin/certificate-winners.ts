import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { podiumRound, standingsOf, type StandingLike, type WinnerStanding } from "@/lib/certificates/winners";

/**
 * Who won an event, for certificates (spec 2026-09-15 §4.1). Service role: the
 * admin may see standings that are published or not? No — deliberately only
 * PUBLISHED rows count, the same ones the public results page and the
 * achievements board show. A certificate must never announce a placing the
 * winner cannot see on the site.
 */
export async function listWinnerStandings(eventId: string): Promise<WinnerStanding[]> {
  const { data, error } = await createAdminClient()
    .from("event_rounds")
    .select(
      "id, sort, results ( roll_no, display_name, team_name, team_members, rank, registration_id, published_at )",
    )
    .eq("event_id", eventId);
  if (error) throw error;

  const rounds = (data ?? []) as unknown as {
    id: string;
    sort: number;
    results: (StandingLike & { published_at: string | null })[];
  }[];
  const round = podiumRound(rounds);
  if (!round) return [];
  return standingsOf(round.results.filter((r) => r.published_at != null));
}
