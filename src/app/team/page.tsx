import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { TeamCard } from "@/components/TeamCard";
import { getCouncilRoster } from "@/lib/council/public-roster";
import { splitRoster } from "@/lib/council/roster";

export const metadata: Metadata = {
  title: "The council",
  description:
    "The CSE Club Council — how the department's eleven clubs are organised and led.",
};

export default async function TeamPage() {
  // null = the read failed; [] = nobody is listed yet. Different messages.
  const roster = await getCouncilRoster();
  const { leadership, heads } = splitRoster(roster ?? []);

  return (
    <>
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
      </section>

      {/* Hidden until the six officer rows exist, so the page never shows an
          empty heading. Add them in /admin/council/members with a designation
          matching LEADERSHIP_TITLES exactly. */}
      {leadership.length > 0 ? (
        <section className="section">
          <div className="sec-head">
            <h2>Council leadership</h2>
          </div>
          <div className="clubs">
            {leadership.map((member) => (
              <TeamCard key={member.id} member={member} />
            ))}
          </div>
        </section>
      ) : null}

      {heads.length > 0 ? (
        <section className="section">
          <div className="sec-head">
            <h2>Heads &amp; vice heads</h2>
            <span className="label">
              {heads.length} {heads.length === 1 ? "member" : "members"}
            </span>
          </div>
          <div className="clubs">
            {heads.map((member) => (
              <TeamCard key={member.id} member={member} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Two distinct states, deliberately not merged. A failed read must not
          claim the roster "is being put together" — that reads as the truth and
          hides an outage. Keyed off the WHOLE roster, not either tier, so officers
          listed with no club heads yet does not contradict the cards above. */}
      {roster === null ? (
        <section className="section">
          <p className="body-text" style={{ maxWidth: 560, color: "var(--ink-3)" }}>
            The roster couldn&rsquo;t be loaded just now. Please refresh in a moment
            &mdash; the council list is still there, this is a temporary hiccup.
          </p>
        </section>
      ) : roster.length === 0 ? (
        <section className="section">
          <p className="body-text" style={{ maxWidth: 560, color: "var(--ink-3)" }}>
            The full roster of council members and club leads is being put together
            and will be published here soon.
          </p>
        </section>
      ) : null}
    </>
  );
}
