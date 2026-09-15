"use client";

import { useActionState, useState } from "react";
import { sendBroadcastAction } from "@/app/admin/(app)/email/actions";
import type { ComposerState } from "@/lib/admin/form-state";

const initial: ComposerState = {};

/**
 * Compose a message and choose who gets it.
 *
 * The counts sit beside each audience because "Send" on a mail that cannot be
 * recalled should say who it is about to reach before it is pressed — and above
 * the inline threshold the server returns a confirmation instead of sending.
 */
export function BroadcastComposer({
  councilWide,
  clubs,
  events,
  counts,
}: {
  councilWide: boolean;
  clubs: { id: string; name: string }[];
  events: { id: string; title: string }[];
  counts: {
    heads: number;
    council: number;
    councilTotal: number;
    allMembers: number;
    ownClubMembers: number;
  };
}) {
  const [state, action, pending] = useActionState(sendBroadcastAction, initial);
  const [kind, setKind] = useState(councilWide ? "heads" : "club_members");

  if (state.sent != null) {
    return (
      <div className="note" style={{ marginTop: 18 }}>
        Sent to {state.sent} {state.sent === 1 ? "address" : "addresses"}. A failed
        send is retried automatically.
      </div>
    );
  }
  if (state.queued != null) {
    return (
      <div className="note" style={{ marginTop: 18 }}>
        Queued {state.queued} messages. Open the <a href="/admin/outbox">Outbox</a> to
        send them — Gmail takes roughly 500 a day, so a large send clears over
        more than one day.
      </div>
    );
  }

  return (
    <form action={action} style={{ marginTop: 18, maxWidth: 640 }}>
      {state.error ? (
        <div role="alert" className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      {state.confirm ? (
        <div role="alert" className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          <strong>This will email {state.confirm.count} people</strong> —{" "}
          {state.confirm.label.toLowerCase()}. Press send again to confirm.
          <input type="hidden" name="confirmed" value="1" />
        </div>
      ) : null}

      <fieldset style={{ border: 0, padding: 0, margin: "4px 0 18px" }}>
        <legend className="label" style={{ marginBottom: 8 }}>Who receives it</legend>

        {councilWide ? (
          <>
            <label style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
              <input type="radio" name="kind" value="heads"
                checked={kind === "heads"} onChange={() => setKind("heads")} />
              <span>Club heads and vice heads — {counts.heads}</span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
              <input type="radio" name="kind" value="council"
                checked={kind === "council"} onChange={() => setKind("council")} />
              <span>
                Council members — {counts.council}
                {counts.councilTotal > counts.council
                  ? ` (${counts.councilTotal - counts.council} have no address on file)`
                  : ""}
              </span>
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
              <input type="radio" name="kind" value="all_members"
                checked={kind === "all_members"} onChange={() => setKind("all_members")} />
              <span>All club members — {counts.allMembers}</span>
            </label>
          </>
        ) : null}

        <label style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
          <input type="radio" name="kind" value="club_members"
            checked={kind === "club_members"} onChange={() => setKind("club_members")} />
          <span>
            One club&rsquo;s members
            {!councilWide && counts.ownClubMembers > 0 ? ` — ${counts.ownClubMembers}` : ""}
          </span>
        </label>

        {kind === "club_members" ? (
          <div className="field" style={{ marginLeft: 26 }}>
            <label htmlFor="clubId">Club</label>
            <select id="clubId" name="clubId" required defaultValue={clubs[0]?.id ?? ""}>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : null}

        <label style={{ display: "flex", gap: 8, alignItems: "baseline", marginBottom: 6 }}>
          <input type="radio" name="kind" value="event"
            checked={kind === "event"} onChange={() => setKind("event")} />
          <span>An event&rsquo;s registrants</span>
        </label>

        {kind === "event" ? (
          <div style={{ marginLeft: 26 }}>
            {events.length === 0 ? (
              <p className="hint">No events to pick from yet.</p>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="eventId">Event</label>
                  <select id="eventId" name="eventId" required defaultValue={events[0]?.id ?? ""}>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>{e.title}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="scope">Which registrants</label>
                  <select id="scope" name="scope" defaultValue="confirmed">
                    <option value="confirmed">Confirmed only</option>
                    <option value="all">Everyone, including the waitlist</option>
                  </select>
                </div>
              </>
            )}
          </div>
        ) : null}
      </fieldset>

      <div className="field">
        <label htmlFor="subject">Subject</label>
        <input id="subject" name="subject" required maxLength={120}
          placeholder="Council meeting moved to Friday" />
      </div>

      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea id="message" name="message" rows={8} required maxLength={4000}
          placeholder="Write what they need to know." />
        <span className="hint">Plain text. Everyone gets the same message.</span>
      </div>

      <div className="field">
        <label htmlFor="link">Link (optional)</label>
        <input id="link" name="link" type="url" maxLength={2000}
          placeholder="https://chat.whatsapp.com/…" />
        <span className="hint">
          Becomes a button in the email. Pasting a link into the message itself
          does not make it clickable.
        </span>
      </div>

      <div className="field">
        <label htmlFor="linkLabel">Button text (optional)</label>
        <input id="linkLabel" name="linkLabel" maxLength={60}
          placeholder="Join the WhatsApp group" />
        <span className="hint">Defaults to &ldquo;Open link&rdquo;.</span>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : state.confirm ? "Yes, send it" : "Send"}
      </button>
    </form>
  );
}
