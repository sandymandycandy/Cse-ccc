import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManageEvent, canViewEvent } from "@/lib/admin/event-hosts";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { listTeams, teamSearchValues } from "@/lib/registration-form/participants";
import { choiceAnswers, defaultGroupField, groupFields, shortlistState } from "@/lib/registration/shortlist";
import { ShortlistReview, type ReviewItem } from "@/components/admin/ShortlistReview";

/** Review every registration on a shortlist event and sort it into a category. */
export default async function ShortlistPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireViewPage("manage:registrations");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();
  // Same scoping as the registrations page: all/read see any event, own sees the
  // events its club hosts, as owner or co-host.
  if (!canViewEvent(session, "manage:registrations", ev.hosts)) redirect("/admin/events");
  const canEdit = canManageEvent(session, "manage:registrations", ev.hosts);

  const [regs, { schema, selectionMode }] = await Promise.all([listRegistrations(id), getEventFormSchema(id)]);
  if (selectionMode !== "shortlist") redirect(`/admin/events/${id}/registrations`);

  const teams = listTeams(regs, schema);
  const fields = groupFields(schema);
  const items: ReviewItem[] = regs.map((r, i) => ({
    id: r.id,
    team: teams[i],
    state: shortlistState(r),
    search: [...teamSearchValues(teams[i]), r.customAnswers],
    choices: choiceAnswers(r, schema, fields),
  }));

  return (
    <div className="admin-page">
      <Link href="/admin/events" className="label" style={{ color: "var(--forest)" }}>← Events</Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Review &amp; shortlist</div>
          <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
          <p className="body-text" style={{ marginTop: 6 }}>{regs.length} registered</p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Link href={`/admin/events/${id}/registrations`} className="btn btn-ghost btn-sm">Attendance</Link>
          <Link href={`/admin/events/${id}/participants`} className="btn btn-ghost btn-sm">Who&rsquo;s registered</Link>
        </div>
      </div>
      <ShortlistReview eventId={id} items={items} canEdit={canEdit} groupFields={fields} defaultGroup={defaultGroupField(fields)} />
    </div>
  );
}
