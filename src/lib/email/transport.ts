import "server-only";
import type { SendArgs, SendResult } from "./resend";
import { sendViaResend } from "./resend";
import { sendViaGmail } from "./gmail";

/**
 * Pick the email transport by which credentials are configured — the queue,
 * renderer, and cron stay provider-agnostic. Gmail SMTP (free, app password) takes
 * precedence when set; otherwise Resend; otherwise a no-op failure the caller records
 * on the row (so a missing config never throws).
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return sendViaGmail(args);
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return sendViaResend(args);
  return { ok: false, error: "No email transport configured (set GMAIL_* or RESEND_*)." };
}
