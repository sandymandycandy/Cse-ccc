"use client";

import { useActionState, useState } from "react";
import { Mail, Send, Users } from "lucide-react";
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
  /** Distinct addresses each audience reaches — every team member, deduped as the send does. */
  confirmedAddresses: number;
  allAddresses: number;
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
  confirmedAddresses,
  allAddresses,
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

  const reach = audience === "all" ? allAddresses : confirmedAddresses;
  const addresses = (n: number) => `${n} ${n === 1 ? "address" : "addresses"}`;

  return (
    <form action={action} className="compose broadcast-workspace">
      <input type="hidden" name="eventId" value={eventId} />

      {state.error ? (
        <div role="alert" className="note" style={{ borderLeftColor: "var(--rust)" }}>
          {state.error}
        </div>
      ) : null}

      <section className="broadcast-audience" aria-labelledby="event-email-audience-title">
        <div className="broadcast-section-head">
          <span className="broadcast-step">01</span>
          <div>
            <h2 id="event-email-audience-title">Choose recipients</h2>
            <p>Every member of each entry is emailed, not only the person who registered.</p>
          </div>
          <Users size={19} aria-hidden="true" />
        </div>
        <fieldset className="audience">
          <legend className="sr-only">Who receives it</legend>
          <AudienceOption
            name="audience"
            value="confirmed"
            checked={audience === "confirmed"}
            onChange={() => setAudience("confirmed")}
            title="Confirmed participants"
            detail={addresses(confirmedAddresses)}
          />
          <AudienceOption
            name="audience"
            value="all"
            checked={audience === "all"}
            onChange={() => setAudience("all")}
            title="Everyone, including the waitlist"
            detail={addresses(allAddresses)}
          />
        </fieldset>
      </section>

      <section className="broadcast-message" aria-labelledby="event-email-message-title">
        <div className="broadcast-section-head">
          <span className="broadcast-step">02</span>
          <div>
            <h2 id="event-email-message-title">Write your message</h2>
            <p>One message, delivered to each selected address.</p>
          </div>
          <Mail size={19} aria-hidden="true" />
        </div>
        <div className="broadcast-message-body">
          {/* Fills the two fields and stops. A send that cannot be recalled gets a
              human's eyes on the wording first — one press to compose, one to send. */}
          {reminder ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm event-email-reminder"
              onClick={() => {
                setSubject(reminder.subject);
                setMessage(reminder.body);
              }}
            >
              Remind them it&rsquo;s coming up
            </button>
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
              rows={8}
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

          <div className="broadcast-link-fields">
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
          </div>

          <EmailPreview
            subject={subject}
            message={message}
            link={link}
            linkLabel={linkLabel}
            fallbackTarget="the event page"
          />

          <div className="compose-actions">
            <button type="submit" className="btn btn-primary" disabled={pending || reach === 0}>
              <Send size={16} aria-hidden="true" />
              {pending ? "Sending…" : `Send to ${addresses(reach)}`}
            </button>
            <span className="hint">
              {reach === 0
                ? "Nobody in this group has an address to send to."
                : "Review your audience and preview before sending."}
            </span>
          </div>
        </div>
      </section>
    </form>
  );
}
