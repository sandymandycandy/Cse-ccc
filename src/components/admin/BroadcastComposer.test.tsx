import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/admin/(app)/email/actions", () => ({
  sendBroadcastAction: vi.fn(),
  previewAudienceAction: vi.fn(),
}));

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
  council: 26,
  councilTotal: 32,
  overlapHeadsCouncil: 23,
  officeBearers: 6,
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

  // 26 reachable of 32 (the live numbers) is what decides whether to chase the
  // missing six before sending, so it cannot be dropped in the restyle.
  it("keeps the count of council members with no address on file", () => {
    expect(compose()).toContain("6 of 32 have no address on file");
  });

  /**
   * ⚠️ `heads` and `council` are different tables describing largely the same
   * humans, and both currently read "26 addresses". Shown bare they look
   * interchangeable; they are not, and sending to each in turn mails 23 people
   * the same thing twice. Each card names its source, and both state the
   * overlap.
   */
  it("distinguishes the two lists that both happen to count 26", () => {
    const html = compose();
    expect(html).toContain("from the admin accounts");
    expect(html).toContain("from the public council roster");
    expect(html).toContain("23 are also club heads");
    expect(html).toContain("23 are also on the council roster");
  });

  it("says nothing about an overlap when there is none", () => {
    const html = compose({ counts: { ...counts, overlapHeadsCouncil: 0 } });
    expect(html).not.toContain("are also club heads");
    expect(html).not.toContain("are also on the council roster");
    expect(html).toContain("from the admin accounts");
  });

  // Layer 2 had no audience at all before this: `heads` is club_head+vice_head
  // (layer 3) and `council` reads the separate council_members roster, so the
  // office-bearers could not be mailed as a group.
  it("offers layer 2, and names the layers so the two are not confused", () => {
    const html = compose();
    expect(html).toContain("Council office-bearers — layer 2");
    expect(html).toContain("Club heads and vice heads — layer 3");
    expect(html).toContain("6 people");
  });

  it("offers typed addresses to the council, and to nobody else", () => {
    expect(compose()).toContain("Specific addresses");
    expect(compose({ councilWide: false })).not.toContain("Specific addresses");
  });

  it("offers to show who is in the chosen audience", () => {
    expect(compose()).toContain("See who gets it");
  });

  // Every audience card posts its exclusions through the picker, so the field
  // has to be there whichever one is chosen.
  it("posts an exclude field from whichever audience is chosen", () => {
    expect(compose()).toContain('name="exclude"');
    expect(compose({ councilWide: false })).toContain('name="exclude"');
  });

  it("hides the council audiences from a club-scoped admin", () => {
    const html = compose({ councilWide: false });
    expect(html).not.toContain("All club members");
    expect(html).not.toContain("Club heads and vice heads");
    expect(html).toContain("236 addresses");
  });

  // Layer 2 is listed first but is NOT the default. The common send is the 26
  // heads, and STATUS.md's own deploy note says to start there rather than with
  // a bigger list — so adding an audience above it must not change what a
  // distracted sender gets by pressing Send without choosing.
  it("still starts on the heads for the council, and on their own club otherwise", () => {
    expect(chosen(compose())).toBe("Club heads and vice heads — layer 3");
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

  it("shows no field complaints on a form nobody has submitted", () => {
    expect(compose()).not.toContain("field-err");
    expect(compose()).not.toContain("aria-invalid");
  });
});
