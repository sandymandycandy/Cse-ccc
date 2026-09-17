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
  applyExclusions,
  audienceLabel,
  isAudienceAllowed,
  parseAudience,
  parseEmailList,
  shouldQueue,
} from "@/lib/admin/broadcast-audience";
import { resolveRecipients } from "@/lib/admin/broadcast-recipients";
import { toFieldErrors } from "@/lib/admin/field-errors";
import type { AudiencePreview, ComposerState } from "@/lib/admin/form-state";

/**
 * The audience as the form describes it, plus the club the DATABASE says owns
 * the event — never the posted one. Shared by the send and the preview so the
 * two can never drift into disagreeing about who may reach what.
 */
async function authorisedAudience(raw: {
  kind?: string | null;
  clubId?: string | null;
  eventId?: string | null;
  scope?: string | null;
  emails?: string | null;
}) {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." } as const;

  const audience = parseAudience(raw);
  if (!audience) return { error: "Pick who should receive this." } as const;

  let resourceClubId: string | null = null;
  if (audience.kind === "event") {
    const ev = await getEventForAttendance(audience.eventId);
    if (!ev) return { error: "Event not found." } as const;
    resourceClubId = ev.clubId;
  }
  if (!isAudienceAllowed(session, audience, resourceClubId)) {
    return { error: "You can't send to that audience." } as const;
  }
  return { session, audience } as const;
}

/**
 * Who an audience actually contains, for the picker.
 *
 * Gated identically to sending — same parse, same database re-read of an
 * event's club, same `isAudienceAllowed`. The bar is deliberately "if you may
 * mail them, you may see them": it reaches no row that the roster pages under
 * /admin already show the same person.
 */
export async function previewAudienceAction(raw: {
  kind?: string | null;
  clubId?: string | null;
  eventId?: string | null;
  scope?: string | null;
  emails?: string | null;
}): Promise<AudiencePreview> {
  const gate = await authorisedAudience(raw);
  if ("error" in gate) return { error: gate.error };

  const recipients = await resolveRecipients(gate.audience);
  return {
    recipients: recipients.map((r) => ({
      email: r.email,
      name: r.name,
      meta: r.meta ?? null,
    })),
    label: audienceLabel(gate.audience),
  };
}

// The wording lives on the rule, so the message a person reads under an input
// cannot drift from the rule that rejected it.
const Schema = z.object({
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
  link: z
    .string()
    .trim()
    .max(2000, "That link is too long.")
    .optional()
    .or(z.literal("")),
  linkLabel: z
    .string()
    .trim()
    .max(60, "Keep the button text to 60 characters or fewer.")
    .optional()
    .or(z.literal("")),
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
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const link = parsed.data.link?.trim() ?? "";
  // Scheme-checked before it becomes an href in someone's inbox: a relative or
  // javascript: URL is rejected now rather than after 900 people get a dead button.
  if (link && !isSafeHttpUrl(link)) {
    return {
      fieldErrors: {
        link: "Use a full http(s) URL, e.g. https://chat.whatsapp.com/…",
      },
    };
  }

  const gate = await authorisedAudience({
    kind: formData.get("kind") as string | null,
    clubId: formData.get("clubId") as string | null,
    eventId: formData.get("eventId") as string | null,
    scope: formData.get("scope") as string | null,
    emails: formData.get("emails") as string | null,
  });
  if ("error" in gate) return { error: gate.error };
  const { session, audience } = gate;

  // ⚠️ The audience is resolved on the server and THEN narrowed. The form posts
  // who was unticked, never who was kept, so this can only ever shrink the
  // send — a tampered request cannot add an address the sender was not already
  // allowed to reach. See `applyExclusions`.
  const excluded = parseEmailList((formData.get("exclude") as string | null) ?? "");
  const all = await resolveRecipients(audience);
  const recipients = applyExclusions(all, excluded);

  if (all.length === 0) {
    return { error: "Nobody to email — no one in that audience has an address on file." };
  }
  if (recipients.length === 0) {
    return { error: "Everyone in that audience is unticked, so there is nobody left to email." };
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
      // Both numbers, so the log shows a send that skipped people as a
      // deliberate act rather than as a mysteriously short audience.
      audienceSize: all.length,
      excluded: all.length - recipients.length,
      subject: parsed.data.subject,
      queued,
    },
  });

  return queued ? { queued: recipients.length } : { sent: recipients.length };
}
