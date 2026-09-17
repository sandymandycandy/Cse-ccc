import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/admin/(app)/events/[id]/email/actions", () => ({ broadcastAction: vi.fn() }));

const { BroadcastForm } = await import("./BroadcastForm");

/** As in BroadcastComposer.test.tsx: initial render only — `useActionState`
 *  yields its initial value here, so the sent screen is out of reach. */
/** The title of whichever audience card is selected — asserted through the
 *  card's own marker rather than through React's attribute order. */
const chosen = (html: string) => {
  const at = html.indexOf('data-checked="true"');
  return at < 0 ? null : html.slice(at).match(/audience-title">([^<]*)</)?.[1] ?? null;
};

const form = (over: Partial<Parameters<typeof BroadcastForm>[0]> = {}) =>
  renderToStaticMarkup(
    <BroadcastForm eventId="e1" confirmedCount={18} allCount={24} {...over} />,
  );

describe("BroadcastForm", () => {
  it("shows both audiences with their entry counts", () => {
    const html = form();
    expect(html).toContain("Confirmed participants");
    expect(html).toContain("18 entries");
    expect(html).toContain("Everyone, including the waitlist");
    expect(html).toContain("24 entries");
  });

  it("counts a single entry in the singular", () => {
    expect(form({ confirmedCount: 1 })).toContain("1 entry");
  });

  it("defaults to the confirmed list, not the waitlist", () => {
    expect(chosen(form())).toBe("Confirmed participants");
  });

  // A team entry is several addresses, so the count above is entries, not
  // people — dropping this line would make the number read as recipients.
  it("keeps the warning that an entry is more than one address", () => {
    expect(form()).toContain("Every member of each entry is emailed");
  });

  it("offers the reminder prefill only when there is a reminder to prefill", () => {
    expect(form()).not.toContain("Remind them it");
    const withReminder = form({
      reminder: { subject: "Pitch Desk is tomorrow", body: "Doors at 9." },
    });
    expect(withReminder).toContain("Remind them it");
  });

  it("previews the mail and names the button's default destination", () => {
    const html = form();
    expect(html).toContain("Preview the email");
    expect(html).toContain("the event page");
  });

  it("carries the event id so the action knows what it is sending about", () => {
    expect(form()).toContain('name="eventId"');
    expect(form()).toContain('value="e1"');
  });
});
