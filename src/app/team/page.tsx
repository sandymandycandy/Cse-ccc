import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { TeamCard } from "@/components/TeamCard";
import { getCouncilRoster } from "@/lib/council/public-roster";
import { groupByClub, splitRoster } from "@/lib/council/roster";

export const metadata: Metadata = {
  title: "The council",
  description:
    "The CSE Club Council — how the department's eleven clubs are organised and led.",
};

export default async function TeamPage() {
  // null = the read failed; [] = nobody is listed yet. Different messages.
  const roster = await getCouncilRoster();
  const { leadership, heads } = splitRoster(roster ?? []);
  // Club heads are grouped by club_id, never by their designation text — the
  // same club is written three different ways across the roster.
  const clubs = groupByClub(heads);
  const total = leadership.length + heads.length;

  return (
    <>
      <section className="section" style={{ paddingTop: 56 }}>
        <div className="eyebrow">The council</div>
        <h1 style={{ margin: "12px 0 0" }}>The council</h1>
        <p className="lead" style={{ marginTop: 16, maxWidth: 560 }}>
          The CSE Club Council brings the department&rsquo;s clubs under one roof —
          a shared calendar, one approvals process, and a small elected team that
          keeps it all running. Each club has its own leads; the council
          coordinates across them.
        </p>
        <div className="stack" style={{ marginTop: 28, gap: 12 }}>
          <ButtonLink href="/clubs">Browse the clubs</ButtonLink>
        </div>
      </section>

      {/* Hidden until the officer rows exist, so the page never shows an empty
          heading. A member joins this tier by holding a designation that matches
          LEADERSHIP_TITLES exactly — set it in /admin/team. */}
      {leadership.length > 0 ? (
        <section className="section">
          <div className="sec-head">
            <h2>Council leadership</h2>
            {total > 0 ? (
              <span className="label">
                {total} {total === 1 ? "member" : "members"} in all
              </span>
            ) : null}
          </div>
          <div className="clubs">
            {leadership.map((member) => (
              <TeamCard key={member.id} member={member} />
            ))}
          </div>
        </section>
      ) : null}

      {/* One section per club, A→Z, heads before vice heads. The trailing group
          (clubId null) holds anyone not attached to a club — a permanent state,
          since /council/join/[token] lets a member register before anyone
          assigns them one. */}
      {clubs.map((group) => (
        <section className="section" key={group.clubId ?? "unassigned"}>
          <div className="sec-head">
            <h2>{group.clubName ?? "Also on the council"}</h2>
            {group.clubSlug ? (
              <Link
                href={`/clubs/${group.clubSlug}`}
                className="label"
                style={{ color: "var(--forest)" }}
              >
                About the club →
              </Link>
            ) : null}
          </div>
          <div className="clubs">
            {group.members.map((member) => (
              <TeamCard key={member.id} member={member} />
            ))}
          </div>
        </section>
      ))}

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
