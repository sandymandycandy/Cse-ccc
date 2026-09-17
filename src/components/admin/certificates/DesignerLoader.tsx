"use client";

import dynamic from "next/dynamic";
import type { CertificateDesignerProps } from "./CertificateDesigner";
import type { CertificatePreviewProps } from "./CertificatePreview";

// The editor (TipTap, font metrics) is browser-only and heavy: load it on this page, on the client.
const CertificateDesigner = dynamic(() => import("./CertificateDesigner").then((m) => m.CertificateDesigner), {
  ssr: false,
  loading: () => <div className="cal-empty">Loading the certificate designer…</div>,
});

// The preview needs the same font metrics, so it loads the same way.
const CertificatePreview = dynamic(() => import("./CertificatePreview").then((m) => m.CertificatePreview), {
  ssr: false,
  loading: () => <div className="cal-empty">Loading the certificate…</div>,
});

export function DesignerLoader(props: CertificateDesignerProps) {
  return <CertificateDesigner {...props} />;
}

export function CertificatePreviewLoader(props: CertificatePreviewProps) {
  return <CertificatePreview {...props} />;
}
