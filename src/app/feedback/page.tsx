import type { Metadata } from "next";
import { getOpenPeriod, listClubsWithLeaders, getSocialLead } from "@/lib/feedback/data";
import { FeedbackForm } from "@/components/FeedbackForm";
import { FeedbackPromise } from "@/components/FeedbackPromise";
import { ButtonLink } from "@/components/ui/Button";

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
          The council collects feedback every few weeks. When the next round
          opens, a Feedback link appears in the menu and on the home page.
        </p>
        {/* An empty state is an invitation, not a full stop. */}
        <div className="stack" style={{ marginTop: 28, gap: 12 }}>
          <ButtonLink href="/clubs">Browse the clubs</ButtonLink>
          <ButtonLink href="/contact" variant="ghost">
            Contact the council
          </ButtonLink>
        </div>
      </section>
    );
  }

  const [clubs, socialLead] = await Promise.all([listClubsWithLeaders(), getSocialLead()]);

  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Feedback</div>
      <h1 style={{ margin: "12px 0 0" }}>Tell us how your club is doing</h1>
      <p className="lead" style={{ marginTop: 14, maxWidth: 560 }}>
        Takes about two minutes. Only the President and Vice President read it —
        never your club&rsquo;s leads.
      </p>
      <div className="fb-grid">
        <div className="fb-formcol">
          <FeedbackForm clubs={clubs} socialLead={socialLead} />
        </div>
        <FeedbackPromise />
      </div>
    </section>
  );
}
