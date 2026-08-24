import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "About",
  description: "About the CSE Club Council — the department's eleven clubs, one calendar.",
};

export default function AboutPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">About</div>
      <h1 style={{ margin: "12px 0 0" }}>About the council</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 620 }}>
        The CSE Club Council brings the department&rsquo;s eleven clubs under one
        roof — a shared calendar, one approvals process, and a single place to
        find every talk, contest, workshop and the occasional 24-hour build.
        Each club runs its own events and recruits its own members; the council
        keeps it all in one view.
      </p>
      <div className="stack" style={{ marginTop: 28, gap: 12 }}>
        <ButtonLink href="/clubs">The clubs</ButtonLink>
        <ButtonLink href="/events" variant="ghost">
          What&rsquo;s on
        </ButtonLink>
      </div>
    </section>
  );
}
