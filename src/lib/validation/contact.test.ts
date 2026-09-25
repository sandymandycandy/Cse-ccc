import { describe, it, expect } from "vitest";
import { ContactSchema } from "./contact";

const valid = {
  name: "Asha Rao",
  email: "Asha@Example.com",
  phone: "9876543210",
  subject: "Question about the robotics club",
  message: "Hi, I'd like to know how to join the robotics club this semester.",
};

describe("ContactSchema", () => {
  it("accepts a well-formed message and normalises the email", () => {
    const parsed = ContactSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("asha@example.com");
  });

  it("treats subject as optional (empty string is fine)", () => {
    const parsed = ContactSchema.safeParse({ ...valid, subject: "" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing name, a bad email, or a too-short message", () => {
    expect(ContactSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(ContactSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
    expect(ContactSchema.safeParse({ ...valid, message: "hi" }).success).toBe(false);
  });

  it("requires a contact number of exactly 10 digits", () => {
    expect(ContactSchema.safeParse({ ...valid, phone: " 9876543210 " }).success).toBe(true);
    for (const phone of ["", "987654321", "98765432101", "98765 43210", "+919876543210", "98765abcde"]) {
      expect(ContactSchema.safeParse({ ...valid, phone }).success).toBe(false);
    }
    expect(ContactSchema.safeParse({ ...valid, phone: undefined }).success).toBe(false);
  });

  it("rejects a filled honeypot (website must be empty)", () => {
    expect(ContactSchema.safeParse({ ...valid, website: "http://spam" }).success).toBe(false);
  });

  it("rejects unknown keys (.strict)", () => {
    expect(ContactSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });
});
