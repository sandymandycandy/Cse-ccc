import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManageEvent } from "@/lib/admin/event-hosts";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { reminderText } from "@/lib/admin/reminder-text";
import { createAdminClient } from "@/lib/supabase/admin";
import { istDateMedium, istTime } from "@/lib/datetime";
import { BroadcastForm } from "@/components/admin/BroadcastForm";

/**
 * Email an event's participants. Reading and writing are both gated on
 * `manage:registrations` for the event's own club — this page is a send button,
 * so view access alone (faculty read) is not enough to open it.
 */
export default async function EmailParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:registrations");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();
  if (!canManageEvent(session, "manage:registrations", ev.hosts)) redirect("/admin/events");

  const [regs, { schema }] = await Promise.all([
    listRegistrations(id),
    getEventFormSchema(id),
  ]);
  const { confirmed } = splitRegistrations(regs);

  const reminder = reminderText({
    title: ev.title,
    startsAt: ev.startsAt,
    endsAt: ev.endsAt,
    isAllDay: ev.isAllDay,
    venue: ev.venue,
  });

  // When this event was last emailed, so nobody blasts the same people twice in
  // an hour. Read from the audit log rather than email_log: broadcastAction
  // records the exact event id there, and (entity, entity_id) is indexed —
  // matching the title inside an email_log payload would be both slower and
  // wrong the moment someone renames an event.
  const { data: lastEmail } = await createAdminClient()
    .from("audit_log")
    .select("at, after")
    .eq("action", "participants_email")
    .eq("entity", "event")
    .eq("entity_id", id)
    .order("at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastRecipients =
    lastEmail?.after && typeof lastEmail.after === "object" && !Array.isArray(lastEmail.after)
      ? (lastEmail.after as Record<string, unknown>).recipients
      : null;

  // Show the real number of ADDRESSES, deduped the same way the send does — the
  // entry count would understate a team event several times over.
  const addresses = (rows: typeof regs) => {
    const seen = new Set<string>();
    for (const r of rows) for (const to of teamRecipients(schema, r.customAnswers, r.email)) seen.add(to);
    return seen.size;
  };

  return (
    <div className="admin-page">
      <Link href={`/admin/events/${id}/registrations`} className="label" style={{ color: "var(--forest)" }}>
        ← Registrations
      </Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Email participants</div>
          <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            {addresses(confirmed)} confirmed{" "}
            {addresses(confirmed) === 1 ? "address" : "addresses"} ·{" "}
            {addresses(regs)} including the waitlist.
          </p>
          {lastEmail ? (
            <p className="hint" style={{ marginTop: 8 }}>
              Last emailed {istDateMedium(lastEmail.at)} at {istTime(lastEmail.at)}
              {typeof lastRecipients === "number" ? ` — ${lastRecipients} addresses` : ""}.
            </p>
          ) : null}
        </div>
      </div>

      <BroadcastForm
        eventId={id}
        confirmedCount={confirmed.length}
        allCount={regs.length}
        reminder={reminder}
      />
    </div>
  );
}
