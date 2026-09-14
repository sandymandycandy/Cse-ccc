import { describe, it, expect } from "vitest";
import { DEFAULT_STYLE, emptyDesign, type DesignElement, type TextElement } from "@/lib/certificates/design";
import { editorReducer, initEditorState, UNDO_LIMIT, type EditorState } from "./designer-state";

const text = (id: string, over: Partial<TextElement> = {}): TextElement => ({
  id,
  name: id.toUpperCase(),
  type: "text",
  x: 10,
  y: 10,
  w: 30,
  h: 10,
  locked: false,
  hidden: false,
  align: "left",
  lineHeight: 1.2,
  fit: "wrap",
  paragraphs: [{ runs: [{ kind: "text", text: id, style: DEFAULT_STYLE }] }],
  ...over,
});

function stateWith(...elements: DesignElement[]): EditorState {
  return initEditorState({ ...emptyDesign(), elements });
}

const ids = (s: EditorState) => s.design.elements.map((e) => e.id);

describe("editorReducer", () => {
  it("updates elements, marks dirty and records one undo step", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: 50 } }] });
    expect(s.design.elements[0].x).toBe(50);
    expect(s.dirty).toBe(true);
    expect(s.past).toHaveLength(1);
  });

  it("coalesces updates that share a key (a drag) into one undo step", () => {
    let s = stateWith(text("a"));
    for (const x of [11, 12, 13]) s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x } }], key: "drag-1" });
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: "undo" });
    expect(s.design.elements[0].x).toBe(10);
    s = editorReducer(s, { type: "redo" });
    expect(s.design.elements[0].x).toBe(13);
  });

  it("starts a new step after any other action", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: 11 } }], key: "k" });
    s = editorReducer(s, { type: "select", ids: ["a"] });
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: 12 } }], key: "k" });
    expect(s.past).toHaveLength(2);
  });

  it("caps the undo history", () => {
    let s = stateWith(text("a"));
    for (let i = 0; i < UNDO_LIMIT + 20; i++) s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { x: i } }] });
    expect(s.past).toHaveLength(UNDO_LIMIT);
  });

  it("adds and selects a new element; deletes the selection but never locked elements", () => {
    let s = stateWith(text("a", { locked: true }), text("b"));
    s = editorReducer(s, { type: "add", element: text("c") });
    expect(ids(s)).toEqual(["a", "b", "c"]);
    expect(s.selection).toEqual(["c"]);
    s = editorReducer(s, { type: "select", ids: ["a", "c"] });
    s = editorReducer(s, { type: "deleteSelected" });
    expect(ids(s)).toEqual(["a", "b"]);
  });

  it("duplicates with an offset and selects the copies", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "select", ids: ["a"] });
    s = editorReducer(s, { type: "duplicateSelected", newId: () => "a2" });
    expect(ids(s)).toEqual(["a", "a2"]);
    expect(s.design.elements[1]).toMatchObject({ x: 12, y: 12, name: "A copy" });
    expect(s.selection).toEqual(["a2"]);
  });

  it("reorders layers", () => {
    let s = stateWith(text("a"), text("b"), text("c"));
    s = editorReducer(s, { type: "reorder", id: "a", to: "front" });
    expect(ids(s)).toEqual(["b", "c", "a"]);
    s = editorReducer(s, { type: "reorder", id: "a", to: "down" });
    expect(ids(s)).toEqual(["b", "a", "c"]);
    s = editorReducer(s, { type: "reorder", id: "c", to: "back" });
    expect(ids(s)).toEqual(["c", "b", "a"]);
  });

  it("sets the template and adopts its page size", () => {
    let s = stateWith();
    const template = { bucket: "certificate-assets" as const, path: "p", type: "jpg" as const, widthPx: 2000, heightPx: 1414 };
    s = editorReducer(s, { type: "setTemplate", template });
    expect(s.design.page).toEqual({ template, widthPx: 2000, heightPx: 1414 });
  });

  it("only opens unlocked text elements for editing", () => {
    let s = stateWith(text("a"), text("b", { locked: true }));
    expect(editorReducer(s, { type: "startEdit", id: "b" }).editingId).toBeNull();
    s = editorReducer(s, { type: "startEdit", id: "a" });
    expect(s).toMatchObject({ editingId: "a", selection: ["a"] });
    expect(editorReducer(s, { type: "select", ids: [] }).editingId).toBeNull();
  });

  it("clears dirty on save without touching history", () => {
    let s = stateWith(text("a"));
    s = editorReducer(s, { type: "update", changes: [{ id: "a", patch: { y: 1 } }] });
    s = editorReducer(s, { type: "markSaved" });
    expect(s.dirty).toBe(false);
    expect(s.past).toHaveLength(1);
  });
});
