import { getIcsEvents } from "@/lib/queries";
import { renderCalendar } from "@/lib/ics";
import { siteOrigin } from "@/lib/site-origin";

/**
 * One event as a calendar download — the "Add to calendar" button. Public: RLS
 * on `events` already limits this to approved events, so there is nothing to
 * authorise here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const events = await getIcsEvents({ eventId: id });
  if (events.length === 0) return new Response("Not found", { status: 404 });

  const host = new URL(siteOrigin() ?? "https://cse-ccc.vercel.app").host;
  const body = renderCalendar(events, { host, name: events[0].title });

  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="event.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
