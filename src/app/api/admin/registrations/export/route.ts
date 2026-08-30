import { requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { answerColumns } from "@/lib/registration-form/columns";
import { toCsv } from "@/lib/csv";
import { writeAudit } from "@/lib/admin/audit";

/** Registrations CSV export — manage:registrations, own-club scoped, audited (§14). */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const eventId = new URL(request.url).searchParams.get("event") ?? "";
  const ev = await getEventForAttendance(eventId);
  if (!ev || !canManage(guard.session, "manage:registrations", ev.clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const [regs, { schema }] = await Promise.all([
    listRegistrations(eventId),
    getEventFormSchema(eventId),
  ]);
  const columns = answerColumns(schema);
  const headers = [
    "Name",
    "Roll No",
    "Department",
    "Year",
    "Email",
    "Phone",
    "Confirmed",
    "Attended",
    "Method",
    "Shortlisted",
    ...columns.map((c) => c.label),
  ];
  const rows = regs.map((r) => [
    r.name,
    r.roll,
    r.department,
    r.year,
    r.email,
    r.phone,
    r.confirmed ? "yes" : "no",
    r.attended ? "yes" : "no",
    r.method ?? "",
    r.shortlistedAt ? "yes" : "no",
    ...columns.map((c) => c.get(r.customAnswers)),
  ]);
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
