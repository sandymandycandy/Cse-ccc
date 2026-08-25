import { getMemberSession } from "@/lib/member/guards";
import { memberExpiringToken } from "@/lib/attendance";
import { qrDataUrl } from "@/lib/qr";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_TTL = 60;

/** A fresh, time-boxed QR for the signed-in member (spec §6a). */
export async function GET() {
  const session = await getMemberSession();
  if (!session) return Response.json({ error: "Not signed in." }, { status: 401 });

  const admin = createAdminClient();
  const { data: open } = await admin
    .from("club_attendance_sessions")
    .select("qr_ttl_seconds")
    .eq("club_id", session.clubId)
    .eq("status", "open")
    .maybeSingle();

  const ttlSeconds = open?.qr_ttl_seconds ?? DEFAULT_TTL;
  const token = memberExpiringToken(session.memberId, ttlSeconds);
  const qr = await qrDataUrl(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/m/${token}`);
  return Response.json({ qr, ttlSeconds });
}
