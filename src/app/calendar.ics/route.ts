import { getIcsEvents } from "@/lib/queries";
import { renderCalendar } from "@/lib/ics";
import { siteOrigin } from "@/lib/site-origin";

/**
 * Every council event, for calendar apps to subscribe to and re-poll. Public:
 * RLS decides what is visible.
 */
export async function GET() {
  const events = await getIcsEvents();
  const host = new URL(siteOrigin() ?? "https://cse-ccc.vercel.app").host;
  return new Response(renderCalendar(events, { host, name: "CSE Club Council" }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
