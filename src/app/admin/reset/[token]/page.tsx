import type { Metadata } from "next";
import QRCode from "qrcode";
import { validateReset } from "@/lib/admin/resets";
import { newTotpSecret, totpKeyUri, encryptSecret } from "@/lib/auth/totp";
import { ResetPasswordForm } from "@/components/admin/ResetPasswordForm";

export const metadata: Metadata = { title: "Reset your admin password" };

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await validateReset(token);

  if (!reset) {
    return (
      <main className="admin-auth">
        <div className="admin-auth-card">
          <div className="label" style={{ color: "var(--rust)" }}>
            Link invalid
          </div>
          <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>
            This link won&rsquo;t work
          </h1>
          <p className="body-text">
            Reset links last one hour and work once. Ask for a fresh one.
          </p>
          <a href="/admin/forgot" className="btn btn-primary w-full" style={{ marginTop: 16 }}>
            Request a new link
          </a>
        </div>
      </main>
    );
  }

  // A fresh secret per page load; the QR shows it and the encrypted copy travels
  // in a hidden field so the submit can verify the code just enrolled.
  const secret = newTotpSecret();
  const qr = await QRCode.toDataURL(totpKeyUri(secret, reset.email), {
    margin: 1,
    width: 200,
  });

  return (
    <main className="admin-auth">
      <div className="admin-auth-card" style={{ maxWidth: 440 }}>
        <ResetPasswordForm
          token={token}
          email={reset.email}
          qr={qr}
          manualKey={secret}
          encSecret={encryptSecret(secret)}
        />
      </div>
    </main>
  );
}
