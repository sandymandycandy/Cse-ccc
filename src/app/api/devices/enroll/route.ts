import { cookies } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/tokens";
import { DEVICE_COOKIE, newDeviceId, deviceHash } from "@/lib/attendance";

/**
 * Device enrollment (SECURITY_SPEC §8a). Called when a student taps their one-tap
 * confirmation link on their phone: it mints an httpOnly device cookie and binds
 * the roll number to that device, revoking any prior device so one roll maps to
 * one active phone. The confirm token is the proof of identity (it arrived in the
 * student's email), consistent with the no-login model.
 */

const Schema = z.object({ token: z.string().min(1).max(300) });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });

  const admin = createAdminClient();
  const { data: reg } = await admin
    .from("registrations")
    .select("roll_no, email, confirmed_at")
    .eq("confirm_token_hash", hashToken(parsed.data.token))
    .maybeSingle();

  // Only a confirmed registration can enroll a device.
  if (!reg || !reg.confirmed_at) {
    return Response.json({ error: "Not eligible." }, { status: 404 });
  }

  const deviceId = newDeviceId();
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;

  // One active phone per roll: revoke any current device, then enroll this one.
  await admin
    .from("student_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("roll_no", reg.roll_no)
    .is("revoked_at", null);

  const { error } = await admin.from("student_devices").insert({
    roll_no: reg.roll_no,
    email: reg.email,
    device_hash: deviceHash(deviceId),
    user_agent: userAgent,
  });
  if (error) return Response.json({ error: "Enrollment failed." }, { status: 500 });

  (await cookies()).set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return Response.json({ ok: true });
}
