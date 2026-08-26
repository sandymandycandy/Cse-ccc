import { describe, it, expect } from "vitest";
import { renderEmail } from "./templates";

describe("renderEmail", () => {
  it("renders an action button from inviteUrl", () => {
    const { html, text } = renderEmail("member_login_link", "Set up your login", "Asha", {
      inviteUrl: "https://x.test/member/accept-invite?token=abc",
    });
    expect(html).toContain("https://x.test/member/accept-invite?token=abc");
    expect(text).toContain("https://x.test/member/accept-invite?token=abc");
  });

  it("also detects confirmUrl", () => {
    const { html } = renderEmail("registration_received", "Confirm your seat", "A", {
      confirmUrl: "https://x.test/registrations/confirm?t=1",
    });
    expect(html).toContain("https://x.test/registrations/confirm?t=1");
  });

  it("has no action link when the payload carries no url", () => {
    const { html } = renderEmail("event_updated", "Updated: Hackathon", "A", { title: "Hackathon" });
    expect(html).not.toContain('href="http');
  });

  it("HTML-escapes the name and subject (XSS guard)", () => {
    const { html } = renderEmail("t", "<script>alert(1)</script>", "<b>x</b>", null);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("ignores a non-http(s) url (no javascript: scheme)", () => {
    const { html } = renderEmail("t", "s", "a", { url: "javascript:alert(1)" });
    expect(html).not.toContain("javascript:");
  });

  it("never throws on an unknown template or null payload", () => {
    expect(() => renderEmail("totally-unknown", "s", null, null)).not.toThrow();
  });
});
