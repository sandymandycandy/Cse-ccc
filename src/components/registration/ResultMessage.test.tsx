import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultMessage } from "./ResultMessage";

const url = "https://chat.whatsapp.com/ABCdef123";
const render = (over: Partial<Parameters<typeof ResultMessage>[0]> = {}) =>
  renderToStaticMarkup(<ResultMessage status="registered" mode="seats" {...over} />);

describe("ResultMessage", () => {
  it("confirms a seat", () => {
    expect(render()).toContain("You&#x27;re registered");
  });

  it("does not promise a seat in shortlist mode", () => {
    const html = render({ status: "submitted", mode: "shortlist" });
    expect(html).toContain("Submitted");
    expect(html).not.toContain("spot is confirmed");
  });

  it("gives the waitlist position", () => {
    expect(render({ status: "waitlisted", position: 4 })).toContain("#4");
  });

  it("keeps the group link on the page once the pop-up is dismissed", () => {
    const html = render({ group: url });
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain("Join the WhatsApp group");
  });

  it("shows the group link to a waitlisted entry too", () => {
    expect(render({ status: "waitlisted", position: 2, group: url })).toContain(`href="${url}"`);
  });

  it("shows no group link when the event has none", () => {
    expect(render()).not.toContain("WhatsApp");
  });

  it("renders no link for a stored value that is not safe to open", () => {
    expect(render({ group: "javascript:alert(1)" })).not.toContain("javascript:");
  });

  it("tells a repeat visitor they already registered", () => {
    expect(render({ status: "duplicate" })).toContain("Already registered");
  });
});

describe("ResultMessage — a full event", () => {
  it("says it is full, not 'Already registered'", () => {
    const html = render({ status: "full" });
    expect(html).toContain("This event is full");
    expect(html).not.toContain("Already registered");
  });
});
