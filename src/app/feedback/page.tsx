import type { Metadata } from "next";
import { getOpenPeriod, listClubsWithLeaders } from "@/lib/feedback/data";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackPromise } from "@/components/FeedbackPromise";

export const metadata: Metadata = {
  title: "Feedback",
  description: "Tell the CSE Clubs Council how your club is doing.",
};

// The window can be opened or closed at any moment, so this page must never be
// served from a cache.
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const period = await getOpenPeriod();

  if (!period) {
    return (
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="eyebrow">Feedback</div>
        <h1 style={{ margin: "12px 0 0" }}>Feedback isn&rsquo;t open right now</h1>
        <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
          We collect feedback every few weeks. Check back soon — it will appear
          here and in the site menu the moment it opens.
        </p>
      </section>
    );
  }

  const clubs = await listClubsWithLeaders();

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Feedback</div>
      <h1 style={{ margin: "12px 0 0" }}>Tell us how your club is doing</h1>
      <div className="fb-grid">
        <div className="fb-formcol">
          <FeedbackForm clubs={clubs} />
        </div>
        <FeedbackPromise />
      </div>
    </section>
  );
}
