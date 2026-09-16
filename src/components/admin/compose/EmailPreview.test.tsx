import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailPreview, previewButtonLabel } from "./EmailPreview";

const preview = (over: Partial<Parameters<typeof EmailPreview>[0]> = {}) =>
  renderToStaticMarkup(
    <EmailPreview
      subject="Council meeting moved"
      message="We now meet on Friday."
      link=""
      linkLabel=""
      fallbackTarget="the council site"
      {...over}
    />,
  );

/**
 * The button's wording is decided in two other files — the action
 * (`linkLabel: link ? (typed || "Open link") : undefined`) and the template
 * (`linkLabel()`, which defaults to "Open"). The preview is only worth having
 * if it agrees with both, so the rule is pinned here.
 */
describe("previewButtonLabel", () => {
  it("uses what the admin typed", () => {
    expect(previewButtonLabel("https://chat.whatsapp.com/x", "Join the group")).toBe(
      "Join the group",
    );
  });

  it("falls back to 'Open link' when a link is given with no wording", () => {
    expect(previewButtonLabel("https://chat.whatsapp.com/x", "")).toBe("Open link");
    expect(previewButtonLabel("https://chat.whatsapp.com/x", "   ")).toBe("Open link");
  });

  // Without a link the action sends no linkLabel at all, so the template's own
  // default wins — "Open", not "Open link". The composer hint says otherwise.
  it("falls back to the template's 'Open' when there is no link", () => {
    expect(previewButtonLabel("", "Join the group")).toBe("Open");
    expect(previewButtonLabel("   ", "")).toBe("Open");
  });

  it("caps the label where the template caps it", () => {
    expect(previewButtonLabel("https://x.test/y", "x".repeat(80))).toHaveLength(60);
  });
});

describe("EmailPreview", () => {
  it("shows the subject and message as written", () => {
    const html = preview();
    expect(html).toContain("Council meeting moved");
    expect(html).toContain("We now meet on Friday.");
  });

  it("names where the button goes when no link is typed", () => {
    expect(preview()).toContain("the council site");
    expect(preview({ fallbackTarget: "the event page" })).toContain("the event page");
  });

  it("shows the typed link once one is given", () => {
    const html = preview({ link: "https://chat.whatsapp.com/abc", linkLabel: "Join" });
    expect(html).toContain("https://chat.whatsapp.com/abc");
    expect(html).toContain("Join");
  });

  it("stands in for an empty subject rather than rendering a blank heading", () => {
    expect(preview({ subject: "" })).toContain("No subject yet");
    expect(preview({ message: "" })).toContain("Nothing written yet");
  });

  // The greeting is filled per recipient by the template. Showing a made-up
  // name would imply the preview knows who it is addressed to.
  it("marks the greeting as something filled in per person", () => {
    expect(preview()).toContain("their name");
  });

  it("collapses by default, so it never pushes the send button off a phone", () => {
    expect(preview()).toContain("<details");
    expect(preview()).not.toContain("open=");
  });
});
