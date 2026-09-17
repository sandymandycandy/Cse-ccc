import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { BULK_PRIORITY, INSERT_CHUNK, chunk } from "./email/bulk";

/**
 * Queue-based email (BUILD_PLAN §11). Side effects insert a `pending` row into
 * email_log, then attempt an immediate best-effort delivery via Resend
 * (`email/send`); a transient failure leaves the row for the cron backstop
 * (`/api/cron/send-email`), so delivery stays retryable and auditable and enqueue
 * never throws for a send error. Writing to email_log needs the service role (anon
 * is revoked), so this runs only in trusted server code.
 */
export interface EnqueueEmailArgs {
  template: string;
  toEmail: string;
  toName?: string;
  subject: string;
  payload?: Json;
  /** Lower = sent sooner. */
  priority?: number;
  /**
   * Queue the row WITHOUT attempting an immediate send. Bulk audiences use
   * this: inline delivery opens one SMTP connection per message, so a few
   * hundred of them would run past the function limit before the first batch
   * landed. The Outbox (or the nightly cron) drains what this leaves behind.
   */
  deferred?: boolean;
}

export async function enqueueEmail(args: EnqueueEmailArgs): Promise<void> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("email_log")
    .insert({
      template: args.template,
      to_email: args.toEmail,
      to_name: args.toName ?? null,
      subject: args.subject,
      payload: args.payload ?? {},
      priority: args.priority ?? 5,
      status: "pending",
    })
    .select("id, template, to_email, to_name, subject, payload")
    .single();
  if (error) throw error;

  if (args.deferred) return;

  // Best-effort immediate delivery. A transient send failure leaves the row
  // 'pending'/'failed' for the cron backstop — enqueue never throws for a delivery error.
  try {
    const { deliverEmail } = await import("./email/send");
    await deliverEmail(data);
  } catch {
    /* swallow — the row is persisted; the cron will retry pending rows */
  }
}

/**
 * Queue many rows in as few statements as possible, sending NOTHING inline.
 * Returns how many rows were written. Draining is the Outbox's job, or the
 * nightly cron's.
 */
export async function enqueueEmailBatch(rows: EnqueueEmailArgs[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createAdminClient();
  let written = 0;
  for (const part of chunk(rows, INSERT_CHUNK)) {
    const { error, count } = await supabase.from("email_log").insert(
      part.map((r) => ({
        template: r.template,
        to_email: r.toEmail,
        to_name: r.toName ?? null,
        subject: r.subject,
        payload: r.payload ?? {},
        priority: r.priority ?? BULK_PRIORITY,
        status: "pending",
      })),
      { count: "exact" },
    );
    if (error) throw error;
    written += count ?? part.length;
  }
  return written;
}
