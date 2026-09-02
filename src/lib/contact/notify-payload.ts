/**
 * Shapes the leadership notification for a public contact query.
 *
 * Pure and separate from `notify.ts` so the wording, truncation and link can be
 * tested without a database or a mail transport.
 */
import type { Json } from "@/lib/database.types";

/** The payload is stored as jsonb on email_log, so it has to be Json-shaped. */
export type EmailPayload = { [key: string]: Json | undefined };

export interface ContactQuery {
  name: string;
  email: string;
  subject: string | null;
  message: string;
  /** Absolute URL of the inbox entry, when the origin is known. */
  inboxUrl?: string | null;
}

/** Subject lines stay readable in a mail list; the full text is in the body. */
const SUBJECT_MAX = 70;
/** Guards against a 4000-char message making an unreadable email. */
const BODY_MAX = 2000;

function clamp(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function contactNotification(q: ContactQuery): {
  subject: string;
  payload: EmailPayload;
} {
  const from = q.name.trim() || "Someone";
  // The sender's own subject is the useful part of the line, so it leads when
  // there is one; otherwise fall back to who it came from.
  const topic = q.subject?.trim();
  const subject = topic
    ? `New query: ${clamp(topic, SUBJECT_MAX)}`
    : `New query from ${clamp(from, SUBJECT_MAX)}`;

  const details: { label: string; value: string }[] = [
    { label: "From", value: from },
    { label: "Reply to", value: q.email.trim() },
  ];
  if (topic) details.push({ label: "Subject", value: topic });

  const payload: EmailPayload = {
    details,
    body: clamp(q.message, BODY_MAX),
  };
  // `url` is what the shared template turns into the "Open" button.
  if (q.inboxUrl) payload.url = q.inboxUrl;

  return { subject, payload };
}
