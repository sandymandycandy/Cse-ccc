import type { FieldValues } from "./fields";

/**
 * Who gets a certificate, where it is sent, and where each one stands
 * (spec §3, §5). Pure — the data layer loads registrations, team members,
 * sheet rows and ledger rows; this decides identity, delivery and status.
 */

export type RecipientKind = "registration" | "member" | "sheet";

export interface Recipient {
  /** Stable identity across re-issues and sheet re-uploads. */
  key: string;
  groupId: string;
  /** The group's label as printed by `{Group}` — "Participation", "Volunteers"… */
  groupLabel: string;
  kind: RecipientKind;
  /** The registration this person came from; null for sheet rows. */
  registrationId: string | null;
  name: string;
  /** The team this person belongs to, when the event has teams. */
  teamLabel: string | null;
  /** This person's own address, if we hold one. */
  email: string | null;
  /** Where the certificate is actually emailed — a team member with no address of their own goes to their leader. */
  deliverTo: string | null;
  viaLeader: boolean;
  values: FieldValues;
  status: RecipientStatus;
}

export type RecipientStatus =
  | { state: "pending" }
  | { state: "issued"; certificateId: string; serial: string; issuedAt: string }
  | { state: "revoked"; revokedAt: string };

/** The ledger columns status needs. */
export interface CertificateLedgerRow {
  id: string;
  recipient_key: string | null;
  serial: string;
  issued_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
}

/** trim, collapse inner whitespace, lowercase — the basis of every key. */
const norm = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

/** Claim `base`, or the first free `base#2`, `base#3`… */
function unique(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  for (let n = 2; ; n++) {
    const candidate = `${base}#${n}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

export const registrationKey = (registrationId: string) => `reg:${registrationId}`;

/**
 * A team member hangs off their registration, identified by roll where there is
 * one and by name otherwise — so the same person keeps their certificate when
 * the team list is edited around them.
 */
export function memberKey(
  registrationId: string,
  member: { name: string; roll: string },
  taken: Set<string>,
): string {
  const who = norm(member.roll) || norm(member.name) || "member";
  return unique(`reg:${registrationId}:m:${who}`, taken);
}

/** A sheet row is identified by email where there is one, else by name, so a re-upload matches. */
export function sheetKey(groupId: string, row: { name: string; email: string | null }, taken: Set<string>): string {
  const who = norm(row.email ?? "") || norm(row.name) || "row";
  return unique(`sheet:${groupId}:${who}`, taken);
}

/**
 * Status per recipient key. A live row wins; otherwise the most recent
 * standalone revoke (not a supersede — that always has a live successor) makes
 * the recipient "revoked", so bulk issuing leaves them alone.
 */
export function statusByKey(rows: CertificateLedgerRow[]): Map<string, RecipientStatus> {
  const out = new Map<string, RecipientStatus>();
  const sorted = [...rows].sort((a, b) => a.issued_at.localeCompare(b.issued_at));
  for (const row of sorted) {
    if (!row.recipient_key) continue;
    const current = out.get(row.recipient_key);
    if (!row.revoked_at) {
      out.set(row.recipient_key, { state: "issued", certificateId: row.id, serial: row.serial, issuedAt: row.issued_at });
    } else if (row.revoked_reason !== "superseded" && current?.state !== "issued") {
      out.set(row.recipient_key, { state: "revoked", revokedAt: row.revoked_at });
    }
  }
  return out;
}

export type IssueMode = "email" | "record";

/** Recipients the next bulk run should process: not issued, not revoked, and (to email) with somewhere to send. */
export function pendingRecipients(recipients: Recipient[], mode: IssueMode): Recipient[] {
  return recipients.filter((r) => r.status.state === "pending" && (mode === "record" || !!r.deliverTo));
}

export interface RecipientCounts {
  total: number;
  issued: number;
  revoked: number;
  pendingEmail: number;
  noEmail: number;
}

export function countRecipients(recipients: Recipient[]): RecipientCounts {
  return {
    total: recipients.length,
    issued: recipients.filter((r) => r.status.state === "issued").length,
    revoked: recipients.filter((r) => r.status.state === "revoked").length,
    pendingEmail: pendingRecipients(recipients, "email").length,
    noEmail: recipients.filter((r) => r.status.state === "pending" && !r.deliverTo).length,
  };
}

export interface Destination {
  /** The address to send to, spelled as first seen. */
  email: string;
  recipients: Recipient[];
}

/**
 * One email per address. A team leader who also receives certificates for
 * members without their own address gets a single mail carrying all of them,
 * rather than one mail per person.
 */
export function groupByDestination(recipients: Recipient[]): Destination[] {
  const byAddress = new Map<string, Destination>();
  for (const recipient of recipients) {
    if (!recipient.deliverTo) continue;
    const key = recipient.deliverTo.toLowerCase();
    const existing = byAddress.get(key);
    if (existing) existing.recipients.push(recipient);
    else byAddress.set(key, { email: recipient.deliverTo, recipients: [recipient] });
  }
  return [...byAddress.values()];
}

/**
 * Take whole destinations until the batch holds at least `minRecipients`. A
 * destination is never split, so a leader's team always arrives in one email
 * and one run.
 */
export function cutBatch(destinations: Destination[], minRecipients: number): Destination[] {
  const batch: Destination[] = [];
  let count = 0;
  for (const destination of destinations) {
    if (count >= minRecipients) break;
    batch.push(destination);
    count += destination.recipients.length;
  }
  return batch;
}

/**
 * Split a run of items so no chunk exceeds `maxBytes` — used to keep a single
 * email's attachments under the provider's limit. An item bigger than the cap
 * on its own still goes out alone rather than being dropped.
 */
export function chunkBySize<T>(items: T[], sizeOf: (item: T) => number, maxBytes: number): T[][] {
  const chunks: T[][] = [];
  let current: T[] = [];
  let total = 0;
  for (const item of items) {
    const size = sizeOf(item);
    if (current.length > 0 && total + size > maxBytes) {
      chunks.push(current);
      current = [];
      total = 0;
    }
    current.push(item);
    total += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** "Certificate - Asha R - Hack Night.pdf", safe as an attachment or ZIP entry name. */
export function certificateFileName(name: string, eventTitle: string): string {
  const base = `Certificate - ${name.trim() || "Participant"} - ${eventTitle.trim()}`
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 116)
    .trim();
  return `${base}.pdf`;
}
