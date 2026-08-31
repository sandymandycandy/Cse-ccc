import { describe, it, expect } from "vitest";
import { validateCouncilRegistration } from "./validation";

const good = {
  name: "Asha Rao", roll: "21001", email: "vtu21001@veltech.edu.in",
  phone: "9876543210", designation: "Robotics Club Head",
};

describe("validateCouncilRegistration", () => {
  it("accepts a well-formed submission", () => {
    const r = validateCouncilRegistration(good);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.designation).toBe("Robotics Club Head");
  });

  it("requires a designation", () => {
    const r = validateCouncilRegistration({ ...good, designation: "  " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.designation).toBeTruthy();
  });

  it("reuses the roll↔email rule", () => {
    const r = validateCouncilRegistration({ ...good, email: "vtu99999@veltech.edu.in" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });

  it("rejects a bad phone", () => {
    const r = validateCouncilRegistration({ ...good, phone: "123" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBeTruthy();
  });
});
