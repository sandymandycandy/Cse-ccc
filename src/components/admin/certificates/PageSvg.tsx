import type { ReactNode } from "react";
import { assetKey, type Design } from "@/lib/certificates/design";
import type { TextLayout } from "@/lib/certificates/layout";
import { SAMPLE_SERIAL, verifyUrl } from "@/lib/certificates/qr";
import { pctToPx } from "./geometry";
import { QrSvg } from "./QrSvg";
import { TextSvg } from "./TextSvg";

/**
 * What a QR encodes on a real certificate, with a placeholder serial of the real
 * length, so the preview has the printed density. The editor and preview only run
 * in the browser, so the page's own origin stands in when the env var isn't set.
 */
export const SAMPLE_QR_TEXT = verifyUrl(
  process.env.NEXT_PUBLIC_SITE_URL || (typeof window === "undefined" ? "" : window.location.origin),
  SAMPLE_SERIAL,
);

/**
 * The page as drawn: template, images, QR and laid-out text. Pure rendering —
 * the editor's Canvas lays its hit boxes and handles over this, the read-only
 * preview shows it alone. `layouts` comes from `layoutText`, so both agree with
 * the PDF.
 */
export function PageSvg({
  design,
  layouts,
  assetUrls,
  skipId = null,
  width,
  height,
  children,
}: {
  design: Design;
  layouts: ReadonlyMap<string, TextLayout>;
  assetUrls: Record<string, string>;
  /** An element drawn elsewhere (the text being typed into). */
  skipId?: string | null;
  width?: number | string;
  height?: number | string;
  children?: ReactNode;
}) {
  const page = design.page;
  const templateUrl = page.template ? assetUrls[assetKey(page.template)] : undefined;
  return (
    <svg className="cd-svg" viewBox={`0 0 ${page.widthPx} ${page.heightPx}`} width={width} height={height}>
      <rect width={page.widthPx} height={page.heightPx} fill="#ffffff" />
      {templateUrl ? (
        <image href={templateUrl} x={0} y={0} width={page.widthPx} height={page.heightPx} preserveAspectRatio="none" />
      ) : null}
      {design.elements.map((el) => {
        if (el.hidden || el.id === skipId) return null;
        if (el.type === "image") {
          const r = pctToPx(el, page);
          const url = assetUrls[assetKey(el.asset)];
          return url ? (
            <image key={el.id} href={url} x={r.x} y={r.y} width={r.w} height={r.h} opacity={el.opacity} preserveAspectRatio="none" />
          ) : (
            <rect key={el.id} x={r.x} y={r.y} width={r.w} height={r.h} fill="#eeeeee" />
          );
        }
        if (el.type === "qr") {
          return <QrSvg key={el.id} box={pctToPx(el, page)} color={el.color} text={SAMPLE_QR_TEXT} />;
        }
        const layout = layouts.get(el.id);
        return layout ? <TextSvg key={el.id} layout={layout} /> : null;
      })}
      {children}
    </svg>
  );
}
