import { isGroupLink } from "@/lib/registration/whatsapp";

/**
 * What the register panel becomes once the POST has come back — the one thing
 * the student reads to know where they stand.
 *
 * The three landing outcomes must stay distinguishable: a shortlist submission
 * promises nothing, and a waitlisted entry holds no seat. Saying "your spot is
 * confirmed" to either would be a lie they plan their day around.
 */
export function ResultMessage({
  status,
  mode,
  position,
  group,
}: {
  status: string;
  mode: "seats" | "shortlist";
  position?: number | null;
  /** The event's group chat, when it has one and this outcome is offered it. */
  group?: string | null;
}) {
  // Kept alongside the pop-up on purpose: dismissing a dialog should not be
  // the same thing as losing the link.
  const safe = isGroupLink(group) ? group.trim() : null;
  const join = safe ? (
    <p style={{ marginTop: 12 }}>
      <a className="btn btn-sm" href={safe} target="_blank" rel="noopener noreferrer">
        Join the WhatsApp group
      </a>
    </p>
  ) : null;

  if (status === "registered" || status === "submitted") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>{mode === "shortlist" ? "Submitted ✓" : "You're registered ✓"}</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          {mode === "shortlist"
            ? "Thanks — the club will review submissions and email you if you're selected."
            : "Your spot is confirmed. See you there!"}
        </p>
        {join}
      </div>
    );
  }
  if (status === "waitlisted") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>You&rsquo;re on the waitlist</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          {typeof position === "number" ? `You're #${position} in line. ` : ""}
          This event is full — the organiser may pull you in if a seat opens up.
        </p>
        {join}
      </div>
    );
  }
  if (status === "full") {
    return (
      <div>
        <h3 style={{ fontSize: 22 }}>This event is full</h3>
        <p className="body-text" style={{ marginTop: 8 }}>
          Every seat is taken and there is no waitlist, so we couldn&rsquo;t register you. Your
          answers were not saved.
        </p>
      </div>
    );
  }
  return (
    <div>
      <h3 style={{ fontSize: 22 }}>Already registered</h3>
      <p className="body-text" style={{ marginTop: 8 }}>
        You&rsquo;ve already submitted this form for this event.
      </p>
      {join}
    </div>
  );
}
