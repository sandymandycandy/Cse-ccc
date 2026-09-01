import type { RegistrationRow } from "@/lib/admin/registrations";

/** Partition rows into confirmed vs waitlisted (unconfirmed, ordered by position). */
export function splitRegistrations(rows: RegistrationRow[]): {
  confirmed: RegistrationRow[];
  waitlist: RegistrationRow[];
} {
  const confirmed = rows.filter((r) => r.confirmed);
  const waitlist = rows
    .filter((r) => !r.confirmed && r.waitlistPosition != null)
    .sort((a, b) => (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0));
  return { confirmed, waitlist };
}
