import type { ReactNode } from "react";
import { headers } from "next/headers";
import { checkVerifyLimits } from "@/lib/rate-limit";
import { normalizeSerial } from "@/lib/certificates/serial";
import { atLeast, toVerifyResult, VERIFY_MIN_MS, type VerifyResult } from "@/lib/certificates/verification";
import { lookupCertificate } from "@/lib/certificates/verify-lookup";
import { VerifyLookupForm } from "@/components/verify/VerifyLookupForm";

export const metadata = { title: "Certificate check", robots: { index: false } };

type Outcome = { kind: "result"; result: VerifyResult } | { kind: "limited" } | { kind: "error" };

function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The page a certificate's QR code opens (spec §7). Public, never indexed,
 * 20 checks a minute per IP, and every answer — valid, replaced, revoked or
 * unknown — takes the same minimum time, so response time reveals nothing.
 */
export default async function VerifyCertificatePage({ params }: { params: Promise<{ serial: string }> }) {
  const { serial: raw } = await params;
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const outcome = await atLeast<Outcome>(VERIFY_MIN_MS, async () => {
    if (!checkVerifyLimits(ip).ok) return { kind: "limited" };
    const serial = normalizeSerial(safeDecode(raw));
    if (!serial) return { kind: "result", result: { state: "unknown" } };
    try {
      return { kind: "result", result: toVerifyResult(await lookupCertificate(serial)) };
    } catch (err) {
      console.error("verify lookup failed:", err instanceof Error ? err.message : err);
      return { kind: "error" };
    }
  });

  return (
    <div className="verify-page">
      <div className="eyebrow">CSE Council · Certificate check</div>
      {outcome.kind === "limited" ? (
        <Verdict tone="muted" mark="…" title="Too many checks">
          Please wait a minute, then try again.
        </Verdict>
      ) : outcome.kind === "error" ? (
        <Verdict tone="muted" mark="!" title="We couldn’t check that just now">
          Please try again in a moment.
        </Verdict>
      ) : (
        <ResultView result={outcome.result} />
      )}
      <details className="panel verify-again">
        <summary className="label">Check another certificate</summary>
        <div style={{ marginTop: 14 }}>
          <VerifyLookupForm />
        </div>
      </details>
    </div>
  );
}

function ResultView({ result }: { result: VerifyResult }) {
  switch (result.state) {
    case "valid":
      return (
        <>
          <Verdict tone="valid" mark="✓" title="Valid certificate">
            Issued by the CSE Club Council and still valid.
          </Verdict>
          <div className="card verify-card">
            {result.name ? (
              <>
                <div className="label">Awarded to</div>
                <h2 className="verify-name">{result.name}</h2>
              </>
            ) : null}
            <dl className="verify-facts">
              <Fact label="Event">{result.eventTitle}</Fact>
              {result.clubName ? <Fact label="Club">{result.clubName}</Fact> : null}
              <Fact label="Event date">{result.eventDate}</Fact>
              <Fact label="Certificate">{result.groupLabel}</Fact>
              <Fact label="Issued">{result.issuedDate}</Fact>
              <Fact label="Serial" mono>
                {result.serial}
              </Fact>
            </dl>
          </div>
        </>
      );
    case "superseded":
      return (
        <>
          <Verdict tone="muted" mark="↻" title="Replaced by a newer certificate">
            This certificate has been replaced, and its holder was sent a newer one. Ask them for that copy.
          </Verdict>
          <div className="card verify-card">
            <dl className="verify-facts">
              <Fact label="Event">{result.eventTitle}</Fact>
              <Fact label="Issued">{result.issuedDate}</Fact>
              <Fact label="Serial" mono>
                {result.serial}
              </Fact>
            </dl>
          </div>
        </>
      );
    case "revoked":
      return (
        <>
          <Verdict tone="revoked" mark="✕" title="Revoked">
            This certificate was withdrawn by the CSE Club Council and is no longer valid.
          </Verdict>
          <div className="card verify-card">
            <dl className="verify-facts">
              <Fact label="Event">{result.eventTitle}</Fact>
              <Fact label="Revoked">{result.revokedDate}</Fact>
              <Fact label="Serial" mono>
                {result.serial}
              </Fact>
            </dl>
          </div>
        </>
      );
    case "unknown":
      return (
        <Verdict tone="revoked" mark="?" title="Not a valid certificate">
          No certificate has this serial. Check it was typed exactly as printed, or scan the QR code again.
        </Verdict>
      );
  }
}

function Verdict({
  tone,
  mark,
  title,
  children,
}: {
  tone: "valid" | "revoked" | "muted";
  mark: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="verify-verdict" data-tone={tone}>
      <span className="verify-mark" aria-hidden>
        {mark}
      </span>
      <div>
        <h1 className="verify-title">{title}</h1>
        <p className="lead">{children}</p>
      </div>
    </div>
  );
}

function Fact({ label, mono, children }: { label: string; mono?: boolean; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? "verify-serial" : undefined}>{children}</dd>
    </>
  );
}
