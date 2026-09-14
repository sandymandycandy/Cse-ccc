import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import { canManage, type AdminIdentity } from "@/lib/auth/capabilities";
import { istDateMedium } from "@/lib/datetime";
import type { FormField } from "@/lib/registration-form/schema";
import { validateCertificateConfig } from "@/lib/certificates/config";
import {
  assetRefsOf,
  canonicalJson,
  designFromLegacyConfig,
  emptyDesign,
  isKnownField,
  LEGACY_TEMPLATE_BUCKET,
  parseStoredDesign,
  validateDesign,
  type Design,
} from "@/lib/certificates/design";
import { signAssetUrls } from "@/lib/certificates/assets";
import {
  buildFieldCatalogue,
  designContextFor,
  fieldLabel,
  memberValues,
  registrantValues,
  sheetValues,
  teamOf,
  type CertEventInfo,
  type FieldGroup,
} from "@/lib/certificates/fields";
import { sniffImage } from "@/lib/certificates/image-type";
import {
  countRecipients,
  memberKey,
  outdatedRecipients,
  printedFields,
  registrationKey,
  sheetKey,
  statusByKey,
  type LiveCertificate,
  type Recipient,
  type RecipientCounts,
} from "@/lib/certificates/recipients";
import { designWithUnknownFieldsAsText } from "@/lib/certificates/rich-text";
import type { SheetRow } from "@/lib/certificates/sheet";
import { getEventFormSchema, listRegistrations } from "./registrations";

/**
 * Data layer for the certificate designer (spec §4). Service-role reads and
 * writes of PII — every caller enforces the capability and club scope first.
 */

export const PARTICIPATION_LABEL = "Participation";
const GROUP_COLUMNS = "id, event_id, kind, name, design, sheet_columns";

export interface CertEvent {
  id: string;
  title: string;
  clubId: string | null;
  info: CertEventInfo;
  schema: FormField[];
}

export async function getCertEvent(eventId: string): Promise<CertEvent | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("id, title, starts_at, ends_at, venue_text, event_clubs ( is_primary, club_id, clubs ( name ) )")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    venue_text: string | null;
    event_clubs: { is_primary: boolean; club_id: string; clubs: { name: string } | null }[];
  };
  const primary = row.event_clubs.find((c) => c.is_primary) ?? row.event_clubs[0];
  const { schema } = await getEventFormSchema(eventId);
  return {
    id: row.id,
    title: row.title,
    clubId: primary?.club_id ?? null,
    schema,
    info: {
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      venue: row.venue_text,
      clubName: primary?.clubs?.name ?? null,
    },
  };
}

export interface CertificateGroup {
  id: string;
  eventId: string;
  kind: "participants" | "sheet";
  name: string;
  design: Design;
  sheetColumns: string[];
}

type GroupRow = {
  id: string;
  event_id: string;
  kind: "participants" | "sheet";
  name: string;
  design: Json;
  sheet_columns: string[] | null;
};

const toGroup = (row: GroupRow): CertificateGroup => ({
  id: row.id,
  eventId: row.event_id,
  kind: row.kind,
  name: row.name,
  design: parseStoredDesign(row.design) ?? emptyDesign(),
  sheetColumns: row.sheet_columns ?? [],
});

export async function getGroup(eventId: string, groupId: string): Promise<CertificateGroup | null> {
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select(GROUP_COLUMNS)
    .eq("event_id", eventId)
    .eq("id", groupId)
    .maybeSingle();
  return data ? toGroup(data as GroupRow) : null;
}

export async function getParticipantsGroup(eventId: string): Promise<CertificateGroup | null> {
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select(GROUP_COLUMNS)
    .eq("event_id", eventId)
    .eq("kind", "participants")
    .maybeSingle();
  return data ? toGroup(data as GroupRow) : null;
}

/** The identity of a design: the hash its version row is keyed by. */
export const designHash = (design: Design): string =>
  createHash("sha256").update(canonicalJson(design)).digest("hex");

/**
 * The version id this design was recorded under, or null if it has never been
 * issued. Read-only — unlike `ensureDesignVersion` it records nothing, so it is
 * safe to ask while rendering a page.
 */
export async function findDesignVersion(groupId: string, design: Design): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("certificate_design_versions")
    .select("id")
    .eq("group_id", groupId)
    .eq("hash", designHash(design))
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * What each live certificate was made from, by certificate id: the design
 * version it used and the values it printed. This is what says whether a
 * certificate still matches the design and the person's current details.
 */
export async function liveCertificateDetails(eventId: string): Promise<Map<string, LiveCertificate>> {
  const { data } = await createAdminClient()
    .from("certificates")
    .select("id, design_version_id, snapshot")
    .eq("event_id", eventId)
    .eq("type", "participation")
    .is("revoked_at", null);
  const out = new Map<string, LiveCertificate>();
  for (const row of (data ?? []) as { id: string; design_version_id: string | null; snapshot: Json | null }[]) {
    const snapshot = row.snapshot as { values?: Record<string, string> } | null;
    out.set(row.id, { designVersionId: row.design_version_id, values: snapshot?.values ?? {} });
  }
  return out;
}

/**
 * The issued people whose certificate no longer matches their group's design
 * or their current details — what "re-issue outdated" works through.
 */
export async function listOutdatedRecipients(
  eventId: string,
  groups: CertificateGroup[],
  recipients: Recipient[],
): Promise<Recipient[]> {
  const live = await liveCertificateDetails(eventId);
  const byGroup = new Map(
    await Promise.all(
      groups.map(async (group) =>
        [group.id, { versionId: await findDesignVersion(group.id, group.design), printed: printedFields(group.design) }] as const,
      ),
    ),
  );
  return outdatedRecipients(recipients, live, byGroup);
}

/** The immutable version row for this exact design (created on first use). */
export async function ensureDesignVersion(groupId: string, design: Design): Promise<string> {
  const admin = createAdminClient();
  const hash = designHash(design);
  const find = () =>
    admin.from("certificate_design_versions").select("id").eq("group_id", groupId).eq("hash", hash).maybeSingle();
  const existing = await find();
  if (existing.data) return existing.data.id;
  const { data, error } = await admin
    .from("certificate_design_versions")
    .insert({ group_id: groupId, hash, design: design as unknown as Json })
    .select("id")
    .single();
  if (data) return data.id;
  if (error?.code === "23505") {
    const again = await find(); // a concurrent issue run recorded it first
    if (again.data) return again.data.id;
  }
  throw new Error("Could not record the design version.");
}

/** v1's uploaded image + name anchor as a design, or an empty design. */
async function designFromV1(eventId: string): Promise<Design> {
  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("events")
    .select("certificate_template, certificate_config")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev?.certificate_template) return emptyDesign();
  const dl = await admin.storage.from(LEGACY_TEMPLATE_BUCKET).download(ev.certificate_template);
  if (dl.error || !dl.data) return emptyDesign();
  const image = sniffImage(new Uint8Array(await dl.data.arrayBuffer()));
  if (!image) return emptyDesign();
  const design = designFromLegacyConfig(
    { path: ev.certificate_template, type: image.type, widthPx: image.width, heightPx: image.height },
    validateCertificateConfig(ev.certificate_config),
  );
  return validateDesign(design, { formFieldIds: new Set(), sheetColumns: new Set() }).ok ? design : emptyDesign();
}

/**
 * The event's Participants group, created on first visit — converting a v1
 * setup if there is one and attaching v1-issued certificates to it (spec §9).
 */
export async function ensureParticipantsGroup(eventId: string, actorId: string | null): Promise<CertificateGroup> {
  const existing = await getParticipantsGroup(eventId);
  if (existing) return existing;

  const admin = createAdminClient();
  const design = await designFromV1(eventId);
  const { data, error } = await admin
    .from("certificate_groups")
    .insert({ event_id: eventId, kind: "participants", name: "Participants", design: design as unknown as Json, created_by: actorId })
    .select(GROUP_COLUMNS)
    .single();
  if (error || !data) {
    const raced = await getParticipantsGroup(eventId); // another tab created it first
    if (raced) return raced;
    throw new Error("Could not set up certificates for this event.");
  }
  const group = toGroup(data as GroupRow);

  const { data: legacy } = await admin
    .from("certificates")
    .select("id")
    .eq("event_id", eventId)
    .is("group_id", null)
    .like("recipient_key", "reg:%")
    .limit(1);
  if (legacy?.length) {
    const versionId = await ensureDesignVersion(group.id, group.design);
    await admin
      .from("certificates")
      .update({ group_id: group.id, design_version_id: versionId })
      .eq("event_id", eventId)
      .is("group_id", null)
      .like("recipient_key", "reg:%");
  }
  return group;
}

/** Every group on the event, Participants first. */
export async function listGroups(eventId: string, actorId: string | null): Promise<CertificateGroup[]> {
  await ensureParticipantsGroup(eventId, actorId);
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select(GROUP_COLUMNS)
    .eq("event_id", eventId)
    .order("kind", { ascending: true })
    .order("sort", { ascending: true })
    .order("created_at", { ascending: true });
  const groups = (data ?? []).map((row) => toGroup(row as GroupRow));
  return [...groups].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "participants" ? -1 : 1));
}

/** A new uploaded-list group, starting from the Participants design so it looks the same. */
export async function createSheetGroup(input: {
  eventId: string;
  name: string;
  actorId: string;
}): Promise<CertificateGroup | { error: string }> {
  const participants = await ensureParticipantsGroup(input.eventId, input.actorId);
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .insert({
      event_id: input.eventId,
      kind: "sheet",
      name: input.name,
      design: participants.design as unknown as Json,
      created_by: input.actorId,
      sort: Date.now() % 100000,
    })
    .select(GROUP_COLUMNS)
    .single();
  if (error || !data) return { error: "Could not add that group. Try again." };
  return toGroup(data as GroupRow);
}

export async function renameGroup(eventId: string, groupId: string, name: string): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("certificate_groups")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("event_id", eventId)
    .eq("kind", "sheet");
  return !error;
}

/** Delete an uploaded group. Certificates already issued from it keep their snapshot. */
export async function deleteSheetGroup(eventId: string, groupId: string): Promise<boolean> {
  const { error } = await createAdminClient()
    .from("certificate_groups")
    .delete()
    .eq("id", groupId)
    .eq("event_id", eventId)
    .eq("kind", "sheet");
  return !error;
}

export async function listSheetRows(groupId: string): Promise<SheetRow[]> {
  const { data } = await createAdminClient()
    .from("certificate_sheet_rows")
    .select("row_no, name, email, data")
    .eq("group_id", groupId)
    .order("row_no", { ascending: true });
  return (data ?? []).map((r) => ({
    row_no: r.row_no,
    name: r.name,
    email: r.email,
    data: (r.data ?? {}) as Record<string, string>,
  }));
}

/** Replace a group's rows in one transaction, and record its columns. */
export async function replaceSheetRows(
  eventId: string,
  groupId: string,
  columns: string[],
  rows: SheetRow[],
): Promise<{ error: string } | { count: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("replace_certificate_sheet_rows", {
    p_group_id: groupId,
    p_rows: rows as unknown as Json,
  });
  if (error) return { error: "Could not save those rows. Try again." };
  const updated = await admin
    .from("certificate_groups")
    .update({ sheet_columns: columns, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("event_id", eventId);
  if (updated.error) return { error: "Saved the rows but not the columns. Try the upload again." };
  return { count: typeof data === "number" ? data : rows.length };
}

/** The event's ledger, as status per recipient key. */
async function ledgerStatus(eventId: string) {
  const { data, error } = await createAdminClient()
    .from("certificates")
    .select("id, recipient_key, serial, issued_at, revoked_at, revoked_reason")
    .eq("event_id", eventId)
    .eq("type", "participation");
  if (error) throw error;
  return statusByKey(data ?? []);
}

/**
 * Everyone who should get a certificate, across every group (spec §3.1):
 * attendees, each member of an attending team, and every uploaded row. Team
 * members with no address of their own are delivered via their leader.
 */
export async function listAllRecipients(event: CertEvent, groups: CertificateGroup[]): Promise<Recipient[]> {
  const participants = groups.find((g) => g.kind === "participants");
  const sheetGroups = groups.filter((g) => g.kind === "sheet");
  const [registrations, status, sheetRows] = await Promise.all([
    listRegistrations(event.id),
    ledgerStatus(event.id),
    Promise.all(sheetGroups.map(async (g) => ({ group: g, rows: await listSheetRows(g.id) }))),
  ]);

  const out: Recipient[] = [];
  const taken = new Set<string>();

  if (participants) {
    for (const registration of registrations.filter((r) => r.attended)) {
      const team = teamOf(registration, event.schema);
      const leaderEmail = registration.email.trim() || null;
      const teamLabel = registration.teamName?.trim() || (team.length > 0 ? `Team ${out.length + 1}` : null);
      const key = registrationKey(registration.id);
      taken.add(key);
      out.push({
        key,
        groupId: participants.id,
        groupLabel: PARTICIPATION_LABEL,
        kind: "registration",
        registrationId: registration.id,
        name: registration.name.trim(),
        teamLabel: team.length > 0 ? teamLabel : null,
        email: leaderEmail,
        deliverTo: leaderEmail,
        viaLeader: false,
        values: registrantValues({
          event: event.info,
          schema: event.schema,
          registration,
          groupLabel: PARTICIPATION_LABEL,
        }),
        status: status.get(key) ?? { state: "pending" },
      });

      for (const member of team.filter((p) => !p.isLeader)) {
        const memberK = memberKey(registration.id, member, taken);
        out.push({
          key: memberK,
          groupId: participants.id,
          groupLabel: PARTICIPATION_LABEL,
          kind: "member",
          registrationId: registration.id,
          name: member.name || member.roll,
          teamLabel,
          email: member.email,
          deliverTo: member.email ?? leaderEmail,
          viaLeader: !member.email && !!leaderEmail,
          values: memberValues({
            event: event.info,
            schema: event.schema,
            registration,
            member,
            groupLabel: PARTICIPATION_LABEL,
          }),
          status: status.get(memberK) ?? { state: "pending" },
        });
      }
    }
  }

  for (const { group, rows } of sheetRows) {
    for (const row of rows) {
      const key = sheetKey(group.id, row, taken);
      out.push({
        key,
        groupId: group.id,
        groupLabel: group.name,
        kind: "sheet",
        registrationId: null,
        name: row.name.trim(),
        teamLabel: null,
        email: row.email,
        deliverTo: row.email,
        viaLeader: false,
        values: sheetValues({ event: event.info, columns: group.sheetColumns, row, groupLabel: group.name }),
        status: status.get(key) ?? { state: "pending" },
      });
    }
  }

  return out;
}

export interface CertificateWorkspace {
  event: CertEvent;
  groups: CertificateGroup[];
  /** The group the Design tab is editing. */
  group: CertificateGroup;
  /** The stored design, with any field that no longer exists shown as text — what the editor opens. */
  editableDesign: Design;
  catalogue: FieldGroup[];
  /** Every recipient, across every group. */
  recipients: Recipient[];
  /** Counts for the active group. */
  counts: RecipientCounts;
  /** Issued certificates in the active group that no longer match the design or their details. */
  outdated: { total: number; withEmail: number };
  assetUrls: Record<string, string>;
}

export async function getCertificateWorkspace(
  eventId: string,
  actorId: string | null,
  activeGroupId?: string,
): Promise<CertificateWorkspace | null> {
  const event = await getCertEvent(eventId);
  if (!event) return null;
  const groups = await listGroups(eventId, actorId);
  const group = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  if (!group) return null;

  const catalogue = buildFieldCatalogue({ formSchema: event.schema, sheetColumns: group.sheetColumns });
  const ctx = designContextFor(event.schema, group.sheetColumns);
  const editableDesign = designWithUnknownFieldsAsText(
    group.design,
    (key) => isKnownField(key, ctx),
    (key) => fieldLabel(catalogue, key),
  );
  const [recipients, assetUrls] = await Promise.all([
    listAllRecipients(event, groups),
    signAssetUrls(assetRefsOf(editableDesign)),
  ]);
  const inGroup = recipients.filter((r) => r.groupId === group.id);
  const stale = await listOutdatedRecipients(eventId, [group], inGroup);
  return {
    event,
    groups,
    group,
    editableDesign,
    catalogue,
    recipients,
    counts: countRecipients(inGroup),
    outdated: { total: stale.length, withEmail: stale.filter((r) => r.deliverTo).length },
    assetUrls,
  };
}

/** Other events whose design this admin may copy: they manage the event and it has a template. */
export async function listDesignSources(
  identity: AdminIdentity,
  eventId: string,
): Promise<{ eventId: string; title: string; date: string }[]> {
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select("event_id, design, events ( title, starts_at, event_clubs ( is_primary, club_id ) )")
    .eq("kind", "participants")
    .neq("event_id", eventId);
  const rows = (data ?? []) as unknown as {
    event_id: string;
    design: Json;
    events: { title: string; starts_at: string; event_clubs: { is_primary: boolean; club_id: string }[] } | null;
  }[];
  return rows
    .filter((row) => {
      if (!row.events || !parseStoredDesign(row.design)?.page.template) return false;
      const primary = row.events.event_clubs.find((c) => c.is_primary) ?? row.events.event_clubs[0];
      return canManage(identity, "issue:participation_certificate", primary?.club_id ?? null);
    })
    .sort((a, b) => b.events!.starts_at.localeCompare(a.events!.starts_at))
    .map((row) => ({ eventId: row.event_id, title: row.events!.title, date: istDateMedium(row.events!.starts_at) }));
}

export interface CertificateEventRow {
  id: string;
  title: string;
  startsAt: string;
  attended: number;
  issued: number;
}

/** Events that have at least one attendee, for the certificates hub. Newest first. */
export async function listCertificateEvents(): Promise<CertificateEventRow[]> {
  const admin = createAdminClient();

  const [attRes, certRes] = await Promise.all([
    admin.from("registrations").select("event_id").eq("attended", true),
    admin.from("certificates").select("event_id, revoked_at").eq("type", "participation"),
  ]);

  const attended = new Map<string, number>();
  for (const r of attRes.data ?? []) {
    if (r.event_id) attended.set(r.event_id, (attended.get(r.event_id) ?? 0) + 1);
  }
  if (attended.size === 0) return [];

  const issued = new Map<string, number>();
  for (const c of certRes.data ?? []) {
    if (c.event_id && !c.revoked_at) issued.set(c.event_id, (issued.get(c.event_id) ?? 0) + 1);
  }

  const { data: events } = await admin.from("events").select("id, title, starts_at").in("id", [...attended.keys()]);

  return (events ?? [])
    .map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      attended: attended.get(e.id) ?? 0,
      issued: issued.get(e.id) ?? 0,
    }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}
