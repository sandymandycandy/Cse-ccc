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
