"use client";

import { useActionState, useState } from "react";
import { sendBroadcastAction } from "@/app/admin/(app)/email/actions";
import type { ComposerState } from "@/lib/admin/form-state";
import { CUSTOM_MAX, parseEmailList, sendPlan } from "@/lib/admin/broadcast-audience";
import { FieldError, fieldClass, fieldProps } from "./FieldError";
import { AudienceOption } from "./compose/AudienceOption";
import { CharCount } from "./compose/CharCount";
import { EmailPreview } from "./compose/EmailPreview";
import { RecipientPicker } from "./compose/RecipientPicker";

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
    /** Addresses on BOTH the heads list and the council roster — see below. */
    overlapHeadsCouncil: number;
    officeBearers: number;
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

  // Controlled so the picker can be handed the same audience the form will
  // post, and so it can be keyed on it — changing club after loading a list
  // must throw that list away, not silently send to the previous one.
  const [clubId, setClubId] = useState(clubs[0]?.id ?? "");
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [scope, setScope] = useState("confirmed");
  const [emails, setEmails] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const typed = parseEmailList(emails);
  const overCap = typed.length > CUSTOM_MAX;

  // Switching audience throws away any count from the previous one — the button
  // must never quote a number that belongs to a list nobody is sending to.
  const choose = (k: string) => {
    setKind(k);
    setSelected(null);
  };

  const picker = (a: Parameters<typeof RecipientPicker>[0]["audience"]) => (
    <RecipientPicker
      key={`${a.kind}:${a.clubId ?? ""}:${a.eventId ?? ""}:${a.scope ?? ""}`}
      audience={a}
      onSelectedChange={setSelected}
    />
  );

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

  // ⚠️ `heads` and `council` are two different tables describing largely the
  // same humans, and they can show the SAME count while being different lists
  // (26 and 26, with 23 in common). Naming the source on each, and stating the
  // overlap, is what stops them reading as interchangeable — the failure it
  // prevents is mailing 23 people the same thing twice, one send apart.
  const councilDetail = [
    `${counts.council} addresses`,
    counts.councilTotal > counts.council
      ? `${counts.councilTotal - counts.council} of ${counts.councilTotal} have no address on file`
      : null,
    "from the public council roster",
    counts.overlapHeadsCouncil > 0
      ? `${counts.overlapHeadsCouncil} are also club heads`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const headsDetail = [
    `${counts.heads} ${counts.heads === 1 ? "address" : "addresses"}`,
    "from the admin accounts",
    counts.overlapHeadsCouncil > 0
      ? `${counts.overlapHeadsCouncil} are also on the council roster`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
              value="office_bearers"
              checked={kind === "office_bearers"}
              onChange={() => choose("office_bearers")}
              title="Council office-bearers — layer 2"
              detail={`${counts.officeBearers} ${counts.officeBearers === 1 ? "person" : "people"} — president, vice-president and the heads`}
            >
              {picker({ kind: "office_bearers" })}
            </AudienceOption>
            <AudienceOption
              name="kind"
              value="heads"
              checked={kind === "heads"}
              onChange={() => choose("heads")}
              title="Club heads and vice heads — layer 3"
              detail={headsDetail}
            >
              {picker({ kind: "heads" })}
            </AudienceOption>
            <AudienceOption
              name="kind"
              value="council"
              checked={kind === "council"}
              onChange={() => choose("council")}
              title="Council members"
              detail={councilDetail}
            >
              {picker({ kind: "council" })}
            </AudienceOption>
            <AudienceOption
              name="kind"
              value="all_members"
              checked={kind === "all_members"}
              onChange={() => choose("all_members")}
              title="All club members"
              detail={`${counts.allMembers} addresses`}
            >
              {picker({ kind: "all_members" })}
            </AudienceOption>
          </>
        ) : null}

        <AudienceOption
          name="kind"
          value="club_members"
          checked={kind === "club_members"}
          onChange={() => choose("club_members")}
          title="One club’s members"
          detail={
            !councilWide && counts.ownClubMembers > 0
              ? `${counts.ownClubMembers} addresses`
              : undefined
          }
        >
          <div className="field">
            <label htmlFor="clubId">Club</label>
            <select
              id="clubId"
              name="clubId"
              required
              value={clubId}
              onChange={(e) => {
                setClubId(e.target.value);
                setSelected(null);
              }}
            >
              {clubs.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          {picker({ kind: "club_members", clubId })}
        </AudienceOption>

        <AudienceOption
          name="kind"
          value="event"
          checked={kind === "event"}
          onChange={() => choose("event")}
          title="An event’s registrants"
        >
          {events.length === 0 ? (
            <p className="hint">No events to pick from yet.</p>
          ) : (
            <>
              <div className="field">
                <label htmlFor="eventId">Event</label>
                <select
                  id="eventId"
                  name="eventId"
                  required
                  value={eventId}
                  onChange={(e) => {
                    setEventId(e.target.value);
                    setSelected(null);
                  }}
                >
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>{e.title}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="scope">Which registrants</label>
                <select
                  id="scope"
                  name="scope"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setSelected(null);
                  }}
                >
                  <option value="confirmed">Confirmed only</option>
                  <option value="all">Everyone, including the waitlist</option>
                </select>
              </div>
              {picker({ kind: "event", eventId, scope })}
            </>
          )}
        </AudienceOption>

        {/* Council-wide only. This is the one audience that can reach an address
            outside the system entirely, so it is not a club head's to send —
            `isAudienceAllowed` refuses it for them regardless of this. */}
        {councilWide ? (
          <AudienceOption
            name="kind"
            value="custom"
            checked={kind === "custom"}
            onChange={() => choose("custom")}
            title="Specific addresses"
            detail="Type or paste the addresses yourself"
          >
            <div className="field">
              <label htmlFor="emails">Addresses</label>
              <textarea
                id="emails"
                name="emails"
                rows={4}
                value={emails}
                onChange={(e) => {
                  setEmails(e.target.value);
                  setSelected(null);
                }}
                placeholder="vtu27884@veltech.edu.in, someone@example.com"
              />
              <div className="field-foot">
                <span className="hint">
                  Separate with commas, spaces or new lines. Duplicates are removed.
                </span>
                <span className="hint counter" data-near-limit={overCap ? "over" : undefined}>
                  {typed.length} / {CUSTOM_MAX}
                </span>
              </div>
              {overCap ? (
                <p className="hint" data-near-limit="over" role="alert">
                  That is more than {CUSTOM_MAX} addresses. Nothing will send until the list is
                  shorter — the send refuses rather than quietly mailing only the first{" "}
                  {CUSTOM_MAX}.
                </p>
              ) : null}
            </div>
          </AudienceOption>
        ) : null}
      </fieldset>

      <div className={fieldClass(state.fieldErrors, "subject")}>
        <label htmlFor="subject">Subject</label>
        <input
          id="subject"
          name="subject"
          required
          maxLength={SUBJECT_MAX}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Council meeting moved to Friday"
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
          placeholder="Write what they need to know."
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
          Becomes a button in the email. Pasting a link into the message itself
          does not make it clickable.
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

      <EmailPreview
        subject={subject}
        message={message}
        link={link}
        linkLabel={linkLabel}
        fallbackTarget="the council site"
      />

      {/* Which of the two send behaviours this audience gets, said while the
          audience can still be changed. Finding out only afterwards that a mail
          was queued — and trickles out over more than a day — is how a
          "tomorrow, 9am" notice reaches people the day after. */}
      {sendPlan(kind === "custom" ? typed.length : (selected ?? 0)) ? (
        <p className="compose-plan">
          {sendPlan(kind === "custom" ? typed.length : (selected ?? 0))}
        </p>
      ) : null}

      <div className="compose-actions">
        <button type="submit" className="btn btn-primary" disabled={pending || overCap}>
          {pending
            ? "Sending…"
            : state.confirm
              ? "Yes, send it"
              : kind === "custom"
                ? `Send to ${typed.length || "…"}`
                : // Only once a list has been read: before that the count would
                  // be the audience total, which is a different claim.
                  selected != null
                  ? `Send to ${selected}`
                  : "Send"}
        </button>
      </div>
    </form>
  );
}
