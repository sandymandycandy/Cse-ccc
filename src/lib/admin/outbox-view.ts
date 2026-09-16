// Presentation helpers for the Outbox. Pure, and deliberately separate from the
// panel that uses them: the panel is a client component, and these are the two
// things in it worth pinning with a test.

/** Roughly what a free Gmail app-password account will send in a day. */
export const DAILY_CEILING = 500;

/** The badge variants `.badge-sent` / `-pending` / `-failed` are defined for. */
export type BadgeTone = "sent" | "pending" | "failed";

/**
 * A row's `email_log.status` as a badge variant.
 *
 * Takes a plain string rather than the enum because the panel is handed already
 * serialised rows, and falls back to `pending` so a status added to
 * `email_status` later renders as an unstyled-but-legible badge instead of
 * bare text with no background.
 */
export function statusTone(status: string): BadgeTone {
  return status === "sent" || status === "failed" ? status : "pending";
}

/**
 * How much of the day's allowance is spent, 0–100 and rounded.
 *
 * Clamped at both ends: the cron drains in batches and can overshoot the
 * ceiling slightly, and a bar wider than its track reads as a rendering bug
 * rather than as "you are done for today".
 *
 * ⚠️ Rounds DOWN, not to nearest. The panel treats 100 as "the allowance is
 * gone" and colours the bar for it, so rounding 499/500 up to 100 would call
 * the day over while one more message could still go.
 */
export function ceilingPercent(sentToday: number, ceiling = DAILY_CEILING): number {
  if (!Number.isFinite(sentToday) || sentToday <= 0) return 0;
  if (ceiling <= 0) return 0;
  return Math.min(100, Math.floor((sentToday / ceiling) * 100));
}
