import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canView } from "@/lib/auth/capabilities";
import { listTeamMembers, TeamColumnsMissingError } from "@/lib/admin/team";
import { TeamRow } from "@/components/admin/TeamRow";
import { saveTeamLinksAction, setTeamVisibilityAction } from "./actions";

export default async function AdminTeamPage() {
  const session = await requireViewPage("manage:council");
  if (!canView(session, "manage:council")) redirect("/admin");
  const canEdit = canManage(session, "manage:council");

  let members;
  try {
    members = await listTeamMembers();
  } catch (e) {
    // The one failure worth its own screen: without the columns there is nothing
    // to edit, and a generic error would send someone hunting the wrong problem.
    if (e instanceof TeamColumnsMissingError) {
      return (
        <div className="admin-page">
          <div className="eyebrow">Public site</div>
          <h1 style={{ margin: "6px 0 0" }}>Team page</h1>
          <div className="note" style={{ borderLeftColor: "var(--rust)", marginTop: 20 }}>
            <p style={{ margin: 0 }}>
              <strong>One migration needs applying before this page works.</strong>
            </p>
            <p style={{ margin: "8px 0 0" }}>
              Run this once via the Supabase MCP <code>apply_migration</code> tool or
              the dashboard SQL editor (never <code>db push</code> — see{" "}
              <code>docs/STATUS.md</code>):
            </p>
            <pre
              style={{
                marginTop: 10,
                padding: 12,
                overflowX: "auto",
                background: "var(--sand)",
                borderRadius: "var(--r-sm, 8px)",
                font: "500 12px var(--mono)",
              }}
            >
{`alter table public.council_members
  add column if not exists linkedin_url  text,
  add column if not exists instagram_url text,
  add column if not exists is_public     boolean not null default false;`}
            </pre>
            <p style={{ margin: "10px 0 0", color: "var(--ink-3)" }}>
              Until then the public <code>/team</code> page publishes nobody, by
              design — visibility cannot be read, so nothing is assumed public.
            </p>
          </div>
        </div>
      );
    }
    throw e;
  }

  const live = members.filter((m) => m.isPublic && m.isActive).length;

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <div>
          <div className="eyebrow">Public site</div>
          <h1 style={{ margin: "6px 0 0" }}>Team page</h1>
        </div>
        <Link href="/team" className="btn btn-sm" target="_blank" rel="noopener noreferrer">
          View /team ↗
        </Link>
      </div>

      <p className="body-text" style={{ marginTop: 12, maxWidth: 620 }}>
        Who appears on the public <code>/team</code> page, plus each person&rsquo;s
        photo, description and links. Nobody is published until you say so —{" "}
        <strong>{live} of {members.length}</strong> {live === 1 ? "person is" : "people are"}{" "}
        live right now.
      </p>
      <p className="body-text" style={{ marginTop: 8, maxWidth: 620, color: "var(--ink-3)" }}>
        Names, roles, roll numbers and phone numbers are edited in{" "}
        <Link href="/admin/council/members">Council → Members</Link> — this page only
        controls what the public sees.
      </p>

      {members.length === 0 ? (
        <p className="body-text" style={{ marginTop: 24 }}>
          No onboarded council members yet. Add them in{" "}
          <Link href="/admin/council/members">Council → Members</Link> first.
        </p>
      ) : (
        <div style={{ marginTop: 24, display: "grid", gap: 12 }}>
          {members.map((m) => (
            <TeamRow
              key={m.id}
              member={m}
              saveAction={saveTeamLinksAction}
              visibilityAction={setTeamVisibilityAction}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
