import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRounds, getRoundRoster, roundIsPublished } from "@/lib/admin/results";
import { createRoundAction } from "./actions";
import { ResultsEditor } from "./ResultsEditor";

export default async function AdminResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const session = await requireViewPage("manage:results");
  const { id } = await params;
  const { round: roundParam } = await searchParams;

  const ev = await getEventForAttendance(id);
  if (!ev) notFound();

  // View: all/read see any club; club-scoped see only their own.
  const grant = grantFor(session.role, "manage:results");
  const canViewThis =
    grant === "all" || grant === "read" || (grant === "own" && session.clubId === ev.clubId);
  if (!canViewThis) redirect("/admin/events");
  const canEdit = canManage(session, "manage:results", ev.clubId);

  const rounds = await listRounds(id);
  const selectedId = roundParam ?? rounds[0]?.id ?? null;
  const selectedRound = rounds.find((r) => r.id === selectedId) ?? null;
  const roster = selectedId ? await getRoundRoster(selectedId) : null;
  const published = selectedId ? await roundIsPublished(selectedId) : false;

  return (
    <div className="admin-page">
      <Link href="/admin/events" className="label" style={{ color: "var(--forest)" }}>
        ← Events
      </Link>
      <div className="admin-page-head" style={{ marginTop: 14 }}>
        <div>
          <div className="eyebrow">Results</div>
          <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
          <p className="body-text" style={{ marginTop: 6 }}>
            {rounds.length} round{rounds.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div
        className="stack"
        style={{
          flexDirection: "row",
          gap: 8,
          marginTop: 18,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {rounds.map((r) => (
          <Link
            key={r.id}
            href={`/admin/events/${id}/results?round=${r.id}`}
            className={`btn btn-sm ${r.id === selectedId ? "btn-primary" : "btn-ghost"}`}
          >
            {r.name}
          </Link>
        ))}
        {canEdit ? (
          <form
            action={createRoundAction}
            className="stack"
            style={{ flexDirection: "row", gap: 6, alignItems: "center" }}
          >
            <input type="hidden" name="eventId" value={id} />
            <input
              name="name"
              placeholder="New round…"
              required
              maxLength={60}
              style={{
                font: "400 13px var(--sans)",
                padding: "5px 9px",
                border: "1px solid var(--line-4)",
                borderRadius: 7,
                background: "var(--paper)",
                color: "var(--ink)",
              }}
            />
            <button type="submit" className="btn btn-ghost btn-sm">
              Add round
            </button>
          </form>
        ) : null}
      </div>

      {selectedId && roster ? (
        <ResultsEditor
          eventId={id}
          roundId={selectedId}
          initialRows={roster.rows}
          seededFrom={roster.seededFrom}
          published={published}
          canEdit={canEdit}
          visibility={{
            show_score: selectedRound?.show_score ?? true,
            show_advanced: selectedRound?.show_advanced ?? true,
            show_remarks: selectedRound?.show_remarks ?? true,
          }}
          isLast={!!selectedRound && rounds[rounds.length - 1]?.id === selectedRound.id}
          defaultNextName={`Round ${rounds.length + 1}`}
        />
      ) : (
        <div className="cal-empty" style={{ marginTop: 18 }}>
          Create a round to enter results.
        </div>
      )}
    </div>
  );
}
