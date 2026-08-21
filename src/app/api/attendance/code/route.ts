import QRCode from "qrcode";
import { requireSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import {
  getSessionById,
  getEventForAttendance,
  sessionScanCount,
} from "@/lib/admin/attendance";
import { currentCode, isSessionOpen, secondsLeft } from "@/lib/attendance";

/**
 * The organiser's live QR feed. Returns the current rotating code as a QR (a URL
 * students open), the countdown, and the live scan count — for an admin who can
 * manage the event's registrations. The display page polls this every few
 * seconds so the QR rotates faster than its ~10s validity.
 */
export async function GET(request: Request) {
  const guard = await requireSession();
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session") ?? "";
  const s = await getSessionById(sessionId);
  if (!s) return Response.json({ error: "No such session." }, { status: 404 });

  const ev = await getEventForAttendance(s.eventId);
  if (!ev || !canManage(guard.session, "manage:registrations", ev.clubId)) {
    return Response.json({ error: "Not permitted." }, { status: 403 });
  }

  const count = await sessionScanCount(sessionId);
  if (!isSessionOpen(s)) return Response.json({ open: false, count });

  const code = currentCode(sessionId);
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
  const qr = await QRCode.toDataURL(`${origin}/a/${sessionId}?c=${code}`, {
    margin: 1,
    width: 320,
  });
  return Response.json({ open: true, qr, secondsLeft: secondsLeft(s), count });
}
