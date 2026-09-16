import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/admin/(app)/email/actions", () => ({ sendBroadcastAction: vi.fn() }));

const { BroadcastComposer } = await import("./BroadcastComposer");

/**
 * ⚠️ These render the composer's INITIAL state. `useActionState` hands back its
 * initial value under `renderToStaticMarkup`, so the sent/queued screens and
 * "Write another" cannot be reached from here, and neither can a click on a
 * different audience — those are covered by the CSS and by AudienceOption's
 * own tests, not by this file.
 */
const counts = {
  heads: 26,
  council: 24,
  councilTotal: 27,
  allMembers: 909,
  ownClubMembers: 236,
};

/** The title of whichever audience card is selected — asserted through the
 *  card's own marker rather than through React's attribute order. */
const chosen = (html: string) => {
  const at = html.indexOf('data-checked="true"');
  return at < 0 ? null : html.slice(at).match(/audience-title">([^<]*)</)?.[1] ?? null;
};

const compose = (over: Partial<Parameters<typeof BroadcastComposer>[0]> = {}) =>
  renderToStaticMarkup(
    <BroadcastComposer
      councilWide
      clubs={[{ id: "c1", name: "AI Forge" }]}
      events={[{ id: "e1", title: "Pitch Desk" }]}
      counts={counts}
      {...over}
    />,
  );

describe("BroadcastComposer", () => {
  it("offers the council-wide audiences with their counts", () => {
    const html = compose();
    expect(html).toContain("Club heads and vice heads");
    expect(html).toContain("26 addresses");
    expect(html).toContain("All club members");
    expect(html).toContain("909 addresses");
  });

  // 24 reachable of 27 is the number that decides whether to chase the missing
  // three before sending, so it cannot be dropped in the restyle.
  it("keeps the count of council members with no address on file", () => {
    expect(compose()).toContain("3 have no address on file");
  });

  it("hides the council audiences from a club-scoped admin", () => {
    const html = compose({ councilWide: false });
    expect(html).not.toContain("All club members");
    expect(html).not.toContain("Club heads and vice heads");
    expect(html).toContain("236 addresses");
  });

  it("starts on heads for the council and on their own club for everyone else", () => {
    expect(chosen(compose())).toBe("Club heads and vice heads");
    expect(chosen(compose({ councilWide: false }))).toBe("One club’s members");
  });

  // The club and event pickers are `required`. Rendering them while a different
  // audience is chosen would block the form on a field nobody can see.
  it("renders a picker only for the chosen audience", () => {
    const council = compose();
    expect(council).not.toContain('name="clubId"');
    expect(council).not.toContain('name="eventId"');

    const ownClub = compose({ councilWide: false });
    expect(ownClub).toContain('name="clubId"');
    expect(ownClub).not.toContain('name="eventId"');
  });

  it("offers a preview of the mail, collapsed", () => {
    const html = compose();
    expect(html).toContain("Preview the email");
    expect(html).toContain("<details");
  });

  it("says where the button goes when no link is typed", () => {
    expect(compose()).toContain("the council site");
  });

  it("keeps the character counts out of the way of an empty form", () => {
    expect(compose()).not.toContain("counter");
  });
});
