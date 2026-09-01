import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateCertificateConfig, type CertificateConfig } from "@/lib/certificates/config";
import { listRegistrations } from "./registrations";

export const CERTIFICATE_TEMPLATE_BUCKET = "certificate-templates";

export interface CertificateAttendee {
  registrationId: string;
  name: string;
  email: string;
  issued: boolean;
  issuedAt: string | null;
}

export interface CertificateSetup {
  /** Storage object path of the uploaded template (in events.certificate_template). */
  templatePath: string | null;
  /** Public URL for the admin preview, or null if no template yet. */
  templateUrl: string | null;
  config: CertificateConfig;
  /** Every attendee (attended = true), each flagged issued/not. */
  attendees: CertificateAttendee[];
  issuedCount: number;
  /** Attendees with an email, not yet issued — the ones a run will email. */
  pendingCount: number;
  /** Attended but no email on file — can't be emailed. */
  missingEmailCount: number;
}

/** Everything the per-event certificates page needs. Service-role (PII) — the
 *  caller enforces the club scope + capability. */
export async function getCertificateSetup(eventId: string): Promise<CertificateSetup> {
  const admin = createAdminClient();

  const { data: ev } = await admin
    .from("events")
    .select("certificate_template, certificate_config")
    .eq("id", eventId)
    .maybeSingle();

  const templatePath = ev?.certificate_template ?? null;
  const config = validateCertificateConfig(ev?.certificate_config ?? null);
  const templateUrl = templatePath
    ? admin.storage.from(CERTIFICATE_TEMPLATE_BUCKET).getPublicUrl(templatePath).data.publicUrl
    : null;

  const [regs, issued] = await Promise.all([
    listRegistrations(eventId),
    admin
      .from("certificates")
      .select("registration_id, issued_at, revoked_at")
      .eq("event_id", eventId)
      .eq("type", "participation"),
  ]);

  // A non-revoked participation cert for this registration = already issued.
  const issuedByReg = new Map<string, string>();
  for (const c of issued.data ?? []) {
    if (c.registration_id && !c.revoked_at) issuedByReg.set(c.registration_id, c.issued_at);
  }

  const attendees: CertificateAttendee[] = regs
    .filter((r) => r.attended)
    .map((r) => ({
      registrationId: r.id,
      name: r.name,
      email: r.email,
      issued: issuedByReg.has(r.id),
      issuedAt: issuedByReg.get(r.id) ?? null,
    }));

  return {
    templatePath,
    templateUrl,
    config,
    attendees,
    issuedCount: attendees.filter((a) => a.issued).length,
    pendingCount: attendees.filter((a) => a.email && !a.issued).length,
    missingEmailCount: attendees.filter((a) => !a.email).length,
  };
}

export interface CertificateEventRow {
  id: string;
  title: string;
  startsAt: string;
  attended: number;
  issued: number;
}

/** Events that have at least one attendee, for the certificates hub. Newest
 *  first. Service-role — the caller enforces the capability. */
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

  const ids = [...attended.keys()];
  const { data: events } = await admin
    .from("events")
    .select("id, title, starts_at")
    .in("id", ids);

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
