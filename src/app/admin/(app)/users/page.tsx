import { requireViewPage } from "@/lib/auth/guards";
import { listAdmins, listPendingInvites } from "@/lib/admin/invites";
import { getClubOptions } from "@/lib/admin/queries";
import { InviteForm } from "@/components/admin/InviteForm";

const roleLabel = (r: string) =>
  r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default async function UsersPage() {
  await requireViewPage("manage:admins"); // Tech Head only
  const [admins, invites, clubs] = await Promise.all([
    listAdmins(),
    listPendingInvites(),
    getClubOptions(),
  ]);

  return (
    <div className="admin-page">
      <div className="eyebrow">People</div>
      <h1 style={{ margin: "6px 0 0" }}>Admins</h1>
      <p className="lead" style={{ marginTop: 8 }}>
        Invite staff and see who has access. Invites set the password and 2FA — no
        password is ever emailed.
      </p>

      <InviteForm clubs={clubs} />

      <div className="tablewrap" style={{ marginTop: 22 }}>
        <table className="admin">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Club</th>
              <th>2FA</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {admins.map((a) => (
              <tr key={a.id}>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td>{a.email}</td>
                <td>{roleLabel(a.role)}</td>
                <td>{a.club ?? "—"}</td>
                <td>{a.hasTotp ? "On" : "—"}</td>
                <td>
                  <span className={`abadge abadge-${a.isActive ? "approved" : "rejected"}`}>
                    {a.isActive ? "Active" : "Disabled"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
