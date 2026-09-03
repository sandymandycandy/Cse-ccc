/**
 * The one-time "save these codes" screen. Shown after an invite is accepted and
 * after a password reset — in both cases these 10 codes are the ONLY copy the
 * admin will ever see, and any previous set has just been invalidated.
 */
export function RecoveryCodesPanel({
  codes,
  heading,
  intro,
}: {
  codes: string[];
  heading: string;
  intro: string;
}) {
  return (
    <div>
      <div className="label" style={{ color: "var(--forest)" }}>
        {heading}
      </div>
      <h1 style={{ font: "400 26px var(--serif)", margin: "8px 0 6px" }}>
        Save your recovery codes
      </h1>
      <p className="body-text" style={{ marginBottom: 14 }}>
        {intro}
      </p>
      <ul className="recovery-codes">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <a href="/admin/login" className="btn btn-primary w-full" style={{ marginTop: 16 }}>
        Go to sign in
      </a>
    </div>
  );
}
