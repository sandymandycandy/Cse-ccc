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
  registrantValues,
  type CertEventInfo,
  type FieldGroup,
} from "@/lib/certificates/fields";
import { sniffImage } from "@/lib/certificates/image-type";
import {
  countRecipients,
  registrationKey,
  statusByKey,
  type Recipient,
  type RecipientCounts,
} from "@/lib/certificates/recipients";
import { designWithUnknownFieldsAsText } from "@/lib/certificates/rich-text";
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

/** The immutable version row for this exact design (created on first use). */
export async function ensureDesignVersion(groupId: string, design: Design): Promise<string> {
  const admin = createAdminClient();
  const hash = createHash("sha256").update(canonicalJson(design)).digest("hex");
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

/** Attendees as certificate recipients, each with values and issue status (phase 1: registrants). */
export async function listParticipantRecipients(event: CertEvent): Promise<Recipient[]> {
  const admin = createAdminClient();
  const [registrations, ledger] = await Promise.all([
    listRegistrations(event.id),
    admin
      .from("certificates")
      .select("id, recipient_key, serial, issued_at, revoked_at, revoked_reason")
      .eq("event_id", event.id)
      .eq("type", "participation"),
  ]);
  if (ledger.error) throw ledger.error;
  const status = statusByKey(ledger.data ?? []);
  return registrations
    .filter((r) => r.attended)
    .map((r) => {
      const key = registrationKey(r.id);
      return {
        key,
        registrationId: r.id,
        name: r.name.trim(),
        email: r.email.trim() || null,
        values: registrantValues({ event: event.info, schema: event.schema, registration: r, groupLabel: PARTICIPATION_LABEL }),
        status: status.get(key) ?? { state: "pending" },
      };
    });
}

export interface CertificateWorkspace {
  event: CertEvent;
  group: CertificateGroup;
  /** The stored design, with any field that no longer exists shown as text — what the editor opens. */
  editableDesign: Design;
  catalogue: FieldGroup[];
  recipients: Recipient[];
  counts: RecipientCounts;
  assetUrls: Record<string, string>;
}

export async function getCertificateWorkspace(eventId: string, actorId: string | null): Promise<CertificateWorkspace | null> {
  const event = await getCertEvent(eventId);
  if (!event) return null;
  const group = await ensureParticipantsGroup(eventId, actorId);
  const catalogue = buildFieldCatalogue({ formSchema: event.schema, sheetColumns: group.sheetColumns });
  const ctx = designContextFor(event.schema, group.sheetColumns);
  const editableDesign = designWithUnknownFieldsAsText(
    group.design,
    (key) => isKnownField(key, ctx),
    (key) => fieldLabel(catalogue, key),
  );
  const [recipients, assetUrls] = await Promise.all([
    listParticipantRecipients(event),
    signAssetUrls(assetRefsOf(editableDesign)),
  ]);
  return { event, group, editableDesign, catalogue, recipients, counts: countRecipients(recipients), assetUrls };
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
