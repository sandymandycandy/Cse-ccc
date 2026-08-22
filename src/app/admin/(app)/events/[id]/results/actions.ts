"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { writeAudit } from "@/lib/admin/audit";
import {
  getRound,
  createRoundRow,
  updateRoundRow,
  deleteRoundRow,
  replaceRoundResults,
  setRoundPublished,
  roundIsPublished,
  type RosterEntry,
} from "@/lib/admin/results";

async function authorize(eventId: string) {
  const session = await getAdminSession();
  if (!session) return null;
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:results", ev.clubId)) return null;
  return { session, ev };
}

/**
 * Authorize AND confirm the round belongs to this event — otherwise a caller
 * with `manage:results` on their own club could pass their eventId but another
 * club's roundId and mutate it (IDOR). The round's ownership is read from the
 * DB, never trusted from the request.
 */
async function authorizeRound(eventId: string, roundId: string) {
  const auth = await authorize(eventId);
  if (!auth) return null;
  const round = await getRound(roundId);
  if (!round || round.event_id !== eventId) return null;
  return auth;
}

function revalidate(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/results`);
  revalidatePath(`/events/${eventId}/results`);
  revalidatePath(`/events/${eventId}`);
}

export async function createRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const startsAt = String(formData.get("startsAt") ?? "").trim() || null;
  if (!eventId || !name) return;
  const auth = await authorize(eventId);
  if (!auth) return;
  const roundId = await createRoundRow(eventId, name, startsAt);
  await writeAudit({
    actorId: auth.session.id,
    action: "round_create",
    entity: "event_round",
    entityId: roundId,
    after: { name },
  });
  revalidate(eventId);
}

export async function updateRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorizeRound(eventId, roundId);
  if (!auth) return;
  const patch: { name?: string; status?: "pending" | "active" | "completed" } = {};
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  if (name) patch.name = name;
  if (status === "pending" || status === "active" || status === "completed") {
    patch.status = status;
  }
  await updateRoundRow(roundId, patch);
  await writeAudit({
    actorId: auth.session.id,
    action: "round_update",
    entity: "event_round",
    entityId: roundId,
    after: patch,
  });
  revalidate(eventId);
}

export async function deleteRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorizeRound(eventId, roundId);
  if (!auth) return;
  if (await roundIsPublished(roundId)) return; // don't delete published standings
  await deleteRoundRow(roundId);
  await writeAudit({
    actorId: auth.session.id,
    action: "round_delete",
    entity: "event_round",
    entityId: roundId,
  });
  revalidate(eventId);
}

const rowSchema = z.object({
  roll_no: z.string().min(1),
  display_name: z.string().nullable(),
  registration_id: z.string().uuid().nullable(),
  score: z.number().nullable(),
  rank: z.number().int().nullable(),
  advanced: z.boolean(),
  remarks: z.string().nullable(),
});

export async function saveResultsAction(input: {
  eventId: string;
  roundId: string;
  rows: RosterEntry[];
}): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeRound(input.eventId, input.roundId);
  if (!auth) return { ok: false, error: "Not permitted." };
  if (await roundIsPublished(input.roundId)) {
    return { ok: false, error: "Unpublish this round before editing it." };
  }
  const parsed = z.array(rowSchema).safeParse(input.rows);
  if (!parsed.success) return { ok: false, error: "Invalid results data." };
  await replaceRoundResults(input.eventId, input.roundId, parsed.data);
  await writeAudit({
    actorId: auth.session.id,
    action: "results_save",
    entity: "event_round",
    entityId: input.roundId,
    after: { count: parsed.data.length },
  });
  revalidate(input.eventId);
  return { ok: true };
}

export async function publishRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorizeRound(eventId, roundId);
  if (!auth) return;
  await setRoundPublished(roundId, true);
  await writeAudit({
    actorId: auth.session.id,
    action: "results_publish",
    entity: "event_round",
    entityId: roundId,
  });
  revalidate(eventId);
}

export async function unpublishRoundAction(formData: FormData): Promise<void> {
  const eventId = String(formData.get("eventId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!eventId || !roundId) return;
  const auth = await authorizeRound(eventId, roundId);
  if (!auth) return;
  await setRoundPublished(roundId, false);
  await writeAudit({
    actorId: auth.session.id,
    action: "results_unpublish",
    entity: "event_round",
    entityId: roundId,
  });
  revalidate(eventId);
}
