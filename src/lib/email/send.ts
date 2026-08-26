import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { renderEmail } from "./templates";
import { sendViaResend } from "./resend";

export interface EmailRow {
  id: string;
  template: string;
  to_email: string;
  to_name: string | null;
  subject: string;
  payload: Json;
}

/** Render + send one queued row, then flip its status. Returns the new status. */
export async function deliverEmail(row: EmailRow): Promise<"sent" | "failed"> {
  const admin = createAdminClient();
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : null;

  const { html, text } = renderEmail(row.template, row.subject, row.to_name, payload);
  const result = await sendViaResend({ to: row.to_email, subject: row.subject, html, text });

  if (result.ok) {
    await admin
      .from("email_log")
      .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
      .eq("id", row.id);
    return "sent";
  }
  await admin
    .from("email_log")
    .update({ status: "failed", error: result.error.slice(0, 500) })
    .eq("id", row.id);
  return "failed";
}

/** Drain up to `limit` pending rows, highest priority (lowest number) + oldest first. */
export async function deliverPending(limit = 25): Promise<{ sent: number; failed: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("email_log")
    .select("id, template, to_email, to_name, subject, payload")
    .eq("status", "pending")
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit);

  let sent = 0;
  let failed = 0;
  for (const row of (data ?? []) as EmailRow[]) {
    if ((await deliverEmail(row)) === "sent") sent++;
    else failed++;
  }
  return { sent, failed };
}
