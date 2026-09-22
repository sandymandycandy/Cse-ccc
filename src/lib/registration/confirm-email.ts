import { isGroupLink } from "./whatsapp";

/** The outcome the registration RPC reported. */
export type RegistrationStatus = "registered" | "submitted" | "waitlisted";

/** A link the mail renders: the button, or the quieter line under it. */
export interface MailLink {
  url: string;
  label: string;
}

export interface RegistrationMail {
  subject: string;
  /** Label → value rows the shared email template renders above the body. */
  details: { label: string; value: string }[];
  body: string;
  /** The primary button, or null when there is nowhere to send them. */
  link: MailLink | null;
  /** Rendered under the button; only ever set when `link` is. */
  secondary: MailLink | null;
}

/**
 * What a registrant — and every one of their teammates — is told when a
 * registration lands.
 *
 * Pure so the wording can be tested without sending anything: `enqueueEmail`
 * attempts immediate delivery, so an end-to-end "try it and see" against this
 * project's live database would mail real students.
 *
 * The three outcomes must not be blurred together. "Registered" holds a seat;
 * "submitted" is shortlist mode, where a human still chooses and nothing is
 * promised; "waitlisted" holds no seat at all. Saying "you're registered" to a
 * waitlisted student would be a lie they act on.
 */
export function registrationMail(input: {
  status: RegistrationStatus;
  eventTitle: string;
  when: string;
  venue: string;
  teamName: string | null;
  position: number | null;
  /** The event's group-chat invite, when the organisers set one. */
  group?: string | null;
  /** Absolute URL of the public event page; absent if the site URL isn't set. */
  eventUrl?: string | null;
}): RegistrationMail {
  const { status, eventTitle, when, venue, teamName, position, eventUrl } = input;

  // Re-checked here rather than trusted: this value came out of the database,
  // and the mail is HTML we send to students.
  const group = isGroupLink(input.group) ? input.group.trim() : null;

  // The group is what they have to act on, so it takes the button and the event
  // page drops to the quieter line beneath it.
  const link: MailLink | null = group
    ? { url: group, label: "Join the WhatsApp group" }
    : eventUrl
      ? { url: eventUrl, label: "View the event" }
      : null;
  const secondary: MailLink | null =
    group && eventUrl ? { url: eventUrl, label: "View the event page" } : null;

  // Said in the body as well as on the button, because a mail client that
  // strips the button would otherwise leave no trace of the group.
  const join = group ? " Join the event's WhatsApp group with the button below — that's where updates go." : "";

  const details: { label: string; value: string }[] = [
    { label: "Event", value: eventTitle },
  ];
  if (when.trim()) details.push({ label: "When", value: when });
  if (venue.trim()) details.push({ label: "Where", value: venue });
  if (teamName?.trim()) details.push({ label: "Team", value: teamName });
  if (status === "waitlisted" && position != null) {
    details.push({ label: "Waitlist position", value: String(position) });
  }

  // Every recipient gets the same text, and most of them never filled the form —
  // so it says outright that this is about their team's entry.
  const team = "You're getting this because you're on the team that registered.";

  if (status === "submitted") {
    return {
      subject: `Application received — ${eventTitle}`,
      details,
      body: `Your team's application is in. The organisers will let you know if you're shortlisted. ${team}${join}`,
      link,
      secondary,
    };
  }
  if (status === "waitlisted") {
    return {
      subject: `You're on the waitlist — ${eventTitle}`,
      details,
      body: `The event is full, so your team is on the waitlist. If a seat opens up you'll be told automatically — there's nothing to do in the meantime. ${team}${join}`,
      link,
      secondary,
    };
  }
  return {
    subject: `You're registered — ${eventTitle}`,
    details,
    body: `Your seat is confirmed. ${team}${join}`,
    link,
    secondary,
  };
}
