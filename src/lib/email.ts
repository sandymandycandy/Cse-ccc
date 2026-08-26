import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

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

  // Best-effort immediate delivery. A transient send failure leaves the row
  // 'pending'/'failed' for the cron backstop — enqueue never throws for a delivery error.
  try {
    const { deliverEmail } = await import("./email/send");
    await deliverEmail(data);
  } catch {
    /* swallow — the row is persisted; the cron will retry pending rows */
  }
}
