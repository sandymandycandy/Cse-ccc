export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", background: "var(--paper)" }}>
      <header style={{ borderBottom: "1px solid var(--rule)", padding: "14px 20px" }}>
        <div className="label" style={{ color: "var(--forest)" }}>CSE Club Council · Member</div>
      </header>
      <main style={{ maxWidth: 560, margin: "0 auto", padding: "24px 20px 64px" }}>{children}</main>
    </div>
  );
}
