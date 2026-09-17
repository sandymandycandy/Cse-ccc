import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { dayKeyStartUTC, istDateMedium, istTime, todayKey } from "@/lib/datetime";
import { OutboxPanel } from "@/components/admin/OutboxPanel";

/**
 * The email queue. Readable by anyone who can broadcast — a club head whose
 * 236-person send was queued needs to see where it went — but draining is
 * council-only, because the daily Gmail allowance is shared org-wide.
 */
export default async function OutboxPage() {
  const session = await requireViewPage("manage:broadcast");
  // One grant, two consequences: draining spends the org-wide Gmail allowance,
  // and the log names people across every club. Both are org-wide concerns.
  const councilWide = grantFor(session.role, "manage:broadcast") === "all";
  const canDrain = councilWide;
  const canSeeLog = councilWide;

  const admin = createAdminClient();
  const startOfToday = dayKeyStartUTC(todayKey()).toISOString();

  const [pending, failed, sentToday, recent] = await Promise.all([
    admin.from("email_log").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("email_log").select("id", { count: "exact", head: true }).eq("status", "failed"),
    admin
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", startOfToday),
    // ⚠️ Not fetched at all unless the viewer may see it. `email_log` has no
    // club, sender or actor column, so this list is org-wide for everyone who
    // reads it — and it carries admin password-reset and invite traffic. A club
    // head holds `manage:broadcast: own`, which opens this page but is not a
    // grant over other clubs' correspondence. Gating the render alone would
    // still pull the addresses into the server component's payload.
    canSeeLog
      ? admin
          .from("email_log")
          .select("id, to_email, subject, status, error, created_at")
          .order("created_at", { ascending: false })
          .limit(20)
      : null,
  ]);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Email</div>
          <h1 style={{ margin: "6px 0 0" }}>Outbox</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            Mail waiting to go out. A large send clears over more than one day —
            whatever is left goes out overnight.
          </p>
        </div>
      </div>

      <OutboxPanel
        pending={pending.count ?? 0}
        failed={failed.count ?? 0}
        sentToday={sentToday.count ?? 0}
        canDrain={canDrain}
        canSeeLog={canSeeLog}
        recent={(recent?.data ?? []).map((r) => ({
          id: r.id,
          toEmail: r.to_email,
          subject: r.subject,
          status: r.status,
          error: r.error,
          when: `${istDateMedium(r.created_at)} ${istTime(r.created_at)}`,
        }))}
      />
    </div>
  );
}
