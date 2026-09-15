"use server";

import { z } from "zod";
import { getAdminSession } from "@/lib/auth/guards";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { enqueueEmail, enqueueEmailBatch } from "@/lib/email";
import { BULK_PRIORITY } from "@/lib/email/bulk";
import { writeAudit } from "@/lib/admin/audit";
import { isSafeHttpUrl } from "@/lib/url";
import { siteOrigin } from "@/lib/site-origin";
import {
  audienceLabel,
  isAudienceAllowed,
  parseAudience,
  shouldQueue,
} from "@/lib/admin/broadcast-audience";
import { resolveRecipients } from "@/lib/admin/broadcast-recipients";
import type { ComposerState } from "@/lib/admin/form-state";

const Schema = z.object({
  subject: z.string().trim().min(3).max(120),
  message: z.string().trim().min(10).max(4000),
  link: z.string().trim().max(2000).optional().or(z.literal("")),
  linkLabel: z.string().trim().max(60).optional().or(z.literal("")),
});

/**
 * Compose-and-send to a chosen audience (BUILD_PLAN §11).
 *
 * Two things this deliberately does NOT do: trust the posted club id — an
 * event's scope is re-read from the database — and send a large audience
 * inline, because Gmail opens one SMTP connection per message and a few hundred
 * would outlast the function.
 */
export async function sendBroadcastAction(
  _prev: ComposerState,
  formData: FormData,
): Promise<ComposerState> {
  const parsed = Schema.safeParse({
    subject: formData.get("subject"),
    message: formData.get("message"),
    link: formData.get("link") ?? "",
    linkLabel: formData.get("linkLabel") ?? "",
  });
  if (!parsed.success) {
    return { error: "Add a subject (3+ characters) and a message (10+ characters)." };
  }

  const link = parsed.data.link?.trim() ?? "";
  // Scheme-checked before it becomes an href in someone's inbox: a relative or
  // javascript: URL is rejected now rather than after 900 people get a dead button.
  if (link && !isSafeHttpUrl(link)) {
    return { error: "The link must be a full http(s) URL, e.g. https://chat.whatsapp.com/…" };
  }

  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." };

  const audience = parseAudience({
    kind: formData.get("kind") as string | null,
    clubId: formData.get("clubId") as string | null,
    eventId: formData.get("eventId") as string | null,
    scope: formData.get("scope") as string | null,
  });
  if (!audience) return { error: "Pick who should receive this." };

  // An event's club comes from the database, never from the form.
  let resourceClubId: string | null = null;
  if (audience.kind === "event") {
    const ev = await getEventForAttendance(audience.eventId);
    if (!ev) return { error: "Event not found." };
    resourceClubId = ev.clubId;
  }
  if (!isAudienceAllowed(session, audience, resourceClubId)) {
    return { error: "You can't send to that audience." };
  }

  const recipients = await resolveRecipients(audience);
  if (recipients.length === 0) {
    return { error: "Nobody to email — no one in that audience has an address on file." };
  }

  const label = audienceLabel(audience);
  const queued = shouldQueue(recipients.length);

  // A send this size gets a second look before it leaves. Nothing is written
  // until the form comes back with the confirmation.
  if (queued && formData.get("confirmed") !== "1") {
    return { confirm: { count: recipients.length, label } };
  }

  const base = siteOrigin() ?? "";
  const payload = {
    body: parsed.data.message,
    url: link || base || undefined,
    linkLabel: link ? parsed.data.linkLabel?.trim() || "Open link" : undefined,
    // Drives the List-Unsubscribe header in `email/send`.
    bulk: queued,
  };

  if (queued) {
    await enqueueEmailBatch(
      recipients.map((r) => ({
        template: "council_broadcast",
        toEmail: r.email,
        toName: r.name ?? undefined,
        subject: parsed.data.subject,
        payload,
        priority: BULK_PRIORITY,
      })),
    );
  } else {
    for (const r of recipients) {
      await enqueueEmail({
        template: "council_broadcast",
        toEmail: r.email,
        toName: r.name ?? undefined,
        subject: parsed.data.subject,
        payload,
        priority: 5,
      });
    }
  }

  await writeAudit({
    actorId: session.id,
    action: "broadcast_send",
    entity: "broadcast",
    entityId: audience.kind === "event" ? audience.eventId : null,
    after: {
      audience: audience.kind,
      label,
      recipients: recipients.length,
      subject: parsed.data.subject,
      queued,
    },
  });

  return queued ? { queued: recipients.length } : { sent: recipients.length };
}
