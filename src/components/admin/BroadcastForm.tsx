"use client";

import { useActionState, useState } from "react";
import { broadcastAction } from "@/app/admin/(app)/events/[id]/email/actions";
import type { BroadcastState } from "@/lib/admin/form-state";
import { FieldError, fieldClass, fieldProps } from "./FieldError";
import { AudienceOption } from "./compose/AudienceOption";
import { CharCount } from "./compose/CharCount";
import { EmailPreview } from "./compose/EmailPreview";

const initial: BroadcastState = {};

const SUBJECT_MAX = 120;
const MESSAGE_MAX = 4000;

interface BroadcastFormProps {
  eventId: string;
  confirmedCount: number;
  allCount: number;
  /** Prefill for the reminder button; the text stays editable afterwards. */
  reminder?: { subject: string; body: string };
}

/**
 * Compose and send a message to an event's participants.
 *
 * The recipient counts are computed on the server and shown on each audience,
 * because "Send" on a mail that cannot be recalled should say who it is about
 * to reach before it is pressed.
 */
export function BroadcastForm(props: BroadcastFormProps) {
  // See BroadcastComposer: remounting is the only way to clear a
  // `useActionState` result, so "Write another" bumps this key.
  const [round, setRound] = useState(0);
  return (
    <SendForm key={round} {...props} onWriteAnother={() => setRound((r) => r + 1)} />
  );
}

function SendForm({
  eventId,
  confirmedCount,
  allCount,
  reminder,
  onWriteAnother,
}: BroadcastFormProps & { onWriteAnother: () => void }) {
  const [state, action, pending] = useActionState(broadcastAction, initial);
  const [audience, setAudience] = useState("confirmed");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  if (state.sent != null) {
    return (
      <div className="compose">
        <div className="note">
          Sent to {state.sent} {state.sent === 1 ? "address" : "addresses"}. Delivery
          happens in the background — a failed send is retried automatically.
        </div>
        <div className="compose-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-ghost" onClick={onWriteAnother}>
            Write another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="compose">
      <input type="hidden" name="eventId" value={eventId} />

      {/* Fills the two fields and stops. A send that cannot be recalled gets a
          human's eyes on the wording first — one press to compose, one to send. */}
      {reminder ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 16 }}
          onClick={() => {
            setSubject(reminder.subject);
            setMessage(reminder.body);
          }}
        >
          Remind them it&rsquo;s coming up
        </button>
      ) : null}

      {state.error ? (
        <div role="alert" className="note" style={{ borderLeftColor: "var(--rust)", marginBottom: 16 }}>
          {state.error}
        </div>
      ) : null}

      <div className={fieldClass(state.fieldErrors, "subject")}>
        <label htmlFor="subject">Subject</label>
        <input
          id="subject"
          name="subject"
          required
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Venue has changed"
          {...fieldProps(state.fieldErrors, "subject")}
        />
        <FieldError errors={state.fieldErrors} name="subject" />
        <div className="field-foot">
          <CharCount value={subject} max={SUBJECT_MAX} />
        </div>
      </div>

      <div className={fieldClass(state.fieldErrors, "message")}>
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          name="message"
          rows={7}
          required
          maxLength={MESSAGE_MAX}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Write what participants need to know."
          {...fieldProps(state.fieldErrors, "message")}
        />
        <FieldError errors={state.fieldErrors} name="message" />
        <div className="field-foot">
          <span className="hint">Plain text. Everyone gets the same message.</span>
          <CharCount value={message} max={MESSAGE_MAX} />
        </div>
      </div>

      <div className={fieldClass(state.fieldErrors, "link")}>
        <label htmlFor="link">Link (optional)</label>
        <input
          id="link"
          name="link"
          type="url"
          maxLength={2000}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://chat.whatsapp.com/…"
          {...fieldProps(state.fieldErrors, "link")}
        />
        <FieldError errors={state.fieldErrors} name="link" />
        <span className="hint">
          Becomes a button in the email — a WhatsApp group, a submission form, a
          meeting link. Without one the button opens the event page. Pasting a
          link into the message itself does not make it clickable.
        </span>
      </div>

      <div className={fieldClass(state.fieldErrors, "linkLabel")}>
        <label htmlFor="linkLabel">Button text (optional)</label>
        <input
          id="linkLabel"
          name="linkLabel"
          maxLength={60}
          value={linkLabel}
          onChange={(e) => setLinkLabel(e.target.value)}
          placeholder="Join the WhatsApp group"
          {...fieldProps(state.fieldErrors, "linkLabel")}
        />
        <FieldError errors={state.fieldErrors} name="linkLabel" />
        <span className="hint">Used only when there is a link to label.</span>
      </div>

      <fieldset className="audience">
        <legend className="label">Who receives it</legend>
        <AudienceOption
          name="audience"
          value="confirmed"
          checked={audience === "confirmed"}
          onChange={() => setAudience("confirmed")}
          title="Confirmed participants"
          detail={`${confirmedCount} ${confirmedCount === 1 ? "entry" : "entries"}`}
        />
        <AudienceOption
          name="audience"
          value="all"
          checked={audience === "all"}
          onChange={() => setAudience("all")}
          title="Everyone, including the waitlist"
          detail={`${allCount} ${allCount === 1 ? "entry" : "entries"}`}
        />
        <span className="hint" style={{ display: "block", marginTop: 10 }}>
          Every member of each entry is emailed, not only the person who registered.
        </span>
      </fieldset>

      <EmailPreview
        subject={subject}
        message={message}
        link={link}
        linkLabel={linkLabel}
        fallbackTarget="the event page"
      />

      <div className="compose-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send to participants"}
        </button>
      </div>
    </form>
  );
}
