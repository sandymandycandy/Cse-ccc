import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { listTeams } from "@/lib/registration-form/participants";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { ParticipantsRoster } from "@/components/admin/ParticipantsRoster";

/**
 * Who is on the roster — every person, not every form answer.
 *
 * The registrations page is the attendance surface: it carries the marking
 * controls and one column per form answer, which a team block expands to
 * (max members × subfields), so it is wide and team members hide inside it.
 * This view answers the other question — "who is coming?" — with each entry
 * shown as the team it actually is: its people, and the answers they submitted
 * together. Events whose form has no team block fall back to a flat list.
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

  const hasTeams = schema.some((f) => f.kind === "team");
  const teams = listTeams(rows, schema);
  const waitingTeams = listTeams(waitlist, schema);
  const headcount = teams.reduce((n, t) => n + t.people.length, 0);
  const waitingCount = waitingTeams.reduce((n, t) => n + t.people.length, 0);

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
            {hasTeams
              ? `${teams.length} ${teams.length === 1 ? "team" : "teams"} · ${headcount} ${
                  headcount === 1 ? "person" : "people"
                }`
              : `${headcount} registered`}
            {waitingCount ? ` · ${waitingCount} waitlisted` : ""}
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

      <ParticipantsRoster teams={teams} waitingTeams={waitingTeams} hasTeams={hasTeams} />
    </div>
  );
}
