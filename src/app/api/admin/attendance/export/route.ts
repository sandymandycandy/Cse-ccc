import { z } from "zod";
import { requireSession } from "@/lib/auth/guards";
import { canViewClub } from "@/lib/auth/capabilities";
import { attendanceRegister } from "@/lib/admin/attendance-club";
import { toCsv } from "@/lib/csv";
import { istNumericDate } from "@/lib/datetime";
import { writeAudit } from "@/lib/admin/audit";

const CELL = { present: "Present", absent: "Absent", na: "" } as const;

/** Club attendance register CSV export — anyone who can view the club's dashboard
 *  (manage:members grant), own-club scoped, audited. Opens in Excel (BOM). */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const clubId = new URL(request.url).searchParams.get("club") ?? "";
  if (!z.string().uuid().safeParse(clubId).success) {
    return Response.json({ error: "Missing or invalid club." }, { status: 400 });
  }
  if (!canViewClub(guard.session, "manage:members", clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const register = await attendanceRegister(clubId);
  const headers = [
    "Name",
    "Roll No",
    ...register.sessions.map((s) => `${s.title} (${istNumericDate(s.date)})`),
    "Attended",
    "Sessions",
    "%",
  ];
  const rows = register.rows.map((r) => [
    r.name,
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
    entity: "attendance",
    entityId: clubId,
    after: { members: register.rows.length, sessions: register.sessions.length },
  });

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendance-${clubId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
