import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VerifyRow } from "./verification";

type Row = Omit<VerifyRow, "event"> & {
  events: {
    title: string;
    starts_at: string;
    ends_at: string | null;
    event_clubs: { is_primary: boolean; clubs: { name: string } | null }[];
  } | null;
};

/**
 * Look a certificate up by serial for the public verify page. Service role,
 * because `certificates` has no anon grant. The select names only what the
 * page may show, plus the two columns that say whether it is still live.
 * `snapshot` is read by one key, never whole: it also holds the recipient's
 * email and roll.
 */
export async function lookupCertificate(serial: string): Promise<VerifyRow | null> {
  const { data, error } = await createAdminClient()
    .from("certificates")
    .select(
      "serial, type, recipient_name, issued_at, revoked_at, superseded_by, group_label:snapshot->>groupLabel, place:snapshot->>place, events ( title, starts_at, ends_at, event_clubs ( is_primary, clubs ( name ) ) )",
    )
    .eq("serial", serial)
    .maybeSingle();
  if (error) throw new Error(`certificate lookup failed: ${error.message}`);
  if (!data) return null;
  const row = data as unknown as Row;
  const clubs = row.events?.event_clubs ?? [];
  const primary = clubs.find((c) => c.is_primary) ?? clubs[0];
  return {
    serial: row.serial,
    type: row.type,
    recipient_name: row.recipient_name,
    issued_at: row.issued_at,
    revoked_at: row.revoked_at,
    superseded_by: row.superseded_by,
    group_label: row.group_label,
    place: row.place,
    event: row.events
      ? {
          title: row.events.title,
          starts_at: row.events.starts_at,
          ends_at: row.events.ends_at,
          club_name: primary?.clubs?.name ?? null,
        }
      : null,
  };
}
