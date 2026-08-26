import { createAdminClient } from "@/lib/supabase/admin";
import { ContactSchema } from "@/lib/validation/contact";
import { checkContactLimits } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";

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
    // Detail goes to the log, not the response.
    console.warn("contact validation failed", parsed.error.flatten().fieldErrors);
    return Response.json({ error: "Please check the form and try again." }, { status: 400 });
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

  const { error } = await admin.from("contact_messages").insert({
    name: input.name,
    email: input.email,
    subject: input.subject || null,
    message: input.message,
  });
  if (error) {
    console.error("contact insert failed", error);
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
