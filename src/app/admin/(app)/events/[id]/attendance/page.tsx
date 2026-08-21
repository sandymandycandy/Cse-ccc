import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import {
  getEventForAttendance,
  getLatestSession,
  attendedCount,
} from "@/lib/admin/attendance";
import { isSessionOpen } from "@/lib/attendance";
import { LiveAttendance } from "@/components/admin/LiveAttendance";
import { openSessionAction, closeSessionAction } from "./actions";

export default async function AttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireViewPage("manage:registrations");
  const { id } = await params;
  const ev = await getEventForAttendance(id);
  if (!ev) notFound();
  // Club-scoped roles can only run their own club's check-in.
  if (!canManage(session, "manage:registrations", ev.clubId)) redirect("/admin/events");

  const latest = await getLatestSession(id);
  const open = latest ? isSessionOpen(latest) : false;
  const attended = await attendedCount(id);

  return (
    <div className="admin-page" style={{ maxWidth: 560 }}>
      <Link href="/admin/events" className="label" style={{ color: "var(--forest)" }}>
        ← Events
      </Link>
      <div className="eyebrow" style={{ marginTop: 14 }}>
        Attendance
      </div>
      <h1 style={{ margin: "6px 0 0" }}>{ev.title}</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        {attended} marked present so far.
      </p>

      {open && latest ? (
        <LiveAttendance sessionId={latest.id} closeAction={closeSessionAction} />
      ) : (
        <form action={openSessionAction} className="card" style={{ marginTop: 18 }}>
          <input type="hidden" name="eventId" value={id} />
          <p className="body-text" style={{ marginBottom: 12 }}>
            Open a check-in window and show the rotating QR on screen. Present
            students scan it from their own phone. Late arrivals: just open it again.
          </p>
          <div className="field">
            <label htmlFor="windowSeconds">Window (seconds)</label>
            <input
              id="windowSeconds"
              name="windowSeconds"
              type="number"
              defaultValue={60}
              min={20}
              max={600}
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Open check-in
          </button>
        </form>
      )}
    </div>
  );
}
