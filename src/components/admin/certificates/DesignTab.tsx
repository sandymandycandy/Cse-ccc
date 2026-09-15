"use client";

import { useState } from "react";
import type { CertificateDesignerProps } from "./CertificateDesigner";
import { CertificatePreviewLoader, DesignerLoader } from "./DesignerLoader";

/**
 * The Design tab for one group (spec 2026-09-15 §1.2): a group following a saved
 * council base opens as the certificate itself; Customise opens the editor.
 * Anything else — a custom group, or a base nobody has saved yet — opens straight
 * in the editor.
 */
export function DesignTab(props: Omit<CertificateDesignerProps, "onCancel">) {
  const base = props.baseKind ? props.bases[props.baseKind] : null;
  const previewable = props.followsBase && !!base?.exists;
  const [mode, setMode] = useState<"preview" | "edit">(previewable ? "preview" : "edit");

  if (mode === "preview" && base) {
    return (
      <CertificatePreviewLoader
        eventId={props.eventId}
        groupId={props.groupId}
        design={props.initialDesign}
        assetUrls={props.initialAssetUrls}
        catalogue={props.catalogue}
        previewRecipients={props.previewRecipients}
        base={base}
        offline={props.offline}
        onCustomise={() => setMode("edit")}
      />
    );
  }
  return <DesignerLoader {...props} onCancel={previewable ? () => setMode("preview") : undefined} />;
}
