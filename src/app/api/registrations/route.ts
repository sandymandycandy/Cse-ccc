import { createAdminClient } from "@/lib/supabase/admin";
import { checkRegistrationLimits } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { validateFormSchema, defaultFormFor, type FormField } from "@/lib/registration-form/schema";
import { validateAnswers } from "@/lib/registration-form/answers";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { registrationMail, type RegistrationStatus } from "@/lib/registration/confirm-email";
import { enqueueEmail } from "@/lib/email";
import { istDayNum, istDateLabel, istTime } from "@/lib/datetime";

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
    .select("id, title, starts_at, is_all_day, venue_text, registration_form")
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
    p_team_name: identity.team_name,
  });
  if (error) {
    console.error("register_for_event failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const row = data?.[0];
  const status = row?.status ?? "full";
  if (status === "no_event") return Response.json({ error: "Event not found." }, { status: 404 });
  // Not open yet (usually clock skew right at the open tick): the client's
  // waiting room keeps retrying on this, so send it as a non-error 409.
  if (status === "not_open") return Response.json({ status }, { status: 409 });
  if (status === "closed") {
    return Response.json({ status, error: "Registration for this event is closed." }, { status: 409 });
  }
  // Waitlisted → look up the assigned position so the form can show "#N".
  let position: number | null = null;
  if (status === "waitlisted" && row?.registration_id) {
    const { data: pos } = await admin
      .from("registrations")
      .select("waitlist_position")
      .eq("id", row.registration_id)
      .maybeSingle();
    position = pos?.waitlist_position ?? null;
  }

  // Tell the whole team it worked. Best-effort by design: the registration is
  // already committed, so a mail failure must never turn a successful sign-up
  // into an error the student sees and retries.
  if (status === "registered" || status === "submitted" || status === "waitlisted") {
    try {
      await notifyTeam({
        status,
        event: ev,
        schema,
        customAnswers,
        leaderEmail: identity.email ?? null,
        leaderName: identity.student_name ?? null,
        teamName: identity.team_name ?? null,
        position,
      });
    } catch (err) {
      console.error("registration confirmation email failed", err);
    }
  }

  if (status === "waitlisted") return Response.json({ status, position });
  // registered | submitted | duplicate | full → the client renders the message
  return Response.json({ status });
}

/**
 * Mail every member of the team that just registered — not only whoever filled
 * the form in. A teammate who is never told is a teammate who does not turn up.
 * Member addresses exist only when the club asked for them, so this is
 * best-effort breadth, never a guarantee.
 */
async function notifyTeam(input: {
  status: RegistrationStatus;
  event: { id: string; title: string; starts_at: string; is_all_day: boolean; venue_text: string | null };
  schema: FormField[];
  customAnswers: Record<string, unknown>;
  leaderEmail: string | null;
  leaderName: string | null;
  teamName: string | null;
  position: number | null;
}): Promise<void> {
  const { status, event, schema, customAnswers, leaderEmail, leaderName, teamName, position } = input;

  const recipients = teamRecipients(schema, customAnswers, leaderEmail);
  if (recipients.length === 0) return;

  const when = event.is_all_day
    ? `${istDayNum(event.starts_at)} ${istDateLabel(event.starts_at)}`
    : `${istDayNum(event.starts_at)} ${istDateLabel(event.starts_at)} · ${istTime(event.starts_at)}`;
  const mail = registrationMail({
    status,
    eventTitle: event.title,
    when,
    venue: event.venue_text ?? "",
    teamName,
    position,
  });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  for (const to of recipients) {
    await enqueueEmail({
      template: "registration_confirmed",
      toEmail: to,
      // Only the registrant's name is known; a teammate is greeted generically
      // rather than being addressed as the person who filled the form in.
      toName: to === leaderEmail?.toLowerCase() ? (leaderName ?? undefined) : undefined,
      subject: mail.subject,
      payload: {
        details: mail.details,
        body: mail.body,
        url: base ? `${base}/events/${event.id}` : undefined,
      },
      priority: 2,
    });
  }
}
