import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Join a club",
  description:
    "How to join one of the department's eleven clubs — recruitment details and the club directory.",
};

export default function JoinPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">Get involved</div>
      <h1 style={{ margin: "12px 0 0" }}>Join a club</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        Every one of the department&rsquo;s eleven clubs runs its own events and
        recruits its own members — you can be part of up to three. Full
        recruitment forms open each term; in the meantime, start by finding the
        clubs whose work you want to be part of.
      </p>
      <div className="stack" style={{ marginTop: 28, gap: 12 }}>
        <ButtonLink href="/clubs">Explore the clubs</ButtonLink>
        <ButtonLink href="/events" variant="ghost">
          See what&rsquo;s on
        </ButtonLink>
      </div>
      <p className="body-text" style={{ marginTop: 32, maxWidth: 560, color: "var(--ink-3)" }}>
        Per-club application forms are on the way. Until then, come to an event —
        it&rsquo;s the fastest way to meet the people who run each club.
      </p>
    </section>
  );
}
