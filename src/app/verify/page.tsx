import { redirect } from "next/navigation";
import { normalizeSerial } from "@/lib/certificates/serial";
import { VerifyLookupForm } from "@/components/verify/VerifyLookupForm";

export const metadata = { title: "Verify a certificate", robots: { index: false } };

/**
 * The typed-in route to a certificate check. A serial that could be one goes
 * straight to `/verify/<serial>` (the same page the QR opens); anything else is
 * answered here, without a lookup.
 */
export default async function VerifyLookupPage({ searchParams }: { searchParams: Promise<{ serial?: string | string[] }> }) {
  const { serial } = await searchParams;
  const typed = typeof serial === "string" ? serial.trim().slice(0, 80) : "";
  const normalized = typed ? normalizeSerial(typed) : null;
  if (normalized) redirect(`/verify/${encodeURIComponent(normalized)}`);

  return (
    <div className="verify-page">
      <div className="eyebrow">CSE Council</div>
      <h1 className="verify-title">Verify a certificate</h1>
      <p className="lead" style={{ marginBottom: 24 }}>
        Scan the QR code on a certificate, or type the serial number printed on it.
      </p>
      <div className="panel" style={{ padding: "clamp(18px, 4vw, 24px)" }}>
        <VerifyLookupForm
          defaultValue={typed}
          notice={typed ? "That isn’t a certificate serial. Serials start with CSE- and a year." : null}
        />
      </div>
    </div>
  );
}
