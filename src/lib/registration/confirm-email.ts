/** The outcome the registration RPC reported. */
export type RegistrationStatus = "registered" | "submitted" | "waitlisted";

export interface RegistrationMail {
  subject: string;
  /** Label → value rows the shared email template renders above the body. */
  details: { label: string; value: string }[];
  body: string;
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
}): RegistrationMail {
  const { status, eventTitle, when, venue, teamName, position } = input;

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
      body: `Your team's application is in. The organisers will let you know if you're shortlisted. ${team}`,
    };
  }
  if (status === "waitlisted") {
    return {
      subject: `You're on the waitlist — ${eventTitle}`,
      details,
      body: `The event is full, so your team is on the waitlist. If a seat opens up you'll be told automatically — there's nothing to do in the meantime. ${team}`,
    };
  }
  return {
    subject: `You're registered — ${eventTitle}`,
    details,
    body: `Your seat is confirmed. ${team}`,
  };
}
