import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEVICE_COOKIE, deviceHash, verifyCode, isSessionOpen } from "@/lib/attendance";
import { getSessionById } from "@/lib/admin/attendance";
import { rateLimit } from "@/lib/rate-limit";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Student self-scan (SECURITY_SPEC §8a). The phone's device cookie is the
 * identity; the rotating code proves "scanned the live QR"; the unique
 * (session, device) row enforces one scan per device; redemption is atomic and
 * audited. Every outcome returns 200 with a status so the scan page can explain
 * itself — the HTTP code carries no information a prober could use.
 */

type ScanStatus =
  | "ok"
  | "already"
  | "closed"
  | "bad_code"
  | "no_device"
  | "not_registered"
  | "error";

const Schema = z.object({
  session: z.string().uuid(),
  code: z.string().min(1).max(64),
});

const reply = (status: ScanStatus, http = 200) =>
  Response.json({ status }, { status: http });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply("error", 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return reply("error", 400);
  const { session: sessionId, code } = parsed.data;

  const deviceId = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!deviceId) return reply("no_device");
  const dHash = deviceHash(deviceId);

  // Rate limit per device and per session (§6).
  if (!rateLimit(`scan:dev:${dHash}`, 10, 60_000).ok) return reply("error", 429);
  if (!rateLimit(`scan:sess:${sessionId}`, 400, 60_000).ok) return reply("error", 429);

  const s = await getSessionById(sessionId);
  if (!s || !isSessionOpen(s)) return reply("closed");
  if (!verifyCode(sessionId, code)) return reply("bad_code");

  const admin = createAdminClient();

  const { data: dev } = await admin
    .from("student_devices")
    .select("roll_no")
    .eq("device_hash", dHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!dev) return reply("no_device");

  const { data: reg } = await admin
    .from("registrations")
    .select("id, attended")
    .eq("event_id", s.eventId)
    .eq("roll_no", dev.roll_no)
    .maybeSingle();
  if (!reg) return reply("not_registered");

  // Claim the (session, device) slot; a duplicate means this phone already scanned.
  const { data: inserted } = await admin
    .from("attendance_scans")
    .upsert(
      { session_id: sessionId, device_hash: dHash, registration_id: reg.id },
      { onConflict: "session_id,device_hash", ignoreDuplicates: true },
    )
    .select("id");
  const isNew = (inserted?.length ?? 0) > 0;
  if (!isNew) return reply("already");

  await admin
    .from("registrations")
    .update({
      attended: true,
      checked_in_at: new Date().toISOString(),
      checkin_method: "self",
    })
    .eq("id", reg.id)
    .eq("attended", false);

  await admin
    .from("student_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("device_hash", dHash);

  await writeAudit({
    actorId: null,
    action: "self_scan",
    entity: "registration",
    entityId: reg.id,
    after: { sessionId, roll: dev.roll_no },
  });

  return reply("ok");
}
