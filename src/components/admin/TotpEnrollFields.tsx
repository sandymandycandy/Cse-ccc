/**
 * The authenticator-enrolment block, shared by the invite flow and the password
 * reset. Purely presentational — the caller owns the form, the hidden encrypted
 * secret, and the submit.
 */
export function TotpEnrollFields({ qr, manualKey }: { qr: string; manualKey: string }) {
  return (
    <>
      <div className="enroll">
        <div className="label" style={{ marginBottom: 8 }}>
          Two-factor authentication
        </div>
        <p className="body-text" style={{ fontSize: 12.5, marginBottom: 10 }}>
          Scan this with an authenticator app (Google Authenticator, Authy, 1Password…).
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="Authenticator QR code" width={180} height={180} className="enroll-qr" />
        <div className="hint" style={{ marginTop: 8 }}>
          Can&rsquo;t scan? Enter this key: <code>{manualKey}</code>
        </div>
      </div>

      <div className="field" style={{ marginTop: 14 }}>
        <label htmlFor="totp">6-digit code from the app</label>
        <input
          id="totp"
          name="totp"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          placeholder="6-digit code"
        />
      </div>
    </>
  );
}
