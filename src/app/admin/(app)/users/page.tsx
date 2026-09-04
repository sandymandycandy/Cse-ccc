import { requireViewPage } from "@/lib/auth/guards";
import { listAdmins, listPendingInvites } from "@/lib/admin/invites";
import { getClubOptions } from "@/lib/admin/queries";
import { InviteForm } from "@/components/admin/InviteForm";
import { groupAdminsByClub } from "@/lib/admin/admin-grouping";
import { refusalMessage, type Refusal } from "@/lib/admin/admin-status";
import { setAdminActiveAction } from "./actions";

const roleLabel = (r: string) =>
  r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const session = await requireViewPage("manage:admins");
  const [admins, invites, clubs, { denied }] = await Promise.all([
    listAdmins(),
    listPendingInvites(),
    getClubOptions(),
    searchParams,
  ]);

  // Grouped by club so a club's heads read together — which is what makes a
  // duplicate or a missing vice head visible at all.
  const groups = groupAdminsByClub(admins);
  const refusal =
    denied === "self" || denied === "last-keyholder" ? (denied as Refusal) : null;

  return (
    <div className="admin-page">
      <div className="eyebrow">People</div>
      <h1 style={{ margin: "6px 0 0" }}>Admins</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Invite staff and see who has access. Invites set the password and 2FA — no
        password is ever emailed.
      </p>

      <InviteForm clubs={clubs} />

      {refusal ? (
        <p className="note" style={{ marginTop: 18 }}>
          {refusalMessage(refusal)}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.clubId ?? "council"} style={{ marginTop: 22 }}>
          <h2 className="admin-group-head">
            {group.label}
            <span>{group.admins.length}</span>
          </h2>
          <div className="tablewrap">
            <table className="admin">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>2FA</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {group.admins.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 500 }}>{a.name}</td>
                    <td>{a.email}</td>
                    <td>{roleLabel(a.role)}</td>
                    <td>{a.hasTotp ? "On" : "—"}</td>
                    <td>
                      <span className={`abadge abadge-${a.isActive ? "approved" : "rejected"}`}>
                        {a.isActive ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td>
                      {/* Your own row has no button: nobody may remove their own
                          access, so offering it then refusing would be a lie. */}
                      {a.id === session.id ? (
                        <span className="hint">You</span>
                      ) : (
                        <form action={setAdminActiveAction}>
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="active" value={a.isActive ? "false" : "true"} />
                          <button type="submit" className="btn btn-ghost btn-sm">
                            {a.isActive ? "Deactivate" : "Reactivate"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {invites.length > 0 ? (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ font: "400 20px var(--serif)" }}>Pending invites</h2>
          <div className="tablewrap" style={{ marginTop: 12 }}>
            <table className="admin">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Expires</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.email + i.expiresAt}>
                    <td>{i.email}</td>
                    <td>{roleLabel(i.role)}</td>
                    <td>{new Date(i.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
