import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { writeAudit } from "./audit";
import { assetLoader } from "@/lib/certificates/assets";
import { isKnownField, parseStoredDesign, type Design } from "@/lib/certificates/design";
import { designContextFor, formatIstDate, type FieldValues } from "@/lib/certificates/fields";
import { loadFontFile } from "@/lib/certificates/font-files";
import {
  certificateFileName,
  chunkBySize,
  cutBatch,
  groupByDestination,
  pendingRecipients,
  type IssueMode,
  type Recipient,
} from "@/lib/certificates/recipients";
import { renderCertificatesPdf } from "@/lib/certificates/render";
import { certificateHmac, newCertificateSerial } from "@/lib/certificates/serial";
import { renderEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/transport";
import type { EmailAttachment } from "@/lib/email/resend";
import {
  ensureDesignVersion,
  getCertEvent,
  getCertificateWorkspace,
  listAllRecipients,
  listGroups,
  type CertEvent,
  type CertificateGroup,
} from "./certificates";

/**
 * Issuing, re-issuing and revoking certificates (spec §5.2–5.4).
 *
 * Recipients are processed by **destination address**, so a team leader who
 * also holds their members' certificates gets one email with all of them.
 * Every row is reserved in the ledger before its PDF is sent and deleted again
 * if the send fails, which keeps issuing at-most-once and resumable.
 */

/** Recipients per server call — Gmail sends ~1/s, so this stays well inside the function timeout. */
export const ISSUE_BATCH = 40;
/** Most providers reject a message over ~25 MB; split before we reach that. */
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

export interface IssueBatchResult {
  /** Recipients this call attempted. 0 = nothing left to do. */
  processed: number;
  sent: number;
  recorded: number;
  failed: number;
  /** Already issued by a concurrent run. */
  skipped: number;
  /** Emails actually sent (one per destination, more when attachments were split). */
  emails: number;
  /** Pending recipients left after this call. */
  remaining: number;
}

type Prepared = { recipient: Recipient; certificateId: string; pdf: Uint8Array; filename: string };

/** A design is issuable when it has a template and every field it prints still exists. */
export function designProblem(group: CertificateGroup, event: CertEvent): string | null {
  if (!group.design.page.template) return `"${group.name}" has no template yet — add one in the Design tab.`;
  const ctx = designContextFor(event.schema, group.sheetColumns);
  for (const element of group.design.elements) {
    if (element.type !== "text") continue;
    const stale = element.paragraphs
      .flatMap((p) => p.runs)
      .find((run) => run.kind === "field" && !isKnownField(run.field, ctx));
    if (stale) return `"${group.name}" prints a field that no longer exists. Open Design, fix it and save.`;
  }
  return null;
}

/** Insert the ledger row first (at-most-once): a failed send deletes it again. */
async function reserveCertificate(input: {
  eventId: string;
  groupId: string;
  groupLabel: string;
  versionId: string;
  recipient: Recipient;
  actorId: string;
}): Promise<{ id: string; values: FieldValues } | "exists" | null> {
  const admin = createAdminClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const serial = newCertificateSerial();
    const values: FieldValues = {
      ...input.recipient.values,
      "cert.serial": serial,
      "cert.issueDate": formatIstDate(new Date()),
      "cert.group": input.groupLabel,
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
        recipient_email: input.recipient.deliverTo,
        snapshot: { values, groupLabel: input.groupLabel } as unknown as Json,
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

const deleteRows = async (ids: string[]) => {
  if (ids.length > 0) await createAdminClient().from("certificates").delete().in("id", ids);
};

/** The email one destination receives, carrying every certificate bound for it. */
function destinationEmail(input: { eventTitle: string; toName: string; prepared: Prepared[] }) {
  const many = input.prepared.length > 1;
  const subject = many
    ? `Certificates — ${input.eventTitle} (${input.prepared.length})`
    : `Your certificate — ${input.eventTitle}`;
  const payload = many
    ? {
        body: `Attached: ${input.prepared.map((p) => p.recipient.name).join(", ")}.`,
        details: input.prepared.map((p) => ({
          label: p.recipient.name,
          value: p.recipient.viaLeader ? "sent to you — they gave no email of their own" : "certificate attached",
        })),
      }
    : null;
  const { html, text } = renderEmail("participation_certificate", subject, input.toName, payload);
  return { subject, html, text };
}

/**
 * Issue the next batch across the chosen groups (spec §5.2). Whole destinations
 * are taken, so a team's certificates never straddle two runs.
 */
export async function issueBatch(args: {
  eventId: string;
  groupIds: string[];
  mode: IssueMode;
  actorId: string;
}): Promise<IssueBatchResult | { error: string }> {
  const event = await getCertEvent(args.eventId);
  if (!event) return { error: "That event no longer exists." };
  const allGroups = await listGroups(args.eventId, args.actorId);
  const groups = allGroups.filter((g) => args.groupIds.includes(g.id));
  if (groups.length === 0) return { error: "Choose at least one group to issue." };
  for (const group of groups) {
    const problem = designProblem(group, event);
    if (problem) return { error: problem };
  }

  const byGroup = new Map(groups.map((g) => [g.id, g]));
  const recipients = (await listAllRecipients(event, allGroups)).filter((r) => byGroup.has(r.groupId));
  const pending = pendingRecipients(recipients, args.mode);
  const destinations = cutBatch(groupByDestination(pending), ISSUE_BATCH);

  const result: IssueBatchResult = {
    processed: args.mode === "record" ? pending.length : destinations.reduce((n, d) => n + d.recipients.length, 0),
    sent: 0,
    recorded: 0,
    failed: 0,
    skipped: 0,
    emails: 0,
    remaining: pending.length,
  };

  const versionIds = new Map<string, string>();
  const versionFor = async (group: CertificateGroup) => {
    let id = versionIds.get(group.id);
    if (!id) {
      id = await ensureDesignVersion(group.id, group.design);
      versionIds.set(group.id, id);
    }
    return id;
  };

  // Record-only: reserve rows and stop. Nothing is rendered or sent.
  if (args.mode === "record") {
    for (const recipient of pending.slice(0, ISSUE_BATCH)) {
      const group = byGroup.get(recipient.groupId)!;
      const reserved = await reserveCertificate({
        eventId: args.eventId,
        groupId: group.id,
        groupLabel: recipient.groupLabel,
        versionId: await versionFor(group),
        recipient,
        actorId: args.actorId,
      });
      if (reserved === "exists") result.skipped++;
      else if (!reserved) result.failed++;
      else result.recorded++;
    }
    result.processed = Math.min(pending.length, ISSUE_BATCH);
    result.remaining = Math.max(0, pending.length - result.recorded - result.skipped);
    await auditRun(args, groups, result, "record");
    return result;
  }

  const loadAsset = assetLoader();
  for (const destination of destinations) {
    const prepared: Prepared[] = [];

    for (const recipient of destination.recipients) {
      const group = byGroup.get(recipient.groupId)!;
      const reserved = await reserveCertificate({
        eventId: args.eventId,
        groupId: group.id,
        groupLabel: recipient.groupLabel,
        versionId: await versionFor(group),
        recipient,
        actorId: args.actorId,
      });
      if (reserved === "exists") {
        result.skipped++;
        continue;
      }
      if (!reserved) {
        result.failed++;
        continue;
      }
      try {
        const pdf = await renderCertificatesPdf({
          design: group.design,
          pages: [{ valueFor: (key) => reserved.values[key] ?? "" }],
          loadAsset,
          loadFont: loadFontFile,
          title: `Certificate — ${event.title}`,
        });
        prepared.push({
          recipient,
          certificateId: reserved.id,
          pdf,
          filename: certificateFileName(recipient.name, event.title),
        });
      } catch (err) {
        console.error("certificate render failed:", err instanceof Error ? err.message : err);
        await deleteRows([reserved.id]);
        result.failed++;
      }
    }
    if (prepared.length === 0) continue;

    // One email per destination — split only if the attachments grow too large.
    const chunks = chunkBySize(prepared, (p) => p.pdf.byteLength, MAX_ATTACHMENT_BYTES);
    for (const chunk of chunks) {
      const attachments: EmailAttachment[] = chunk.map((p) => ({
        filename: p.filename,
        content: Buffer.from(p.pdf),
        contentType: "application/pdf",
      }));
      const toName = chunk[0].recipient.name;
      const { subject, html, text } = destinationEmail({ eventTitle: event.title, toName, prepared: chunk });
      const sent = await sendEmail({ to: destination.email, subject, html, text, attachments });
      if (sent.ok) {
        result.sent += chunk.length;
        result.emails++;
      } else {
        console.error("certificate email failed:", sent.error);
        await deleteRows(chunk.map((p) => p.certificateId));
        result.failed += chunk.length;
      }
    }
  }

  result.remaining = Math.max(0, pending.length - result.sent - result.skipped);
  await auditRun(args, groups, result, "email");
  return result;
}

async function auditRun(
  args: { eventId: string; actorId: string },
  groups: CertificateGroup[],
  result: IssueBatchResult,
  mode: IssueMode,
) {
  await writeAudit({
    actorId: args.actorId,
    action: "issue",
    entity: "certificate",
    entityId: args.eventId,
    after: {
      type: "participation",
      mode,
      groups: groups.map((g) => g.name),
      source: groups.some((g) => g.kind === "sheet") ? "sheet" : "attendance",
      sent: result.sent,
      recorded: result.recorded,
      failed: result.failed,
      skipped: result.skipped,
      emails: result.emails,
    },
  });
}

/** The ledger row plus the design it was issued with — what a download re-renders from. */
export interface IssuedCertificate {
  id: string;
  eventId: string;
  serial: string;
  recipientName: string;
  recipientEmail: string | null;
  recipientKey: string | null;
  groupId: string | null;
  revokedAt: string | null;
  design: Design;
  values: FieldValues;
}

export async function getIssuedCertificate(certificateId: string): Promise<IssuedCertificate | null> {
  const { data } = await createAdminClient()
    .from("certificates")
    .select(
      "id, event_id, serial, recipient_name, recipient_email, recipient_key, group_id, revoked_at, snapshot, certificate_design_versions ( design )",
    )
    .eq("id", certificateId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    event_id: string;
    serial: string;
    recipient_name: string | null;
    recipient_email: string | null;
    recipient_key: string | null;
    group_id: string | null;
    revoked_at: string | null;
    snapshot: { values?: Record<string, string> } | null;
    certificate_design_versions: { design: Json } | null;
  };
  const design = row.certificate_design_versions ? parseStoredDesign(row.certificate_design_versions.design) : null;
  if (!design) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    serial: row.serial,
    recipientName: row.recipient_name ?? "",
    recipientEmail: row.recipient_email,
    recipientKey: row.recipient_key,
    groupId: row.group_id,
    revokedAt: row.revoked_at,
    design,
    values: row.snapshot?.values ?? {},
  };
}

/** Re-render an issued certificate exactly as it was sent. */
export async function renderIssuedCertificate(cert: IssuedCertificate): Promise<Uint8Array> {
  return renderCertificatesPdf({
    design: cert.design,
    pages: [{ valueFor: (key) => cert.values[key] ?? "" }],
    loadAsset: assetLoader(),
    loadFont: loadFontFile,
    title: `Certificate ${cert.serial}`,
  });
}

/**
 * Issue this person's certificate again with today's data and design
 * (spec §5.3–5.4). If they hold a live one it is superseded in a single
 * transaction; if theirs was revoked, or never issued, a fresh one is written.
 * Either way a failed email is rolled back, so the ledger never claims a
 * certificate that did not go out.
 */
export async function reissueForRecipient(args: {
  eventId: string;
  recipientKey: string;
  actorId: string;
}): Promise<{ error: string } | { serial: string; emailed: boolean; superseded: boolean }> {
  const admin = createAdminClient();
  const [event, ws] = await Promise.all([
    getCertEvent(args.eventId),
    getCertificateWorkspace(args.eventId, args.actorId),
  ]);
  if (!event || !ws) return { error: "That event no longer exists." };

  const recipient = ws.recipients.find((r) => r.key === args.recipientKey);
  if (!recipient) return { error: "That person is no longer on the list — nothing to issue." };
  const group = ws.groups.find((g) => g.id === recipient.groupId);
  if (!group) return { error: "That certificate's group no longer exists." };
  const problem = designProblem(group, event);
  if (problem) return { error: problem };

  const serial = newCertificateSerial();
  const values: FieldValues = {
    ...recipient.values,
    "cert.serial": serial,
    "cert.issueDate": formatIstDate(new Date()),
    "cert.group": recipient.groupLabel,
  };
  const versionId = await ensureDesignVersion(group.id, group.design);
  const live = recipient.status.state === "issued" ? recipient.status : null;

  let newId: string;
  if (live) {
    const { data, error } = await admin.rpc("supersede_certificate", {
      p_old_id: live.certificateId,
      p_new: {
        serial,
        hmac: certificateHmac(serial),
        issued_by: args.actorId,
        group_id: group.id,
        design_version_id: versionId,
        recipient_name: recipient.name,
        recipient_email: recipient.deliverTo,
        snapshot: { values, groupLabel: recipient.groupLabel },
      } as unknown as Json,
    });
    if (error || !data) return { error: "Could not re-issue that certificate. Try again." };
    newId = data as string;
  } else {
    const reserved = await reserveCertificate({
      eventId: args.eventId,
      groupId: group.id,
      groupLabel: recipient.groupLabel,
      versionId,
      recipient,
      actorId: args.actorId,
    });
    if (reserved === "exists") return { error: "Someone just issued this one — reload the page." };
    if (!reserved) return { error: "Could not issue that certificate. Try again." };
    newId = reserved.id;
    Object.assign(values, reserved.values);
  }

  let emailed = false;
  if (recipient.deliverTo) {
    try {
      const pdf = await renderCertificatesPdf({
        design: group.design,
        pages: [{ valueFor: (key) => values[key] ?? "" }],
        loadAsset: assetLoader(),
        loadFont: loadFontFile,
        title: `Certificate — ${event.title}`,
      });
      const subject = live ? `Your updated certificate — ${event.title}` : `Your certificate — ${event.title}`;
      const { html, text } = renderEmail(
        "participation_certificate",
        subject,
        recipient.name,
        live ? { body: "This replaces the certificate we sent you earlier. Please use this one." } : null,
      );
      const sent = await sendEmail({
        to: recipient.deliverTo,
        subject,
        html,
        text,
        attachments: [
          { filename: certificateFileName(recipient.name, event.title), content: Buffer.from(pdf), contentType: "application/pdf" },
        ],
      });
      if (!sent.ok) throw new Error(sent.error);
      emailed = true;
    } catch (err) {
      console.error("certificate re-issue failed:", err instanceof Error ? err.message : err);
      if (live) await admin.rpc("undo_supersede", { p_new_id: newId });
      else await deleteRows([newId]);
      return {
        error: live
          ? "Could not email the new certificate, so the old one is still the live one."
          : "Could not email that certificate, so nothing was issued.",
      };
    }
  }

  await writeAudit({
    actorId: args.actorId,
    action: live ? "reissue" : "issue",
    entity: "certificate",
    entityId: newId,
    before: live ? { serial: live.serial } : undefined,
    after: { serial, recipient: recipient.name, emailed, group: group.name, key: recipient.key },
  });
  return { serial, emailed, superseded: !!live };
}

/** Revoke a certificate (spec §5.4). Requires `revoke:certificate` — the caller checks. */
export async function revokeCertificate(args: {
  eventId: string;
  certificateId: string;
  reason: string;
  actorId: string;
}): Promise<{ error: string } | { ok: true }> {
  const reason = args.reason.trim().slice(0, 200);
  if (!reason) return { error: "Give a reason — it is kept internally, not shown to the student." };
  if (reason === "superseded") return { error: "That reason is reserved. Write what actually happened." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("certificates")
    .update({ revoked_at: new Date().toISOString(), revoked_reason: reason })
    .eq("id", args.certificateId)
    .eq("event_id", args.eventId)
    .is("revoked_at", null)
    .select("id, serial, recipient_name")
    .maybeSingle();
  if (error) return { error: "Could not revoke that certificate. Try again." };
  if (!data) return { error: "That certificate is already revoked." };

  await writeAudit({
    actorId: args.actorId,
    action: "revoke",
    entity: "certificate",
    entityId: data.id,
    after: { serial: data.serial, recipient: data.recipient_name, reason },
  });
  return { ok: true };
}
