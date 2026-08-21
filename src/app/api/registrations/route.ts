import { createAdminClient } from "@/lib/supabase/admin";
import { RegistrationSchema } from "@/lib/validation/registration";
import { checkRegistrationLimits } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { generateConfirmToken } from "@/lib/tokens";
import { enqueueEmail } from "@/lib/email";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  // 1) body size cap (SECURITY_SPEC §5)
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 100_000) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  // 2) parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const parsed = RegistrationSchema.safeParse(body);
  if (!parsed.success) {
    // Detail goes to the log, not the response.
    console.warn("registration validation failed", parsed.error.flatten().fieldErrors);
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const input = parsed.data;
  const ip = clientIp(request);

  // 3) rate limit (per IP, per roll, per email)
  const limit = checkRegistrationLimits({ ip, rollNo: input.rollNo, email: input.email });
  if (!limit.ok) {
    return Response.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 4) bot check (skipped when Turnstile isn't configured)
  if (!(await verifyTurnstile(input.turnstile, ip))) {
    return Response.json({ error: "Verification failed. Please retry." }, { status: 400 });
  }

  // 5) privileged insert via the atomic RPC (needs the service role)
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Registration isn't fully configured yet. Please try again soon." },
      { status: 503 },
    );
  }

  const { raw, hash } = generateConfirmToken();
  const { data, error } = await admin.rpc("register_for_event", {
    p_event_id: input.eventId,
    p_student_name: input.studentName,
    p_roll_no: input.rollNo,
    p_email: input.email,
    p_phone: input.phone,
    p_department: input.department,
    p_year: input.year,
    p_confirm_token_hash: hash,
  });
  if (error) {
    console.error("register_for_event failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const result = data?.[0];
  const status = result?.status ?? "full";

  if (status === "no_event") {
    return Response.json({ error: "Event not found." }, { status: 404 });
  }
  if (status === "closed") {
    return Response.json({ status, error: "Registration for this event is closed." }, { status: 409 });
  }

  // 6) confirmation email for a fresh registration (queued, not sent inline)
  let confirmUrl: string | undefined;
  if (status === "registered") {
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
    const url = `${origin}/registrations/confirm?token=${raw}`;
    const { data: ev } = await admin
      .from("events")
      .select("title")
      .eq("id", input.eventId)
      .maybeSingle();
    const eventTitle = ev?.title ?? "your event";

    await enqueueEmail({
      template: "registration_received",
      toEmail: input.email,
      toName: input.studentName,
      subject: `Confirm your seat — ${eventTitle}`,
      payload: { confirmUrl: url, eventTitle, studentName: input.studentName },
      priority: 1,
    });

    // Dev convenience only: surface the link when there's no live mail sender,
    // so the flow is testable locally. Never leak it in production.
    if (process.env.NODE_ENV !== "production") confirmUrl = url;
  }

  return Response.json({ status, confirmUrl });
}
