import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { Panel } from "@/components/ui/Surface";
import { listResponses, clubNames } from "@/lib/admin/feedback";
import { duplicateVtus } from "@/lib/feedback/summary";
import { istNumericDate } from "@/lib/datetime";

const stars = (n: number | null) =>
  n == null ? "—" : "★".repeat(n) + "☆".repeat(5 - n);

export default async function FeedbackClubPage({
  params,
}: {
  params: Promise<{ periodId: string; clubId: string }>;
}) {
  await requireViewPage("view:feedback");
  const { periodId, clubId } = await params;

  const [all, names] = await Promise.all([listResponses(periodId), clubNames()]);
  const rows = all.filter((r) => r.clubId === clubId);
  // Duplicates are computed across the WHOLE period, not just this club: the
  // same student giving feedback on three clubs is normal; the same VTU twice
  // is what deserves a second look.
  const dupes = duplicateVtus(all);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">
            <Link href={`/admin/feedback/${periodId}`}>← All clubs</Link>
          </div>
          <h1 style={{ margin: "6px 0 0" }}>{names.get(clubId) ?? "Club"}</h1>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="cal-empty" style={{ marginTop: 18 }}>
          No responses for this club.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, marginTop: 18 }}>
          {rows.map((r) => (
            <Panel key={r.id} style={{ padding: 18 }}>
              <div className="label" style={{ color: "var(--ink-3)" }}>
                {r.studentName} · {r.vtu}
                {dupes.has(r.vtu.trim().toLowerCase()) ? (
                  <span style={{ color: "var(--rust)" }}> · repeat VTU this period</span>
                ) : null}
                {" · "}
                {istNumericDate(r.createdAt)}
              </div>

              {r.headName ? (
                <p className="body-text" style={{ marginTop: 10 }}>
                  <strong>Head — {r.headName}</strong> {stars(r.headRating)}
                  {r.headComment ? (
                    <>
                      <br />
                      {r.headComment}
                    </>
                  ) : null}
                </p>
              ) : null}

              {r.viceName ? (
                <p className="body-text" style={{ marginTop: 10 }}>
                  <strong>Vice Head — {r.viceName}</strong> {stars(r.viceRating)}
                  {r.viceComment ? (
                    <>
                      <br />
                      {r.viceComment}
                    </>
                  ) : null}
                </p>
              ) : null}

              <p className="body-text" style={{ marginTop: 10 }}>
                <strong>The club</strong> {stars(r.clubRating)}
              </p>
              <p className="body-text" style={{ marginTop: 10 }}>
                <strong>Activities</strong>
                <br />
                {r.activities}
              </p>
              {r.suggestions ? (
                <p className="body-text" style={{ marginTop: 10 }}>
                  <strong>Suggestions</strong>
                  <br />
                  {r.suggestions}
                </p>
              ) : null}
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
