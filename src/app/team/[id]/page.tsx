import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCouncilMember } from "@/lib/council/public-roster";
import { TeamAvatar } from "@/components/TeamAvatar";
import { socialsOf } from "@/lib/council/roster";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const member = await getCouncilMember(id);
  if (!member) return { title: "Council member" };
  return {
    title: `${member.name} — ${member.designation}`,
    description: `${member.name}, ${member.designation} on the CSE Club Council.`,
  };
}

export default async function CouncilMemberPage({ params }: Params) {
  const { id } = await params;
  const member = await getCouncilMember(id);
  // Covers "no such member", "hidden", "inactive", "not onboarded" and a failed
  // read alike — see getCouncilMember. A hidden person must not be reachable by URL.
  if (!member) notFound();

  const socials = socialsOf(member);

  return (
    <section className="section" style={{ paddingTop: 56, maxWidth: 620 }}>
      <Link href="/team" className="label" style={{ color: "var(--forest)" }}>
        ← All of the council
      </Link>

      <div style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 24 }}>
        <TeamAvatar name={member.name} photoUrl={member.photoUrl} size={76} />
        <div>
          <div className="eyebrow">{member.designation}</div>
          <h1 style={{ margin: "8px 0 0" }}>{member.name}</h1>
        </div>
      </div>

      <dl
        style={{
          marginTop: 28,
          paddingTop: 20,
          borderTop: "1px solid var(--line-2)",
          display: "grid",
          gap: 14,
        }}
      >
        <div>
          <dt className="label">Role on the council</dt>
          <dd className="body-text" style={{ margin: "4px 0 0" }}>
            {member.designation}
          </dd>
        </div>
        {member.rollNo ? (
          <div>
            <dt className="label">VTU number</dt>
            <dd
              style={{
                margin: "4px 0 0",
                font: "500 13px var(--mono)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {member.rollNo}
            </dd>
          </div>
        ) : null}
        {socials.length > 0 ? (
          <div>
            <dt className="label">Find them on</dt>
            <dd style={{ margin: "6px 0 0", display: "flex", flexWrap: "wrap", gap: 14 }}>
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.url}
                  target="_blank"
                  /* nofollow: member-submitted external URLs, so the site should not
                     vouch for them to search engines. */
                  rel="noopener noreferrer nofollow"
                  className="team-card-link"
                  aria-label={`${s.label} — ${member.name} (opens in a new tab)`}
                >
                  {s.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>

      {/* The hand-written description from /admin/team replaces the generic
          sentence. `pre-line` keeps the author's line breaks; the value is stored
          and rendered as PLAIN TEXT, never Markdown or HTML, so there is no
          injection surface. The fallback keeps a member with no description from
          rendering a bare page. */}
      {member.bio ? (
        <p className="body-text" style={{ marginTop: 28, whiteSpace: "pre-line" }}>
          {member.bio}
        </p>
      ) : (
        <p className="body-text" style={{ marginTop: 28, color: "var(--ink-3)" }}>
          Part of the CSE Club Council, which coordinates the department&rsquo;s clubs —
          a shared calendar, one approvals process, and the events each club runs.
        </p>
      )}
      <div className="stack" style={{ marginTop: 20, gap: 12 }}>
        <Link href="/clubs" className="btn btn-sm">
          Browse the clubs
        </Link>
      </div>
    </section>
  );
}
