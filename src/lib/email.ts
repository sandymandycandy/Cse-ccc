import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

/**
 * Queue-based email (BUILD_PLAN §11). Side effects insert a `pending` row into
 * email_log; a processor (Resend, cron-triggered) sends it later. This keeps the
 * request fast and makes delivery retryable and auditable. Writing to email_log
 * needs the service role (anon is revoked), so this runs only in trusted server
 * code.
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
  const { error } = await supabase.from("email_log").insert({
    template: args.template,
    to_email: args.toEmail,
    to_name: args.toName ?? null,
    subject: args.subject,
    payload: args.payload ?? {},
    priority: args.priority ?? 5,
    status: "pending",
  });
  if (error) throw error;
}
