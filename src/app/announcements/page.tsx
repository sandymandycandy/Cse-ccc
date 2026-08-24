import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Announcements",
  description: "Notices and updates from the CSE Club Council.",
};

export default function AnnouncementsPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Notices</div>
      <h1 style={{ margin: "12px 0 0" }}>Announcements</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Council-wide notices, deadlines and updates will be posted here.
      </p>
      <p className="body-text" style={{ marginTop: 24, maxWidth: 560, color: "var(--ink-3)" }}>
        Nothing to announce just yet. For now, the calendar has everything
        that&rsquo;s scheduled.
      </p>
      <div className="stack" style={{ marginTop: 24, gap: 12 }}>
        <ButtonLink href="/calendar">Open the calendar</ButtonLink>
      </div>
    </section>
  );
}
