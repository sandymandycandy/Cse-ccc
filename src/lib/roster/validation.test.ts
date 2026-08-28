import { describe, it, expect } from "vitest";
import { validateRegistration, validatePhoto, MAX_PHOTO_BYTES } from "./validation";

const good = { name: "Asha Rao", roll: "12345", email: "vtu12345@veltech.edu.in", phone: "9876543210" };

describe("validateRegistration", () => {
  it("accepts a well-formed submission and normalizes email to lower-case", () => {
    const r = validateRegistration({ ...good, email: "VTU12345@Veltech.edu.in" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.email).toBe("vtu12345@veltech.edu.in");
  });
  it("rejects a roll that is not exactly 5 digits", () => {
    expect(validateRegistration({ ...good, roll: "1234" }).ok).toBe(false);
    expect(validateRegistration({ ...good, roll: "123456" }).ok).toBe(false);
    expect(validateRegistration({ ...good, roll: "12a45" }).ok).toBe(false);
  });
  it("rejects a non-veltech email", () => {
    expect(validateRegistration({ ...good, email: "asha@gmail.com" }).ok).toBe(false);
  });
  it("rejects when the email digits do not match the roll", () => {
    const r = validateRegistration({ ...good, email: "vtu99999@veltech.edu.in" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBeTruthy();
  });
  it("rejects a phone that is not exactly 10 digits", () => {
    expect(validateRegistration({ ...good, phone: "+919876543210" }).ok).toBe(false);
    expect(validateRegistration({ ...good, phone: "98765" }).ok).toBe(false);
  });
  it("rejects a short name", () => {
    expect(validateRegistration({ ...good, name: "A" }).ok).toBe(false);
  });
});

describe("validatePhoto", () => {
  it("requires a photo", () => {
    expect(validatePhoto(null)).toBeTruthy();
    expect(validatePhoto({ size: 0, type: "image/png" })).toBeTruthy();
  });
  it("rejects a non-image type", () => {
    expect(validatePhoto({ size: 1000, type: "application/pdf" })).toBeTruthy();
  });
  it("rejects a photo over 200 KB", () => {
    expect(validatePhoto({ size: MAX_PHOTO_BYTES + 1, type: "image/jpeg" })).toBeTruthy();
  });
  it("accepts a valid photo", () => {
    expect(validatePhoto({ size: 1000, type: "image/jpeg" })).toBeNull();
  });
});
