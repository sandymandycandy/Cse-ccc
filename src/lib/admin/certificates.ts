import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import type { AdminIdentity } from "@/lib/auth/capabilities";
import { canManageEvent, hostsFromLinks } from "@/lib/admin/event-hosts";
import { istDateMedium } from "@/lib/datetime";
import { validateFormSchema, type FormField } from "@/lib/registration-form/schema";
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
  winnerValues,
  type CertEventInfo,
  type FieldGroup,
  type FieldValues,
} from "@/lib/certificates/fields";
import { parsePosition } from "@/lib/certificates/winners";
import { listWinnerStandings } from "./certificate-winners";
import { sniffImage } from "@/lib/certificates/image-type";
import {
  countRecipients,
  memberKey,
  outdatedRecipients,
  printedFields,
  registrationKey,
  sheetKey,
  statusByKey,
  winnerKey,
  winnerMemberKey,
  winnerRollKey,
  type LiveCertificate,
  type Recipient,
  type RecipientCounts,
  type RecipientStatus,
} from "@/lib/certificates/recipients";
import { designWithUnknownFieldsAsText } from "@/lib/certificates/rich-text";
import type { ListRow, SheetRow } from "@/lib/certificates/sheet";
import {
  effectiveDesign,
  summarizeBases,
  type BaseDesign,
  type BaseKind,
  type BaseSummary,
} from "@/lib/certificates/bases";
import { loadBases } from "./certificate-bases";
import { getEventFormSchema, listRegistrations, type RegistrationRow } from "./registrations";
import { presentOf, presentPositions } from "./team-attendance";

/**
 * Data layer for the certificate designer (spec §4). Service-role reads and
 * writes of PII — every caller enforces the capability and club scope first.
 */

export const PARTICIPATION_LABEL = "Participation";
export const WINNER_LABEL = "Winner";
const GROUP_COLUMNS = "id, event_id, kind, name, design, base_kind, sheet_columns, position_column";

/**
 * Where a group's people come from: the event's attendees, an uploaded/typed
 * list, or its published podium (spec 2026-09-15 §4.1).
 */
export type CertificateGroupKind = "participants" | "sheet" | "results";

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
  kind: CertificateGroupKind;
  name: string;
  /**
   * The design this group prints with — its own once customised, otherwise its
   * council base's (spec 2026-09-15 §3). Issuing, previews, print and outdated
   * checks all read this, so they follow the base without knowing it exists.
   */
  design: Design;
  /** The group's own saved design; null while it follows its base. */
  customDesign: Design | null;
  /** The base slot this group fills; null for an extra group (Judges…), which is always custom. */
  baseKind: BaseKind | null;
  followsBase: boolean;
  sheetColumns: string[];
  /** Winners from an uploaded list: which column holds the placing. */
  positionColumn: string | null;
}

type GroupRow = {
  id: string;
  event_id: string;
  kind: CertificateGroupKind;
  name: string;
  design: Json | null;
  base_kind: BaseKind | null;
  sheet_columns: string[] | null;
  position_column: string | null;
};

const toGroup = (row: GroupRow, bases: ReadonlyMap<BaseKind, BaseDesign>): CertificateGroup => {
  const customDesign = row.design === null ? null : (parseStoredDesign(row.design) ?? emptyDesign());
  return {
    id: row.id,
    eventId: row.event_id,
    kind: row.kind,
    name: row.name,
    design: effectiveDesign({ customDesign, baseKind: row.base_kind }, bases),
    customDesign,
    baseKind: row.base_kind,
    followsBase: customDesign === null,
    sheetColumns: row.sheet_columns ?? [],
    positionColumn: row.position_column,
  };
};

export async function getGroup(eventId: string, groupId: string): Promise<CertificateGroup | null> {
  const [{ data }, bases] = await Promise.all([
    createAdminClient()
      .from("certificate_groups")
      .select(GROUP_COLUMNS)
      .eq("event_id", eventId)
      .eq("id", groupId)
      .maybeSingle(),
    loadBases(),
  ]);
  return data ? toGroup(data as GroupRow, bases) : null;
}

export async function getParticipantsGroup(eventId: string): Promise<CertificateGroup | null> {
  const [{ data }, bases] = await Promise.all([
    createAdminClient()
      .from("certificate_groups")
      .select(GROUP_COLUMNS)
      .eq("event_id", eventId)
      .eq("kind", "participants")
      .maybeSingle(),
    loadBases(),
  ]);
  return data ? toGroup(data as GroupRow, bases) : null;
}

/**
 * What a group's design may reference: this event's form answers, the group's
 * own list columns, and — on a Winners group — the placing (spec §4.3).
 */
export const groupContext = (event: CertEvent, group: CertificateGroup) =>
  designContextFor(event.schema, group.sheetColumns, group.baseKind === "winners");

/** The + Field menu for a group, with the same winner rule as `groupContext`. */
export const groupCatalogue = (event: CertEvent, group: CertificateGroup) =>
  buildFieldCatalogue({
    formSchema: event.schema,
    sheetColumns: group.sheetColumns,
    winnerFields: group.baseKind === "winners",
  });

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
    // Both types: a Winners group's certificates go stale the same way.
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

/** v1's uploaded image + name anchor as a design, or null when the event never had one. */
async function designFromV1(eventId: string): Promise<Design | null> {
  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("events")
    .select("certificate_template, certificate_config")
    .eq("id", eventId)
    .maybeSingle();
  if (!ev?.certificate_template) return null;
  const dl = await admin.storage.from(LEGACY_TEMPLATE_BUCKET).download(ev.certificate_template);
  if (dl.error || !dl.data) return null;
  const image = sniffImage(new Uint8Array(await dl.data.arrayBuffer()));
  if (!image) return null;
  const design = designFromLegacyConfig(
    { path: ev.certificate_template, type: image.type, widthPx: image.width, heightPx: image.height },
    validateCertificateConfig(ev.certificate_config),
  );
  return validateDesign(design, { formFieldIds: new Set(), sheetColumns: new Set() }).ok ? design : null;
}

/**
 * The event's Participants group, created on first visit — converting a v1
 * setup if there is one and attaching v1-issued certificates to it (spec §9).
 * Without a v1 setup it follows the council's Participants base.
 */
export async function ensureParticipantsGroup(eventId: string, actorId: string | null): Promise<CertificateGroup> {
  const existing = await getParticipantsGroup(eventId);
  if (existing) return existing;

  const admin = createAdminClient();
  const legacyDesign = await designFromV1(eventId);
  const { data, error } = await admin
    .from("certificate_groups")
    .insert({
      event_id: eventId,
      kind: "participants",
      base_kind: "participants",
      name: "Participants",
      // A v1 setup is this event's own design; otherwise it follows the council base.
      design: legacyDesign as unknown as Json | null,
      created_by: actorId,
    })
    .select(GROUP_COLUMNS)
    .single();
  if (error || !data) {
    const raced = await getParticipantsGroup(eventId); // another tab created it first
    if (raced) return raced;
    throw new Error("Could not set up certificates for this event.");
  }
  const group = toGroup(data as GroupRow, await loadBases());

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

/**
 * The fixed groups every event has besides Participants (spec 2026-09-15 §1.1).
 * Winners default to `results` — their people come from the published podium —
 * and can be switched to an uploaded list.
 */
const LIST_SLOTS: { baseKind: BaseKind; name: string; kind: "sheet" | "results" }[] = [
  { baseKind: "volunteers", name: "Volunteers", kind: "sheet" },
  { baseKind: "winners", name: "Winners", kind: "results" },
];

const SLOT_RANK: Record<BaseKind, number> = { participants: 0, volunteers: 1, winners: 2 };
const slotRank = (group: CertificateGroup) => (group.baseKind ? SLOT_RANK[group.baseKind] : 3);

async function ensureListSlots(eventId: string, actorId: string | null): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("certificate_groups")
    .select("base_kind")
    .eq("event_id", eventId)
    .not("base_kind", "is", null);
  const have = new Set((data ?? []).map((row) => row.base_kind));
  for (const slot of LIST_SLOTS) {
    if (have.has(slot.baseKind)) continue;
    // Another tab racing this insert loses on certificate_groups_one_per_base. Harmless: the group exists.
    await admin
      .from("certificate_groups")
      .insert({ event_id: eventId, kind: slot.kind, base_kind: slot.baseKind, name: slot.name, design: null, created_by: actorId });
  }
}

/** Every group on the event: Participants, Volunteers, then extra groups in the order they were added. */
export async function listGroups(eventId: string, actorId: string | null): Promise<CertificateGroup[]> {
  await ensureParticipantsGroup(eventId, actorId);
  await ensureListSlots(eventId, actorId);
  const [{ data }, bases] = await Promise.all([
    createAdminClient()
      .from("certificate_groups")
      .select(GROUP_COLUMNS)
      .eq("event_id", eventId)
      .order("sort", { ascending: true })
      .order("created_at", { ascending: true }),
    loadBases(),
  ]);
  const groups = (data ?? []).map((row) => toGroup(row as GroupRow, bases));
  return [...groups].sort((a, b) => slotRank(a) - slotRank(b));
}

/** A new extra list group (Judges…), starting from whatever Participants currently prints with. Always custom. */
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
  // Its design is its own, so no base is needed to resolve it.
  return toGroup(data as GroupRow, new Map());
}

export async function renameGroup(eventId: string, groupId: string, name: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("event_id", eventId)
    .is("base_kind", null)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** Delete an extra group. Base slots (Participants, Volunteers) can't be. Issued certificates keep their snapshot. */
export async function deleteSheetGroup(eventId: string, groupId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .delete()
    .eq("id", groupId)
    .eq("event_id", eventId)
    .is("base_kind", null)
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

/** A live certificate whose recipient is no longer on any list (spec §4.4). */
export interface OrphanCertificate {
  certificateId: string;
  key: string;
  groupId: string | null;
  name: string;
  serial: string;
  issuedAt: string;
}

/**
 * Certificates that are still live but whose person no longer appears — a
 * winner whose rank was corrected off the podium, someone deleted from a list,
 * an attendance mark undone. Nothing is revoked automatically: the ledger is
 * the record of what was actually sent, so a human decides.
 */
export async function listOrphanCertificates(eventId: string, recipients: Recipient[]): Promise<OrphanCertificate[]> {
  const { data } = await createAdminClient()
    .from("certificates")
    .select("id, recipient_key, recipient_name, serial, issued_at, group_id")
    .eq("event_id", eventId)
    .is("revoked_at", null);
  const known = new Set(recipients.map((r) => r.key));
  return ((data ?? []) as {
    id: string;
    recipient_key: string | null;
    recipient_name: string | null;
    serial: string;
    issued_at: string;
    group_id: string | null;
  }[])
    .filter((row) => row.recipient_key && !known.has(row.recipient_key))
    .map((row) => ({
      certificateId: row.id,
      key: row.recipient_key!,
      groupId: row.group_id,
      name: row.recipient_name?.trim() || row.recipient_key!,
      serial: row.serial,
      issuedAt: row.issued_at,
    }));
}

/** Live certificates a group has issued — what blocks changing where its people come from. */
export async function countLiveCertificates(eventId: string, groupId: string): Promise<number> {
  const { count } = await createAdminClient()
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("group_id", groupId)
    .is("revoked_at", null);
  return count ?? 0;
}

/** Change where a group's people come from (Winners: published results, or an uploaded list). */
export async function setGroupKind(
  eventId: string,
  groupId: string,
  kind: "sheet" | "results",
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("certificate_groups")
    .update({ kind, updated_at: new Date().toISOString() })
    .eq("id", groupId)
    .eq("event_id", eventId)
    .eq("base_kind", "winners")
    .select("id");
  return !error && (data?.length ?? 0) > 0;
}

export async function listSheetRows(groupId: string): Promise<ListRow[]> {
  const { data } = await createAdminClient()
    .from("certificate_sheet_rows")
    .select("id, row_no, name, email, roll, data")
    .eq("group_id", groupId)
    .order("row_no", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    row_no: r.row_no,
    name: r.name,
    email: r.email,
    roll: r.roll,
    data: (r.data ?? {}) as Record<string, string>,
  }));
}

/** Replace a group's rows in one transaction, and record its columns. */
export async function replaceSheetRows(
  eventId: string,
  groupId: string,
  columns: string[],
  rows: SheetRow[],
  positionColumn: string | null = null,
): Promise<{ error: string } | { count: number }> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("replace_certificate_sheet_rows", {
    p_group_id: groupId,
    p_rows: rows as unknown as Json,
  });
  if (error) return { error: "Could not save those rows. Try again." };
  const updated = await admin
    .from("certificate_groups")
    .update({ sheet_columns: columns, position_column: positionColumn, updated_at: new Date().toISOString() })
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
    // Both types — winner keys are `win:…`, participation `reg:`/`sheet:`, so
    // one person can hold both and each is matched to its own recipient.
    .eq("event_id", eventId);
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
      // Per-person attendance: the leader is position 0; solo entries have no team.
      const present = presentOf(team, true, registration.absentMembers);
      const leaderPresent = team.length === 0 || present.some((p) => p.isLeader);
      const leaderEmail = registration.email.trim() || null;
      const teamLabel = registration.teamName?.trim() || (team.length > 0 ? `Team ${out.length + 1}` : null);
      const key = registrationKey(registration.id);
      if (leaderPresent) {
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
      }

      // An absent leader's email may still carry a present member's certificate —
      // that is only a delivery address, not a certificate for the leader.
      for (const member of present.filter((p) => !p.isLeader)) {
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

  for (const group of groups.filter((g) => g.kind === "results")) {
    for (const recipient of await winnerRecipients(event, group, registrations, status, taken)) {
      out.push(recipient);
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
        values: listRowValues(event, group, row),
        status: status.get(key) ?? { state: "pending" },
      });
    }
  }

  return out;
}

/**
 * A list row's values. A Winners group fed by an uploaded list also prints the
 * placing from its Position column: "1"/"1st"/"First" all become "1st", and
 * anything else — "Best UI" — prints as typed (spec §4.3).
 */
function listRowValues(event: CertEvent, group: CertificateGroup, row: SheetRow): FieldValues {
  const values = sheetValues({ event: event.info, columns: group.sheetColumns, row, groupLabel: group.name });
  if (group.baseKind !== "winners") return values;
  const typed = group.positionColumn ? (row.data[group.positionColumn] ?? "") : "";
  const place = parsePosition(typed);
  return { ...values, "winner.place": place, "winner.placeWords": placeWordsFor(place) };
}

/** "1st" → "First". An award we don't recognise has no long form — it prints as itself. */
const placeWordsFor = (place: string): string =>
  place === "1st" ? "First" : place === "2nd" ? "Second" : place === "3rd" ? "Third" : place;

/**
 * Everyone on the event's published podium (spec §4.2). A standing that came
 * from a registration is expanded through that registration, so team members
 * keep their own email addresses; one that did not (a roll typed straight into
 * the results) is expanded from the standing's own member list and has no
 * address, so it is download-only.
 */
async function winnerRecipients(
  event: CertEvent,
  group: CertificateGroup,
  registrations: RegistrationRow[],
  status: Map<string, RecipientStatus>,
  taken: Set<string>,
): Promise<Recipient[]> {
  const standings = await listWinnerStandings(event.id);
  const byId = new Map(registrations.map((r) => [r.id, r]));
  const out: Recipient[] = [];

  for (const standing of standings) {
    const label = standing.teamName?.trim() || null;
    const base = { groupId: group.id, groupLabel: group.name, teamLabel: label, viaLeader: false };
    const registration = standing.registrationId ? byId.get(standing.registrationId) : undefined;

    if (registration) {
      const leaderEmail = registration.email.trim() || null;
      const key = winnerKey(registration.id);
      taken.add(key);
      out.push({
        ...base,
        key,
        kind: "registration",
        registrationId: registration.id,
        name: registration.name.trim(),
        email: leaderEmail,
        deliverTo: leaderEmail,
        values: winnerValues({
          event: event.info,
          standing,
          person: {
            name: registration.name,
            roll: registration.roll,
            email: leaderEmail,
            department: registration.department,
            year: registration.year == null ? null : String(registration.year),
          },
          groupLabel: group.name,
        }),
        status: status.get(key) ?? { state: "pending" },
      });

      for (const member of teamOf(registration, event.schema).filter((p) => !p.isLeader)) {
        const memberK = winnerMemberKey(registration.id, member, taken);
        out.push({
          ...base,
          key: memberK,
          kind: "member",
          registrationId: registration.id,
          name: member.name || member.roll,
          email: member.email,
          deliverTo: member.email ?? leaderEmail,
          viaLeader: !member.email && !!leaderEmail,
          values: winnerValues({
            event: event.info,
            standing,
            person: { name: member.name || member.roll, roll: member.roll, email: member.email, department: member.department, year: member.year },
            groupLabel: group.name,
          }),
          status: status.get(memberK) ?? { state: "pending" },
        });
      }
      continue;
    }

    const people = [
      { name: standing.displayName?.trim() || standing.rollNo, roll: standing.rollNo },
      ...standing.teamMembers,
    ];
    for (const person of people) {
      const key = winnerRollKey(person, taken);
      out.push({
        ...base,
        key,
        kind: "sheet",
        registrationId: null,
        name: person.name || person.roll,
        email: null,
        deliverTo: null,
        values: winnerValues({
          event: event.info,
          standing,
          person: { name: person.name || person.roll, roll: person.roll, email: null },
          groupLabel: group.name,
        }),
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
  /** Every base's status — the preview banner and the Save-as-base confirm read it. */
  bases: Record<BaseKind, BaseSummary>;
  /** The active group's people, when it is a list group (typed or uploaded). */
  listRows: ListRow[];
  /** Live certificates whose person is no longer on any list. */
  orphans: OrphanCertificate[];
}

export async function getCertificateWorkspace(
  eventId: string,
  actorId: string | null,
  activeGroupId?: string,
): Promise<CertificateWorkspace | null> {
  const event = await getCertEvent(eventId);
  if (!event) return null;
  const [groups, bases] = await Promise.all([listGroups(eventId, actorId), loadBases()]);
  const group = groups.find((g) => g.id === activeGroupId) ?? groups[0];
  if (!group) return null;

  const catalogue = groupCatalogue(event, group);
  const ctx = groupContext(event, group);
  const editableDesign = designWithUnknownFieldsAsText(
    group.design,
    (key) => isKnownField(key, ctx),
    (key) => fieldLabel(catalogue, key),
  );
  const [recipients, assetUrls, listRows] = await Promise.all([
    listAllRecipients(event, groups),
    signAssetUrls(assetRefsOf(editableDesign)),
    group.kind === "sheet" ? listSheetRows(group.id) : Promise.resolve([] as ListRow[]),
  ]);
  const inGroup = recipients.filter((r) => r.groupId === group.id);
  const [stale, orphans] = await Promise.all([
    listOutdatedRecipients(eventId, [group], inGroup),
    listOrphanCertificates(eventId, recipients),
  ]);
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
    bases: summarizeBases(bases),
    listRows,
    orphans,
  };
}

/**
 * Other events whose design this admin may copy: they manage the event and it has a template.
 * A group following the base isn't listed: copying it would just copy the base.
 */
export async function listDesignSources(
  identity: AdminIdentity,
  eventId: string,
): Promise<{ eventId: string; title: string; date: string }[]> {
  const { data } = await createAdminClient()
    .from("certificate_groups")
    .select("event_id, design, events ( title, starts_at, event_clubs ( is_primary, club_id ) )")
    .eq("kind", "participants")
    .not("design", "is", null)
    .neq("event_id", eventId);
  const rows = (data ?? []) as unknown as {
    event_id: string;
    design: Json;
    events: { title: string; starts_at: string; event_clubs: { is_primary: boolean; club_id: string }[] } | null;
  }[];
  return rows
    .filter((row) => {
      if (!row.events || !parseStoredDesign(row.design)?.page.template) return false;
      // Any event this admin could certify, as owner or co-host.
      return canManageEvent(
        identity,
        "issue:participation_certificate",
        hostsFromLinks(row.events.event_clubs),
      );
    })
    .sort((a, b) => b.events!.starts_at.localeCompare(a.events!.starts_at))
    .map((row) => ({ eventId: row.event_id, title: row.events!.title, date: istDateMedium(row.events!.starts_at) }));
}

export interface CertificateEventRow {
  id: string;
  title: string;
  startsAt: string;
  /** Everyone due a certificate: attendees, their team members, and uploaded rows. */
  people: number;
  issued: number;
}

/** Read every row of a table in pages — Supabase caps a single select at 1000. */
async function selectAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const page = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += page) {
    const { data } = await query(from, from + page - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}

/**
 * The certificates hub: every event that has anyone to certify, with the same
 * people count the Recipients tab shows — attendees expanded into their team
 * members, plus uploaded lists. Read-only: viewing the hub never creates a
 * group. Newest first.
 */
export async function listCertificateEvents(): Promise<CertificateEventRow[]> {
  const admin = createAdminClient();

  const [attendedRows, groupRows, certRows] = await Promise.all([
    selectAll<{ event_id: string | null; custom_answers: Json | null; absent_members: number[] | null }>((from, to) =>
      admin.from("registrations").select("event_id, custom_answers, absent_members").eq("attended", true).range(from, to),
    ),
    selectAll<{ id: string; event_id: string; kind: "participants" | "sheet" | "results" }>((from, to) =>
      admin.from("certificate_groups").select("id, event_id, kind").range(from, to),
    ),
    selectAll<{ event_id: string; revoked_at: string | null }>((from, to) =>
      admin.from("certificates").select("event_id, revoked_at").range(from, to),
    ),
  ]);

  const sheetGroups = groupRows.filter((g) => g.kind === "sheet");
  const [sheetCounts, winnerCounts] = await Promise.all([
    Promise.all(
      sheetGroups.map(async (group) => {
        const { count } = await admin
          .from("certificate_sheet_rows")
          .select("id", { count: "exact", head: true })
          .eq("group_id", group.id);
        return { eventId: group.event_id, count: count ?? 0 };
      }),
    ),
    // Winners fed by results: everyone on the podium, each team member counted,
    // as the Recipients tab lists them (spec 2026-09-15 §4.4).
    Promise.all(
      groupRows
        .filter((g) => g.kind === "results")
        .map(async (group) => ({
          eventId: group.event_id,
          count: (await listWinnerStandings(group.event_id)).reduce((n, s) => n + 1 + s.teamMembers.length, 0),
        })),
    ),
  ]);

  const eventIds = new Set<string>();
  for (const row of attendedRows) {
    if (row.event_id) eventIds.add(row.event_id);
  }
  const sheetPerEvent = new Map<string, number>();
  for (const { eventId, count } of [...sheetCounts, ...winnerCounts]) {
    if (count === 0) continue;
    eventIds.add(eventId);
    sheetPerEvent.set(eventId, (sheetPerEvent.get(eventId) ?? 0) + count);
  }
  const issuedPerEvent = new Map<string, number>();
  for (const row of certRows) {
    eventIds.add(row.event_id);
    if (!row.revoked_at) issuedPerEvent.set(row.event_id, (issuedPerEvent.get(row.event_id) ?? 0) + 1);
  }
  if (eventIds.size === 0) return [];

  // Team members are recipients too, so the attendee count alone would be wrong
  // for a team event. Expand them here, once for every event, rather than per row.
  const ids = [...eventIds];
  const [events, forms] = await Promise.all([
    admin.from("events").select("id, title, starts_at").in("id", ids),
    admin.from("events").select("id, registration_form").in("id", ids),
  ]);

  const schemas = new Map<string, FormField[]>();
  for (const row of (forms.data ?? []) as { id: string; registration_form: unknown }[]) {
    const parsed = row.registration_form ? validateFormSchema(row.registration_form) : null;
    schemas.set(row.id, parsed?.ok ? parsed.fields : []);
  }
  // Everyone present on each attended entry: the registrant alone on a solo
  // event, otherwise the team minus its per-person absences.
  const presentPerEvent = new Map<string, number>();
  for (const row of attendedRows) {
    if (!row.event_id) continue;
    const schema = schemas.get(row.event_id) ?? [];
    // `teamOf` drops people with neither name nor roll, so the stub leader needs
    // a name to keep position 0 — absences are indexed with the leader included.
    const team = schema.length
      ? teamOf(
          { name: "leader", roll: "", department: null, year: null, email: "", phone: null, teamName: null, customAnswers: row.custom_answers as Record<string, unknown> | null },
          schema,
        )
      : [];
    const size = team.length || 1;
    const n = presentPositions(size, true, team.length > 0 ? row.absent_members ?? [] : []).length;
    presentPerEvent.set(row.event_id, (presentPerEvent.get(row.event_id) ?? 0) + n);
  }

  return ((events.data ?? []) as { id: string; title: string; starts_at: string }[])
    .map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      people:
        (presentPerEvent.get(e.id) ?? 0) + (sheetPerEvent.get(e.id) ?? 0),
      issued: issuedPerEvent.get(e.id) ?? 0,
    }))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
}
