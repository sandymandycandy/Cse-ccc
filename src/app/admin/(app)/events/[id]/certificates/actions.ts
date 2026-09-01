"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getAdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getEventForAttendance } from "@/lib/admin/attendance";
import { getCertificateSetup, CERTIFICATE_TEMPLATE_BUCKET } from "@/lib/admin/certificates";
import { renderCertificatePdf } from "@/lib/certificates/render";
import { validateCertificateConfig } from "@/lib/certificates/config";
import { newCertificateSerial, certificateHmac } from "@/lib/certificates/serial";
import { renderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";

const CAP = "issue:participation_certificate";
/** Per click cap — Gmail is ~1 mail/s, so this stays well inside the function
 *  timeout and the daily cap; issuing is resumable (click again to continue). */
const BATCH = 40;

export type CertificateSetupState = { error?: string; ok?: boolean };
export type CertificateIssueState = {
  error?: string;
  message?: string;
};

const ConfigSchema = z.object({
  nameXPct: z.coerce.number(),
  nameYPct: z.coerce.number(),
  fontPct: z.coerce.number(),
  align: z.string(),
  color: z.string(),
});

/** Guard + own-club scope for a certificate action on an event. */
async function authorize(eventId: string) {
  const session = await getAdminSession();
  if (!session) return { error: "Your session expired. Sign in again." as const };
  if (!z.string().uuid().safeParse(eventId).success) return { error: "Missing event." as const };
  const ev = await getEventForAttendance(eventId);
  if (!ev) return { error: "That event no longer exists." as const };
  if (!canManage(session, CAP, ev.clubId)) return { error: "You can't issue certificates for that event." as const };
  return { session, ev };
}

/** Upload/replace the template image and save the name-placement config. */
export async function saveCertificateSetupAction(
  _prev: CertificateSetupState,
  formData: FormData,
): Promise<CertificateSetupState> {
  const eventId = String(formData.get("eventId") ?? "");
  const auth = await authorize(eventId);
  if ("error" in auth) return { error: auth.error };
  const { session } = auth;

  const parsed = ConfigSchema.safeParse({
    nameXPct: formData.get("nameXPct"),
    nameYPct: formData.get("nameYPct"),
    fontPct: formData.get("fontPct"),
    align: formData.get("align"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: "Placement values look off." };
  const config = validateCertificateConfig(parsed.data);

  const admin = createAdminClient();

  // Optional new template. pdf-lib embeds PNG/JPEG only, so reject others up front.
  const file = formData.get("template");
  let newPath: string | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.type !== "image/png" && file.type !== "image/jpeg") {
      return { error: "Template must be a PNG or JPEG image." };
    }
    if (file.size > 8 * 1024 * 1024) return { error: "Template must be 8 MB or smaller." };
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const up = await admin.storage
      .from(CERTIFICATE_TEMPLATE_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) return { error: "Could not upload the template. Try again." };
    newPath = path;
  }

  // Fetch the old path so we can (a) require a template exists and (b) clean up a replacement.
  const { data: current } = await admin
    .from("events")
    .select("certificate_template")
    .eq("id", eventId)
    .maybeSingle();
  const oldPath = current?.certificate_template ?? null;

  const update: { certificate_config: Json; certificate_template?: string } = {
    certificate_config: config as unknown as Json,
  };
  if (newPath) update.certificate_template = newPath;

  const { error } = await admin.from("events").update(update).eq("id", eventId);
  if (error) {
    if (newPath) await admin.storage.from(CERTIFICATE_TEMPLATE_BUCKET).remove([newPath]);
    return { error: "Could not save the certificate setup. Try again." };
  }
  if (newPath && oldPath) {
    await admin.storage.from(CERTIFICATE_TEMPLATE_BUCKET).remove([oldPath]);
  }

  await writeAudit({
    actorId: session.id,
    action: "update",
    entity: "event",
    entityId: eventId,
    after: { certificateSetup: true, templateReplaced: !!newPath, config: config as unknown as Json },
  });

  revalidatePath(`/admin/events/${eventId}/certificates`);
  return { ok: true };
}

/** Render + email participation certificates to attendees not yet issued.
 *  Reserve-then-send gives at-most-once: a failed email leaves no ledger row. */
export async function issueCertificatesAction(
  _prev: CertificateIssueState,
  formData: FormData,
): Promise<CertificateIssueState> {
  const eventId = String(formData.get("eventId") ?? "");
  const auth = await authorize(eventId);
  if ("error" in auth) return { error: auth.error };
  const { session, ev } = auth;

  const setup = await getCertificateSetup(eventId);
  if (!setup.templatePath) return { error: "Upload a certificate template first." };
  const ext = setup.templatePath.toLowerCase().endsWith(".png") ? "png" : "jpg";

  const admin = createAdminClient();
  const dl = await admin.storage.from(CERTIFICATE_TEMPLATE_BUCKET).download(setup.templatePath);
  if (dl.error || !dl.data) return { error: "Could not load the template image." };
  const templateBytes = new Uint8Array(await dl.data.arrayBuffer());

  const pending = setup.attendees.filter((a) => a.email && !a.issued).slice(0, BATCH);
  if (pending.length === 0) {
    return { message: "Nothing to send — every attendee with an email already has a certificate." };
  }

  let sent = 0;
  let failed = 0;
  for (const a of pending) {
    // 1) Reserve a ledger row (retry the rare serial clash).
    let certId: string | null = null;
    for (let attempt = 0; attempt < 3 && !certId; attempt++) {
      const serial = newCertificateSerial();
      const { data, error } = await admin
        .from("certificates")
        .insert({
          event_id: eventId,
          registration_id: a.registrationId,
          type: "participation",
          serial,
          hmac: certificateHmac(serial),
          issued_by: session.id,
        })
        .select("id")
        .single();
      if (!error && data) certId = data.id;
      else if (error?.code !== "23505") break; // non-clash error → give up on this one
    }
    if (!certId) {
      failed++;
      continue;
    }

    // 2) Render + email. On failure, roll the reservation back so it retries next run.
    try {
      const pdf = await renderCertificatePdf({
        templateBytes,
        templateType: ext,
        name: a.name,
        config: setup.config,
      });
      const subject = `Your certificate — ${ev.title}`;
      const { html, text } = renderEmail("participation_certificate", subject, a.name, null);
      const res = await sendEmail({
        to: a.email,
        subject,
        html,
        text,
        attachments: [
          {
            filename: `Certificate - ${ev.title}.pdf`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 120),
            content: Buffer.from(pdf),
            contentType: "application/pdf",
          },
        ],
      });
      if (!res.ok) throw new Error(res.error);
      sent++;
    } catch {
      await admin.from("certificates").delete().eq("id", certId);
      failed++;
    }
  }

  await writeAudit({
    actorId: session.id,
    action: "issue",
    entity: "certificate",
    entityId: eventId,
    after: { sent, failed, type: "participation" },
  });

  revalidatePath(`/admin/events/${eventId}/certificates`);
  const remaining = Math.max(0, setup.pendingCount - sent);
  const parts = [`Emailed ${sent} certificate${sent === 1 ? "" : "s"}.`];
  if (failed) parts.push(`${failed} failed (will retry on the next run).`);
  if (remaining) parts.push(`${remaining} still to go — click again to continue.`);
  return { message: parts.join(" ") };
}
