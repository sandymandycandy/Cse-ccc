import { describe, it, expect } from "vitest";
import { diffPresence } from "./attendance-presence";

describe("diffPresence", () => {
  it("adds newly-present and removes newly-absent, leaving unchanged alone", () => {
    const current = new Set(["a", "b"]);
    const desired = new Set(["b", "c"]);
    const { toAdd, toRemove } = diffPresence(current, desired);
    expect(toAdd.sort()).toEqual(["c"]);
    expect(toRemove.sort()).toEqual(["a"]);
  });
  it("is a no-op when the sets are equal", () => {
    const s = new Set(["x", "y"]);
    expect(diffPresence(s, new Set(["x", "y"]))).toEqual({ toAdd: [], toRemove: [] });
  });
  it("adds all when current is empty", () => {
    expect(diffPresence(new Set(), new Set(["a", "b"])).toAdd.sort()).toEqual(["a", "b"]);
  });
});
