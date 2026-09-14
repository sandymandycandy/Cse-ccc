/** Type a serial to check it. A plain GET form, so it works without JavaScript. */
export function VerifyLookupForm({ defaultValue, notice }: { defaultValue?: string; notice?: string | null }) {
  return (
    <form method="get" action="/verify" style={{ display: "grid", gap: 12 }}>
      <div className="field" style={{ margin: 0 }}>
        <label htmlFor="serial">Serial number</label>
        <input
          id="serial"
          name="serial"
          defaultValue={defaultValue}
          maxLength={80}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="CSE-2026-XXXXX-XXXXX-…"
          style={{ fontFamily: "var(--mono)" }}
          aria-describedby={notice ? "serial-notice" : undefined}
        />
        {notice ? (
          <p id="serial-notice" className="hint" style={{ color: "var(--rust)" }}>
            {notice}
          </p>
        ) : null}
      </div>
      <button className="btn btn-primary" style={{ width: "100%" }}>
        Check certificate
      </button>
    </form>
  );
}
