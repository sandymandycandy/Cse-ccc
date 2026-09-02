import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { splitRegistrations } from "@/lib/registration/waitlist";
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
  if (!canManage(session, "manage:registrations", ev.clubId)) redirect("/admin/events");

  const [regs, { schema }] = await Promise.all([
    listRegistrations(id),
    getEventFormSchema(id),
  ]);
  const { confirmed } = splitRegistrations(regs);

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
        </div>
      </div>

      <BroadcastForm
        eventId={id}
        confirmedCount={confirmed.length}
        allCount={regs.length}
      />
    </div>
  );
}
