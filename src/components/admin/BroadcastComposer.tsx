"use client";

import { useActionState, useState } from "react";
import { sendBroadcastAction } from "@/app/admin/(app)/email/actions";
import type { ComposerState } from "@/lib/admin/form-state";
import { AudienceOption } from "./compose/AudienceOption";
import { CharCount } from "./compose/CharCount";
import { EmailPreview } from "./compose/EmailPreview";

const initial: ComposerState = {};

const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;

interface ComposerProps {
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
}

/**
 * Compose a message and choose who gets it.
 *
 * The counts sit on each audience because "Send" on a mail that cannot be
 * recalled should say who it is about to reach before it is pressed — and above
 * the inline threshold the server returns a confirmation instead of sending.
 */
export function BroadcastComposer(props: ComposerProps) {
  // "Write another" bumps this key, which remounts the form below. That is the
  // only way to clear the result: `useActionState` has no reset, so without a
  // remount the success screen is a dead end that only a page reload leaves.
  const [round, setRound] = useState(0);
  return (
    <ComposerForm
      key={round}
      {...props}
      onWriteAnother={() => setRound((r) => r + 1)}
    />
  );
}

function ComposerForm({
  councilWide,
  clubs,
  events,
  counts,
  onWriteAnother,
}: ComposerProps & { onWriteAnother: () => void }) {
  const [state, action, pending] = useActionState(sendBroadcastAction, initial);
  const [kind, setKind] = useState(councilWide ? "heads" : "club_members");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  if (state.sent != null) {
    return (
      <div className="compose">
        <div className="note">
          Sent to {state.sent} {state.sent === 1 ? "address" : "addresses"}. A failed
          send is retried automatically.
        </div>
        <div className="compose-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onWriteAnother}>
            Write another
          </button>
        </div>
      </div>
    );
  }

  if (state.queued != null) {
    return (
      <div className="compose">
        <div className="note">
          Queued {state.queued} messages. Open the <a href="/admin/outbox">Outbox</a> to
          send them — Gmail takes roughly 500 a day, so a large send clears over
          more than one day.
        </div>
        <div className="compose-actions" style={{ marginTop: 16 }}>
          <a className="btn btn-primary" href="/admin/outbox">
            Open the Outbox
          </a>
          <button type="button" className="btn btn-ghost" onClick={onWriteAnother}>
            Write another
          </button>
        </div>
      </div>
    );
  }

  const councilDetail =
    counts.councilTotal > counts.council
      ? `${counts.council} addresses · ${counts.councilTotal - counts.council} have no address on file`
      : `${counts.council} addresses`;

  return (
    <form action={action} className="compose">
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

      <fieldset className="audience">
        <legend className="label">Who receives it</legend>

        {councilWide ? (
          <>
            <AudienceOption
              name="kind"
              value="heads"
              checked={kind === "heads"}
              onChange={() => setKind("heads")}
              title="Club heads and vice heads"
              detail={`${counts.heads} ${counts.heads === 1 ? "address" : "addresses"}`}
            />
            <AudienceOption
              name="kind"
              value="council"
              checked={kind === "council"}
              onChange={() => setKind("council")}
              title="Council members"
              detail={councilDetail}
            />
            <AudienceOption
              name="kind"
              value="all_members"
              checked={kind === "all_members"}
              onChange={() => setKind("all_members")}
              title="All club members"
              detail={`${counts.allMembers} addresses`}
            />
          </>
        ) : null}

        <AudienceOption
          name="kind"
          value="club_members"
          checked={kind === "club_members"}
          onChange={() => setKind("club_members")}
          title="One club’s members"
          detail={
            !councilWide && counts.ownClubMembers > 0
              ? `${counts.ownClubMembers} addresses`
              : undefined
          }
        >
          <div className="field">
            <label htmlFor="clubId">Club</label>
            <select id="clubId" name="clubId" required defaultValue={clubs[0]?.id ?? ""}>
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </AudienceOption>

        <AudienceOption
          name="kind"
          value="event"
          checked={kind === "event"}
          onChange={() => setKind("event")}
          title="An event’s registrants"
        >
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
        </AudienceOption>
      </fieldset>

      <div className="field">
        <label htmlFor="subject">Subject</label>
        <input
          id="subject"
          name="subject"
          required
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Council meeting moved to Friday"
        />
        <div className="field-foot">
          <CharCount value={subject} max={SUBJECT_MAX} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          name="message"
          rows={8}
          required
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write what they need to know."
        />
        <div className="field-foot">
          <span className="hint">Plain text. Everyone gets the same message.</span>
          <CharCount value={message} max={MESSAGE_MAX} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="link">Link (optional)</label>
        <input
          id="link"
          name="link"
          type="url"
          maxLength={2000}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
        />
        <span className="hint">
          Becomes a button in the email. Pasting a link into the message itself
          does not make it clickable.
        </span>
      </div>

      <div className="field">
        <label htmlFor="linkLabel">Button text (optional)</label>
        <input
          id="linkLabel"
          name="linkLabel"
          maxLength={60}
          value={linkLabel}
          onChange={(e) => setLinkLabel(e.target.value)}
          placeholder="Join the WhatsApp group"
        />
        <span className="hint">Used only when there is a link to label.</span>
      </div>

      <EmailPreview
        subject={subject}
        message={message}
        link={link}
        linkLabel={linkLabel}
        fallbackTarget="the council site"
      />

      <div className="compose-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : state.confirm ? "Yes, send it" : "Send"}
        </button>
      </div>
    </form>
  );
}
