import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { listParticipants, type Participant } from "@/lib/registration-form/participants";
import { splitRegistrations } from "@/lib/registration/waitlist";

/**
 * Who is on the roster — every person, not every form answer.
 *
 * The registrations page is the attendance surface: it carries the marking
 * controls and one column per form answer, which a team block expands to
 * (max members × subfields), so it is wide and team members hide inside it.
 * This view answers the other question — "who is coming?" — as one numbered
 * list with the team members pulled out onto their own rows.
 */
export default async function ParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:registrations");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();

  // Same scoping as the registrations page: all/read see any club, own sees theirs.
  const grant = grantFor(session.role, "manage:registrations");
  const canViewThis =
    grant === "all" || grant === "read" || (grant === "own" && session.clubId === ev.clubId);
  if (!canViewThis) redirect("/admin/events");

  const [regs, { schema, selectionMode }] = await Promise.all([
    listRegistrations(id),
    getEventFormSchema(id),
  ]);
  const isShortlist = selectionMode === "shortlist";
  const { confirmed, waitlist } = splitRegistrations(regs);
  const rows = isShortlist ? regs : confirmed;

  const people = listParticipants(rows, schema);
  const waiting = listParticipants(waitlist, schema);
  const hasTeams = people.some((p) => p.role !== "solo");
  const teamCount = rows.length;

  return (
    <div className="admin-page">
      <Link href="/admin/events" className="label" style={{ color: "var(--forest)" }}>
        ← Events
      </Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Registered participants</div>
          <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            {people.length} {people.length === 1 ? "person" : "people"}
            {hasTeams
              ? ` · ${teamCount} ${teamCount === 1 ? "team" : "teams"}`
              : ` · ${teamCount} ${teamCount === 1 ? "registration" : "registrations"}`}
            {waiting.length ? ` · ${waiting.length} waitlisted` : ""}
          </p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Link href={`/admin/events/${id}/registrations`} className="btn btn-ghost btn-sm">
            Attendance
          </Link>
          <a
            href={`/api/admin/registrations/export?event=${id}`}
            className="btn btn-primary btn-sm"
          >
            Export CSV
          </a>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="cal-empty">No registrations yet.</div>
      ) : (
        <PeopleTable people={people} hasTeams={hasTeams} className="mt-4" />
      )}

      {waiting.length > 0 ? (
        <div style={{ marginTop: 28 }}>
          <div className="label" style={{ marginBottom: 8 }}>
            Waitlist ({waiting.length})
          </div>
          <PeopleTable people={waiting} hasTeams={hasTeams} />
        </div>
      ) : null}
    </div>
  );
}

function PeopleTable({
  people,
  hasTeams,
  className,
}: {
  people: Participant[];
  hasTeams: boolean;
  className?: string;
}) {
  return (
    <div className={`tablewrap cards${className ? ` ${className}` : ""}`}>
      <table className="admin">
        <thead>
          <tr>
            <th style={{ width: 52 }}>#</th>
            <th>Name</th>
            <th>Roll</th>
            <th>Dept · Yr</th>
            <th>Email</th>
            <th>Phone</th>
            {hasTeams ? <th>Team</th> : null}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={`${p.team}-${p.index}`}>
              <td data-label="#" style={{ color: "var(--ink-3)" }}>
                {p.index}
              </td>
              <td data-primary="" style={{ fontWeight: 500 }}>
                {p.name || "—"}
              </td>
              <td data-label="Roll">{p.roll || "—"}</td>
              <td data-label="Dept · Yr">
                {p.department || "—"}
                {p.year ? ` · ${p.year}` : ""}
              </td>
              <td data-label="Email">{p.email || "—"}</td>
              <td data-label="Phone">{p.phone || "—"}</td>
              {hasTeams ? (
                <td data-label="Team">
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <span className="label" style={{ color: "var(--ink-3)" }}>
                      T{p.team}
                    </span>
                    <span className={`badge ${p.role === "leader" ? "badge-open" : "badge-fast"}`}>
                      {p.role === "leader" ? "Leader" : "Member"}
                    </span>
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
