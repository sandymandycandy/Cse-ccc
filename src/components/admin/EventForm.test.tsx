import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EventForm, type EventFormInitial } from "./EventForm";
import type { EventFormState } from "@/lib/admin/form-state";

const noop = async (): Promise<EventFormState> => ({});
const clubs = [{ id: "11111111-1111-1111-1111-111111111111", name: "Coding Club" }];

const initial = (over: Partial<EventFormInitial> = {}): EventFormInitial => ({
  title: "PITCH DESK",
  description: "",
  clubId: clubs[0].id,
  cohostIds: [],
  venueText: "",
  startsAtLocal: "2026-10-01T10:00",
  endsAtLocal: "2026-10-01T12:00",
  capacity: "",
  posterUrl: null,
  selectionMode: "seats",
  registrationForm: "",
  registrationOpensAtLocal: "",
  registrationClosesAtLocal: "",
  waitlistEnabled: false,
  showOnAchievements: false,
  whatsappUrl: "",
  ...over,
});

const render = (over: Partial<Parameters<typeof EventForm>[0]> = {}) =>
  renderToStaticMarkup(<EventForm action={noop} clubs={clubs} fixedClub={null} {...over} />);

/** The whole <input> tag for a field, so assertions don't depend on attribute order. */
const inputFor = (html: string, name: string) =>
  html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? null;

describe("EventForm — the event's WhatsApp group", () => {
  it("offers a field for the group link", () => {
    expect(inputFor(render(), "whatsappUrl")).not.toBeNull();
  });

  it("is optional — most events never have a group", () => {
    expect(inputFor(render(), "whatsappUrl")).not.toContain("required");
  });

  it("says where the link ends up, since nobody would guess", () => {
    expect(render()).toMatch(/pop-up|confirmation email/i);
  });

  it("prefills the saved link when editing", () => {
    const html = render({
      eventId: "e1",
      initial: initial({ whatsappUrl: "https://chat.whatsapp.com/ABCdef123" }),
    });
    expect(inputFor(html, "whatsappUrl")).toContain('value="https://chat.whatsapp.com/ABCdef123"');
  });
});

/**
 * The tabbed rewrite. The thing most worth pinning is that splitting the form
 * across panels did not cost it any fields: every input must still be in the
 * markup — and therefore in the FormData — while its tab is closed.
 */
describe("EventForm — five tabs, one form", () => {
  it("offers a tab per section, numbered", () => {
    const html = render();
    for (const label of ["Basics", "When &amp; where", "Registration", "Form", "Cover"]) {
      expect(html).toContain(label);
    }
    for (const n of ["01", "02", "03", "04", "05"]) expect(html).toContain(`>${n}<`);
  });

  it("opens on Basics and hides the other four panels", () => {
    const html = render();
    const panel = (id: string) =>
      html.match(new RegExp(`<div[^>]*id="ef-panel-${id}"[^>]*>`))?.[0] ?? "";
    expect(panel("basics")).not.toContain("hidden");
    for (const id of ["when", "registration", "form", "cover"]) {
      expect(panel(id)).toContain("hidden");
    }
  });

  it("keeps every field in the form while its tab is closed", () => {
    const html = render();
    // One from each of the four panels that start hidden — if `hidden` ever
    // became an unmount, saving from Basics would silently wipe these.
    for (const name of ["venueText", "startsAt", "capacity", "whatsappUrl", "registrationForm"]) {
      expect(html).toContain(`name="${name}"`);
    }
  });

  it("turns off browser validation, which cannot report a hidden field", () => {
    expect(render()).toMatch(/<form[^>]*noValidate/i);
  });

  it("marks exactly the tabs that still want something", () => {
    // A brand-new event: Basics wants a title, When a venue, Registration a
    // closing time. The Form tab starts with the six default questions and the
    // Cover is never outstanding — so three amber, two green.
    const html = render();
    expect(html.match(/data-gap="true"/g) ?? []).toHaveLength(3);
    expect(html.match(/data-gap="false"/g) ?? []).toHaveLength(2);
  });

  it("says what a tab is waiting for", () => {
    expect(render()).toContain("Still needs a title");
  });

  it("reports nothing outstanding once the event is filled in", () => {
    const html = render({
      eventId: "e1",
      initial: initial({
        venueText: "Seminar Hall",
        description: "A pitching contest.",
        registrationClosesAtLocal: "2026-09-30T23:59",
      }),
    });
    expect(html).not.toContain("data-gap=\"true\"");
  });

  it("reads back how long the event runs", () => {
    const html = render({ eventId: "e1", initial: initial() });
    expect(html).toContain("2 hours");
    expect(html).toContain("Runs for");
  });

  it("offers the two registration modes as cards", () => {
    const html = render();
    expect(html).toContain("First come, capacity-limited.");
    expect(html).toContain("Collect everyone, you pick later.");
    expect(html).toContain('value="seats"');
    expect(html).toContain('value="shortlist"');
  });

  it("links to the live event only when there is one to link to", () => {
    expect(render({ eventId: "e1", initial: initial() })).toContain("View event");
    expect(render()).not.toContain("View event");
  });
});
