import { deliverPending } from "@/lib/email/send";

/**
 * Email backstop (spec §Architecture). Vercel Cron calls this with
 * `Authorization: Bearer ${CRON_SECRET}`; anything else is rejected. Drains pending
 * rows — the retry path and what flushes anything inline delivery missed. Not under
 * `app/api/admin/**`, so the admin-guard ESLint rule doesn't apply; CRON_SECRET is
 * the guard.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  // 100, not 25: a queued all-members send is ~908 rows, and this nightly pass
  // is the backstop that clears whatever the Outbox did not.
  const summary = await deliverPending(100);
  return Response.json({ ok: true, ...summary });
}
