import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations } from "@/lib/admin/registrations";
import { toggleAttendanceAction } from "./actions";

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

  const regs = await listRegistrations(id);
  const confirmed = regs.filter((r) => r.confirmed).length;
  const attended = regs.filter((r) => r.attended).length;

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
            {regs.length} registered · {confirmed} confirmed · {attended} attended
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
        <div className="tablewrap" style={{ marginTop: 18 }}>
          <table className="admin">
            <thead>
              <tr>
                <th>Name</th>
                <th>Roll</th>
                <th>Dept · Yr</th>
                <th>Confirmed</th>
                <th>Attended</th>
                {canEdit ? <th>Check-in</th> : null}
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 500 }}>{r.name}</td>
                  <td>{r.roll}</td>
                  <td>
                    {r.department ?? "—"}
                    {r.year ? ` · ${r.year}` : ""}
                  </td>
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
                          {r.attended ? "Undo" : "Mark present"}
                        </button>
                      </form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
