import { describe, expect, it } from "vitest";
import { contactNotification, type ContactQuery } from "./notify-payload";

const base: ContactQuery = {
  name: "Tarun S",
  email: "vtu28651@veltech.edu.in",
  subject: "Question about Pitch Desk",
  message: "Can a team of two enter, or is three the minimum?",
  inboxUrl: "https://cse-ccc.vercel.app/admin/contact/abc",
};

describe("contactNotification", () => {
  it("leads the subject with the sender's own subject", () => {
    expect(contactNotification(base).subject).toBe("New query: Question about Pitch Desk");
  });

  it("falls back to the sender's name when they gave no subject", () => {
    expect(contactNotification({ ...base, subject: null }).subject).toBe("New query from Tarun S");
    expect(contactNotification({ ...base, subject: "   " }).subject).toBe("New query from Tarun S");
  });

  it("falls back again when the name is blank too", () => {
    expect(contactNotification({ ...base, subject: null, name: "  " }).subject).toBe(
      "New query from Someone",
    );
  });

  it("carries who to reply to, so the mail is actionable", () => {
    const { payload } = contactNotification(base);
    expect(payload.details).toEqual([
      { label: "From", value: "Tarun S" },
      { label: "Reply to", value: "vtu28651@veltech.edu.in" },
      { label: "Subject", value: "Question about Pitch Desk" },
    ]);
  });

  it("omits the subject row when there is none", () => {
    const { payload } = contactNotification({ ...base, subject: null });
    expect(payload.details).toEqual([
      { label: "From", value: "Tarun S" },
      { label: "Reply to", value: "vtu28651@veltech.edu.in" },
    ]);
  });

  it("quotes the message as the body", () => {
    expect(contactNotification(base).payload.body).toBe(
      "Can a team of two enter, or is three the minimum?",
    );
  });

  it("truncates a very long message rather than mailing 4000 characters", () => {
    const { payload } = contactNotification({ ...base, message: "x".repeat(5000) });
    const body = payload.body as string;
    expect(body).toHaveLength(2000);
    expect(body.endsWith("…")).toBe(true);
  });

  it("truncates a very long subject line", () => {
    const { subject } = contactNotification({ ...base, subject: "y".repeat(200) });
    expect(subject.length).toBeLessThanOrEqual("New query: ".length + 70);
    expect(subject.endsWith("…")).toBe(true);
  });

  it("passes the inbox link through as the template's action url", () => {
    expect(contactNotification(base).payload.url).toBe(
      "https://cse-ccc.vercel.app/admin/contact/abc",
    );
  });

  it("omits the url entirely when the origin is unknown", () => {
    expect(contactNotification({ ...base, inboxUrl: null }).payload).not.toHaveProperty("url");
    expect(contactNotification({ ...base, inboxUrl: undefined }).payload).not.toHaveProperty("url");
  });

  it("does not sanitise — the template escapes, so the raw text is preserved", () => {
    const { payload } = contactNotification({ ...base, message: "<script>alert(1)</script>" });
    expect(payload.body).toBe("<script>alert(1)</script>");
  });
});
