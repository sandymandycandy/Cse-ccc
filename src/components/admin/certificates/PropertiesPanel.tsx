"use client";

import type { Dispatch } from "react";
import type { Editor } from "@tiptap/react";
import {
  DEFAULT_STYLE,
  type DesignElement,
  type FieldTransform,
  type Style,
  type TextElement,
} from "@/lib/certificates/design";
import { cssFamily, familyFromCss, FONT_FAMILIES, hasVariant, type FontFamilyId } from "@/lib/certificates/fonts";
import { layoutText } from "@/lib/certificates/layout";
import { METRICS } from "@/lib/certificates/metrics";
import { applyStyleToAll, listFieldRuns, primaryStyle, setFieldTransform } from "@/lib/certificates/rich-text";
import type { EditorAction, EditorState } from "./designer-state";
import { pctToPt, ptToPct } from "./geometry";

interface Props {
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  editor: Editor | null;
  valueFor: (field: string) => string;
  fieldLabel: (key: string) => string;
}

export function PropertiesPanel({ state, dispatch, editor, valueFor, fieldLabel }: Props) {
  const selected = state.design.elements.filter((el) => state.selection.includes(el.id));
  if (selected.length === 0) {
    return (
      <aside className="cd-panel" aria-label="Properties">
        <div className="label">Properties</div>
        <p className="hint">
          Select something on the certificate. Double-click text to type; use <strong>+ Field</strong> while typing to
          insert a name, team or event detail.
        </p>
      </aside>
    );
  }
  if (selected.length > 1) {
    return (
      <aside className="cd-panel" aria-label="Properties">
        <div className="label">{selected.length} selected</div>
        <p className="hint">Drag to move them together, or press Delete.</p>
      </aside>
    );
  }
  const el = selected[0];
  const set = (patch: Partial<DesignElement>, key: string) =>
    dispatch({ type: "update", key: `prop-${el.id}-${key}`, changes: [{ id: el.id, patch }] });

  return (
    <aside className="cd-panel" aria-label="Properties">
      <div className="label">{el.type === "image" ? "Image" : "Text"}</div>

      <label className="cd-row">
        <span>Name</span>
        <input value={el.name} maxLength={60} onChange={(e) => set({ name: e.target.value || "Untitled" }, "name")} />
      </label>

      <div className="cd-grid2">
        <NumberField label="X %" value={el.x} onChange={(x) => set({ x }, "x")} />
        <NumberField label="Y %" value={el.y} onChange={(y) => set({ y }, "y")} />
        <NumberField label="W %" value={el.w} min={0.5} onChange={(w) => set({ w }, "w")} />
        {el.type === "text" && el.fit === "wrap" ? null : (
          <NumberField label="H %" value={el.h} min={0.5} onChange={(h) => set({ h }, "h")} />
        )}
      </div>

      {el.type === "image" ? (
        <label className="cd-row">
          <span>Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={el.opacity}
            onChange={(e) => set({ opacity: Number(e.target.value) }, "opacity")}
          />
        </label>
      ) : (
        <TextProperties el={el} state={state} dispatch={dispatch} editor={editor} valueFor={valueFor} fieldLabel={fieldLabel} />
      )}

      <div className="cd-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: "reorder", id: el.id, to: "front" })}>
          To front
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => dispatch({ type: "reorder", id: el.id, to: "back" })}>
          To back
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={el.locked} onClick={() => set({ locked: !el.locked }, "locked")}>
          {el.locked ? "Unlock" : "Lock"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={el.locked}
          onClick={() => dispatch({ type: "deleteSelected" })}
        >
          Delete
        </button>
      </div>
    </aside>
  );
}

function TextProperties({
  el,
  state,
  dispatch,
  editor,
  valueFor,
  fieldLabel,
}: {
  el: TextElement;
  state: EditorState;
  dispatch: Dispatch<EditorAction>;
  editor: Editor | null;
  valueFor: (field: string) => string;
  fieldLabel: (key: string) => string;
}) {
  const page = state.design.page;
  const editing = state.editingId === el.id && editor ? editor : null;
  const base = primaryStyle(el.paragraphs, DEFAULT_STYLE);

  // What the controls show: the style at the cursor while typing, else the box's first run.
  let style: Style = base;
  if (editing) {
    const attrs = editing.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string; color?: string };
    const px = attrs.fontSize ? parseFloat(attrs.fontSize) : NaN;
    style = {
      font: (attrs.fontFamily && familyFromCss(attrs.fontFamily)) || base.font,
      sizePct: Number.isFinite(px) ? (px / page.heightPx) * 100 : base.sizePct,
      bold: editing.isActive("bold"),
      italic: editing.isActive("italic"),
      underline: editing.isActive("underline"),
      color: attrs.color && /^#[0-9a-f]{6}$/i.test(attrs.color) ? attrs.color.toLowerCase() : base.color,
    };
  }

  const setBox = (patch: Partial<TextElement>, key: string) =>
    dispatch({ type: "update", key: `prop-${el.id}-${key}`, changes: [{ id: el.id, patch }] });

  function applyStyle(patch: Partial<Style>) {
    if (!editing) {
      setBox({ paragraphs: applyStyleToAll(el.paragraphs, patch) }, `style-${Object.keys(patch).join("")}`);
      return;
    }
    // Nothing selected: style the whole box, like the panel does when not typing.
    let chain = editing.chain().focus();
    if (editing.state.selection.empty) chain = chain.selectAll();
    const next = { ...style, ...patch };
    if (patch.font) chain = chain.setFontFamily(cssFamily(patch.font));
    if (patch.sizePct !== undefined) chain = chain.setFontSize(`${(patch.sizePct / 100) * page.heightPx}px`);
    if (patch.color) chain = chain.setColor(patch.color);
    if (patch.bold !== undefined) chain = patch.bold ? chain.setBold() : chain.unsetBold();
    if (patch.italic !== undefined) chain = patch.italic ? chain.setItalic() : chain.unsetItalic();
    if (patch.underline !== undefined) chain = patch.underline ? chain.setUnderline() : chain.unsetUnderline();
    if (patch.font && !hasVariant(next.font, next.bold, next.italic)) chain = chain.unsetBold().unsetItalic();
    chain.run();
  }

  const layout = layoutText(el, valueFor, page, METRICS);
  const fields = editing ? [] : listFieldRuns(el.paragraphs);

  return (
    <>
      <div className="cd-row">
        <span>Align</span>
        <div className="stack">
          {(["left", "center", "right"] as const).map((a) => (
            <button key={a} type="button" className="chip" aria-pressed={el.align === a} onClick={() => setBox({ align: a }, "align")}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="cd-grid2">
        <label className="cd-row">
          <span>Fit</span>
          <select value={el.fit} onChange={(e) => setBox({ fit: e.target.value as TextElement["fit"] }, "fit")}>
            <option value="wrap">Wrap lines</option>
            <option value="shrink">Shrink to one line</option>
          </select>
        </label>
        <NumberField label="Line spacing" value={el.lineHeight} step={0.05} min={0.8} max={3} onChange={(lineHeight) => setBox({ lineHeight }, "lh")} />
      </div>

      <div className="label" style={{ marginTop: 10 }}>
        {editing ? "Style (selection)" : "Style (whole box)"}
      </div>
      <label className="cd-row">
        <span>Font</span>
        <select
          value={style.font}
          onMouseDown={(e) => editing && e.stopPropagation()}
          onChange={(e) => applyStyle({ font: e.target.value as FontFamilyId })}
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
      <div className="cd-grid2">
        <NumberField
          label="Size pt"
          value={pctToPt(style.sizePct, page)}
          step={0.5}
          min={1}
          onChange={(pt) => applyStyle({ sizePct: Math.min(30, Math.max(0.5, ptToPct(pt, page))) })}
        />
        <label className="cd-row">
          <span>Colour</span>
          <input type="color" value={style.color} onChange={(e) => applyStyle({ color: e.target.value.toLowerCase() })} />
        </label>
      </div>
      <div className="stack">
        <button
          type="button"
          className="chip"
          aria-pressed={style.bold}
          disabled={!hasVariant(style.font, !style.bold, style.italic)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ bold: !style.bold })}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={style.italic}
          disabled={!hasVariant(style.font, style.bold, !style.italic)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ italic: !style.italic })}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={style.underline}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyStyle({ underline: !style.underline })}
        >
          <u>U</u>
        </button>
      </div>

      {fields.length > 0 ? (
        <>
          <div className="label" style={{ marginTop: 10 }}>
            Fields in this box
          </div>
          {fields.map((f) => (
            <label key={`${f.paragraph}.${f.run}`} className="cd-row">
              <span>{`{${fieldLabel(f.field)}}`}</span>
              <select
                value={f.transform}
                onChange={(e) =>
                  setBox({ paragraphs: setFieldTransform(el.paragraphs, f, e.target.value as FieldTransform) }, `tf-${f.paragraph}-${f.run}`)
                }
              >
                <option value="none">As typed</option>
                <option value="title">Title Case</option>
                <option value="upper">UPPERCASE</option>
              </select>
            </label>
          ))}
        </>
      ) : null}

      {layout.overflow ? (
        <p className="hint cd-warn">
          {el.fit === "shrink" ? "This text is too long for the box even at its smallest." : "This text runs off the page."}
        </p>
      ) : null}
      {layout.missingGlyphs.length ? (
        <p className="hint cd-warn">This font can&rsquo;t print: {layout.missingGlyphs.join(" ")}</p>
      ) : null}
    </>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <label className="cd-row">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(v)) onChange(v);
        }}
      />
    </label>
  );
}
