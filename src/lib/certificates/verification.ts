import { formatEventDate, formatIstDate } from "./fields";

/**
 * What the public verify page may say about a serial (spec §7, SECURITY_SPEC §9).
 * The row type holds only the columns the page is allowed to read. Email, roll,
 * phone, team and the revoke reason are never selected, so they cannot leak
 * from here.
 */

export interface VerifyRow {
  serial: string;
  type: "participation" | "winner";
  recipient_name: string | null;
  issued_at: string;
  revoked_at: string | null;
  superseded_by: string | null;
  group_label: string | null;
  event: { title: string; starts_at: string; ends_at: string | null; club_name: string | null } | null;
}

export type VerifyResult =
  | {
      state: "valid";
      serial: string;
      name: string;
      eventTitle: string;
      clubName: string | null;
      eventDate: string;
      groupLabel: string;
      issuedDate: string;
    }
  | { state: "superseded"; serial: string; eventTitle: string; issuedDate: string }
  | { state: "revoked"; serial: string; eventTitle: string; revokedDate: string }
  | { state: "unknown" };

/** Every verify response takes at least this long, hit or miss, so timing says nothing. */
export const VERIFY_MIN_MS = 450;

export function toVerifyResult(row: VerifyRow | null): VerifyResult {
  if (!row || !row.event) return { state: "unknown" };
  const eventTitle = row.event.title;
  // A re-issue retires the old row and links the new one; that is not a revocation.
  if (row.revoked_at && row.superseded_by) {
    return { state: "superseded", serial: row.serial, eventTitle, issuedDate: formatIstDate(row.issued_at) };
  }
  if (row.revoked_at) {
    return { state: "revoked", serial: row.serial, eventTitle, revokedDate: formatIstDate(row.revoked_at) };
  }
  return {
    state: "valid",
    serial: row.serial,
    name: row.recipient_name?.trim() ?? "",
    eventTitle,
    clubName: row.event.club_name,
    eventDate: formatEventDate(row.event.starts_at, row.event.ends_at),
    groupLabel: row.group_label?.trim() || (row.type === "winner" ? "Winner" : "Participation"),
    issuedDate: formatIstDate(row.issued_at),
  };
}

const realClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

/** Run `work`, then wait out whatever is left of `ms` — even if `work` threw. */
export async function atLeast<T>(ms: number, work: () => Promise<T>, clock = realClock): Promise<T> {
  const start = clock.now();
  try {
    return await work();
  } finally {
    const left = ms - (clock.now() - start);
    if (left > 0) await clock.sleep(left);
  }
}
