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
    <BroadcastForm eventId="e1" confirmedAddresses={18} allAddresses={24} {...over} />,
  );

describe("BroadcastForm", () => {
  it("shows both audiences with the addresses each one reaches", () => {
    const html = form();
    expect(html).toContain("Confirmed participants");
    expect(html).toContain("18 addresses");
    expect(html).toContain("Everyone, including the waitlist");
    expect(html).toContain("24 addresses");
  });

  it("counts a single address in the singular", () => {
    expect(form({ confirmedAddresses: 1 })).toContain("1 address<");
  });

  it("lays out recipients and message as two numbered panels", () => {
    const html = form();
    expect(html).toContain("broadcast-workspace");
    expect(html).toMatch(/broadcast-step">01<[\s\S]*Choose recipients/);
    expect(html).toMatch(/broadcast-step">02<[\s\S]*Write your message/);
  });

  // Mail cannot be recalled, so the button says how many it is about to reach.
  it("names the default audience's address count on the send button", () => {
    expect(form()).toContain("Send to 18 addresses");
    expect(form({ confirmedAddresses: 1 })).toContain("Send to 1 address<");
  });

  it("does not offer to send to nobody", () => {
    expect(form({ confirmedAddresses: 0 })).toMatch(/<button type="submit"[^>]*disabled/);
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
