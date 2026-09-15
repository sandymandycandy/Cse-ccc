"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverPending } from "@/lib/email/send";
import { writeAudit } from "@/lib/admin/audit";

/** One press sends this many. ~1s per SMTP connection, well inside the 300s limit. */
const BATCH = 40;

/**
 * One shape for both actions. A discriminated union narrows badly at the call
 * site — `"error" in r ? … : r.sent` does not narrow inside a template literal —
 * and the client reads one field at a time anyway.
 */
export interface OutboxResult {
  error?: string;
  sent?: number;
  failed?: number;
  retried?: number;
}

/**
 * Draining is council-only even though the page is readable by any broadcast
 * holder: the daily Gmail allowance is shared org-wide, so spending it is the
 * council's call, not one club head's.
 */
async function requireCouncilWide() {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };
  if (grantFor(session.role, "manage:broadcast") !== "all") {
    return { error: "Only the council can send the queue." };
  }
  return { session };
}

export async function drainBatchAction(): Promise<OutboxResult> {
  const guard = await requireCouncilWide();
  if ("error" in guard) return { error: guard.error };

  const summary = await deliverPending(BATCH);
  await writeAudit({
    actorId: guard.session.id,
    action: "outbox_drain",
    entity: "email_log",
    after: summary,
  });
  revalidatePath("/admin/outbox");
  return summary;
}

export async function retryFailedAction(): Promise<OutboxResult> {
  const guard = await requireCouncilWide();
  if ("error" in guard) return { error: guard.error };

  const admin = createAdminClient();
  const { data } = await admin
    .from("email_log")
    .update({ status: "pending", error: null })
    .eq("status", "failed")
    .select("id");

  const retried = data?.length ?? 0;
  await writeAudit({
    actorId: guard.session.id,
    action: "outbox_retry",
    entity: "email_log",
    after: { retried },
  });
  revalidatePath("/admin/outbox");
  return { retried };
}
