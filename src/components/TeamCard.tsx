import Link from "next/link";
import { TeamAvatar } from "./TeamAvatar";
import type { RosterMember } from "@/lib/council/roster";

/**
 * One council member on `/team` — monogram, role, name, VTU number.
 *
 * Shows the member's photo when one has been uploaded in /admin/team, and an
 * initials monogram otherwise — same box either way, so the grid does not reflow
 * as photos are added one at a time.
 *
 * The WHOLE CARD is the link to `/team/<id>`, so the tap target on a phone is the
 * tile rather than a line of small text. That is also why the social links live on
 * the profile page and not here: an anchor wrapping the card cannot contain further
 * anchors, which is invalid HTML that browsers recover from unpredictably.
 */
export function TeamCard({ member }: { member: RosterMember }) {
  return (
    <Link
      href={`/team/${member.id}`}
      className="panel team-card"
      style={{
        padding: 20,
        borderRadius: "var(--r-md)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
      }}
      /* The card's own text would otherwise read out as one run-on string
         ("AI Forge - Head R. Jayasurya VTU 27657"). */
      aria-label={`${member.name} — ${member.designation}`}
    >
      <TeamAvatar name={member.name} photoUrl={member.photoUrl} size={64} />

      <div className="label" style={{ marginTop: 15 }}>
        {member.designation}
      </div>
      <div className="h4" style={{ marginTop: 6 }}>
        {member.name}
      </div>

      {member.rollNo ? (
        <div
          style={{
            // `auto` pins the footer to the bottom of the card, so a row of cards
            // has its rules on one line even when a long name wraps to two.
            // `.clubs` is a grid, whose items stretch to equal height already.
            marginTop: "auto",
            width: "100%",
            paddingTop: 13,
            borderTop: "1px solid var(--line-2)",
            font: "500 11px var(--mono)",
            letterSpacing: "0.1em",
            fontVariantNumeric: "tabular-nums",
            color: "var(--ink-3)",
          }}
        >
          VTU {member.rollNo}
        </div>
      ) : null}
    </Link>
  );
}
