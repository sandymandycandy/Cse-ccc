import { createAdminClient } from "@/lib/supabase/admin";
import { checkRegistrationLimits } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { validateFormSchema, defaultFormFor, type FormField } from "@/lib/registration-form/schema";
import { validateAnswers } from "@/lib/registration-form/answers";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  // 1) body size cap (SECURITY_SPEC §5)
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > 100_000) return Response.json({ error: "Payload too large." }, { status: 413 });

  // 2) parse JSON: { eventId, answers, website (honeypot), turnstile }
  let body: { eventId?: unknown; answers?: unknown; website?: unknown; turnstile?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  if (!eventId) return Response.json({ error: "Event not found." }, { status: 404 });
  const answers =
    body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? (body.answers as Record<string, unknown>)
      : {};

  // honeypot: real users never fill this
  if (typeof body.website === "string" && body.website.length > 0) {
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }

  const ip = clientIp(request);

  // 3) bot check (skipped when Turnstile isn't configured)
  if (!(await verifyTurnstile(typeof body.turnstile === "string" ? body.turnstile : undefined, ip))) {
    return Response.json({ error: "Verification failed. Please retry." }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "Registration isn't fully configured yet. Please try again soon." },
      { status: 503 },
    );
  }

  // 4) load the event's stored schema (service role) — the validation authority
  const { data: ev } = await admin
    .from("events")
    .select("id, registration_form")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return Response.json({ error: "Event not found." }, { status: 404 });

  let schema: FormField[] = defaultFormFor();
  if (ev.registration_form) {
    const parsed = validateFormSchema(ev.registration_form);
    if (parsed.ok) schema = parsed.fields; // fall back to the default template if somehow invalid
  }

  // 5) validate answers against the stored schema (never trust the client's field list)
  const result = validateAnswers(schema, answers);
  if (!result.ok) {
    return Response.json({ error: "Please check the form.", fields: result.fieldErrors }, { status: 400 });
  }
  const { identity, customAnswers } = result.data;

  // 6) rate limit — by ip + roll/email when collected (dedup keys)
  const limit = checkRegistrationLimits({
    ip,
    rollNo: identity.roll_no ?? "",
    email: identity.email ?? "",
  });
  if (!limit.ok) {
    return Response.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 7) atomic insert via the RPC (needs the service role). Absent identity keys
  // are omitted → SQL defaults them to null.
  const { data, error } = await admin.rpc("register_for_event", {
    p_event_id: eventId,
    p_student_name: identity.student_name,
    p_roll_no: identity.roll_no,
    p_email: identity.email,
    p_phone: identity.phone,
    p_department: identity.department,
    p_year: identity.year,
    p_custom_answers: customAnswers,
  });
  if (error) {
    console.error("register_for_event failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const status = data?.[0]?.status ?? "full";
  if (status === "no_event") return Response.json({ error: "Event not found." }, { status: 404 });
  if (status === "closed") {
    return Response.json({ status, error: "Registration for this event is closed." }, { status: 409 });
  }
  // registered | submitted | waitlisted | duplicate | full → the client renders the message
  return Response.json({ status });
}
