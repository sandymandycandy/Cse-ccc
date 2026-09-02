import { createAdminClient } from "@/lib/supabase/admin";
import { ContactSchema } from "@/lib/validation/contact";
import { checkContactLimits } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { notifyLeadershipOfQuery } from "@/lib/contact/notify";

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
  const parsed = ContactSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    console.warn("contact validation failed", fieldErrors);
    // Surface per-field messages for the visible fields only — never the honeypot
    // ("website") or the bot token — so filling the honeypot still fails generically.
    const fields: Record<string, string> = {};
    for (const key of ["name", "email", "subject", "message"] as const) {
      const msg = fieldErrors[key]?.[0];
      if (msg) fields[key] = msg;
    }
    return Object.keys(fields).length > 0
      ? Response.json({ error: "Please fix the highlighted fields.", fields }, { status: 400 })
      : Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const input = parsed.data;
  const ip = clientIp(request);

  // 3) rate limit (per IP, per email)
  const limit = checkContactLimits({ ip, email: input.email });
  if (!limit.ok) {
    return Response.json(
      { error: "Too many messages. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 4) bot check (skipped when Turnstile isn't configured)
  if (!(await verifyTurnstile(input.turnstile, ip))) {
    return Response.json({ error: "Verification failed. Please retry." }, { status: 400 });
  }

  // 5) store via the service role (no anon write grant on contact_messages)
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return Response.json(
      { error: "The contact form isn't fully configured yet. Please try again soon." },
      { status: 503 },
    );
  }

  const { data: saved, error } = await admin
    .from("contact_messages")
    .insert({
      name: input.name,
      email: input.email,
      subject: input.subject || null,
      message: input.message,
    })
    .select("id")
    .single();
  if (error) {
    console.error("contact insert failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  // 6) tell the President + Vice President (owner ask, 2026-09-02). The message
  // is already stored, so this is awaited but never allowed to fail the request —
  // a mail outage must not tell the student their query was lost.
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;
  await notifyLeadershipOfQuery({
    name: input.name,
    email: input.email,
    subject: input.subject || null,
    message: input.message,
    inboxUrl: saved?.id ? `${origin}/admin/contact/${saved.id}` : null,
  });

  return Response.json({ ok: true });
}
