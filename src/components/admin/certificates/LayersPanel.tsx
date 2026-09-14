"use client";

import type { Dispatch } from "react";
import type { EditorAction, EditorState } from "./designer-state";

/** Layer list, top layer first: select, hide, lock, move up/down. */
export function LayersPanel({ state, dispatch }: { state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const layers = [...state.design.elements].reverse();
  return (
    <aside className="cd-panel" aria-label="Layers">
      <div className="label">Layers</div>
      {layers.length === 0 ? <p className="hint">Add text, an image or a field.</p> : null}
      <ul className="cd-layers">
        {layers.map((el) => (
          <li key={el.id} className={state.selection.includes(el.id) ? "is-selected" : undefined}>
            <button
              type="button"
              className="cd-layer-name"
              onClick={(e) =>
                dispatch(e.shiftKey ? { type: "toggleSelect", id: el.id } : { type: "select", ids: [el.id] })
              }
            >
              <span aria-hidden>{el.type === "image" ? "▣" : "T"}</span> {el.name}
            </button>
            <button
              type="button"
              className="cd-icon"
              aria-label={el.hidden ? `Show ${el.name}` : `Hide ${el.name}`}
              aria-pressed={el.hidden}
              onClick={() => dispatch({ type: "update", changes: [{ id: el.id, patch: { hidden: !el.hidden } }] })}
            >
              {el.hidden ? "◌" : "●"}
            </button>
            <button
              type="button"
              className="cd-icon"
              aria-label={el.locked ? `Unlock ${el.name}` : `Lock ${el.name}`}
              aria-pressed={el.locked}
              onClick={() => dispatch({ type: "update", changes: [{ id: el.id, patch: { locked: !el.locked } }] })}
            >
              {el.locked ? "🔒" : "🔓"}
            </button>
            <button type="button" className="cd-icon" aria-label={`Move ${el.name} up`} onClick={() => dispatch({ type: "reorder", id: el.id, to: "up" })}>
              ↑
            </button>
            <button type="button" className="cd-icon" aria-label={`Move ${el.name} down`} onClick={() => dispatch({ type: "reorder", id: el.id, to: "down" })}>
              ↓
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
