import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, canView } from "@/lib/auth/capabilities";
import { getClub, layers, objectPosition, portraitOf, type LayerId } from "@/data/ccc";
import { listTeamProfiles } from "@/lib/admin/team-profiles";
import { publicPhotoUrl } from "@/lib/team/profiles";
import { TeamProfileRow, type TeamProfileRowData } from "@/components/admin/TeamProfileRow";
import { saveTeamProfileAction, syncTeamProfilesAction } from "./profile-actions";

/**
 * /admin/team edits the public /team page — every detail and portrait of the 46
 * people in src/data/ccc.ts, stored in team_profiles.
 *
 * ⚠️ This page used to edit council_members. Since the new /team renders from
 * src/data/ccc.ts + team_profiles, those edits appeared nowhere. The attendance
 * roster is still edited at Council → Members, and is a separate list.
 */
export default async function AdminTeamPage() {
  const session = await requireViewPage("manage:council");
  if (!canView(session, "manage:council")) redirect("/admin");
  const canEdit = canManage(session, "manage:council");

  const profiles = await listTeamProfiles();
  const unsaved = profiles.filter((p) => !p.hasRow).length;

  const rows: (TeamProfileRowData & { layer: LayerId })[] = profiles.map((p) => {
    const m = p.member;
    const bundled = portraitOf(m);
    const hasUpload = p.photoPath != null;
    return {
      layer: m.layer,
      memberId: m.id,
      name: m.name,
      role: m.role,
      email: m.email,
      year: m.year ?? null,
      department: m.department ?? null,
      description: m.description ?? null,
      portfolio: m.portfolio ?? null,
      placement: m.club ? getClub(m.club).name : (layers.find((l) => l.id === m.layer)?.title ?? ""),
      hasRow: p.hasRow,
      photoUrl: hasUpload ? publicPhotoUrl(p.photoPath!) : (bundled?.src.src ?? null),
      hasUpload,
      bundledPosition: objectPosition(m),
      focalX: p.focalX,
      focalY: p.focalY,
    };
  });

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

      <p className="body-text" style={{ marginTop: 12, maxWidth: 640 }}>
        Everyone on the public <code>/team</code> page — {profiles.length} people. Edit a
        name, role, year, department, email, description or photo and save: it is live
        on <code>/team</code> straight away.
      </p>
      <p className="body-text" style={{ marginTop: 8, maxWidth: 640, color: "var(--ink-3)" }}>
        Who is on the page, and which section they appear in, is set in code — adding or
        removing a person needs a change to the site. This is a separate list from the
        attendance roster in <Link href="/admin/council/members">Council → Members</Link>.
      </p>

      {canEdit && unsaved > 0 ? (
        <form
          action={syncTeamProfilesAction}
          className="panel"
          style={{
            marginTop: 20,
            padding: "12px 16px",
            borderRadius: "var(--r-md)",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span className="body-text" style={{ margin: 0 }}>
            <strong>{unsaved}</strong> {unsaved === 1 ? "person is" : "people are"} still showing
            the form&rsquo;s answers and {unsaved === 1 ? "has" : "have"} no saved record yet.
          </span>
          <button type="submit" className="btn btn-sm">
            Save everyone&rsquo;s current details
          </button>
          <span className="hint" style={{ marginLeft: "auto" }}>
            Optional — saving any one person also does this for them. Never overwrites an edit.
          </span>
        </form>
      ) : null}

      {layers.map((layer) => {
        const inLayer = rows.filter((r) => r.layer === layer.id);
        if (inLayer.length === 0) return null;
        return (
          <section key={layer.id} style={{ marginTop: 28 }}>
            <div className="sec-head">
              <h2 style={{ margin: 0 }}>{layer.title}</h2>
              <span className="label">
                {inLayer.length} {inLayer.length === 1 ? "person" : "people"}
              </span>
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              {inLayer.map((row) => (
                <TeamProfileRow key={row.memberId} row={row} saveAction={saveTeamProfileAction} canEdit={canEdit} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
