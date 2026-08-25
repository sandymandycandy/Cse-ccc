import type { Metadata } from "next";
import QRCode from "qrcode";
import { validateMemberInvite } from "@/lib/member/invites";
import { newTotpSecret, totpKeyUri, encryptSecret } from "@/lib/auth/totp";
import { createAdminClient } from "@/lib/supabase/admin";
import { MemberSetupForm } from "@/components/member/MemberSetupForm";

export const metadata: Metadata = { title: "Set up your member login", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function MemberAcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invite = token ? await validateMemberInvite(token) : null;

  if (!invite) {
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <div className="label" style={{ color: "var(--rust)" }}>Link invalid</div>
          <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>This link won&rsquo;t work</h1>
          <p className="body-text">It may have expired or already been used. Ask your club head for a new one.</p>
        </div>
      </main>
    );
  }

  // Fetch the member's email to label the authenticator entry.
  const admin = createAdminClient();
  const { data: m } = await admin.from("club_members").select("email").eq("id", invite.memberId).maybeSingle();
  const label = m?.email ?? "member";

  const secret = newTotpSecret();
  const qr = await QRCode.toDataURL(totpKeyUri(secret, label), { margin: 1, width: 200 });

  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 440 }}>
        <MemberSetupForm token={token!} qr={qr} manualKey={secret} encSecret={encryptSecret(secret)} />
      </div>
    </main>
  );
}
