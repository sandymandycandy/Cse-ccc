import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { answerColumns } from "@/lib/registration-form/columns";
import { isSafeHttpUrl } from "@/lib/url";
import { isAttendanceEligible } from "@/lib/admin/attendance-eligibility";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { SearchableTable } from "@/components/admin/SearchableTable";
import {
  toggleAttendanceAction,
  shortlistAction,
  unshortlistAction,
  promoteWaitlistAction,
} from "./actions";

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:registrations");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();

  // View: all-scope + read (faculty) see any club; club-scoped see only their own.
  const grant = grantFor(session.role, "manage:registrations");
  const canViewThis =
    grant === "all" || grant === "read" || (grant === "own" && session.clubId === ev.clubId);
  if (!canViewThis) redirect("/admin/events");
  const canEdit = canManage(session, "manage:registrations", ev.clubId);

  const [regs, { schema, selectionMode }] = await Promise.all([
    listRegistrations(id),
    getEventFormSchema(id),
  ]);
  const columns = answerColumns(schema);
  const hasTeam = schema.some((f) => f.kind === "team");
  const isShortlist = selectionMode === "shortlist";
  const attended = regs.filter((r) => r.attended).length;
  const shortlisted = regs.filter((r) => r.shortlistedAt).length;
  // Seats mode splits confirmed (the main table) from the waitlist; shortlist
  // mode has no waitlist, so the main table shows everything.
  const { confirmed: confirmedRows, waitlist: waitlistRows } = splitRegistrations(regs);
  const rows = isShortlist ? regs : confirmedRows;

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
              ? `${regs.length} submitted · ${shortlisted} shortlisted`
              : `${confirmedRows.length} registered · ${attended} attended${
                  waitlistRows.length ? ` · ${waitlistRows.length} waitlisted` : ""
                }`}
          </p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
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

      {regs.length === 0 ? (
        <div className="cal-empty">No registrations yet.</div>
      ) : (
        <>
          {isShortlist && canEdit ? (
            <form id="shortlist-form" action={shortlistAction} style={{ marginTop: 18 }}>
              <input type="hidden" name="eventId" value={id} />
              <button type="submit" className="btn btn-accent btn-sm">
                Shortlist selected &amp; email
              </button>
              <span className="hint" style={{ marginLeft: 10 }}>
                Emails each newly-selected applicant who gave an email.
              </span>
            </form>
          ) : null}
          <SearchableTable
            wrapStyle={{ marginTop: 12 }}
            noun="registration"
            placeholder="Search name, roll, email, phone, department, any answer…"
            ariaLabel="Search registrations by any detail"
            head={
                <tr>
                  {isShortlist && canEdit ? <th aria-label="Select" /> : null}
                  <th>Name</th>
                  {hasTeam ? <th>Team</th> : null}
                  <th>Roll</th>
                  <th>Dept · Yr</th>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  {isShortlist ? <th>Shortlisted</th> : null}
                  <th>Confirmed</th>
                  <th>Attended</th>
                  {canEdit ? <th>Mark</th> : null}
                </tr>
            }
            rows={rows.map((r) => ({
              key: r.id,
              // Findable by anything on the row — including details the table
              // never shows (email, phone) and every team member nested inside
              // the custom answers, which matchesAny walks into.
              values: [r.name, r.teamName, r.roll, r.department, r.year, r.email, r.phone, r.customAnswers],
              row: (
                  <tr key={r.id}>
                    {isShortlist && canEdit ? (
                      <td data-label="Select">
                        <input
                          type="checkbox"
                          name="selected"
                          form="shortlist-form"
                          value={r.id}
                          aria-label={`Select ${r.name || r.roll || "registrant"}`}
                        />
                      </td>
                    ) : null}
                    <td data-primary="" style={{ fontWeight: 500 }}>
                      {r.name}
                      {hasTeam ? (
                        <span className="label" style={{ marginLeft: 6, fontWeight: 400 }}>
                          · 👥 {teamSize(r.customAnswers, schema)}
                        </span>
                      ) : null}
                    </td>
                    {hasTeam ? (
                      <td data-label="Team">{r.teamName || "—"}</td>
                    ) : null}
                    <td data-label="Roll">{r.roll}</td>
                    <td data-label="Dept · Yr">
                      {r.department ?? "—"}
                      {r.year ? ` · ${r.year}` : ""}
                    </td>
                    {columns.map((c) => {
                      const v = c.get(r.customAnswers);
                      if (c.kind === "link" && isSafeHttpUrl(v)) {
                        return (
                          <td key={c.key} data-label={c.label}>
                            <a
                              href={v}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "var(--forest)" }}
                            >
                              link ↗
                            </a>
                          </td>
                        );
                      }
                      return (
                        <td key={c.key} data-label={c.label}>
                          {v || "—"}
                        </td>
                      );
                    })}
                  {isShortlist ? (
                    <td data-label="Shortlisted">
                      {r.shortlistedAt ? (
                        <span
                          style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
                        >
                          <span className="abadge abadge-approved">Shortlisted</span>
                          {canEdit ? (
                            <form action={unshortlistAction} style={{ display: "inline" }}>
                              <input type="hidden" name="registrationId" value={r.id} />
                              <input type="hidden" name="eventId" value={id} />
                              <button type="submit" className="btn btn-sm btn-ghost">
                                Undo
                              </button>
                            </form>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  ) : null}
                    <td data-label="Confirmed">{r.confirmed ? "Yes" : "—"}</td>
                    <td data-label="Attended">
                      {r.attended ? (
                        <span className="abadge abadge-approved">Present</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {canEdit ? (
                      isAttendanceEligible(r, selectionMode) ? (
                        <td data-action="">
                          <form action={toggleAttendanceAction}>
                            <input type="hidden" name="registrationId" value={r.id} />
                            <input type="hidden" name="eventId" value={id} />
                            <input type="hidden" name="attend" value={r.attended ? "0" : "1"} />
                            <button
                              type="submit"
                              className={`btn btn-sm ${r.attended ? "btn-ghost" : "btn-accent"}`}
                            >
                              {r.attended ? "Undo" : hasTeam ? "Mark team present" : "Mark present"}
                            </button>
                          </form>
                        </td>
                      ) : (
                        <td data-label="Mark">—</td>
                      )
                    ) : null}
                </tr>
              ),
            }))}
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

/** Number of members captured in the first team block of this registration. */
function teamSize(
  custom: Record<string, unknown> | null,
  schema: { id: string; kind: string }[],
): number {
  const team = schema.find((f) => f.kind === "team");
  const list = team ? custom?.[team.id] : undefined;
  return Array.isArray(list) ? list.length : 0;
}
