import { requireSession } from "@/lib/auth/guards";
import { canView } from "@/lib/auth/capabilities";
import { attendanceRegister } from "@/lib/admin/attendance-council";
import { toCsv } from "@/lib/csv";
import { istNumericDate } from "@/lib/datetime";
import { writeAudit } from "@/lib/admin/audit";

const CELL = { present: "Present", absent: "Absent" } as const;

/** Council attendance register CSV export — manage:council view grant (org-wide),
 *  audited. Opens in Excel (BOM). */
export async function GET() {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;
  if (!canView(guard.session, "manage:council")) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const register = await attendanceRegister();
  const headers = [
    "Name",
    "Role",
    "Roll No",
    ...register.sessions.map((s) => `${s.title} (${istNumericDate(s.date)})`),
    "Attended",
    "Sessions",
    "%",
  ];
  const rows = register.rows.map((r) => [
    r.name,
    r.designation,
    r.rollNo ?? "",
    ...r.cells.map((c) => CELL[c]),
    r.attended,
    r.eligible,
    `${r.pct}%`,
  ]);
  const csv = toCsv(headers, rows);

  await writeAudit({
    actorId: guard.session.id,
    action: "csv_export",
    entity: "council_attendance",
    after: { members: register.rows.length, sessions: register.sessions.length },
  });

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="council-attendance.csv"`,
      "cache-control": "no-store",
    },
  });
}
