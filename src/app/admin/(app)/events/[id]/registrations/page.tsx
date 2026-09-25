import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManageEvent, canViewEvent } from "@/lib/admin/event-hosts";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { answerColumns } from "@/lib/registration-form/columns";
import { isSafeHttpUrl } from "@/lib/url";
import { isAttendanceEligible } from "@/lib/admin/attendance-eligibility";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { teamOf } from "@/lib/certificates/fields";
import { presentPositions } from "@/lib/admin/team-attendance";
import { RegistrationsBoard, type BoardEntry } from "@/components/admin/RegistrationsBoard";
import { attendanceRows, choiceAnswers, defaultGroupField, groupFields } from "@/lib/registration/shortlist";
import { promoteWaitlistAction } from "./actions";

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:registrations");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();

  // View: all-scope + read see any event; club-scoped see the events their club
  // hosts, as owner or co-host.
  if (!canViewEvent(session, "manage:registrations", ev.hosts)) redirect("/admin/events");
  const canEdit = canManageEvent(session, "manage:registrations", ev.hosts);

  const [regs, { schema, selectionMode }] = await Promise.all([
    listRegistrations(id),
    getEventFormSchema(id),
  ]);
  const columns = answerColumns(schema);
  const hasTeam = schema.some((f) => f.kind === "team");
  const isShortlist = selectionMode === "shortlist";
  // Seats mode splits confirmed (the main table) from the waitlist. Shortlist
  // mode admits only finalised teams — the rest live on the Review page.
  const { confirmed: confirmedRows, waitlist: waitlistRows } = splitRegistrations(regs);
  const rows = isShortlist ? attendanceRows(regs, "shortlist") : confirmedRows;

  // One compact entry per registration: its people for the card, and the
  // answers other than the team block (which the people list already shows).
  const teamIds = schema.filter((f) => f.kind === "team").map((f) => f.id);
  const answerCols = columns.filter((c) => !teamIds.some((tid) => c.key.startsWith(`${tid}.`)));
  const deptYear = (d: string | null, y: string | number | null) =>
    [d, y].filter((v) => v != null && v !== "").join(" · ");
  const fields = groupFields(schema);
  const entries: BoardEntry[] = rows.map((r) => {
    const team = teamOf(r, schema);
    const people =
      team.length > 0
        ? team.map((p, position) => ({
            position,
            name: p.name,
            role: p.isLeader ? ("Leader" as const) : ("Member" as const),
            roll: p.roll,
            deptYear: deptYear(p.department, p.year),
            email: p.email,
            phone: p.phone,
          }))
        : [{ position: 0, name: r.name, role: null, roll: r.roll, deptYear: deptYear(r.department, r.year), email: r.email || null, phone: r.phone }];
    return {
      id: r.id,
      title: (hasTeam && r.teamName?.trim()) || r.name || r.roll || "Registrant",
      leader: hasTeam ? r.name : null,
      people,
      attended: r.attended,
      absent: r.absentMembers,
      eligible: isAttendanceEligible(r, selectionMode),
      answers: answerCols.map((c) => {
        const value = c.get(r.customAnswers);
        return { label: c.label, value, href: c.kind === "link" && isSafeHttpUrl(value) ? value : null };
      }),
      // Findable by anything — including details the row never shows (email,
      // phone) and every team member nested inside the custom answers.
      search: [r.name, r.teamName, r.roll, r.department, r.year, r.email, r.phone, r.customAnswers],
      choices: choiceAnswers(r, schema, fields),
    };
  });
  const peoplePresent = entries.reduce(
    (n, e) => n + presentPositions(e.people.length, e.attended, e.absent).length,
    0,
  );

  return (
    <div className="admin-page">
      <Link href="/admin/events" className="label" style={{ color: "var(--forest)" }}>
        ← Events
      </Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Registrations</div>
          <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            {isShortlist
              ? `${rows.length} shortlisted ${rows.length === 1 ? "team" : "teams"} · ${peoplePresent} ${peoplePresent === 1 ? "person" : "people"} present`
              : `${confirmedRows.length} ${hasTeam ? (confirmedRows.length === 1 ? "team" : "teams") : "registered"} · ${peoplePresent} ${peoplePresent === 1 ? "person" : "people"} present${
                  waitlistRows.length ? ` · ${waitlistRows.length} waitlisted` : ""
                }`}
          </p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {isShortlist ? (
            <Link href={`/admin/events/${id}/shortlist`} className="btn btn-accent btn-sm">
              Review &amp; shortlist
            </Link>
          ) : null}
          <Link
            href={`/admin/events/${id}/participants`}
            className="btn btn-ghost btn-sm"
          >
            Who&rsquo;s registered
          </Link>
          <Link
            href={`/admin/events/${id}/certificates`}
            className="btn btn-ghost btn-sm"
          >
            Certificates
          </Link>
          {canEdit ? (
            <Link
              href={`/admin/events/${id}/email`}
              className="btn btn-ghost btn-sm"
            >
              Email participants
            </Link>
          ) : null}
          <a
            href={`/api/admin/registrations/export?event=${id}`}
            className="btn btn-primary btn-sm"
          >
            Export CSV
          </a>
        </div>
      </div>

      {rows.length === 0 && waitlistRows.length === 0 ? (
        <div className="cal-empty">
          {isShortlist ? (
            <>
              No shortlisted teams yet.{" "}
              <Link href={`/admin/events/${id}/shortlist`}>Review registrations</Link> and finalise the
              shortlist.
            </>
          ) : (
            "No registrations yet."
          )}
        </div>
      ) : (
        <>
          <RegistrationsBoard
            eventId={id}
            entries={entries}
            canEdit={canEdit}
            isTeamEvent={hasTeam}
            groupFields={fields}
            defaultGroup={defaultGroupField(fields)}
          />

          {!isShortlist && waitlistRows.length > 0 ? (
            <div style={{ marginTop: 28 }}>
              <div className="label" style={{ marginBottom: 8 }}>
                Waitlist ({waitlistRows.length})
              </div>
              <div className="tablewrap cards">
                <table className="admin">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Roll</th>
                      <th>Dept · Yr</th>
                      {canEdit ? <th>Promote</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {waitlistRows.map((r) => (
                      <tr key={r.id}>
                        <td data-label="Position">{r.waitlistPosition}</td>
                        <td data-primary="" style={{ fontWeight: 500 }}>{r.name}</td>
                        <td data-label="Roll">{r.roll}</td>
                        <td data-label="Dept · Yr">
                          {r.department ?? "—"}
                          {r.year ? ` · ${r.year}` : ""}
                        </td>
                        {canEdit ? (
                          <td data-action="">
                            <form action={promoteWaitlistAction}>
                              <input type="hidden" name="registrationId" value={r.id} />
                              <input type="hidden" name="eventId" value={id} />
                              <button type="submit" className="btn btn-sm btn-accent">
                                Promote to registered
                              </button>
                            </form>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <span className="hint">
                Promoting confirms the student (past capacity if needed) and emails them.
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
