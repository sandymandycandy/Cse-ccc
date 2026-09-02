import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueEmail } from "@/lib/email";
import { contactNotification, type ContactQuery } from "./notify-payload";

/** Roles told about a public contact query, per owner ask (2026-09-02). */
export const NOTIFY_ROLES = ["president", "vice_president"] as const;

/**
 * Tell the President and Vice President that someone sent a query.
 *
 * Fire-and-forget by design: the message is already stored before this runs, so
 * a mail failure must never turn a successful submission into an error for the
 * student. Everything here is swallowed and logged.
 */
export async function notifyLeadershipOfQuery(query: ContactQuery): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("admin_users")
      .select("email, full_name, role")
      .in("role", [...NOTIFY_ROLES])
      .eq("is_active", true);
    if (error) throw error;

    const recipients = (data ?? []) as { email: string; full_name: string | null }[];
    if (recipients.length === 0) {
      // Not an error — the roles may simply be unfilled. Worth a log line, because
      // it means a query arrived and nobody was told.
      console.warn("contact notify: no active president/vice_president to notify");
      return 0;
    }

    const mail = contactNotification(query);
    let queued = 0;
    for (const r of recipients) {
      if (!r.email) continue;
      try {
        await enqueueEmail({
          template: "contact_query",
          toEmail: r.email,
          toName: r.full_name ?? undefined,
          subject: mail.subject,
          payload: mail.payload,
          // above the default 5: a person is waiting on a reply
          priority: 3,
        });
        queued++;
      } catch (e) {
        console.error("contact notify: enqueue failed", e);
      }
    }
    return queued;
  } catch (e) {
    console.error("contact notify failed", e);
    return 0;
  }
}
