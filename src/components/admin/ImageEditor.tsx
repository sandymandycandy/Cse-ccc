"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  FRAME_WIDTH,
  applyAspect,
  applyQuarterTurn,
  applyStraighten,
  clampOffset,
  fitWholeState,
  minZoom,
  outputSize,
  resolveFrame,
  type EditState,
  type Size,
} from "@/lib/image/edit-math";
import {
  ANIMATED_TYPE,
  assignToInput,
  bake,
  formatBytes,
  loadImage,
  type BakeResult,
} from "@/lib/image/render";

/**
 * Image picker with a crop / rotate / resize editor in front of it.
 *
 * The component wraps a real `<input type="file">` and, on Apply, replaces that
 * input's file with the baked result. The surrounding form stays a plain
 * `<form action={serverAction}>` and the server actions keep receiving an
 * ordinary file field — nothing on the server knows an editor exists.
 *
 * The live preview is a CSS transform on an <img> (smooth at any photo size);
 * the canvas runs exactly once, on Apply. Both replay the same transform in the
 * same order (see edit-math.ts), so the thumbnail shown afterwards is literally
 * the bytes that will upload.
 */

export interface AspectPreset {
  label: string;
  value: number | null;
}

export const DEFAULT_PRESETS: AspectPreset[] = [
  { label: "Original", value: null },
  { label: "3:2", value: 3 / 2 },
  { label: "4:3", value: 4 / 3 },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "16:9", value: 16 / 9 },
];

const LONG_EDGES = [2400, 1600, 1200, 800];
const QUALITIES: { label: string; value: number }[] = [
  { label: "High", value: 0.92 },
  { label: "Balanced", value: 0.82 },
  { label: "Small file", value: 0.7 },
];
const MAX_ZOOM_FACTOR = 8;
const STRAIGHTEN_LIMIT = 15;

const BLANK: EditState = {
  aspect: null,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  quarterTurns: 0,
  straightenDeg: 0,
  flipH: false,
  flipV: false,
};

interface Source {
  file: File;
  img: HTMLImageElement;
  url: string;
  natural: Size;
}

export function ImageEditor({
  name = "image",
  label,
  hint,
  required = false,
  initialUrl = null,
  defaultAspect = null,
  presets = DEFAULT_PRESETS,
  longEdge: defaultLongEdge = 1600,
  withDimensions = false,
}: {
  name?: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** Existing image when editing a row — shown until a new file is picked. */
  initialUrl?: string | null;
  defaultAspect?: number | null;
  presets?: AspectPreset[];
  longEdge?: number;
  /** Emit `imageW`/`imageH` hidden fields (only the gallery stores them). */
  withDimensions?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const [source, setSource] = useState<Source | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [baked, setBaked] = useState<BakeResult | null>(null);
  const [passthrough, setPassthrough] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [longEdge, setLongEdge] = useState(defaultLongEdge);
  const [quality, setQuality] = useState(QUALITIES[1].value);
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const uid = useId();

  // Object URLs are revoked on unmount so a long admin session doesn't hold a
  // decoded copy of every photo that passed through the editor.
  const urls = useRef<string[]>([]);
  const track = useCallback((url: string) => {
    urls.current.push(url);
    return url;
  }, []);
  useEffect(() => {
    const held = urls.current;
    return () => held.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setSource(null);
    setEdit(null);
    setBaked(null);
    setPassthrough(null);
    setError(null);
    if (!file) return;

    // Baking an animated GIF through a canvas keeps frame one and silently
    // drops the animation, so GIFs skip the editor and upload untouched.
    if (file.type === ANIMATED_TYPE) {
      setPassthrough(track(URL.createObjectURL(file)));
      return;
    }

    try {
      const { img, url } = await loadImage(file);
      track(url);
      const natural = { width: img.naturalWidth, height: img.naturalHeight };
      const base = fitWholeState(BLANK, natural);
      setSource({ file, img, url, natural });
      setEdit(defaultAspect == null ? base : applyAspect(base, natural, defaultAspect));
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That file could not be read as an image.");
    }
  }

  // Measuring the stage and sizing the frame in JS sidesteps the
  // aspect-ratio + max-width + max-height sizing puzzle, and yields the
  // px-per-canonical-unit factor the CSS preview needs.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const ro = new ResizeObserver(([entry]) => {
      setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const frame = source && edit ? resolveFrame(edit, source.natural) : null;
  const frameAspect = frame ? frame.width / frame.height : 1;
  const frameW = frame ? Math.max(1, Math.min(stage.width, stage.height * frameAspect)) : 0;
  const frameH = frameW / frameAspect;
  const k = frameW / FRAME_WIDTH;

  const floor = source && edit ? minZoom(edit, source.natural) : 0;
  const ceiling = floor * MAX_ZOOM_FACTOR;
  const outPx = source && edit && frame ? outputSize(frame, edit.zoom, longEdge) : null;

  const update = useCallback(
    (next: EditState) => {
      if (!source) return;
      setEdit(clampOffset(next, source.natural));
    },
    [source],
  );

  // ── pointer: drag to pan, two fingers to zoom ─────────────────────────────
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragFrom = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);
  const pinchFrom = useRef<{ dist: number; zoom: number } | null>(null);

  function spread(): number {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!edit) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      dragFrom.current = { x: e.clientX, y: e.clientY, offsetX: edit.offsetX, offsetY: edit.offsetY };
    } else if (pointers.current.size === 2) {
      dragFrom.current = null;
      pinchFrom.current = { dist: spread(), zoom: edit.zoom };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!edit || !pointers.current.has(e.pointerId) || k === 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchFrom.current) {
      const ratio = spread() / (pinchFrom.current.dist || 1);
      update({
        ...edit,
        zoom: Math.min(ceiling, Math.max(floor, pinchFrom.current.zoom * ratio)),
      });
      return;
    }
    const from = dragFrom.current;
    if (!from) return;
    update({
      ...edit,
      offsetX: from.offsetX + (e.clientX - from.x) / k,
      offsetY: from.offsetY + (e.clientY - from.y) / k,
    });
  }

  function endPointer(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchFrom.current = null;
    if (pointers.current.size === 0) dragFrom.current = null;
  }

  // Wheel-to-zoom needs a non-passive listener: React's synthetic wheel handler
  // is passive, so preventDefault there is ignored and the page scrolls out
  // from under the crop instead of zooming.
  useEffect(() => {
    const el = frameRef.current;
    if (!el || !edit || !source) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoom = Math.min(ceiling, Math.max(floor, edit.zoom * Math.exp(-e.deltaY * 0.0015)));
      setEdit(clampOffset({ ...edit, zoom }, source.natural));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [edit, source, floor, ceiling]);

  async function apply() {
    if (!source || !edit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bake(source.img, edit, { longEdge, quality, baseName: "photo" });
      track(result.url);
      if (fileRef.current) assignToInput(fileRef.current, result.file);
      setBaked(result);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare that image.");
    } finally {
      setBusy(false);
    }
  }

  const shownUrl = baked?.url ?? passthrough ?? initialUrl;
  const transform = edit
    ? [
        `translate(${edit.offsetX * k}px, ${edit.offsetY * k}px)`,
        `rotate(${edit.quarterTurns * 90 + edit.straightenDeg}deg)`,
        `scale(${edit.zoom * k * (edit.flipH ? -1 : 1)}, ${edit.zoom * k * (edit.flipV ? -1 : 1)})`,
      ].join(" ")
    : undefined;

  // The dialog is a SIBLING of .field, never a child: `.field input/select` sets
  // a 46px min-height plus a border, which would deform the sliders and chips.
  return (
    <>
      <div className="field">
        <label htmlFor={`${uid}-file`}>{label}</label>

        {shownUrl ? (
          <div className="imged-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shownUrl} alt={baked ? "Edited photo preview" : "Current photo"} />
            <div className="imged-preview-meta">
              {baked ? (
                <>
                  <strong>
                    {baked.width} × {baked.height}
                  </strong>
                  <span>uploads as {formatBytes(baked.bytes)}</span>
                </>
              ) : passthrough ? (
                <>
                  <strong>Animated GIF</strong>
                  <span>Uploads as-is — editing it would drop the animation.</span>
                </>
              ) : (
                <span>Current photo. Choose a file to replace it.</span>
              )}
              {source ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(true)}>
                  {baked ? "Edit again" : "Crop & rotate"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <input
          ref={fileRef}
          id={`${uid}-file`}
          name={name}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          required={required}
          onChange={onPick}
        />
        {hint ? <span className="hint">{hint}</span> : null}
        {error && !open ? (
          <span className="hint" style={{ color: "var(--rust)" }}>
            {error}
          </span>
        ) : null}

        {withDimensions ? (
          <>
            <input type="hidden" name="imageW" value={baked?.width ?? ""} />
            <input type="hidden" name="imageH" value={baked?.height ?? ""} />
          </>
        ) : null}
      </div>

      {open && source && edit ? (
        <>
          <div className="imged-backdrop" onClick={() => setOpen(false)} aria-hidden />
          <div className="imged" role="dialog" aria-modal="true" aria-label="Crop and adjust photo">
            <div className="imged-head">
              <div>
                <div className="label">Adjust photo</div>
                <div className="imged-dims">
                  {outPx ? `Exports at ${outPx.width} × ${outPx.height} px` : null}
                </div>
              </div>
              <button
                type="button"
                className="imged-close"
                aria-label="Close"
                onClick={() => setOpen(false)}
                ref={closeRef}
              >
                ✕
              </button>
            </div>

            <div className="imged-stage" ref={stageRef}>
              <div
                className="imged-frame"
                ref={frameRef}
                style={{ width: frameW, height: frameH }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endPointer}
                onPointerCancel={endPointer}
              >
                <div className="imged-imgwrap" style={{ transform }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={source.url}
                    alt=""
                    draggable={false}
                    style={{
                      width: source.natural.width,
                      height: source.natural.height,
                      left: -source.natural.width / 2,
                      top: -source.natural.height / 2,
                    }}
                  />
                </div>
                <div className="imged-thirds" aria-hidden />
              </div>
            </div>

            <div className="imged-controls">
              <div className="imged-row" role="group" aria-label="Crop shape">
                {presets.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="chip"
                    aria-pressed={
                      p.value == null
                        ? edit.aspect == null
                        : edit.aspect != null && Math.abs(edit.aspect - p.value) < 1e-6
                    }
                    onClick={() => update(applyAspect(edit, source.natural, p.value))}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="imged-row">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update(applyQuarterTurn(edit, source.natural, -1))}
                >
                  ↺ Left
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update(applyQuarterTurn(edit, source.natural, 1))}
                >
                  ↻ Right
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-pressed={edit.flipH}
                  onClick={() => update({ ...edit, flipH: !edit.flipH })}
                >
                  ⇆ Mirror
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  aria-pressed={edit.flipV}
                  onClick={() => update({ ...edit, flipV: !edit.flipV })}
                >
                  ⇅ Mirror
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update(fitWholeState(edit, source.natural))}
                >
                  Fit whole image
                </button>
              </div>

              <div className="imged-slider">
                <label htmlFor={`${uid}-zoom`}>Zoom</label>
                <input
                  id={`${uid}-zoom`}
                  type="range"
                  min={floor}
                  max={ceiling}
                  step={(ceiling - floor) / 400 || 0.001}
                  value={edit.zoom}
                  onChange={(e) => update({ ...edit, zoom: Number(e.target.value) })}
                />
                <output htmlFor={`${uid}-zoom`}>{(edit.zoom / floor).toFixed(1)}×</output>
              </div>

              <div className="imged-slider">
                <label htmlFor={`${uid}-straighten`}>Straighten</label>
                <input
                  id={`${uid}-straighten`}
                  type="range"
                  min={-STRAIGHTEN_LIMIT}
                  max={STRAIGHTEN_LIMIT}
                  step={0.5}
                  value={edit.straightenDeg}
                  onChange={(e) =>
                    update(applyStraighten(edit, source.natural, Number(e.target.value)))
                  }
                />
                <output htmlFor={`${uid}-straighten`}>{edit.straightenDeg.toFixed(1)}°</output>
              </div>

              <div className="imged-row imged-output">
                <label htmlFor={`${uid}-longedge`}>Max size</label>
                <select
                  id={`${uid}-longedge`}
                  value={longEdge}
                  onChange={(e) => setLongEdge(Number(e.target.value))}
                >
                  {LONG_EDGES.map((v) => (
                    <option key={v} value={v}>
                      {v} px
                    </option>
                  ))}
                </select>
                <label htmlFor={`${uid}-quality`}>Quality</label>
                <select
                  id={`${uid}-quality`}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                >
                  {QUALITIES.map((q) => (
                    <option key={q.label} value={q.value}>
                      {q.label}
                    </option>
                  ))}
                </select>
              </div>

              {error ? (
                <div className="note" style={{ borderLeftColor: "var(--rust)" }}>
                  {error}
                </div>
              ) : null}

              <div className="imged-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => update(fitWholeState(edit, source.natural))}
                >
                  Reset
                </button>
                <span className="imged-spacer" />
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={apply}
                  disabled={busy}
                >
                  {busy ? "Preparing…" : "Apply"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
