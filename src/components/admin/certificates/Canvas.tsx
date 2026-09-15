"use client";

import { useMemo, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import type { DesignElement, TextElement } from "@/lib/certificates/design";
import { layoutText, type TextLayout } from "@/lib/certificates/layout";
import { METRICS } from "@/lib/certificates/metrics";
import type { EditorAction, EditorState } from "./designer-state";
import {
  clampPct,
  pctToPx,
  pxToPct,
  resizeRect,
  snapMove,
  snapTargets,
  type Guide,
  type Handle,
  type Rect,
} from "./geometry";
import { PageSvg } from "./PageSvg";

type Drag =
  | { kind: "move"; startX: number; startY: number; key: string; primary: string; origins: Map<string, Rect> }
  | { kind: "resize"; startX: number; startY: number; key: string; id: string; handle: Handle; origin: Rect };

const ALL_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SIDE_HANDLES: Handle[] = ["e", "w"];
/** Snap distance in screen pixels. */
const SNAP_PX = 6;

export interface CanvasProps {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  zoom: number;
  assetUrls: Record<string, string>;
  valueFor: (field: string) => string;
  editor: Editor | null;
}

export function Canvas({ state, dispatch, zoom, assetUrls, valueFor, editor }: CanvasProps) {
  const { design, selection, editingId } = state;
  const page = design.page;
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guide[]>([]);

  const layouts = useMemo(() => {
    const map = new Map<string, TextLayout>();
    for (const el of design.elements) {
      if (el.type === "text") map.set(el.id, layoutText(el, valueFor, page, METRICS));
    }
    return map;
  }, [design.elements, page, valueFor]);

  /** The on-screen box of an element in page px — a wrap text box is as tall as its text. */
  const boxOf = (el: DesignElement): Rect => {
    const r = pctToPx(el, page);
    const layout = el.type === "text" && el.fit === "wrap" ? layouts.get(el.id) : undefined;
    return layout ? { ...r, h: Math.max(layout.height, 1) } : r;
  };

  function startMove(e: ReactPointerEvent<HTMLDivElement>, el: DesignElement) {
    if (e.button !== 0 || editingId === el.id) return;
    e.stopPropagation();
    if (e.shiftKey) {
      dispatch({ type: "toggleSelect", id: el.id });
      return;
    }
    const ids = selection.includes(el.id) ? selection : [el.id];
    if (!selection.includes(el.id)) dispatch({ type: "select", ids });
    const movable = design.elements.filter((x) => ids.includes(x.id) && !x.locked);
    if (movable.length === 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = {
      kind: "move",
      startX: e.clientX,
      startY: e.clientY,
      key: `move-${e.timeStamp}`,
      primary: movable.some((m) => m.id === el.id) ? el.id : movable[0].id,
      origins: new Map(movable.map((m) => [m.id, boxOf(m)])),
    };
  }

  function startResize(e: ReactPointerEvent<HTMLDivElement>, el: DesignElement, handle: Handle) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { kind: "resize", startX: e.clientX, startY: e.clientY, key: `resize-${e.timeStamp}`, id: el.id, handle, origin: boxOf(el) };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / zoom;
    const dy = (e.clientY - d.startY) / zoom;

    if (d.kind === "move") {
      const origin = d.origins.get(d.primary)!;
      let offX = dx;
      let offY = dy;
      let nextGuides: Guide[] = [];
      if (!e.altKey) {
        const others = design.elements.filter((x) => !d.origins.has(x.id) && !x.hidden).map(boxOf);
        const snapped = snapMove({ ...origin, x: origin.x + dx, y: origin.y + dy }, snapTargets(page, others), SNAP_PX / zoom);
        offX = snapped.rect.x - origin.x;
        offY = snapped.rect.y - origin.y;
        nextGuides = snapped.guides;
      }
      setGuides(nextGuides);
      dispatch({
        type: "update",
        key: d.key,
        changes: [...d.origins].map(([id, r]) => {
          const pct = clampPct(pxToPct({ ...r, x: r.x + offX, y: r.y + offY }, page));
          return { id, patch: { x: pct.x, y: pct.y } };
        }),
      });
      return;
    }

    const el = design.elements.find((x) => x.id === d.id);
    if (!el) return;
    const keepAspect = el.type === "qr" || (el.type === "image" && !e.shiftKey);
    const pct = clampPct(pxToPct(resizeRect(d.origin, d.handle, dx, dy, keepAspect), page));
    const wrap = el.type === "text" && el.fit === "wrap";
    dispatch({
      type: "update",
      key: d.key,
      changes: [{ id: d.id, patch: wrap ? { x: pct.x, w: pct.w } : { x: pct.x, y: pct.y, w: pct.w, h: pct.h } }],
    });
  }

  function endDrag() {
    drag.current = null;
    setGuides([]);
  }

  const selected = design.elements.filter((el) => selection.includes(el.id) && !el.hidden);
  const single = selected.length === 1 ? selected[0] : null;
  const editing = design.elements.find((el): el is TextElement => el.id === editingId && el.type === "text") ?? null;

  return (
    <div
      className="cd-stage"
      style={{ width: page.widthPx * zoom, height: page.heightPx * zoom }}
      // Hit boxes, handles and the text editor stop propagation, so anything
      // reaching the stage is a click on empty page: deselect (and end editing).
      onPointerDown={() => dispatch({ type: "select", ids: [] })}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <PageSvg
        design={design}
        layouts={layouts}
        assetUrls={assetUrls}
        skipId={editingId}
        width={page.widthPx * zoom}
        height={page.heightPx * zoom}
      >
        {guides.map((g, i) =>
          g.axis === "x" ? (
            <line key={i} className="cd-guide" x1={g.at} x2={g.at} y1={0} y2={page.heightPx} vectorEffect="non-scaling-stroke" />
          ) : (
            <line key={i} className="cd-guide" x1={0} x2={page.widthPx} y1={g.at} y2={g.at} vectorEffect="non-scaling-stroke" />
          ),
        )}
      </PageSvg>

      {design.elements.map((el) => {
        if (el.hidden || el.id === editingId) return null;
        const r = boxOf(el);
        return (
          <div
            key={el.id}
            className={`cd-hit${selection.includes(el.id) ? " is-selected" : ""}${el.locked ? " is-locked" : ""}`}
            style={{ left: r.x * zoom, top: r.y * zoom, width: r.w * zoom, height: r.h * zoom }}
            onPointerDown={(e) => startMove(e, el)}
            onDoubleClick={() => el.type === "text" && dispatch({ type: "startEdit", id: el.id })}
            title={el.name}
          />
        );
      })}

      {single && !single.locked && single.id !== editingId
        ? (single.type === "text" && single.fit === "wrap" ? SIDE_HANDLES : ALL_HANDLES).map((h) => {
            const r = boxOf(single);
            const x = h.includes("w") ? r.x : h.includes("e") ? r.x + r.w : r.x + r.w / 2;
            const y = h.includes("n") ? r.y : h.includes("s") ? r.y + r.h : r.y + r.h / 2;
            return (
              <div
                key={h}
                className={`cd-handle cd-handle-${h}`}
                style={{ left: x * zoom, top: y * zoom }}
                onPointerDown={(e) => startResize(e, single, h)}
              />
            );
          })
        : null}

      {editing && editor ? (
        <div
          className="cd-editing"
          style={{
            left: (editing.x / 100) * page.widthPx * zoom,
            top: (editing.y / 100) * page.heightPx * zoom,
            width: (editing.w / 100) * page.widthPx,
            transform: `scale(${zoom})`,
            textAlign: editing.align,
            lineHeight: editing.lineHeight,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <EditorContent editor={editor} />
        </div>
      ) : null}
    </div>
  );
}
