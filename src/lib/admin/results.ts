import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getEventFormSchema } from "@/lib/admin/registrations";
import {
  teamMembersForPublic,
  type PublicTeamMember,
} from "@/lib/registration-form/participants";
import { eligibleAdvancers } from "@/lib/results";

export interface RoundRow {
  id: string;
  event_id: string;
  name: string;
  sort: number;
  status: "pending" | "active" | "completed";
  starts_at: string | null;
  show_score: boolean;
  show_advanced: boolean;
  show_remarks: boolean;
}

const ROUND_COLS =
  "id, event_id, name, sort, status, starts_at, show_score, show_advanced, show_remarks";

export interface RosterEntry {
  roll_no: string;
  display_name: string | null;
  registration_id: string | null;
  /**
   * Snapshot of the team's name, copied from the registration when the roster
   * is seeded — never edited here. The public standings read the anon client,
   * which has no privilege on `registrations` (PII), so this must live on the
   * result row, exactly as `display_name` does.
   */
  team_name: string | null;
  /**
   * The other team members, snapshotted the same way. Name + roll only — see
   * `teamMembersForPublic()`; the member records also hold emails and phone
   * numbers, which must never reach a publicly readable column.
   */
  team_members: PublicTeamMember[] | null;
  score: number | null;
  rank: number | null;
  advanced: boolean;
  remarks: string | null;
}

// ── reads / seed ─────────────────────────────────────────────────────────────

export async function listRounds(eventId: string): Promise<RoundRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_rounds")
    .select(ROUND_COLS)
    .eq("event_id", eventId)
    .order("sort", { ascending: true });
  return (data ?? []) as RoundRow[];
}

export async function getRound(roundId: string): Promise<RoundRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_rounds")
    .select(ROUND_COLS)
    .eq("id", roundId)
    .maybeSingle();
  return (data as RoundRow | null) ?? null;
}

export async function roundIsPublished(roundId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("results")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId)
    .not("published_at", "is", null);
  return (count ?? 0) > 0;
}

/**
 * The rows to show in the editor for a round:
 * - already-saved rows win;
 * - else the first round seeds from the event's attended registrations;
 * - else a later round seeds from the previous round's advancing students.
 */
export async function getRoundRoster(
  roundId: string,
): Promise<{ rows: RosterEntry[]; seededFrom: string }> {
  const admin = createAdminClient();
  const round = await getRound(roundId);
  if (!round) return { rows: [], seededFrom: "unknown" };

  // 1) Already-saved rows win.
  const { data: saved } = await admin
    .from("results")
    .select("roll_no, display_name, registration_id, team_name, team_members, score, rank, advanced, remarks")
    .eq("round_id", roundId);
  if (saved && saved.length > 0) {
    return { rows: saved as RosterEntry[], seededFrom: "saved" };
  }

  const emptyEntry = (
    roll_no: string,
    display_name: string | null,
    registration_id: string | null,
    team_name: string | null = null,
    team_members: PublicTeamMember[] | null = null,
  ): RosterEntry => ({
    roll_no,
    display_name,
    registration_id,
    team_name,
    team_members,
    score: null,
    rank: null,
    advanced: false,
    remarks: null,
  });

  // 2) Is this the first round of the event?
  const rounds = await listRounds(round.event_id);
  const idx = rounds.findIndex((r) => r.id === roundId);

  if (idx <= 0) {
    const { data: regs } = await admin
      .from("registrations")
      .select("id, roll_no, student_name, team_name, custom_answers")
      .eq("event_id", round.event_id)
      .eq("attended", true)
      .order("roll_no", { ascending: true });
    // Member names are snapshotted here, at seed time, because the public
    // standings can never join back to registrations.
    const { schema } = await getEventFormSchema(round.event_id);
    const rows = (regs ?? []).flatMap((r) => {
      if (r.roll_no == null) return [];
      const members = teamMembersForPublic(
        {
          name: r.student_name ?? "",
          roll: r.roll_no,
          department: null,
          year: null,
          email: null,
          phone: null,
          customAnswers: (r.custom_answers as Record<string, unknown> | null) ?? null,
        },
        schema,
      );
      return [
        emptyEntry(
          r.roll_no,
          r.student_name,
          r.id,
          r.team_name,
          members.length > 0 ? members : null,
        ),
      ];
    });
    return { rows, seededFrom: `attended (${rows.length})` };
  }

  // 3) Later round: prior round's advancers — advanced AND with a score (§13.9:
  // no marks → no advancement). Score 0 counts; only null (blank) is excluded.
  const prev = rounds[idx - 1];
  const { data: adv } = await admin
    .from("results")
    .select("roll_no, display_name, registration_id, team_name, team_members, score, advanced")
    .eq("round_id", prev.id)
    .order("roll_no", { ascending: true });
  const rows = eligibleAdvancers(
    (adv ?? []) as {
      roll_no: string;
      display_name: string | null;
      registration_id: string | null;
      team_name: string | null;
      team_members: PublicTeamMember[] | null;
      score: number | null;
      advanced: boolean;
    }[],
  ).map((r) =>
    emptyEntry(r.roll_no, r.display_name, r.registration_id, r.team_name, r.team_members),
  );
  return { rows, seededFrom: `advancing in ${prev.name} (${rows.length})` };
}

// ── write primitives (called by guarded actions) ─────────────────────────────

export async function createRoundRow(
  eventId: string,
  name: string,
  startsAt: string | null,
): Promise<string> {
  const admin = createAdminClient();
  const existing = await listRounds(eventId);
  const nextSort = existing.reduce((m, r) => Math.max(m, r.sort), 0) + 1;
  const { data, error } = await admin
    .from("event_rounds")
    .insert({ event_id: eventId, name, sort: nextSort, starts_at: startsAt })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function updateRoundRow(
  roundId: string,
  patch: {
    name?: string;
    status?: RoundRow["status"];
    sort?: number;
    starts_at?: string | null;
    show_score?: boolean;
    show_advanced?: boolean;
    show_remarks?: boolean;
  },
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("event_rounds").update(patch).eq("id", roundId);
}

export async function deleteRoundRow(roundId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("results").delete().eq("round_id", roundId);
  await admin.from("event_rounds").delete().eq("id", roundId);
}

/** Replace the round's rows in place: delete existing, insert the set as draft. */
export async function replaceRoundResults(
  eventId: string,
  roundId: string,
  rows: RosterEntry[],
): Promise<void> {
  const admin = createAdminClient();
  await admin.from("results").delete().eq("round_id", roundId);
  const payload = rows
    .filter((r) => r.roll_no.trim() !== "")
    .map((r) => ({
      event_id: eventId,
      round_id: roundId,
      roll_no: r.roll_no.trim(),
      display_name: r.display_name,
      registration_id: r.registration_id,
      team_name: r.team_name,
      // Serialised at the DB boundary: the column is jsonb, and the row type
      // is a plain interface without Json's index signature.
      team_members: (r.team_members ?? null) as unknown as Json,
      score: r.score,
      rank: r.rank,
      advanced: r.advanced,
      remarks: r.remarks,
      published_at: null,
    }));
  if (payload.length === 0) return;
  const { error } = await admin.from("results").insert(payload);
  if (error) throw new Error(error.message);
}

export async function setRoundPublished(
  roundId: string,
  publish: boolean,
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("results")
    .update({ published_at: publish ? new Date().toISOString() : null })
    .eq("round_id", roundId);
}
