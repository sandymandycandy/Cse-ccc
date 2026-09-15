"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { getAdminSession, type AdminSession } from "@/lib/auth/guards";
import { canManage } from "@/lib/auth/capabilities";
import { writeAudit } from "@/lib/admin/audit";
import { getEventForAttendance, type AttendanceEvent } from "@/lib/admin/attendance";
import {
  createSheetGroup,
  deleteSheetGroup,
  getCertEvent,
  getGroup,
  getParticipantsGroup,
  groupCatalogue,
  groupContext,
  renameGroup,
  replaceSheetRows,
} from "@/lib/admin/certificates";
import {
  issueBatch,
  reissueForRecipient,
  reissueOutdatedBatch,
  revokeCertificate,
  type IssueBatchResult,
  type ReissueBatchResult,
} from "@/lib/admin/certificate-issue";
import { copyDesignAssets, signAssetUrls, verifyNewAssets } from "@/lib/certificates/assets";
import {
  BASE_ASSET_FOLDER,
  BASE_LABEL,
  ENABLED_BASE_KINDS,
  baseFieldProblem,
  isBaseAsset,
  savableBases,
  type BaseKind,
} from "@/lib/certificates/bases";
import { baseImpact, followBase, writeBases } from "@/lib/admin/certificate-bases";
import {
  CERT_ASSET_BUCKET,
  isKnownField,
  MAX_ASSET_BYTES,
  validateDesign,
  type AssetRef,
  type Design,
} from "@/lib/certificates/design";
import { buildFieldCatalogue, designContextFor, fieldLabel } from "@/lib/certificates/fields";
import { sheetIdentity, type IssueMode } from "@/lib/certificates/recipients";
import { buildSheetRows, SHEET_LIMITS, validateListRow, type ColumnChoice } from "@/lib/certificates/sheet";
import {
  addListRow,
  countListRows,
  getListRow,
  hasLiveListCertificate,
  removeListRow,
  updateListRow,
} from "@/lib/admin/certificate-list-rows";
import { designWithUnknownFieldsAsText } from "@/lib/certificates/rich-text";

const CAP = "issue:participation_certificate";
const uuid = z.string().uuid();

export type ActionResult = { ok: true } | { ok: false; error: string };
export type UploadTicket = { ok: true; path: string; token: string } | { ok: false; error: string };
export type IssueBatchResponse = ({ ok: true } & IssueBatchResult) | { ok: false; error: string };
export type ReissueBatchResponse = ({ ok: true } & ReissueBatchResult) | { ok: false; error: string };
export type GroupResult = { ok: true; groupId: string } | { ok: false; error: string };
export type SheetUploadResult =
  | { ok: true; rows: number; dropped: number; invalidEmails: number; columns: string[] }
  | { ok: false; error: string };
export type ReissueResult =
  | { ok: true; serial: string; emailed: boolean; superseded: boolean }
  | { ok: false; error: string };
export type SaveBaseResult = { ok: true; groupFollows: boolean } | { ok: false; error: string };
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

  const checked = validateDesign(input.design, groupContext(event, group));
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

/**
 * Save the editor's design as one or more council bases (spec 2026-09-15 §5).
 * Council-wide admins only. The images are copied into the council folder, so
 * a base never depends on this event. If this group's own base was saved, the
 * group follows it from now on.
 */
export async function saveCertificateBaseAction(input: {
  eventId: string;
  groupId: string;
  design: unknown;
  targets: string[];
}): Promise<SaveBaseResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.groupId).success) return { ok: false, error: "Missing certificate group." };

  const enabled: readonly string[] = ENABLED_BASE_KINDS;
  const targets = [...new Set(Array.isArray(input.targets) ? input.targets : [])].filter((t): t is BaseKind =>
    enabled.includes(t),
  );
  if (targets.length === 0) return { ok: false, error: "Choose which base to save." };
  const allowed = savableBases(auth.session);
  if (targets.some((kind) => !allowed.includes(kind))) {
    return { ok: false, error: "Only council admins can change a base template." };
  }

  const [event, group] = await Promise.all([getCertEvent(input.eventId), getGroup(input.eventId, input.groupId)]);
  if (!event || !group) return { ok: false, error: "That certificate group no longer exists." };

  const checked = validateDesign(input.design, groupContext(event, group));
  if (!checked.ok) return { ok: false, error: checked.error };
  const catalogue = groupCatalogue(event, group);
  const fieldProblem = baseFieldProblem(checked.design, targets, (key) => fieldLabel(catalogue, key));
  if (fieldProblem) return { ok: false, error: fieldProblem };
  if (!checked.design.page.template) return { ok: false, error: "Add a template before saving it as a base." };
  // `group.design` is the effective design, so the base's own images count as known here.
  const assetProblem = await verifyNewAssets(input.eventId, checked.design, group.design);
  if (assetProblem) return { ok: false, error: assetProblem };

  let design: Design;
  let impact: Awaited<ReturnType<typeof baseImpact>>;
  try {
    [design, impact] = await Promise.all([
      copyDesignAssets(checked.design, BASE_ASSET_FOLDER, isBaseAsset).then((copied) => copied.design),
      baseImpact(targets, input.eventId),
    ]);
  } catch {
    return { ok: false, error: "Could not save the base. Try again." };
  }

  const written = await writeBases({ kinds: targets, design, sourceEventId: input.eventId, actorId: auth.session.id });
  if ("error" in written) return { ok: false, error: written.error };

  const groupFollows =
    group.baseKind !== null && targets.includes(group.baseKind) ? await followBase(input.eventId, group.id) : false;

  await Promise.all(
    targets.map((kind) =>
      writeAudit({
        actorId: auth.session.id,
        action: "update",
        entity: "certificate_base",
        entityId: kind,
        // The previous base, so a mistaken overwrite can be restored by hand.
        before: written.previous.has(kind) ? { design: written.previous.get(kind) ?? null } : null,
        after: {
          base: BASE_LABEL[kind],
          sourceEventId: input.eventId,
          elements: design.elements.length,
          following: impact[kind]?.following ?? 0,
          withLive: impact[kind]?.withLive ?? 0,
        },
      }),
    ),
  );
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, groupFollows };
}

/** Drop this event's custom design so the group follows its council base again. */
export async function resetCertificateGroupToBaseAction(input: { eventId: string; groupId: string }): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!uuid.safeParse(input.groupId).success) return { ok: false, error: "Missing certificate group." };
  const group = await getGroup(input.eventId, input.groupId);
  if (!group) return { ok: false, error: "That certificate group no longer exists." };
  if (!group.baseKind) return { ok: false, error: "This group has no base to reset to." };
  if (group.followsBase) return { ok: true };
  if (!(await followBase(input.eventId, group.id))) return { ok: false, error: "Could not reset the design. Try again." };

  await writeAudit({
    actorId: auth.session.id,
    action: "update",
    entity: "certificate_design",
    entityId: group.id,
    before: { design: group.customDesign as unknown as Json },
    after: { eventId: input.eventId, reset: true },
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
export async function issueCertificatesBatchAction(input: {
  eventId: string;
  groupIds: string[];
  mode: IssueMode;
}): Promise<IssueBatchResponse> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (input.mode !== "email" && input.mode !== "record") return { ok: false, error: "Unknown issue mode." };
  const groupIds = (input.groupIds ?? []).filter((id) => uuid.safeParse(id).success);
  if (groupIds.length === 0) return { ok: false, error: "Choose at least one group to issue." };

  const result = await issueBatch({ eventId: input.eventId, groupIds, mode: input.mode, actorId: auth.session.id });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, ...result };
}

/**
 * Replace the certificates that no longer match the design or their owner's
 * details (spec §5.3). The Issue tab calls this in a loop, like issuing.
 */
export async function reissueOutdatedBatchAction(input: {
  eventId: string;
  groupIds: string[];
}): Promise<ReissueBatchResponse> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const groupIds = (input.groupIds ?? []).filter((id) => uuid.safeParse(id).success);
  if (groupIds.length === 0) return { ok: false, error: "Choose at least one group." };

  const result = await reissueOutdatedBatch({ eventId: input.eventId, groupIds, actorId: auth.session.id });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, ...result };
}

// ── groups ───────────────────────────────────────────────────────────────────

const groupName = z.string().trim().min(1).max(60);

/** Add an uploaded-list group (volunteers, judges…), starting from the Participants design. */
export async function createCertificateGroupAction(input: {
  eventId: string;
  name: string;
}): Promise<GroupResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const name = groupName.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Give the group a name (up to 60 characters)." };

  const created = await createSheetGroup({ eventId: input.eventId, name: name.data, actorId: auth.session.id });
  if ("error" in created) return { ok: false, error: created.error };
  await writeAudit({
    actorId: auth.session.id,
    action: "create",
    entity: "certificate_group",
    entityId: created.id,
    after: { eventId: input.eventId, name: name.data },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, groupId: created.id };
}

export async function renameCertificateGroupAction(input: {
  eventId: string;
  groupId: string;
  name: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const name = groupName.safeParse(input.name);
  if (!name.success) return { ok: false, error: "Give the group a name (up to 60 characters)." };
  if (!(await renameGroup(input.eventId, input.groupId, name.data))) {
    return { ok: false, error: "That group can't be renamed." };
  }
  await writeAudit({
    actorId: auth.session.id,
    action: "update",
    entity: "certificate_group",
    entityId: input.groupId,
    after: { name: name.data },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

/** Delete an uploaded group. Certificates already issued from it keep their own snapshot. */
export async function deleteCertificateGroupAction(input: { eventId: string; groupId: string }): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await getGroup(input.eventId, input.groupId);
  if (!group) return { ok: false, error: "That group no longer exists." };
  if (group.baseKind) return { ok: false, error: `${group.name} is on every event and can't be deleted.` };
  if (!(await deleteSheetGroup(input.eventId, input.groupId))) {
    return { ok: false, error: "Could not delete that group." };
  }
  await writeAudit({
    actorId: auth.session.id,
    action: "delete",
    entity: "certificate_group",
    entityId: input.groupId,
    before: { name: group.name },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

/**
 * Replace an uploaded group's people. The browser parses the file (CSV here,
 * XLSX via read-excel-file) and sends rows; the caps are re-checked server-side.
 */
export async function uploadCertificateSheetAction(input: {
  eventId: string;
  groupId: string;
  table: string[][];
  choice: ColumnChoice;
}): Promise<SheetUploadResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await getGroup(input.eventId, input.groupId);
  if (!group || group.kind !== "sheet") return { ok: false, error: "Upload into one of your own groups." };
  if (!Array.isArray(input.table)) return { ok: false, error: "That file could not be read." };

  const built = buildSheetRows(input.table, input.choice);
  if (!built.ok) return { ok: false, error: built.error };

  const saved = await replaceSheetRows(input.eventId, input.groupId, built.columns, built.rows);
  if ("error" in saved) return { ok: false, error: saved.error };

  await writeAudit({
    actorId: auth.session.id,
    action: "upload",
    entity: "certificate_sheet",
    entityId: input.groupId,
    after: {
      eventId: input.eventId,
      group: group.name,
      rows: built.rows.length,
      dropped: built.dropped,
      invalidEmails: built.invalidEmails,
      columns: built.columns,
    },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, rows: built.rows.length, dropped: built.dropped, invalidEmails: built.invalidEmails, columns: built.columns };
}

// ── typed list rows (spec 2026-09-15 §1.4) ───────────────────────────────────

/** The event's list group, or null — typed rows only go into list groups. */
async function listGroupOf(eventId: string, groupId: string) {
  if (!uuid.safeParse(groupId).success) return null;
  const group = await getGroup(eventId, groupId);
  return group?.kind === "sheet" ? group : null;
}

export async function addCertificateListRowAction(input: {
  eventId: string;
  groupId: string;
  name: string;
  email: string;
  roll: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await listGroupOf(input.eventId, input.groupId);
  if (!group) return { ok: false, error: "Add people to one of this event's lists." };
  const checked = validateListRow(input);
  if (!checked.ok) return { ok: false, error: checked.error };
  if ((await countListRows(group.id)) >= SHEET_LIMITS.rows) {
    return { ok: false, error: `${group.name} already has ${SHEET_LIMITS.rows} people.` };
  }
  const added = await addListRow(group.id, checked.row);
  if ("error" in added) return { ok: false, error: added.error };
  await writeAudit({
    actorId: auth.session.id,
    action: "create",
    entity: "certificate_sheet_row",
    entityId: added.id,
    after: { eventId: input.eventId, groupId: group.id },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

export async function updateCertificateListRowAction(input: {
  eventId: string;
  groupId: string;
  rowId: string;
  name: string;
  email: string;
  roll: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await listGroupOf(input.eventId, input.groupId);
  const row = group && uuid.safeParse(input.rowId).success ? await getListRow(group.id, input.rowId) : null;
  if (!group || !row) return { ok: false, error: "That person is no longer on the list." };
  const checked = validateListRow(input);
  if (!checked.ok) return { ok: false, error: checked.error };

  // Identity (email, else name) is what an issued certificate is keyed by. Changing it
  // would orphan that certificate and queue a second one for the same person.
  if (sheetIdentity(row) !== sheetIdentity(checked.row)) {
    let held: boolean;
    try {
      held = await hasLiveListCertificate(input.eventId, group.id, sheetIdentity(row));
    } catch {
      return { ok: false, error: "Could not check this person's certificates. Try again." };
    }
    if (held) {
      return {
        ok: false,
        error: `${row.name} already has a certificate, so their name and email can't change here. Ask a Faculty Advisor, VP or Tech Head to revoke it first.`,
      };
    }
  }

  if (!(await updateListRow(group.id, row.id, checked.row))) {
    return { ok: false, error: "Could not save that change. Try again." };
  }
  await writeAudit({
    actorId: auth.session.id,
    action: "update",
    entity: "certificate_sheet_row",
    entityId: row.id,
    after: { eventId: input.eventId, groupId: group.id },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

export async function removeCertificateListRowAction(input: {
  eventId: string;
  groupId: string;
  rowId: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const group = await listGroupOf(input.eventId, input.groupId);
  if (!group || !uuid.safeParse(input.rowId).success) {
    return { ok: false, error: "That person is no longer on the list." };
  }
  if (!(await removeListRow(group.id, input.rowId))) {
    return { ok: false, error: "That person is no longer on the list." };
  }
  await writeAudit({
    actorId: auth.session.id,
    action: "delete",
    entity: "certificate_sheet_row",
    entityId: input.rowId,
    after: { eventId: input.eventId, groupId: group.id },
  });
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
}

// ── one certificate at a time ────────────────────────────────────────────────

/**
 * Issue this person's certificate again with today's data and design: a live
 * one is superseded, a revoked or never-issued one is written fresh (spec §5.3).
 */
export async function reissueCertificateAction(input: {
  eventId: string;
  recipientKey: string;
}): Promise<ReissueResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const key = z.string().trim().min(1).max(200).safeParse(input.recipientKey);
  if (!key.success) return { ok: false, error: "Missing recipient." };

  const result = await reissueForRecipient({
    eventId: input.eventId,
    recipientKey: key.data,
    actorId: auth.session.id,
  });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true, ...result };
}

/**
 * Revoke — the one certificate action that needs more than issuing rights
 * (spec D8): Faculty Advisor, Vice President or Tech Head.
 */
export async function revokeCertificateAction(input: {
  eventId: string;
  certificateId: string;
  reason: string;
}): Promise<ActionResult> {
  const auth = await authorize(input.eventId);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!canManage(auth.session, "revoke:certificate", auth.ev.clubId)) {
    return { ok: false, error: "Only the Faculty Advisor, Vice President or Tech Head can revoke. You can re-issue instead." };
  }
  if (!uuid.safeParse(input.certificateId).success) return { ok: false, error: "Missing certificate." };

  const result = await revokeCertificate({
    eventId: input.eventId,
    certificateId: input.certificateId,
    reason: String(input.reason ?? ""),
    actorId: auth.session.id,
  });
  if ("error" in result) return { ok: false, error: result.error };
  revalidatePath(`/admin/events/${input.eventId}/certificates`);
  return { ok: true };
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

  let copied: { design: Design; copied: AssetRef[] };
  try {
    copied = await copyDesignAssets(sourceGroup.design, input.eventId);
  } catch {
    return { ok: false, error: "Could not copy that design's images. Try again." };
  }

  // Form questions differ between events: fields this event lacks become visible text.
  const ctx = designContextFor(target.schema);
  const sourceCatalogue = buildFieldCatalogue({ formSchema: sourceEvent.schema });
  const design = designWithUnknownFieldsAsText(copied.design, (k) => isKnownField(k, ctx), (k) => fieldLabel(sourceCatalogue, k));

  await writeAudit({
    actorId: auth.session.id,
    action: "copy",
    entity: "certificate_design",
    entityId: input.eventId,
    after: { fromEvent: input.sourceEventId, assets: copied.copied.length },
  });
  return { ok: true, design, assetUrls: await signAssetUrls(copied.copied) };
}
