import { requireSession } from "@/lib/auth/guards";
import { canViewClub } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { liveFeed } from "@/lib/admin/attendance-club";

/**
 * Live present-feed for a session. Gated on canViewClub (not canManage) so the
 * faculty/council read-only live view (which the session page grants via
 * canViewClub) can actually poll — the payload is read-only present data that
 * viewer already sees server-rendered. Mutations stay gated on the scan route.
 */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  const sessionId = new URL(request.url).searchParams.get("session") ?? "";
  if (!sessionId) return Response.json({ error: "Missing session." }, { status: 400 });

  const admin = createAdminClient();
  const { data: sess } = await admin
    .from("club_attendance_sessions").select("club_id").eq("id", sessionId).maybeSingle();
  if (!sess) return Response.json({ error: "Not found." }, { status: 404 });
  if (!canViewClub(guard.session, "manage:members", sess.club_id)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }
  const feed = await liveFeed(sessionId);
  if (!feed) return Response.json({ error: "Not found." }, { status: 404 });
  return Response.json(feed, { headers: { "cache-control": "no-store" } });
}
