import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface RoundRow {
  id: string;
  event_id: string;
  name: string;
  sort: number;
  status: "pending" | "active" | "completed";
  starts_at: string | null;
}

export interface RosterEntry {
  roll_no: string;
  display_name: string | null;
  registration_id: string | null;
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
    .select("id, event_id, name, sort, status, starts_at")
    .eq("event_id", eventId)
    .order("sort", { ascending: true });
  return (data ?? []) as RoundRow[];
}

export async function getRound(roundId: string): Promise<RoundRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("event_rounds")
    .select("id, event_id, name, sort, status, starts_at")
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
    .select("roll_no, display_name, registration_id, score, rank, advanced, remarks")
    .eq("round_id", roundId);
  if (saved && saved.length > 0) {
    return { rows: saved as RosterEntry[], seededFrom: "saved" };
  }

  const emptyEntry = (
    roll_no: string,
    display_name: string | null,
    registration_id: string | null,
  ): RosterEntry => ({
    roll_no,
    display_name,
    registration_id,
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
      .select("id, roll_no, student_name")
      .eq("event_id", round.event_id)
      .eq("attended", true)
      .order("roll_no", { ascending: true });
    const rows = (regs ?? []).map((r) => emptyEntry(r.roll_no, r.student_name, r.id));
    return { rows, seededFrom: `attended (${rows.length})` };
  }

  // 3) Later round: prior round's advanced rows.
  const prev = rounds[idx - 1];
  const { data: adv } = await admin
    .from("results")
    .select("roll_no, display_name, registration_id")
    .eq("round_id", prev.id)
    .eq("advanced", true)
    .order("roll_no", { ascending: true });
  const rows = (adv ?? []).map((r) =>
    emptyEntry(r.roll_no, r.display_name, r.registration_id),
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
