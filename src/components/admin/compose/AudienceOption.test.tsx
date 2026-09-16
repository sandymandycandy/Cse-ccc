import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AudienceOption } from "./AudienceOption";

describe("AudienceOption", () => {
  it("posts the value under the given field name", () => {
    const html = renderToStaticMarkup(
      <AudienceOption name="kind" value="heads" checked title="Club heads" />,
    );
    expect(html).toContain('name="kind"');
    expect(html).toContain('value="heads"');
    expect(html).toContain('type="radio"');
  });

  // The selected card is styled off this attribute rather than :has(), so the
  // highlight follows React's state exactly and can be asserted here.
  it("marks the chosen card so the styling has something to hang on", () => {
    const on = renderToStaticMarkup(
      <AudienceOption name="kind" value="heads" checked title="Club heads" />,
    );
    const off = renderToStaticMarkup(
      <AudienceOption name="kind" value="heads" checked={false} title="Club heads" />,
    );
    expect(on).toContain('data-checked="true"');
    expect(off).not.toContain('data-checked="true"');
  });

  it("puts the count on its own line instead of trailing the title", () => {
    const html = renderToStaticMarkup(
      <AudienceOption
        name="kind"
        value="council"
        checked
        title="Council members"
        detail="24 — 3 have no address on file"
      />,
    );
    expect(html).toContain("Council members");
    expect(html).toContain("3 have no address on file");
    expect(html).toContain("audience-detail");
  });

  it("reveals its nested fields only while it is the chosen one", () => {
    const shown = renderToStaticMarkup(
      <AudienceOption name="kind" value="club_members" checked title="One club">
        <select name="clubId" />
      </AudienceOption>,
    );
    const hidden = renderToStaticMarkup(
      <AudienceOption name="kind" value="club_members" checked={false} title="One club">
        <select name="clubId" />
      </AudienceOption>,
    );
    expect(shown).toContain('name="clubId"');
    expect(hidden).not.toContain('name="clubId"');
  });

  // A <select> inside the <label> would toggle the radio when opened, and would
  // give the label two controls to be "for". The card is the wrapper; the label
  // must close before the nested fields begin.
  it("keeps the nested fields outside the label", () => {
    const html = renderToStaticMarkup(
      <AudienceOption name="kind" value="event" checked title="An event">
        <select name="eventId" />
      </AudienceOption>,
    );
    expect(html.indexOf("</label>")).toBeLessThan(html.indexOf('name="eventId"'));
  });
});
