"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useTransition } from "react";
import {
  copyCertificateDesignAction,
  saveCertificateDesignAction,
} from "@/app/admin/(app)/events/[id]/certificates/actions";
import {
  DEFAULT_STYLE,
  assetKey,
  newElementId,
  type Design,
  type FieldTransform,
  type TextElement,
} from "@/lib/certificates/design";
import { fieldLabel as labelOf, fieldNameValue, type FieldGroup, type FieldValues } from "@/lib/certificates/fields";
import { fontFaceCss } from "@/lib/certificates/fonts";
import { FIELD_NODE } from "@/lib/certificates/rich-text";
import { Canvas } from "./Canvas";
import { editorReducer, initEditorState } from "./designer-state";
import { FieldMenu } from "./FieldMenu";
import type { AssetKind } from "./image-prep";
import { LayersPanel } from "./LayersPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { uploadCertificateAsset } from "./upload";
import { useTextEditor } from "./useTextEditor";

const FONT_CSS = fontFaceCss();
const ZOOMS = [0.1, 0.25, 0.5, 1] as const;

export interface PreviewRecipient {
  key: string;
  name: string;
  values: FieldValues;
}

export interface DesignSource {
  eventId: string;
  title: string;
  date: string;
}

export interface CertificateDesignerProps {
  eventId: string;
  groupId: string;
  initialDesign: Design;
  initialAssetUrls: Record<string, string>;
  catalogue: FieldGroup[];
  previewRecipients: PreviewRecipient[];
  issuedCount: number;
  designSources: DesignSource[];
  /** Dev harness only: no uploads, saves or previews. */
  offline?: boolean;
}

type Busy = "upload" | "preview" | "copy" | null;

export function CertificateDesigner(props: CertificateDesignerProps) {
  const { eventId, groupId, catalogue } = props;
  const [state, dispatch] = useReducer(editorReducer, props.initialDesign, initEditorState);
  const [assetUrls, setAssetUrls] = useState(props.initialAssetUrls);
  const [zoomMode, setZoomMode] = useState<"fit" | number>("fit");
  const [fitZoom, setFitZoom] = useState(0.2);
  const [previewKey, setPreviewKey] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [saving, startSaving] = useTransition();
  const [copyFrom, setCopyFrom] = useState("");
  const [confirmCopy, setConfirmCopy] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const latestDesign = useRef(state.design);
  useEffect(() => {
    latestDesign.current = state.design;
  }, [state.design]);

  const page = state.design.page;
  const zoom = zoomMode === "fit" ? fitZoom : zoomMode;

  const fieldLabel = useCallback((key: string) => labelOf(catalogue, key), [catalogue]);
  const previewValues = props.previewRecipients.find((r) => r.key === previewKey)?.values;
  const valueFor = useMemo(
    () => (previewValues ? (k: string) => previewValues[k] ?? "" : fieldNameValue(catalogue)),
    [previewValues, catalogue],
  );

  const editingEl =
    state.design.elements.find((el): el is TextElement => el.id === state.editingId && el.type === "text") ?? null;
  const editor = useTextEditor({
    element: editingEl,
    pageHeightPx: page.heightPx,
    fieldLabel,
    onChange: (paragraphs) => {
      if (editingEl) dispatch({ type: "update", key: `type-${editingEl.id}`, changes: [{ id: editingEl.id, patch: { paragraphs } }] });
    },
  });

  // Fit-to-width zoom follows the viewport size.
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setFitZoom(Math.max(0.05, (entry.contentRect.width - 32) / page.widthPx)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [page.widthPx]);

  // Keyboard: undo/redo/duplicate/delete/nudge; Escape ends typing or clears the selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      const mod = e.ctrlKey || e.metaKey;
      if (state.editingId) {
        if (e.key === "Escape") {
          e.preventDefault();
          dispatch({ type: "endEdit" });
        }
        return;
      }
      if (typing) return;
      const key = e.key.toLowerCase();
      if (mod && key === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && key === "y") {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && key === "d") {
        e.preventDefault();
        dispatch({ type: "duplicateSelected", newId: newElementId });
      } else if ((e.key === "Delete" || e.key === "Backspace") && state.selection.length) {
        e.preventDefault();
        dispatch({ type: "deleteSelected" });
      } else if (e.key === "Escape") {
        dispatch({ type: "select", ids: [] });
      } else if (e.key.startsWith("Arrow") && state.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        dispatch({
          type: "nudge",
          dx: e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
          dy: e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0,
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.editingId, state.selection.length]);

  useEffect(() => {
    if (!state.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.dirty]);

  function addText() {
    const id = newElementId();
    dispatch({
      type: "add",
      element: {
        id,
        name: "Text",
        type: "text",
        x: 20,
        y: 45,
        w: 60,
        h: 8,
        locked: false,
        hidden: false,
        align: "center",
        lineHeight: 1.25,
        fit: "wrap",
        paragraphs: [{ runs: [{ kind: "text", text: "Type your text", style: DEFAULT_STYLE }] }],
      },
    });
    dispatch({ type: "startEdit", id });
  }

  function addQr() {
    // Square on the page: the same pixel width and height, each as a % of its own side.
    const w = 12;
    const h = Math.min(200, ((w / 100) * page.widthPx * 100) / page.heightPx);
    dispatch({
      type: "add",
      element: {
        id: newElementId(),
        name: "Verification QR",
        type: "qr",
        x: 100 - w - 6,
        y: Math.max(0, 100 - h - 8),
        w,
        h,
        locked: false,
        hidden: false,
        color: "#1a1a1a",
      },
    });
  }

  function pickField(field: string, transform: FieldTransform, label: string) {
    if (editor && state.editingId) {
      editor.chain().focus().insertContent({ type: FIELD_NODE, attrs: { field, transform } }).run();
      return;
    }
    dispatch({
      type: "add",
      element: {
        id: newElementId(),
        name: label.slice(0, 60),
        type: "text",
        x: 20,
        y: 40,
        w: 60,
        h: 8,
        locked: false,
        hidden: false,
        align: "center",
        lineHeight: 1.2,
        fit: "shrink",
        paragraphs: [{ runs: [{ kind: "field", field, transform, style: { ...DEFAULT_STYLE, sizePct: 5, bold: true } }] }],
      },
    });
  }

  async function onFile(kind: AssetKind, file: File | undefined) {
    if (!file) return;
    if (props.offline) {
      setMessage({ tone: "error", text: "Uploads only work on the real admin page." });
      return;
    }
    setBusy("upload");
    setMessage(null);
    try {
      const { ref, localUrl } = await uploadCertificateAsset(eventId, file, kind);
      setAssetUrls((urls) => ({ ...urls, [assetKey(ref)]: localUrl }));
      if (kind === "template") {
        dispatch({ type: "setTemplate", template: ref });
      } else {
        const w = 20;
        const h = (((w / 100) * page.widthPx * (ref.heightPx / ref.widthPx)) / page.heightPx) * 100;
        dispatch({
          type: "add",
          element: {
            id: newElementId(),
            name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Image",
            type: "image",
            x: 40,
            y: 8,
            w,
            h: Math.min(200, Math.max(0.5, h)),
            locked: false,
            hidden: false,
            opacity: 1,
            asset: ref,
          },
        });
      }
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const sent = state.design;
    setMessage(null);
    startSaving(async () => {
      const res = await saveCertificateDesignAction({ eventId, groupId, design: sent });
      if (!res.ok) {
        setMessage({ tone: "error", text: res.error });
        return;
      }
      // Only clear "unsaved" if nothing changed while the save was in flight.
      if (latestDesign.current === sent) dispatch({ type: "markSaved" });
      setMessage({ tone: "ok", text: "Saved." });
    });
  }

  async function previewPdf() {
    const win = window.open("", "_blank");
    setBusy("preview");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/certificates/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId, design: state.design, recipientKey: previewKey || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Could not build the preview.");
      }
      const url = URL.createObjectURL(await res.blob());
      if (win) win.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      win?.close();
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not build the preview." });
    } finally {
      setBusy(null);
    }
  }

  async function copyDesign() {
    setConfirmCopy(false);
    setBusy("copy");
    setMessage(null);
    try {
      const res = await copyCertificateDesignAction({ eventId, sourceEventId: copyFrom });
      if (!res.ok) throw new Error(res.error);
      setAssetUrls((urls) => ({ ...urls, ...res.assetUrls }));
      dispatch({ type: "replaceDesign", design: res.design });
      setMessage({ tone: "ok", text: "Design copied. Check it over, then Save." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not copy that design." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cd">
      <style>{FONT_CSS}</style>
      <div className="note cd-narrow">
        <strong>Designing needs a laptop.</strong> Placing text and images on a certificate wants a screen
        wider than this one, so the editor opens on a laptop or desktop.
        {props.offline ? null : (
          <div className="stack cd-narrow-actions">
            <a className="btn btn-ghost btn-sm" href={`/admin/events/${eventId}/certificates?tab=recipients`}>
              Recipients
            </a>
            <a className="btn btn-ghost btn-sm" href={`/admin/events/${eventId}/certificates?tab=issue`}>
              Issue
            </a>
          </div>
        )}
        <p className="hint" style={{ marginTop: props.offline ? 8 : 10 }}>
          Checking who gets a certificate, issuing them and downloading them all work on a phone.
        </p>
      </div>

      <div className="cd-wide">
        <div className="cd-toolbar">
          <div className="stack">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => templateInput.current?.click()}>
              {page.template ? "Replace template" : "Upload template"}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addText}>
              + Text
            </button>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => imageInput.current?.click()}>
              + Image
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={addQr}>
              + QR
            </button>
            <FieldMenu catalogue={catalogue} onPick={pickField} />
          </div>
          <div className="stack">
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Undo" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}>
              ↶
            </button>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Redo" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })}>
              ↷
            </button>
            <select
              aria-label="Zoom"
              value={String(zoomMode)}
              onChange={(e) => setZoomMode(e.target.value === "fit" ? "fit" : Number(e.target.value))}
            >
              <option value="fit">Fit</option>
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  {Math.round(z * 100)}%
                </option>
              ))}
            </select>
          </div>
          <div className="stack">
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
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null || props.offline} onClick={previewPdf}>
              {busy === "preview" ? "Building…" : "Preview PDF"}
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!state.dirty || saving || props.offline} onClick={save}>
              {saving ? "Saving…" : state.dirty ? "Save" : "Saved"}
            </button>
          </div>
        </div>

        <input ref={templateInput} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(e) => { void onFile("template", e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={imageInput} type="file" hidden accept="image/png,image/jpeg,image/svg+xml,image/webp"
          onChange={(e) => { void onFile("image", e.target.files?.[0]); e.target.value = ""; }} />

        {message ? (
          <p className="label" role="status" style={{ color: message.tone === "ok" ? "var(--forest)" : "var(--rust)", marginTop: 8 }}>
            {message.text}
          </p>
        ) : null}
        {busy === "upload" ? <p className="hint">Uploading…</p> : null}
        {!page.template ? (
          <p className="note" style={{ marginTop: 10 }}>
            Start by uploading your base certificate template (PNG or JPEG, up to 8 MB).
          </p>
        ) : null}
        {props.issuedCount > 0 && state.dirty ? (
          <p className="note" style={{ marginTop: 10 }}>
            {props.issuedCount} certificate{props.issuedCount === 1 ? " was" : "s were"} already issued. They keep the design
            they were issued with.
          </p>
        ) : null}

        <div className="cd-layout">
          <LayersPanel state={state} dispatch={dispatch} />
          <div className="cd-viewport" ref={viewport}>
            <Canvas state={state} dispatch={dispatch} zoom={zoom} assetUrls={assetUrls} valueFor={valueFor} editor={editor} />
          </div>
          <PropertiesPanel state={state} dispatch={dispatch} editor={editor} valueFor={valueFor} fieldLabel={fieldLabel} />
        </div>

        {props.designSources.length > 0 ? (
          <details className="cd-copy">
            <summary>Start from another event&rsquo;s design</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <select value={copyFrom} onChange={(e) => { setCopyFrom(e.target.value); setConfirmCopy(false); }}>
                <option value="">Choose an event…</option>
                {props.designSources.map((s) => (
                  <option key={s.eventId} value={s.eventId}>
                    {s.title} — {s.date}
                  </option>
                ))}
              </select>
              {confirmCopy ? (
                <>
                  <span className="hint">This replaces the design above.</span>
                  <button type="button" className="btn btn-accent btn-sm" disabled={busy !== null} onClick={copyDesign}>
                    Replace
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmCopy(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" disabled={!copyFrom || busy !== null || props.offline} onClick={() => setConfirmCopy(true)}>
                  {busy === "copy" ? "Copying…" : "Copy design"}
                </button>
              )}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
