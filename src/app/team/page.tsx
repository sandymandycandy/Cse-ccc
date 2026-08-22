import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "The council",
  description:
    "The CSE Club Council — how the department's eleven clubs are organised and led.",
};

export default function TeamPage() {
  return (
    <section className="section" style={{ paddingTop: 56 }}>
      <div className="eyebrow">The council</div>
      <h1 style={{ margin: "12px 0 0" }}>The council</h1>
      <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
        The CSE Club Council brings the department&rsquo;s eleven clubs under one
        roof — a shared calendar, one approvals process, and a small elected
        team that keeps it all running. Each club has its own leads; the council
        coordinates across them.
      </p>
      <div className="stack" style={{ marginTop: 28, gap: 12 }}>
        <ButtonLink href="/clubs">Browse the clubs</ButtonLink>
      </div>
      <p className="body-text" style={{ marginTop: 32, maxWidth: 560, color: "var(--ink-3)" }}>
        The full roster of council members and club leads is being put together
        and will be published here soon.
      </p>
    </section>
  );
}
