"use client";

import { useActionState } from "react";
import { broadcastAction } from "@/app/admin/(app)/events/[id]/email/actions";
import type { BroadcastState } from "@/lib/admin/form-state";

const initial: BroadcastState = {};

/**
 * Compose and send a message to an event's participants.
 *
 * The recipient counts are computed on the server and shown on the button
 * itself, because "Send" on a mail that cannot be recalled should say who it is
 * about to reach before it is pressed.
 */
export function BroadcastForm({
  eventId,
  confirmedCount,
  allCount,
}: {
  eventId: string;
  confirmedCount: number;
  allCount: number;
}) {
  const [state, action, pending] = useActionState(broadcastAction, initial);

  if (state.sent != null) {
    return (
      <div className="note" style={{ marginTop: 18 }}>
        Sent to {state.sent} {state.sent === 1 ? "address" : "addresses"}. Delivery
        happens in the background — a failed send is retried automatically.
      </div>
    );
  }

  return (
    <form action={action} style={{ marginTop: 18, maxWidth: 640 }}>
      <input type="hidden" name="eventId" value={eventId} />

      {state.error ? (
        <div role="alert" className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="subject">Subject</label>
        <input id="subject" name="subject" required maxLength={120} placeholder="Venue has changed" />
      </div>

      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" rows={7} required maxLength={4000}
          placeholder="Write what participants need to know." />
        <span className="hint">Plain text. Everyone gets the same message.</span>
      </div>

      <div className="field">
        <label htmlFor="link">Link (optional)</label>
        <input id="link" name="link" type="url" maxLength={2000}
          placeholder="https://chat.whatsapp.com/…" />
        <span className="hint">
          Becomes a button in the email — a WhatsApp group, a submission form, a
          meeting link. Without one the button opens the event page. Pasting a
          link into the message itself does not make it clickable.
        </span>
      </div>

      <div className="field">
        <label htmlFor="linkLabel">Button text (optional)</label>
        <input id="linkLabel" name="linkLabel" maxLength={60}
          placeholder="Join the WhatsApp group" />
        <span className="hint">Defaults to &ldquo;Open link&rdquo;.</span>
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: "4px 0 18px" }}>
        <legend className="label" style={{ marginBottom: 8 }}>Who receives it</legend>
        <label style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
          <input type="radio" name="audience" value="confirmed" defaultChecked />
          <span>Confirmed participants — {confirmedCount} {confirmedCount === 1 ? "entry" : "entries"}</span>
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <input type="radio" name="audience" value="all" />
          <span>Everyone, including the waitlist — {allCount} {allCount === 1 ? "entry" : "entries"}</span>
        </label>
        <span className="hint" style={{ display: "block", marginTop: 8 }}>
          Every member of each entry is emailed, not only the person who registered.
        </span>
      </fieldset>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Send to participants"}
      </button>
    </form>
  );
}
