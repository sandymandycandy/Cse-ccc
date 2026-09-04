import { FeedbackSchema, FEEDBACK_FIELD_KEYS } from "@/lib/feedback/schema";
import {
  getOpenPeriod,
  getClubLeaders,
  insertFeedbackResponse,
} from "@/lib/feedback/data";
import { checkFeedbackLimits } from "@/lib/rate-limit";
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
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    // Visible fields only — never the honeypot or the bot token, so a filled
    // honeypot fails generically instead of telling a bot which field it was.
    const fields: Record<string, string> = {};
    for (const key of FEEDBACK_FIELD_KEYS) {
      const msg = fieldErrors[key]?.[0];
      if (msg) fields[key] = msg;
    }
    return Object.keys(fields).length > 0
      ? Response.json({ error: "Please fix the highlighted fields.", fields }, { status: 400 })
      : Response.json({ error: "Please check the form and try again." }, { status: 400 });
  }
  const input = parsed.data;
  const ip = clientIp(request);

  // 3) rate limit (per IP only — see checkFeedbackLimits)
  const limit = checkFeedbackLimits({ ip });
  if (!limit.ok) {
    return Response.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  // 4) bot check (skipped when Turnstile isn't configured)
  if (!(await verifyTurnstile(input.turnstile, ip))) {
    return Response.json({ error: "Verification failed. Please retry." }, { status: 400 });
  }

  // 5) the window must STILL be open. A form left sitting in a tab after the
  //    President pressed Close must not submit.
  const period = await getOpenPeriod();
  if (!period) {
    return Response.json(
      { error: "Feedback has closed. Thank you for your interest." },
      { status: 409 },
    );
  }

  // 6) Re-resolve the leaders SERVER-SIDE from club_id. Names and ids sent by
  //    the browser are ignored entirely — otherwise anyone could post a
  //    one-star rating attached to a name of their choosing.
  const leaders = await getClubLeaders(input.clubId);
  if (!leaders) {
    return Response.json({ error: "Choose your club." }, { status: 400 });
  }

  // 7) store
  const ok = await insertFeedbackResponse({
    periodId: period.id,
    vtu: input.vtu,
    studentName: input.studentName,
    clubId: input.clubId,
    leaders,
    headRating: input.headRating ?? null,
    headComment: input.headComment,
    viceRating: input.viceRating ?? null,
    viceComment: input.viceComment,
    clubRating: input.clubRating,
    activities: input.activities,
    suggestions: input.suggestions,
  });
  if (!ok) {
    return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
