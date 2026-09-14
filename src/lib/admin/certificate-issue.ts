import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { writeAudit } from "./audit";
import { assetLoader } from "@/lib/certificates/assets";
import { isKnownField } from "@/lib/certificates/design";
import { designContextFor, formatIstDate, type FieldValues } from "@/lib/certificates/fields";
import { loadFontFile } from "@/lib/certificates/font-files";
import { certificateFileName, pendingRecipients, type IssueMode, type Recipient } from "@/lib/certificates/recipients";
import { renderCertificatesPdf } from "@/lib/certificates/render";
import { certificateHmac, newCertificateSerial } from "@/lib/certificates/serial";
import { renderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import { ensureDesignVersion, getCertificateWorkspace, PARTICIPATION_LABEL } from "./certificates";

/** Recipients per server call — Gmail sends ~1/s, so this stays well inside the function timeout. */
export const ISSUE_BATCH = 40;

export interface IssueBatchResult {
  /** Recipients this call attempted. 0 = nothing left to do. */
  processed: number;
  sent: number;
  recorded: number;
  failed: number;
  /** Already issued by a concurrent run. */
  skipped: number;
  /** Pending recipients left after this call. */
  remaining: number;
}

type Reserved = { id: string; values: FieldValues };

/** Insert the ledger row first (at-most-once): a failed send deletes it again. */
async function reserveCertificate(input: {
  eventId: string;
  groupId: string;
  versionId: string;
  recipient: Recipient;
  actorId: string;
}): Promise<Reserved | "exists" | null> {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const serial = newCertificateSerial();
    const values: FieldValues = {
      ...input.recipient.values,
      "cert.serial": serial,
      "cert.issueDate": formatIstDate(new Date()),
      "cert.group": PARTICIPATION_LABEL,
    };
    const { data, error } = await admin
      .from("certificates")
      .insert({
        event_id: input.eventId,
        registration_id: input.recipient.registrationId,
        type: "participation",
        serial,
        hmac: certificateHmac(serial),
        issued_by: input.actorId,
        group_id: input.groupId,
        design_version_id: input.versionId,
        recipient_key: input.recipient.key,
        recipient_name: input.recipient.name,
        recipient_email: input.recipient.email,
        snapshot: { values, groupLabel: PARTICIPATION_LABEL } as unknown as Json,
      })
      .select("id")
      .single();
    if (data) return { id: data.id, values };
    if (error?.code !== "23505") return null;
    if (error.message.includes("certificates_one_live_per_recipient")) return "exists";
    // otherwise a serial clash — try a fresh serial
  }
  return null;
}

/** Issue the next batch of Participants certificates (spec §5.2). */
export async function issueParticipantBatch(args: {
  eventId: string;
  mode: IssueMode;
  actorId: string;
}): Promise<IssueBatchResult | { error: string }> {
  const ws = await getCertificateWorkspace(args.eventId, args.actorId);
  if (!ws) return { error: "That event no longer exists." };
  const { design } = ws.group;
  if (!design.page.template) return { error: "Add a template in the Design tab first." };
  const ctx = designContextFor(ws.event.schema, ws.group.sheetColumns);
  for (const el of design.elements) {
    if (el.type !== "text") continue;
    const stale = el.paragraphs.flatMap((p) => p.runs).find((r) => r.kind === "field" && !isKnownField(r.field, ctx));
    if (stale) return { error: `"${el.name}" uses a field that no longer exists. Open Design, fix it and save.` };
  }

  const pending = pendingRecipients(ws.recipients, args.mode);
  const batch = pending.slice(0, ISSUE_BATCH);
  const result: IssueBatchResult = { processed: batch.length, sent: 0, recorded: 0, failed: 0, skipped: 0, remaining: pending.length };
  if (batch.length === 0) return result;

  const admin = createAdminClient();
  const versionId = await ensureDesignVersion(ws.group.id, design);
  const loadAsset = assetLoader();

  for (const recipient of batch) {
    const reserved = await reserveCertificate({ eventId: args.eventId, groupId: ws.group.id, versionId, recipient, actorId: args.actorId });
    if (reserved === "exists") {
      result.skipped++;
      continue;
    }
    if (!reserved) {
      result.failed++;
      continue;
    }
    if (args.mode === "record") {
      result.recorded++;
      continue;
    }
    try {
      const pdf = await renderCertificatesPdf({
        design,
        pages: [{ valueFor: (key) => reserved.values[key] ?? "" }],
        loadAsset,
        loadFont: loadFontFile,
        title: `Certificate — ${ws.event.title}`,
      });
      const subject = `Your certificate — ${ws.event.title}`;
      const { html, text } = renderEmail("participation_certificate", subject, recipient.name, null);
      const sent = await sendEmail({
        to: recipient.email!,
        subject,
        html,
        text,
        attachments: [
          {
            filename: certificateFileName(recipient.name, ws.event.title),
            content: Buffer.from(pdf),
            contentType: "application/pdf",
          },
        ],
      });
      if (!sent.ok) throw new Error(sent.error);
      result.sent++;
    } catch (err) {
      console.error("certificate issue failed:", err instanceof Error ? err.message : err);
      await admin.from("certificates").delete().eq("id", reserved.id);
      result.failed++;
    }
  }

  result.remaining = Math.max(0, pending.length - result.sent - result.recorded - result.skipped);
  await writeAudit({
    actorId: args.actorId,
    action: "issue",
    entity: "certificate",
    entityId: args.eventId,
    after: {
      type: "participation",
      mode: args.mode,
      group: ws.group.id,
      designVersion: versionId,
      sent: result.sent,
      recorded: result.recorded,
      failed: result.failed,
      skipped: result.skipped,
    },
  });
  return result;
}
