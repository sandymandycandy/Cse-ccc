"use server";

import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { listRegistrations, getEventFormSchema } from "@/lib/admin/registrations";
import { teamRecipients } from "@/lib/registration-form/recipients";
import { splitRegistrations } from "@/lib/registration/waitlist";
import { enqueueEmail } from "@/lib/email";
import { writeAudit } from "@/lib/admin/audit";
import { isSafeHttpUrl } from "@/lib/url";
import { toFieldErrors } from "@/lib/admin/field-errors";
import type { BroadcastState } from "@/lib/admin/form-state";

const Schema = z.object({
  eventId: z.string().uuid(),
  subject: z
    .string()
    .trim()
    .min(3, "Give it a subject — at least 3 characters.")
    .max(120, "Keep the subject to 120 characters or fewer."),
  message: z
    .string()
    .trim()
    .min(10, "Write the message — at least 10 characters.")
    .max(4000, "Keep the message to 4000 characters or fewer."),
  audience: z.enum(["confirmed", "all"]),
  // Optional: a WhatsApp group, a submission form, a meeting link.
  link: z.string().trim().max(2000, "That link is too long.").optional().or(z.literal("")),
  linkLabel: z
    .string()
    .trim()
    .max(60, "Keep the button text to 60 characters or fewer.")
    .optional()
    .or(z.literal("")),
});

/**
 * Email everyone registered for an event — every team member, not just whoever
 * filled the form in.
 *
 * Deliberately not batched or scheduled: this is a person clicking send on a
 * message they wrote, and the queue in `enqueueEmail` already handles delivery
 * and retries. It is audited because it is an outward-facing action that cannot
 * be taken back once the mail leaves.
 */
export async function broadcastAction(
  _prev: BroadcastState,
  formData: FormData,
): Promise<BroadcastState> {
  const parsed = Schema.safeParse({
    eventId: formData.get("eventId"),
    subject: formData.get("subject"),
    message: formData.get("message"),
    audience: formData.get("audience") ?? "confirmed",
    link: formData.get("link") ?? "",
    linkLabel: formData.get("linkLabel") ?? "",
  });
  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }
  const { eventId, subject, message, audience } = parsed.data;
  const link = parsed.data.link?.trim() ?? "";
  // Scheme-checked before it becomes an href in someone's inbox. A relative or
  // javascript: URL is rejected outright rather than quietly dropped, so the
  // sender finds out now instead of after 69 people get a dead button.
  if (link && !isSafeHttpUrl(link)) {
    return {
      fieldErrors: { link: "Use a full http(s) URL, e.g. https://chat.whatsapp.com/…" },
    };
  }

  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  // Club scope is read from the event in the DB, never from the form.
  const ev = await getEventForAttendance(eventId);
  if (!ev) return { error: "Event not found." };
  if (!canManage(session, "manage:registrations", ev.clubId)) {
    return { error: "You can't email that event's participants." };
  }

  const [regs, { schema }] = await Promise.all([
    listRegistrations(eventId),
    getEventFormSchema(eventId),
  ]);
  const { confirmed } = splitRegistrations(regs);
  const rows = audience === "all" ? regs : confirmed;

  // One address is mailed once even if it appears on several entries.
  const seen = new Set<string>();
  for (const r of rows) {
    for (const to of teamRecipients(schema, r.customAnswers, r.email)) {
      seen.add(to);
    }
  }
  if (seen.size === 0) return { error: "Nobody to email — no registration has an address." };

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  for (const to of seen) {
    await enqueueEmail({
      template: "event_broadcast",
      toEmail: to,
      subject,
      payload: {
        details: [{ label: "Event", value: ev.title }],
        body: message,
        // A supplied link replaces the default event link — the button is the
        // point of the message when there is one.
        url: link || (base ? `${base}/events/${eventId}` : undefined),
        linkLabel: link ? (parsed.data.linkLabel?.trim() || "Open link") : undefined,
      },
      priority: 3,
    });
  }

  await writeAudit({
    actorId: session.id,
    action: "participants_email",
    entity: "event",
    entityId: eventId,
    after: { recipients: seen.size, audience, subject, link: link || null },
  });

  return { sent: seen.size };
}
