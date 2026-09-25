import { requireSession } from "@/lib/auth/guards";
import { canManageEvent } from "@/lib/admin/event-hosts";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { answerColumns } from "@/lib/registration-form/columns";
import { toCsv } from "@/lib/csv";
import { writeAudit } from "@/lib/admin/audit";
import { teamOf } from "@/lib/certificates/fields";
import { absentNames, attendanceCell } from "@/lib/admin/team-attendance";
import { STATE_LABEL, shortlistState } from "@/lib/registration/shortlist";

/** Registrations CSV export — manage:registrations, own-club scoped, audited (§14). */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const eventId = new URL(request.url).searchParams.get("event") ?? "";
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManageEvent(guard.session, "manage:registrations", ev.hosts)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const [regs, { schema, selectionMode }] = await Promise.all([
    listRegistrations(eventId),
    getEventFormSchema(eventId),
  ]);
  const columns = answerColumns(schema);
  const headers = [
    "Name",
    "Team",
    "Roll No",
    "Department",
    "Year",
    "Email",
    "Phone",
    "Confirmed",
    "Attended",
    "Absent members",
    "Method",
    "Category",
    ...columns.map((c) => c.label),
  ];
  const rows = regs.map((r) => {
    // Per-person attendance: yes / partial / no, and who on the team was absent.
    const team = teamOf(r, schema);
    return [
      r.name,
      r.teamName ?? "",
      r.roll,
      r.department,
      r.year,
      r.email,
      r.phone,
      r.confirmed ? "yes" : "no",
      attendanceCell(team.length || 1, r.attended, r.absentMembers),
      absentNames(team, r.attended, r.absentMembers),
      r.method ?? "",
      selectionMode === "shortlist" ? STATE_LABEL[shortlistState(r)] : "",
      ...columns.map((c) => c.get(r.customAnswers)),
    ];
  });
  const csv = toCsv(headers, rows);

  await writeAudit({
    actorId: guard.session.id,
    action: "csv_export",
    entity: "registrations",
    entityId: eventId,
    after: { count: regs.length },
  });

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="registrations-${eventId}.csv"`,
      "cache-control": "no-store",
    },
  });
}
