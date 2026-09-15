"use client";

import { useMemo, useState } from "react";
import type { BaseSummary } from "@/lib/certificates/bases";
import type { Design } from "@/lib/certificates/design";
import { fieldNameValue, formatIstDate, type FieldGroup } from "@/lib/certificates/fields";
import { fontFaceCss } from "@/lib/certificates/fonts";
import { layoutText, type TextLayout } from "@/lib/certificates/layout";
import { METRICS } from "@/lib/certificates/metrics";
import type { PreviewRecipient } from "./CertificateDesigner";
import { PageSvg } from "./PageSvg";

const FONT_CSS = fontFaceCss();

export interface CertificatePreviewProps {
  eventId: string;
  groupId: string;
  design: Design;
  assetUrls: Record<string, string>;
  catalogue: FieldGroup[];
  previewRecipients: PreviewRecipient[];
  base: BaseSummary;
  onCustomise: () => void;
  /** Dev harness only: no PDF download. */
  offline?: boolean;
}

/**
 * A group that follows its council base opens here, not in the editor (spec
 * 2026-09-15 §1.2): the certificate as it will print, filled with a real person,
 * and one button to customise it for this event. Unlike the editor it works on
 * a phone — it is just the page, scaled to the width.
 */
export function CertificatePreview(props: CertificatePreviewProps) {
  const { design, base } = props;
  const [previewKey, setPreviewKey] = useState(props.previewRecipients[0]?.key ?? "");
  const values = props.previewRecipients.find((r) => r.key === previewKey)?.values;
  const valueFor = useMemo(
    () => (values ? (key: string) => values[key] ?? "" : fieldNameValue(props.catalogue)),
    [values, props.catalogue],
  );
  const layouts = useMemo(() => {
    const map = new Map<string, TextLayout>();
    for (const el of design.elements) {
      if (el.type === "text") map.set(el.id, layoutText(el, valueFor, design.page, METRICS));
    }
    return map;
  }, [design, valueFor]);

  const saved = base.updatedAt ? formatIstDate(base.updatedAt) : null;
  const provenance = base.sourceEventTitle ? `saved from ${base.sourceEventTitle} on ${saved}` : saved ? `saved ${saved}` : null;
  const pdfHref = `/api/admin/events/${props.eventId}/certificates/preview?group=${props.groupId}&recipient=${encodeURIComponent(previewKey)}`;

  return (
    <div className="cd-preview">
      <style>{FONT_CSS}</style>
      <div className="cd-base-banner">
        <p className="body-text">
          <strong>● Council base</strong>
          {provenance ? <span className="hint"> · {provenance}</span> : null}
          <br />
          <span className="hint">
            Stays in step with the council: when they edit the {base.label} base, this event&rsquo;s certificates change too.
          </span>
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={props.onCustomise}>
          Customise
        </button>
      </div>

      <div className="cd-preview-page">
        <PageSvg design={design} layouts={layouts} assetUrls={props.assetUrls} width="100%" />
      </div>

      <div className="stack cd-preview-actions">
        <label className="cd-inline">
          Preview as
          <select value={previewKey} onChange={(e) => setPreviewKey(e.target.value)}>
            <option value="">Field names</option>
            {props.previewRecipients.map((r) => (
              <option key={r.key} value={r.key}>
                {r.name || r.key}
              </option>
            ))}
          </select>
        </label>
        {previewKey && !props.offline ? (
          <a className="btn btn-ghost btn-sm" href={pdfHref} target="_blank" rel="noopener">
            Download preview PDF
          </a>
        ) : (
          <span className="hint">Pick a person to download their preview PDF.</span>
        )}
      </div>
    </div>
  );
}
