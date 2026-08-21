"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import {
  getEventForAttendance,
  getSessionById,
  openSession,
  closeSession,
} from "@/lib/admin/attendance";
import { writeAudit } from "@/lib/admin/audit";

export async function openSessionAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  const eventId = String(formData.get("eventId") ?? "");
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) return;

  const requested = Number(formData.get("windowSeconds"));
  const windowSeconds = Math.min(600, Math.max(20, Number.isFinite(requested) ? requested : 60));
  const id = await openSession(eventId, session.id, windowSeconds);
  await writeAudit({
    actorId: session.id,
    action: "open",
    entity: "attendance_session",
    entityId: id,
    after: { eventId, windowSeconds },
  });
  redirect(`/admin/events/${eventId}/attendance`);
}

export async function closeSessionAction(formData: FormData): Promise<void> {
  const session = await getAdminSession();
  if (!session) return;
  const sessionId = String(formData.get("sessionId") ?? "");
  const s = await getSessionById(sessionId);
  if (!s) return;
  const ev = await getEventForAttendance(s.eventId);
  if (!ev || !canManage(session, "manage:registrations", ev.clubId)) return;

  await closeSession(sessionId);
  await writeAudit({
    actorId: session.id,
    action: "close",
    entity: "attendance_session",
    entityId: sessionId,
  });
  revalidatePath(`/admin/events/${s.eventId}/attendance`);
}
