import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import {
  listPeriods,
  listResponses,
  clubNames,
  listActiveClubs,
  memberCount,
} from "@/lib/admin/feedback";
import { computeFeedbackAnalytics } from "@/lib/admin/feedback-analytics";
import { FeedbackAnalyticsView } from "@/components/admin/FeedbackAnalytics";
import { summarizeSocial } from "@/lib/admin/social-feedback";
import { istNumericDate } from "@/lib/datetime";

const THRESHOLDS = [2.5, 3, 3.5, 4];

function avg(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return Math.round((present.reduce((a, b) => a + b, 0) / present.length) * 10) / 10;
}

/**
 * Everything about one feedback period that is for READING. Same capability as
 * the inbox: view:feedback (president / VP / tech head only — design D2).
 */
export default async function FeedbackAnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodId: string }>;
  searchParams: Promise<{ below?: string }>;
}) {
  await requireViewPage("view:feedback");
  const { periodId } = await params;
  const { below } = await searchParams;
  const belowThreshold = THRESHOLDS.includes(Number(below)) ? Number(below) : 3;

  const [periods, responses, names, active, members] = await Promise.all([
    listPeriods(),
    listResponses(periodId),
    clubNames(),
    listActiveClubs(),
    memberCount(),
  ]);

  const index = periods.findIndex((p) => p.id === periodId);
  if (index === -1) notFound();
  const period = periods[index];
  const label = `${istNumericDate(period.openedAt)} – ${
    period.closedAt ? istNumericDate(period.closedAt) : "present"
  }`;

  // listPeriods is newest-first, so the NEXT entry is the previous window.
  const prior = periods[index + 1] ?? null;
  const priorResponses = prior ? await listResponses(prior.id) : [];
  const previous = prior
    ? {
        label: `${istNumericDate(prior.openedAt)} – ${
          prior.closedAt ? istNumericDate(prior.closedAt) : "present"
        }`,
        clubAvg: avg(priorResponses.map((r) => r.clubRating)),
        headAvg: avg(priorResponses.map((r) => r.headRating)),
        viceAvg: avg(priorResponses.map((r) => r.viceRating)),
        responses: priorResponses.length,
      }
    : null;

  const analytics = computeFeedbackAnalytics({
    responses: responses.map((r) => ({
      clubId: r.clubId,
      vtu: r.vtu,
      clubRating: r.clubRating,
      headRating: r.headRating,
      headName: r.headName,
      viceRating: r.viceRating,
      viceName: r.viceName,
      activities: r.activities,
      suggestions: r.suggestions ?? "",
      createdAt: r.createdAt,
    })),
    // Active clubs define who COULD have answered (so "silent" is meaningful),
    // plus any now-inactive club that did answer, so its name still resolves.
    clubs: [
      ...active,
      ...[...new Set(responses.map((r) => r.clubId))]
        .filter((id) => !active.some((c) => c.id === id))
        .map((id) => ({ id, name: names.get(id) ?? "—" })),
    ],
    previous,
    memberCount: members,
    belowThreshold,
  });

  // Council-wide: counted per student, so a member of three clubs who answered
  // three times still contributes one social opinion.
  const social = summarizeSocial(
    responses.map((r) => ({
      vtu: r.vtu,
      socialTeamRating: r.socialTeamRating,
      socialLeadRating: r.socialLeadRating,
      socialLeadName: r.socialLeadName,
      createdAt: r.createdAt,
    })),
  );

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">
            <Link href={`/admin/feedback/${periodId}`}>← {label}</Link>
          </div>
          <h1 style={{ margin: "6px 0 0" }}>Feedback analytics</h1>
        </div>
      </div>

      <FeedbackAnalyticsView
        analytics={analytics}
        social={social}
        periodId={periodId}
        periodLabel={label}
        thresholds={THRESHOLDS}
        belowThreshold={belowThreshold}
      />
    </div>
  );
}
