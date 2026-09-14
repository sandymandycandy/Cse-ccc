"use client";

import dynamic from "next/dynamic";
import type { CertificateDesignerProps } from "./CertificateDesigner";

// The editor (TipTap, font metrics) is browser-only and heavy: load it on this page, on the client.
const CertificateDesigner = dynamic(() => import("./CertificateDesigner").then((m) => m.CertificateDesigner), {
  ssr: false,
  loading: () => <div className="cal-empty">Loading the certificate designer…</div>,
});

export function DesignerLoader(props: CertificateDesignerProps) {
  return <CertificateDesigner {...props} />;
}
