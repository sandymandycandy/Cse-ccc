import { requireSession } from "@/lib/auth/guards";
import { canView } from "@/lib/auth/capabilities";
import { listResponses, clubNames } from "@/lib/admin/feedback";
import { toCsv } from "@/lib/csv";
import { istNumericDate } from "@/lib/datetime";
import { writeAudit } from "@/lib/admin/audit";

/**
 * Feedback CSV export for one period — view:feedback only, audited.
 *
 * ⚠️ This file is the RAW record: VTU, name and every free-text answer about
 * named people. It is exactly as sensitive as the table, which is why it sits
 * behind the same capability and is never linked from a public page.
 */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  if (!canView(guard.session, "view:feedback")) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const periodId = new URL(request.url).searchParams.get("period") ?? "";
  if (!periodId) {
    return Response.json({ error: "Missing period." }, { status: 400 });
  }

  const [rows, names] = await Promise.all([listResponses(periodId), clubNames()]);

  const headers = [
    "Submitted",
    "VTU",
    "Name",
    "Club",
    "Head",
    "Head rating",
    "Head feedback",
    "Vice head",
    "Vice rating",
    "Vice feedback",
    "Club rating",
    "Activities",
    "Suggestions",
  ];
  const body = rows.map((r) => [
    istNumericDate(r.createdAt),
    r.vtu,
    r.studentName,
    names.get(r.clubId) ?? "",
    r.headName ?? "",
    r.headRating ?? "",
    r.headComment ?? "",
    r.viceName ?? "",
    r.viceRating ?? "",
    r.viceComment ?? "",
    r.clubRating,
    r.activities,
    r.suggestions ?? "",
  ]);

  await writeAudit({
    actorId: guard.session.id,
    action: "csv_export",
    entity: "feedback_period",
    entityId: periodId,
    after: { responses: rows.length },
  });

  return new Response(toCsv(headers, body), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="feedback-${periodId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
