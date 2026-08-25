import Link from "next/link";
import { requireViewPage } from "@/lib/auth/guards";
import { canManage, grantFor } from "@/lib/auth/capabilities";
import { getOpenSession } from "@/lib/admin/attendance-club";
import { QrScanner } from "@/components/admin/QrScanner";

// QrScanner is a client component; it's safe to import directly because it only
// touches the camera / html5-qrcode inside useEffect (never during SSR). Do NOT
// use next/dynamic({ ssr: false }) here — that's disallowed in a Server Component.

export default async function ScanPage({ searchParams }: { searchParams: Promise<{ club?: string }> }) {
  const session = await requireViewPage("manage:members");
  const { club } = await searchParams;
  const grant = grantFor(session.role, "manage:members");
  const clubId = grant === "own" ? session.clubId : (club ?? null);

  if (!clubId || !canManage(session, "manage:members", clubId)) {
    return <div className="admin-page"><h1>Scan</h1><p className="lead">Pick your club from the <Link href="/admin/attendance">dashboard</Link>.</p></div>;
  }
  const open = await getOpenSession(clubId);

  return (
    <div className="admin-page">
      <div className="eyebrow">Attendance</div>
      <h1 style={{ margin: "6px 0 12px" }}>Scan</h1>
      {open ? (
        <>
          <p className="lead" style={{ marginBottom: 16 }}>Session: <strong>{open.title}</strong></p>
          <QrScanner sessionId={open.id} />
          <p className="body-text" style={{ marginTop: 16 }}>
            <Link href={`/admin/attendance/sessions/${open.id}`} style={{ color: "var(--forest)" }}>Live dashboard →</Link>
          </p>
        </>
      ) : (
        <div className="cal-empty">No open session. Open one from the <Link href="/admin/attendance" style={{ color: "var(--forest)" }}>dashboard</Link>.</div>
      )}
    </div>
  );
}
