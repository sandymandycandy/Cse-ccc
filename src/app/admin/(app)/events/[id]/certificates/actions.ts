"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getAdminSession, type AdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getEventForAttendance, type AttendanceEvent } from "@/lib/admin/attendance";
import { getCertEvent, getGroup, getParticipantsGroup } from "@/lib/admin/certificates";
import { issueParticipantBatch, type IssueBatchResult } from "@/lib/admin/certificate-issue";
import { assetLoader, signAssetUrls, verifyNewAssets } from "@/lib/certificates/assets";
import {
  assetKey,
  assetRefsOf,
  CERT_ASSET_BUCKET,
  isKnownField,
  MAX_ASSET_BYTES,
  validateDesign,
  type AssetRef,
  type Design,
} from "@/lib/certificates/design";
import { buildFieldCatalogue, designContextFor, fieldLabel } from "@/lib/certificates/fields";
import type { IssueMode } from "@/lib/certificates/recipients";
import { designWithUnknownFieldsAsText } from "@/lib/certificates/rich-text";

const CAP = "issue:participation_certificate";
const uuid = z.string().uuid();

export type ActionResult = { ok: true } | { ok: false; error: string };
export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; error: string };
export type IssueBatchResponse = ({ ok: true } & IssueBatchResult) | { ok: false; error: string };
export type CopyDesignResult =
  | { ok: true; design: Design; assetUrls: Record<string, string> }
  | { ok: false; error: string };

type Authorized =
  | { ok: false; error: string }
  | { ok: true; session: AdminSession; ev: AttendanceEvent };

/** Session + own-club scope for a certificate action on an event. */
async function authorize(eventId: string): Promise<Authorized> {
  const session = await getAdminSession();
  if (!session) return { ok: false, error: "Your session expired. Sign in again." };
  if (!uuid.safeParse(eventId).success) return { ok: false, error: "Missing event." };
  const ev = await getEventForAttendance(eventId);
  if (!ev) return { ok: false, error: "That event no longer exists." };
  if (!canManage(session, CAP, ev.clubId)) {
    return { ok: false, error: "You can't manage certificates for that event." };
  }
  return { ok: true, session, ev };
}

/** Validate and store a group's working design (spec §2.4, §6.4). */
export async function saveCertificateDesignAction(input: {
  eventId: string;
  groupId: string;
  design: unknown;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.groupId).success) return { ok: false, error: "Missing certificate group." };

  const [event, group] = await Promise.all([getCertEvent(input.eventId), getGroup(input.eventId, input.groupId)]);
  if (!event || !group) return { ok: false, error: "That certificate group no longer exists." };

  const checked = validateDesign(input.design, designContextFor(event.schema, group.sheetColumns));
  if (!checked.ok) return { ok: false, error: checked.error };
  const assetProblem = await verifyNewAssets(input.eventId, checked.design, group.design);
  if (assetProblem) return { ok: false, error: assetProblem };

  const { error } = await createAdminClient()
    .from("certificate_groups")
    .update({ design: checked.design as unknown as Json, updated_at: new Date().toISOString() })
    .eq("id", group.id)
    .eq("event_id", input.eventId);
  if (error) return { ok: false, error: "Could not save the design. Try again." };

  await writeAudit({
    actorId: auth.session.id,
    action: "update",
    entity: "certificate_design",
    entityId: group.id,
    after: {
      eventId: input.eventId,
      elements: checked.design.elements.length,
      templateChanged: group.design.page.template?.path !== checked.design.page.template?.path,
    },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

/** A one-path signed upload URL for a design asset — the browser uploads straight to Storage. */
export async function createCertificateUploadAction(input: {
  eventId: string;
  contentType: string;
  size: number;
}): Promise<UploadTicket> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (input.contentType !== "image/png" && input.contentType !== "image/jpeg") {
    return { ok: false, error: "Images must be PNG or JPEG." };
  }
  if (!(input.size > 0 && input.size <= MAX_ASSET_BYTES)) return { ok: false, error: "Images must be 8 MB or smaller." };

  const path = `${input.eventId}/${crypto.randomUUID()}.${input.contentType === "image/png" ? "png" : "jpg"}`;
  const { data, error } = await createAdminClient().storage.from(CERT_ASSET_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: "Could not start the upload. Try again." };
  return { ok: true, path: data.path, token: data.token };
}

/** Issue the next batch; the Issue tab calls this in a loop (spec §5.2). */
export async function issueCertificatesBatchAction(input: { eventId: string; mode: IssueMode }): Promise<IssueBatchResponse> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (input.mode !== "email" && input.mode !== "record") return { ok: false, error: "Unknown issue mode." };

  const result = await issueParticipantBatch({ eventId: input.eventId, mode: input.mode, actorId: auth.session.id });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, ...result };
}

/**
 * "Start from another event's design": copy its design and images into this
 * event. Not saved — the editor shows it as unsaved changes.
 */
export async function copyCertificateDesignAction(input: {
  eventId: string;
  sourceEventId: string;
}): Promise<CopyDesignResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.sourceEventId).success) return { ok: false, error: "Choose an event to copy from." };
  const source = await getEventForAttendance(input.sourceEventId);
  if (!source || !canManage(auth.session, CAP, source.clubId)) return { ok: false, error: "You can't copy from that event." };

  const [target, sourceEvent, sourceGroup] = await Promise.all([
    getCertEvent(input.eventId),
    getCertEvent(input.sourceEventId),
    getParticipantsGroup(input.sourceEventId),
  ]);
  if (!target || !sourceEvent || !sourceGroup?.design.page.template) {
    return { ok: false, error: "That event has no design to copy." };
  }

  const admin = createAdminClient();
  const load = assetLoader();
  const moved = new Map<string, AssetRef>();
  try {
    for (const ref of assetRefsOf(sourceGroup.design)) {
      if (moved.has(assetKey(ref))) continue;
      const path = `${input.eventId}/${crypto.randomUUID()}.${ref.type}`;
      const { error } = await admin.storage
        .from(CERT_ASSET_BUCKET)
        .upload(path, await load(ref), { contentType: ref.type === "png" ? "image/png" : "image/jpeg", upsert: false });
      if (error) throw new Error(error.message);
      moved.set(assetKey(ref), { ...ref, bucket: CERT_ASSET_BUCKET, path });
    }
  } catch {
    return { ok: false, error: "Could not copy that design's images. Try again." };
  }

  const swap = (ref: AssetRef) => moved.get(assetKey(ref)) ?? ref;
  const copied: Design = {
    ...sourceGroup.design,
    page: { ...sourceGroup.design.page, template: swap(sourceGroup.design.page.template) },
    elements: sourceGroup.design.elements.map((el) => (el.type === "image" ? { ...el, asset: swap(el.asset) } : el)),
  };
  // Form questions differ between events: fields this event lacks become visible text.
  const ctx = designContextFor(target.schema);
  const sourceCatalogue = buildFieldCatalogue({ formSchema: sourceEvent.schema });
  const design = designWithUnknownFieldsAsText(copied, (k) => isKnownField(k, ctx), (k) => fieldLabel(sourceCatalogue, k));

  await writeAudit({
    actorId: auth.session.id,
    action: "copy",
    entity: "certificate_design",
    entityId: input.eventId,
    after: { fromEvent: input.sourceEventId, assets: moved.size },
  });
  return { ok: true, design, assetUrls: await signAssetUrls([...moved.values()]) };
}
