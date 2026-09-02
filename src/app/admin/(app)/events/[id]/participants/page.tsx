import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { grantFor } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { listTeams, type Participant, type TeamGroup } from "@/lib/registration-form/participants";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { isSafeHttpUrl } from "@/lib/url";

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

      {teams.length === 0 ? (
        <div className="cal-empty">No registrations yet.</div>
      ) : hasTeams ? (
        <TeamGrid teams={teams} />
      ) : (
        <SoloTable people={teams.flatMap((t) => t.people)} />
      )}

      {waitingTeams.length > 0 ? (
        <div style={{ marginTop: 30 }}>
          <div className="label" style={{ marginBottom: 4 }}>
            Waitlist ({waitingCount})
          </div>
          {hasTeams ? (
            <TeamGrid teams={waitingTeams} />
          ) : (
            <SoloTable people={waitingTeams.flatMap((t) => t.people)} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function TeamGrid({ teams }: { teams: TeamGroup[] }) {
  return (
    <div className="team-grid">
      {teams.map((team) => (
        <article className="team-card" key={team.index}>
          <div className="team-card-head">
            <span className="n">Team {team.index}</span>
            <span className="c">
              {team.people.length} {team.people.length === 1 ? "person" : "people"}
            </span>
          </div>

          {team.people.map((p) => (
            <div
              key={`${team.index}-${p.index}`}
              className={`team-person${p.role === "leader" ? " is-leader" : ""}`}
            >
              <div className="team-person-top">
                <span className="team-person-name">{p.name || "—"}</span>
                <span className={`badge ${p.role === "leader" ? "badge-open" : "badge-fast"}`}>
                  {p.role === "leader" ? "Leader" : p.role === "member" ? "Member" : "Registered"}
                </span>
              </div>
              <div className="team-person-meta">
                {[p.roll, p.department, p.year].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="team-person-meta">
                {[p.email, p.phone].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          ))}

          {team.answers.length > 0 ? (
            <div className="team-answers">
              {team.answers.map((a) => (
                <div className="team-answer" key={a.key}>
                  <span className="k">{a.label}</span>
                  <span className="v">
                    {a.value && isSafeHttpUrl(a.value) ? (
                      <a
                        href={a.value}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--forest)" }}
                      >
                        {a.value} ↗
                      </a>
                    ) : (
                      a.value || "—"
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/** Events with no team block: a plain numbered list of the people who signed up. */
function SoloTable({ people }: { people: Participant[] }) {
  return (
    <div className="tablewrap cards" style={{ marginTop: 18 }}>
      <table className="admin">
        <thead>
          <tr>
            <th style={{ width: 52 }}>#</th>
            <th>Name</th>
            <th>Roll</th>
            <th>Dept · Yr</th>
            <th>Email</th>
            <th>Phone</th>
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.index}>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
