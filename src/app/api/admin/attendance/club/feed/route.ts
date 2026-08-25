import { requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveFeed } from "@/lib/admin/attendance-club";

/** Live present-feed for a session — manage:members, own-club scoped. Polled. */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  if (!sessionId) return Response.json({ error: "Missing session." }, { status: 400 });

  const admin = createAdminClient();
  const { data: sess } = await admin
    .from("club_attendance_sessions").select("club_id").eq("id", sessionId).maybeSingle();
  if (!sess) return Response.json({ error: "Not found." }, { status: 404 });
  if (!canManage(guard.session, "manage:members", sess.club_id)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }
  const feed = await liveFeed(sessionId);
  return Response.json(feed, { headers: { "cache-control": "no-store" } });
}
