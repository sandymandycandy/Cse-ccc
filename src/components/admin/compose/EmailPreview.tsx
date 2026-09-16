/** Matches `LABEL_MAX` in `src/lib/email/templates.ts`. */
const LABEL_MAX = 60;

/**
 * What the action button will actually say.
 *
 * The rule is split across two other files and is easy to get wrong: the
 * actions send `linkLabel: link ? (typed || "Open link") : undefined`, and the
 * template's own `linkLabel()` defaults an absent one to **"Open"**. So a mail
 * with no link typed gets "Open", not "Open link" — which is not what the
 * composer's hint claims.
 */
export function previewButtonLabel(link: string, linkLabel: string): string {
  if (!link.trim()) return "Open";
  return linkLabel.trim().slice(0, LABEL_MAX) || "Open link";
}

/**
 * A facsimile of the mail that is about to go out, folded away in a `<details>`.
 *
 * ⚠️ A FACSIMILE, not the real thing. `renderEmail` is server-side, and
 * rendering it here would mean shipping the template to the browser to answer
 * a question the admin is asking about their own typing. This mirrors the
 * template's structure in the app's own tokens, which also means it themes
 * with the rest of the panel instead of showing a white card in night mode.
 *
 * Collapsed by default: on a phone an open preview would push the send button
 * a screen and a half down.
 */
export function EmailPreview({
  subject,
  message,
  link,
  linkLabel,
  fallbackTarget,
}: {
  subject: string;
  message: string;
  link: string;
  linkLabel: string;
  /** Where the button lands with no link typed — "the event page", "the
   *  council site". Named in words because the composer cannot know the URL. */
  fallbackTarget: string;
}) {
  const label = previewButtonLabel(link, linkLabel);
  const href = link.trim();

  return (
    <details className="mailprev">
      <summary className="mailprev-toggle">Preview the email</summary>
      <div className="mailprev-paper">
        <div className="mailprev-brand">CSE Club Council</div>
        <div className="mailprev-subject">
          {subject.trim() || <span className="mailprev-empty">No subject yet</span>}
        </div>
        <p className="mailprev-greeting">
          Hi <span className="mailprev-sub">their name</span>,
        </p>
        <div className="mailprev-body">
          {message.trim() || <span className="mailprev-empty">Nothing written yet</span>}
        </div>
        <p className="mailprev-cta">
          <span className="mailprev-btn">{label}</span>
        </p>
        <p className="mailprev-url">
          {href ? (
            <>Or open this link: {href}</>
          ) : (
            <>No link typed, so the button opens {fallbackTarget}.</>
          )}
        </p>
        <hr className="mailprev-rule" />
        <p className="mailprev-foot">
          CSE Club Council · automated message, please don&rsquo;t reply.
        </p>
      </div>
    </details>
  );
}
