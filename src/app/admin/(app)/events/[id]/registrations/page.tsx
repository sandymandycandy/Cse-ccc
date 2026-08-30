import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { answerColumns } from "@/lib/registration-form/columns";
import { isSafeHttpUrl } from "@/lib/url";
import { toggleAttendanceAction, shortlistAction, unshortlistAction } from "./actions";

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
  const confirmed = regs.filter((r) => r.confirmed).length;
  const attended = regs.filter((r) => r.attended).length;
  const shortlisted = regs.filter((r) => r.shortlistedAt).length;

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
              : `${regs.length} registered · ${confirmed} confirmed · ${attended} attended`}
          </p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Link href={`/admin/events/${id}/attendance`} className="btn btn-ghost btn-sm">
            Check-in
          </Link>
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
          <div className="tablewrap" style={{ marginTop: isShortlist && canEdit ? 12 : 18 }}>
            <table className="admin">
              <thead>
                <tr>
                  {isShortlist && canEdit ? <th aria-label="Select" /> : null}
                  <th>Name</th>
                  <th>Roll</th>
                  <th>Dept · Yr</th>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                  {isShortlist ? <th>Shortlisted</th> : null}
                  <th>Confirmed</th>
                  <th>Attended</th>
                  {canEdit ? <th>Check-in</th> : null}
                </tr>
              </thead>
              <tbody>
                {regs.map((r) => (
                  <tr key={r.id}>
                    {isShortlist && canEdit ? (
                      <td>
                        <input
                          type="checkbox"
                          name="selected"
                          form="shortlist-form"
                          value={r.id}
                          aria-label={`Select ${r.name || r.roll || "registrant"}`}
                        />
                      </td>
                    ) : null}
                    <td style={{ fontWeight: 500 }}>
                      {r.name}
                      {hasTeam ? (
                        <span className="label" style={{ marginLeft: 6, fontWeight: 400 }}>
                          · 👥 {teamSize(r.customAnswers, schema)}
                        </span>
                      ) : null}
                    </td>
                    <td>{r.roll}</td>
                    <td>
                      {r.department ?? "—"}
                      {r.year ? ` · ${r.year}` : ""}
                    </td>
                    {columns.map((c) => {
                      const v = c.get(r.customAnswers);
                      if (c.kind === "link" && isSafeHttpUrl(v)) {
                        return (
                          <td key={c.key}>
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
                      return <td key={c.key}>{v || "—"}</td>;
                    })}
                  {isShortlist ? (
                    <td>
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
                    <td>{r.confirmed ? "Yes" : "—"}</td>
                    <td>
                      {r.attended ? (
                        <span className="abadge abadge-approved">
                          {r.method ?? "yes"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    {canEdit ? (
                      <td>
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
                    ) : null}
                </tr>
              ))}
              </tbody>
            </table>
          </div>
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
