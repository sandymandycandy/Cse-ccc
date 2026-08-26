import { requireSession, requireSameOrigin } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { verifyMemberToken, verifyMemberExpiringToken } from "@/lib/attendance";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/admin/audit";

/** Mark a member present by scanning their QR — manage:members, own-club scoped. */
export async function POST(request: Request) {
  const bad = requireSameOrigin(request);
  if (bad) return bad;
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  let body: { sessionId?: string; token?: string };
  try { body = await request.json(); } catch { return Response.json({ error: "Bad request." }, { status: 400 }); }
  const sessionId = String(body.sessionId ?? "");
  const rawToken = String(body.token ?? "");
  const memberId = rawToken.startsWith("e.")
    ? verifyMemberExpiringToken(rawToken)
    : verifyMemberToken(rawToken);
  if (!sessionId || !memberId) return Response.json({ error: "Invalid QR." }, { status: 400 });

  const admin = createAdminClient();
  const { data: sess } = await admin
    .from("club_attendance_sessions").select("id, club_id, status").eq("id", sessionId).maybeSingle();
  if (!sess) return Response.json({ error: "Session not found." }, { status: 404 });
  if (!canManage(guard.session, "manage:members", sess.club_id)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }
  if (sess.status !== "open") return Response.json({ error: "Session is closed." }, { status: 409 });

  const { data: member } = await admin
    .from("club_members").select("id, name, club_id, is_active").eq("id", memberId).maybeSingle();
  if (!member || member.club_id !== sess.club_id || !member.is_active) {
    return Response.json({ error: "Not a member of this club." }, { status: 403 });
  }

  // Idempotent: the UNIQUE(session_id, member_id) makes a re-scan a no-op.
  const { error } = await admin
    .from("club_attendance")
    .insert({ session_id: sessionId, member_id: memberId, marked_by: guard.session.id });
  if (error) {
    // 23505 = unique_violation → already present.
    if ((error as { code?: string }).code === "23505") {
      return Response.json({ status: "already", member: { id: member.id, name: member.name } });
    }
    return Response.json({ error: "Could not record attendance." }, { status: 500 });
  }

  await writeAudit({
    actorId: guard.session.id, action: "scan", entity: "club_attendance",
    entityId: sessionId, after: { memberId: member.id },
  });
  return Response.json({ status: "marked", member: { id: member.id, name: member.name } });
}
