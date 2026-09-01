"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  saveCertificateSetupAction,
  issueCertificatesAction,
  type CertificateSetupState,
  type CertificateIssueState,
} from "@/app/admin/(app)/events/[id]/certificates/actions";
import { type CertificateConfig } from "@/lib/certificates/config";

interface Attendee {
  registrationId: string;
  name: string;
  email: string;
  issued: boolean;
  issuedAt: string | null;
}

interface Props {
  eventId: string;
  templateUrl: string | null;
  config: CertificateConfig;
  attendees: Attendee[];
  issuedCount: number;
  pendingCount: number;
  missingEmailCount: number;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function CertificateManager(props: Props) {
  const router = useRouter();
  const [config, setConfig] = useState<CertificateConfig>(props.config);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [boxH, setBoxH] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  const shownUrl = previewUrl ?? props.templateUrl;
  const sampleName = props.attendees[0]?.name || "Sample Name";

  const [setupState, saveAction, saving] = useActionState<CertificateSetupState, FormData>(
    saveCertificateSetupAction,
    {},
  );
  const [issueState, issueAction, issuing] = useActionState<CertificateIssueState, FormData>(
    issueCertificatesAction,
    {},
  );

  // Keep the preview font sized off the rendered image height.
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const measure = () => setBoxH(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shownUrl]);

  // After a save/issue, pull fresh server data (new template URL, issued badges).
  // The object-URL preview keeps showing the just-uploaded image until then.
  useEffect(() => {
    if (setupState.ok) router.refresh();
  }, [setupState, router]);
  useEffect(() => {
    if (issueState.message) router.refresh();
  }, [issueState, router]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  function onPlace(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    setConfig((c) => ({
      ...c,
      nameXPct: Math.round(clamp(((e.clientX - rect.left) / rect.width) * 100) * 10) / 10,
      nameYPct: Math.round(clamp(((e.clientY - rect.top) / rect.height) * 100) * 10) / 10,
    }));
  }

  const overlayTransform =
    config.align === "center"
      ? "translate(-50%,-50%)"
      : config.align === "right"
        ? "translate(-100%,-50%)"
        : "translate(0,-50%)";

  return (
    <div style={{ marginTop: 20, display: "grid", gap: 28 }}>
      {/* ── 1. Template + placement ── */}
      <section>
        <h2 style={{ fontSize: 24 }}>Template &amp; name placement</h2>
        <p className="body-text" style={{ marginTop: 6 }}>
          Upload the finished certificate (PNG or JPEG). Then <strong>click on the image</strong>{" "}
          where the name should sit and fine-tune below — the preview matches the emailed PDF.
        </p>

        <form action={saveAction} style={{ marginTop: 16 }}>
          <input type="hidden" name="eventId" value={props.eventId} />
          <input type="hidden" name="nameXPct" value={config.nameXPct} />
          <input type="hidden" name="nameYPct" value={config.nameYPct} />
          <input type="hidden" name="fontPct" value={config.fontPct} />
          <input type="hidden" name="align" value={config.align} />
          <input type="hidden" name="color" value={config.color} />

          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="cert-template">
              Certificate template {props.templateUrl ? "(replace)" : "(required)"}
            </label>
            <input id="cert-template" type="file" name="template" accept="image/png,image/jpeg" onChange={onFile} />
          </div>

          {shownUrl ? (
            <div
              style={{
                position: "relative",
                display: "inline-block",
                maxWidth: 760,
                width: "100%",
                border: "1px solid var(--line-2)",
                borderRadius: "var(--r-md)",
                overflow: "hidden",
                lineHeight: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={shownUrl}
                alt="Certificate template"
                onClick={onPlace}
                style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
              />
              {boxH > 0 ? (
                <span
                  style={{
                    position: "absolute",
                    left: `${config.nameXPct}%`,
                    top: `${config.nameYPct}%`,
                    transform: overlayTransform,
                    fontFamily: "'Times New Roman', Times, serif",
                    fontWeight: 700,
                    fontSize: `${(config.fontPct / 100) * boxH}px`,
                    color: config.color,
                    whiteSpace: "nowrap",
                    pointerEvents: "none",
                    lineHeight: 1,
                  }}
                >
                  {sampleName}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="note" style={{ maxWidth: 520 }}>
              Choose a template image to position the name.
            </div>
          )}

          {/* placement controls */}
          <div style={{ marginTop: 16, display: "grid", gap: 14, maxWidth: 520 }}>
            <Slider label={`Horizontal — ${config.nameXPct}%`} value={config.nameXPct} min={0} max={100} step={0.5}
              onChange={(v) => setConfig((c) => ({ ...c, nameXPct: v }))} />
            <Slider label={`Vertical — ${config.nameYPct}%`} value={config.nameYPct} min={0} max={100} step={0.5}
              onChange={(v) => setConfig((c) => ({ ...c, nameYPct: v }))} />
            <Slider label={`Font size — ${config.fontPct}%`} value={config.fontPct} min={1} max={12} step={0.1}
              onChange={(v) => setConfig((c) => ({ ...c, fontPct: v }))} />
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {(["left", "center", "right"] as const).map((a) => (
                  <button key={a} type="button" className="chip" aria-pressed={config.align === a}
                    onClick={() => setConfig((c) => ({ ...c, align: a }))}>
                    {a}
                  </button>
                ))}
              </div>
              <label style={{ display: "inline-flex", gap: 8, alignItems: "center", font: "500 12px var(--sans)" }}>
                Ink
                <input type="color" value={config.color}
                  onChange={(e) => setConfig((c) => ({ ...c, color: e.target.value }))}
                  style={{ width: 40, height: 28, border: "1px solid var(--line-3)", borderRadius: 6, background: "none" }} />
              </label>
            </div>
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
              {saving ? "Saving…" : "Save certificate setup"}
            </button>
            {setupState.ok ? <span className="label" style={{ color: "var(--forest)" }}>Saved ✓</span> : null}
            {setupState.error ? <span className="label" style={{ color: "var(--rust)" }}>{setupState.error}</span> : null}
          </div>
        </form>
      </section>

      {/* ── 2. Attendees + issue ── */}
      <section>
        <div className="sec-head" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 24 }}>Attendees</h2>
        </div>
        <p className="body-text">
          {props.attendees.length} attended · {props.issuedCount} issued · {props.pendingCount} to email
          {props.missingEmailCount ? ` · ${props.missingEmailCount} have no email (can't send)` : ""}
        </p>

        <form action={issueAction} style={{ marginTop: 14 }}>
          <input type="hidden" name="eventId" value={props.eventId} />
          <button type="submit" className="btn btn-accent btn-sm"
            disabled={issuing || !props.templateUrl || props.pendingCount === 0}>
            {issuing ? "Sending…" : `Issue & email certificates (${props.pendingCount})`}
          </button>
          {!props.templateUrl ? (
            <span className="hint" style={{ marginLeft: 10 }}>Upload &amp; save a template first.</span>
          ) : null}
          {issueState.error ? (
            <span className="label" style={{ marginLeft: 10, color: "var(--rust)" }}>{issueState.error}</span>
          ) : null}
          {issueState.message ? (
            <span className="label" style={{ marginLeft: 10, color: "var(--forest)" }}>{issueState.message}</span>
          ) : null}
        </form>

        {props.attendees.length > 0 ? (
          <div className="tablewrap" style={{ marginTop: 16 }}>
            <table className="admin">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {props.attendees.map((a) => (
                  <tr key={a.registrationId}>
                    <td style={{ fontWeight: 500 }}>{a.name || "—"}</td>
                    <td>{a.email || <span style={{ color: "var(--rust)" }}>no email</span>}</td>
                    <td>
                      {a.issued ? (
                        <span className="abadge abadge-approved">Issued</span>
                      ) : a.email ? (
                        <span className="abadge abadge-pending">Pending</span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="cal-empty" style={{ marginTop: 14 }}>
            No attendees yet — mark people present on the registrations page first.
          </div>
        )}
      </section>
    </div>
  );
}

function Slider({
  label, value, min, max, step, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span className="label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: "100%" }} />
    </label>
  );
}
