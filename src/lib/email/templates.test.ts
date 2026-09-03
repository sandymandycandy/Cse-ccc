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

  it("wraps the fallback URL in its own anchor (button + link) so clients don't re-linkify/split it", () => {
    const { html } = renderEmail("member_login_link", "Set up your login", "Asha", {
      inviteUrl: "https://x.test/a?token=abc",
    });
    // The URL appears as an href twice: the Open button AND the fallback link.
    const hrefs = html.match(/href="https:\/\/x\.test\/a\?token=abc"/g) ?? [];
    expect(hrefs.length).toBe(2);
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

describe("renderEmail — details + body (contact query notifications)", () => {
  const q = {
    details: [
      { label: "From", value: "Tarun S" },
      { label: "Reply to", value: "vtu28651@veltech.edu.in" },
    ],
    body: "Can a team of two enter?",
  };

  it("renders each detail's label and value", () => {
    const { html } = renderEmail("contact_query", "New query", "Asha", q);
    expect(html).toContain("From");
    expect(html).toContain("Tarun S");
    expect(html).toContain("Reply to");
    expect(html).toContain("vtu28651@veltech.edu.in");
  });

  it("renders the body so the query is actually readable in the mail", () => {
    const { html, text } = renderEmail("contact_query", "New query", "Asha", q);
    expect(html).toContain("Can a team of two enter?");
    expect(text).toContain("Can a team of two enter?");
  });

  it("puts the details in the plain-text part too", () => {
    const { text } = renderEmail("contact_query", "New query", null, q);
    expect(text).toContain("From: Tarun S");
    expect(text).toContain("Reply to: vtu28651@veltech.edu.in");
  });

  it("ESCAPES the body — it is public user input, never markup", () => {
    const { html } = renderEmail("contact_query", "New query", "A", {
      body: "<img src=x onerror=alert(1)>",
    });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("escapes detail labels and values as well", () => {
    const { html } = renderEmail("contact_query", "New query", "A", {
      details: [{ label: "<b>L</b>", value: "<script>alert(1)</script>" }],
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>L</b>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("ignores malformed details instead of throwing", () => {
    expect(() => renderEmail("t", "s", "a", { details: "nope" })).not.toThrow();
    expect(() => renderEmail("t", "s", "a", { details: [null, 7, {}] })).not.toThrow();
    const { html } = renderEmail("t", "s", "a", { details: [{ label: "", value: "x" }] });
    expect(html).not.toContain(">x<");
  });

  it("renders a detail with a missing value as an empty cell, not \"undefined\"", () => {
    const { text } = renderEmail("t", "s", "a", { details: [{ label: "Subject" }] });
    expect(text).toContain("Subject: ");
    expect(text).not.toContain("undefined");
  });

  it("still renders nothing extra when neither key is present", () => {
    const { html } = renderEmail("event_updated", "Updated", "A", { title: "X" });
    expect(html).not.toContain("border-left:3px solid");
  });
});

describe("renderEmail — custom button label (participant broadcasts)", () => {
  const url = "https://chat.whatsapp.com/AbCdEf";

  it('labels the button with payload.linkLabel instead of "Open"', () => {
    const { html, text } = renderEmail("event_broadcast", "Join the group", null, {
      url, linkLabel: "Join the WhatsApp group",
    });
    expect(html).toContain("Join the WhatsApp group");
    expect(text).toContain("Join the WhatsApp group:");
    expect(html).not.toContain(">Open<");
  });

  it('falls back to "Open" when no label is given', () => {
    const { html } = renderEmail("event_broadcast", "Update", null, { url });
    expect(html).toContain(">Open<");
  });

  it("falls back when the label is blank or only whitespace", () => {
    expect(renderEmail("event_broadcast", "U", null, { url, linkLabel: "   " }).html)
      .toContain(">Open<");
  });

  it("escapes the label — an admin types it and it lands in HTML", () => {
    const { html } = renderEmail("event_broadcast", "U", null, {
      url, linkLabel: '<script>alert(1)</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("caps an absurdly long label so it cannot blow up the button", () => {
    const { html } = renderEmail("event_broadcast", "U", null, {
      url, linkLabel: "x".repeat(200),
    });
    expect(html).not.toContain("x".repeat(61));
  });

  it("ignores a non-string label rather than throwing", () => {
    expect(() => renderEmail("event_broadcast", "U", null, { url, linkLabel: 42 })).not.toThrow();
    expect(renderEmail("event_broadcast", "U", null, { url, linkLabel: 42 }).html).toContain(">Open<");
  });
});
