import { describe, it, expect } from "vitest";
import { canDeactivate, refusalMessage } from "./admin-status";

const A = "actor-1";
const B = "target-2";
const C = "target-3";

describe("canDeactivate", () => {
  it("allows deactivating another admin who holds no keys", () => {
    expect(canDeactivate(A, B, [A])).toEqual({ ok: true });
  });

  it("refuses self-deactivation", () => {
    // The invariant this protects: an actor can never remove their own access,
    // so removing someone always takes a second person and no one can lock
    // themselves out with one click.
    expect(canDeactivate(A, A, [A, B])).toEqual({ ok: false, reason: "self" });
  });

  it("refuses self-deactivation even when other keyholders remain", () => {
    expect(canDeactivate(A, A, [A, B, C])).toEqual({ ok: false, reason: "self" });
  });

  it("allows deactivating a keyholder while another stays active", () => {
    expect(canDeactivate(A, B, [A, B])).toEqual({ ok: true });
  });

  it("refuses deactivating the LAST active keyholder", () => {
    // Reachable only if the actor is not themselves a keyholder — which the
    // current call path prevents, since holding manage:admins is what lets you
    // press the button. Kept because the invariant matters more than the line:
    // zero active keyholders means admin management is bricked with no UI path
    // back, only direct database access.
    expect(canDeactivate(A, B, [B])).toEqual({ ok: false, reason: "last-keyholder" });
  });

  it("puts the self rule ahead of the keyholder rule", () => {
    // A sole keyholder deactivating themselves trips both; "self" is the more
    // useful thing to tell them.
    expect(canDeactivate(A, A, [A])).toEqual({ ok: false, reason: "self" });
  });

  it("never leaves zero active keyholders, however the buttons are pressed", () => {
    // Property check over the real call path: the actor always holds the
    // capability, so they are always in the keyholder list.
    let keyholders = [A, B, C];
    for (const target of [B, C, A]) {
      const r = canDeactivate(A, target, keyholders);
      if (r.ok) keyholders = keyholders.filter((k) => k !== target);
    }
    expect(keyholders).toEqual([A]);
    expect(keyholders.length).toBeGreaterThan(0);
  });
});

describe("refusalMessage", () => {
  it("explains each refusal in the reader's terms", () => {
    expect(refusalMessage("self")).toMatch(/your own/i);
    expect(refusalMessage("last-keyholder")).toMatch(/last/i);
  });

  it("never returns an empty string", () => {
    for (const r of ["self", "last-keyholder"] as const) {
      expect(refusalMessage(r).length).toBeGreaterThan(0);
    }
  });
});
