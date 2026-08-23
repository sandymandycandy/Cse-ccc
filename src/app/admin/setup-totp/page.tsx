import type { Metadata } from "next";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { getAdminSession } from "@/lib/auth/guards";
import { roleRequiresTotp } from "@/lib/auth/capabilities";
import { createAdminClient } from "@/lib/supabase/admin";
import { newTotpSecret, totpKeyUri, encryptSecret } from "@/lib/auth/totp";
import { SetupTotpForm } from "@/components/admin/SetupTotpForm";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

export default async function SetupTotpPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  // Nothing to do here unless this role must enrol and hasn't yet.
  if (!roleRequiresTotp(session.role)) redirect("/admin");
  const admin = createAdminClient();
  const { data: totp } = await admin
    .from("admin_totp")
    .select("confirmed_at")
    .eq("admin_id", session.id)
    .maybeSingle();
  if (totp?.confirmed_at) redirect("/admin");

  // A fresh secret per load; the QR shows it and its encrypted copy travels in a
  // hidden field so the submit can verify the code the admin just enrolled.
  const secret = newTotpSecret();
  const qr = await QRCode.toDataURL(totpKeyUri(secret, session.email), { margin: 1, width: 200 });

  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 440 }}>
        <SetupTotpForm
          email={session.email}
          roleLabel={session.role.replace(/_/g, " ")}
          qr={qr}
          manualKey={secret}
          encSecret={encryptSecret(secret)}
        />
      </div>
    </main>
  );
}
