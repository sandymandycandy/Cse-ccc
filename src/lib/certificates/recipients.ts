import type { FieldValues } from "./fields";

/**
 * Who gets a certificate and where each one stands (spec §3, §5). Pure — the
 * data layer loads registrations and ledger rows, this decides status.
 * Phase 1 covers registrations (solo participants and team leaders).
 */

export interface Recipient {
  /** Stable identity across re-issues: "reg:<registrationId>". */
  key: string;
  registrationId: string;
  name: string;
  /** Where the certificate is emailed; null = download only. */
  email: string | null;
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

export const registrationKey = (registrationId: string) => `reg:${registrationId}`;

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

/** Recipients the next bulk run should process: not issued, not revoked, and (to email) with an address. */
export function pendingRecipients(recipients: Recipient[], mode: IssueMode): Recipient[] {
  return recipients.filter((r) => r.status.state === "pending" && (mode === "record" || !!r.email));
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
    noEmail: recipients.filter((r) => r.status.state === "pending" && !r.email).length,
  };
}

/** "Certificate - Asha R - Hack Night.pdf", safe as an attachment or ZIP entry name. */
export function certificateFileName(name: string, eventTitle: string): string {
  const base = `Certificate - ${name.trim() || "Participant"} - ${eventTitle.trim()}`
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 116)
    .trim();
  return `${base}.pdf`;
}
