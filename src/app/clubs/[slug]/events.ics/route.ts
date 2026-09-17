import { getIcsEvents } from "@/lib/queries";
import { renderCalendar } from "@/lib/ics";
import { siteOrigin } from "@/lib/site-origin";

/** One club's events, subscribable. Public: RLS decides what is visible. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const events = await getIcsEvents({ clubSlug: slug });
  const host = new URL(siteOrigin() ?? "https://cse-ccc.vercel.app").host;
  return new Response(renderCalendar(events, { host, name: `CSE Club Council — ${slug}` }), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
