import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WhatsAppInvite } from "./WhatsAppInvite";

const url = "https://chat.whatsapp.com/ABCdef123";
const render = (over: Partial<Parameters<typeof WhatsAppInvite>[0]> = {}) =>
  renderToStaticMarkup(<WhatsAppInvite url={url} onClose={() => {}} {...over} />);

describe("WhatsAppInvite", () => {
  it("links to the group", () => {
    expect(render()).toContain(`href="${url}"`);
  });

  it("opens the group in a new tab without leaking the referrer", () => {
    const anchor = render().match(new RegExp(`<a[^>]*href="${url}"[^>]*>`))?.[0] ?? "";
    expect(anchor).toContain('target="_blank"');
    expect(anchor).toContain("noopener");
    expect(anchor).toContain("noreferrer");
  });

  it("says what the button does", () => {
    expect(render()).toContain("Join the WhatsApp group");
  });

  it("is a labelled modal dialog for screen readers", () => {
    const html = render();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-labelledby="[^"]+"/);
  });

  it("shows the raw link, so it can be copied when the button cannot be tapped", () => {
    expect(render()).toContain(url);
  });

  it("offers a way out that is not the group", () => {
    expect(render()).toMatch(/Maybe later|Close/i);
  });

  it("renders nothing when the link is not safe to open", () => {
    expect(render({ url: "javascript:alert(1)" })).toBe("");
    expect(render({ url: "http://chat.whatsapp.com/x" })).toBe("");
  });

  it("renders nothing without a link", () => {
    expect(render({ url: null })).toBe("");
  });
});
