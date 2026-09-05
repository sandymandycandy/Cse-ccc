import { describe, it, expect } from "vitest";
import { isDirty, autosaveAction } from "./autosave";

const set = (...ids: string[]) => new Set(ids);

describe("isDirty", () => {
  it("is false when the marks match what the server confirmed", () => {
    expect(isDirty(set("a", "b"), set("a", "b"))).toBe(false);
  });

  it("is false when both are empty", () => {
    expect(isDirty(set(), set())).toBe(false);
  });

  it("is true when a member has been marked present", () => {
    expect(isDirty(set("a"), set("a", "b"))).toBe(true);
  });

  it("is true when a member has been unmarked", () => {
    expect(isDirty(set("a", "b"), set("a"))).toBe(true);
  });

  it("is true when the count matches but the members differ", () => {
    expect(isDirty(set("a", "b"), set("a", "c"))).toBe(true);
  });
});

describe("autosaveAction", () => {
  it("saves when there are changes and nothing is in flight", () => {
    expect(autosaveAction({ dirty: true, inFlight: false })).toBe("save");
  });

  it("waits when there is nothing to save", () => {
    expect(autosaveAction({ dirty: false, inFlight: false })).toBe("wait");
  });

  // The coalescing rule that stops a burst of taps opening a request per tap.
  // The save in flight is stale the moment this returns "wait", so the caller
  // MUST re-check when it lands or the last taps are never persisted.
  it("waits while a save is already in flight, even with newer changes", () => {
    expect(autosaveAction({ dirty: true, inFlight: true })).toBe("wait");
  });
});
