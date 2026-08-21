import type { Metadata } from "next";
import QRCode from "qrcode";
import { validateInvite } from "@/lib/admin/invites";
import { newTotpSecret, totpKeyUri, encryptSecret } from "@/lib/auth/totp";
import { AcceptInviteForm } from "@/components/admin/AcceptInviteForm";

export const metadata: Metadata = { title: "Set up your admin account" };

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await validateInvite(token) : null;

  if (!invite) {
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <div className="label" style={{ color: "var(--rust)" }}>
            Invite invalid
          </div>
          <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>
            This link won&rsquo;t work
          </h1>
          <p className="body-text">
            It may have expired (invites last 48 hours) or already been used. Ask a
            Tech Head to send a fresh one.
          </p>
        </div>
      </main>
    );
  }

  // A fresh secret per page load; the QR shows it and the encrypted copy travels
  // in a hidden field so the submit can verify the code the admin just enrolled.
  const secret = newTotpSecret();
  const qr = await QRCode.toDataURL(totpKeyUri(secret, invite.email), {
    margin: 1,
    width: 200,
  });

  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 440 }}>
        <AcceptInviteForm
          token={token!}
          email={invite.email}
          roleLabel={invite.role.replace(/_/g, " ")}
          qr={qr}
          manualKey={secret}
          encSecret={encryptSecret(secret)}
        />
      </div>
    </main>
  );
}
