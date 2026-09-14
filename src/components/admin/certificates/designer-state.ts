import type { AssetRef, Design, DesignElement } from "@/lib/certificates/design";

/**
 * The certificate editor's state machine — pure, so undo/redo, selection and
 * layer ordering are unit-tested. Every design change goes through `update`;
 * consecutive updates sharing a `key` (one drag, one slider, one typing
 * session) collapse into a single undo step.
 */

export const UNDO_LIMIT = 100;

export interface EditorState {
  design: Design;
  selection: string[];
  /** Text element currently open in the in-place editor. */
  editingId: string | null;
  past: Design[];
  future: Design[];
  /** Key of the last recorded change, for coalescing. */
  lastKey: string | null;
  dirty: boolean;
}

export type ElementPatch = Partial<Omit<DesignElement, "id" | "type">> & Record<string, unknown>;

export type EditorAction =
  | { type: "select"; ids: string[] }
  | { type: "toggleSelect"; id: string }
  | { type: "startEdit"; id: string }
  | { type: "endEdit" }
  | { type: "update"; changes: { id: string; patch: ElementPatch }[]; key?: string }
  | { type: "setTemplate"; template: AssetRef }
  | { type: "add"; element: DesignElement }
  | { type: "deleteSelected" }
  | { type: "duplicateSelected"; newId: () => string }
  | { type: "reorder"; id: string; to: "up" | "down" | "front" | "back" }
  | { type: "replaceDesign"; design: Design }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "markSaved" };

export function initEditorState(design: Design): EditorState {
  return { design, selection: [], editingId: null, past: [], future: [], lastKey: null, dirty: false };
}

/** Record `next` as a new undo step (or merge into the previous one when `key` matches). */
function commit(state: EditorState, next: Design, key: string | null = null): EditorState {
  const coalesce = key !== null && key === state.lastKey;
  const past = coalesce ? state.past : [...state.past, state.design].slice(-UNDO_LIMIT);
  return { ...state, design: next, past, future: [], lastKey: key, dirty: true };
}

const withElements = (design: Design, elements: DesignElement[]): Design => ({ ...design, elements });

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const { design } = state;
  switch (action.type) {
    case "select":
      return { ...state, selection: action.ids, editingId: action.ids.includes(state.editingId ?? "") ? state.editingId : null, lastKey: null };

    case "toggleSelect": {
      const on = state.selection.includes(action.id);
      return { ...state, selection: on ? state.selection.filter((i) => i !== action.id) : [...state.selection, action.id], editingId: null, lastKey: null };
    }

    case "startEdit": {
      const el = design.elements.find((e) => e.id === action.id);
      if (!el || el.type !== "text" || el.locked) return state;
      return { ...state, selection: [action.id], editingId: action.id, lastKey: null };
    }

    case "endEdit":
      return { ...state, editingId: null, lastKey: null };

    case "update": {
      const byId = new Map(action.changes.map((c) => [c.id, c.patch]));
      let changed = false;
      const elements = design.elements.map((el) => {
        const patch = byId.get(el.id);
        if (!patch) return el;
        changed = true;
        return { ...el, ...patch } as DesignElement;
      });
      return changed ? commit(state, withElements(design, elements), action.key ?? null) : state;
    }

    case "setTemplate":
      return commit(state, {
        ...design,
        page: { template: action.template, widthPx: action.template.widthPx, heightPx: action.template.heightPx },
      });

    case "add":
      return { ...commit(state, withElements(design, [...design.elements, action.element])), selection: [action.element.id], editingId: null };

    case "deleteSelected": {
      if (state.selection.length === 0) return state;
      const keep = design.elements.filter((el) => !state.selection.includes(el.id) || el.locked);
      if (keep.length === design.elements.length) return state;
      return { ...commit(state, withElements(design, keep)), selection: [], editingId: null };
    }

    case "duplicateSelected": {
      const copies = design.elements
        .filter((el) => state.selection.includes(el.id))
        .map((el) => ({ ...structuredClone(el), id: action.newId(), name: `${el.name} copy`.slice(0, 60), x: el.x + 2, y: el.y + 2, locked: false }));
      if (copies.length === 0) return state;
      return { ...commit(state, withElements(design, [...design.elements, ...copies])), selection: copies.map((c) => c.id), editingId: null };
    }

    case "reorder": {
      const from = design.elements.findIndex((el) => el.id === action.id);
      if (from < 0) return state;
      const last = design.elements.length - 1;
      const to = { up: Math.min(last, from + 1), down: Math.max(0, from - 1), front: last, back: 0 }[action.to];
      if (to === from) return state;
      const elements = [...design.elements];
      const [moved] = elements.splice(from, 1);
      elements.splice(to, 0, moved);
      return commit(state, withElements(design, elements));
    }

    case "replaceDesign":
      return { ...commit(state, action.design), selection: [], editingId: null };

    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return { ...state, design: prev, past: state.past.slice(0, -1), future: [design, ...state.future], lastKey: null, dirty: true, editingId: null, selection: state.selection.filter((id) => prev.elements.some((e) => e.id === id)) };
    }

    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return { ...state, design: next, past: [...state.past, design], future: state.future.slice(1), lastKey: null, dirty: true, editingId: null, selection: state.selection.filter((id) => next.elements.some((e) => e.id === id)) };
    }

    case "markSaved":
      return { ...state, dirty: false, lastKey: null };
  }
}
