import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultFormFor, validateFormSchema, type FormField } from "@/lib/registration-form/schema";

/** Registration rows for the admin view (PII — service-role only, scoped by the caller). */
export interface RegistrationRow {
  id: string;
  name: string;
  roll: string;
  department: string | null;
  year: number | null;
  email: string;
  phone: string | null;
  confirmed: boolean;
  attended: boolean;
  method: string | null;
  customAnswers: Record<string, unknown> | null;
  /** The team's own name; null on solo events and on rows predating the field. */
  teamName: string | null;
  shortlistedAt: string | null;
  waitlistPosition: number | null;
}

export async function listRegistrations(eventId: string): Promise<RegistrationRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select(
      "id, student_name, roll_no, department, year, email, phone, confirmed_at, attended, checkin_method, custom_answers, team_name, shortlisted_at, waitlist_position",
    )
    .eq("event_id", eventId)
    .order("student_name", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      student_name: string | null;
      roll_no: string | null;
      department: string | null;
      year: number | null;
      email: string | null;
      phone: string | null;
      confirmed_at: string | null;
      attended: boolean;
      checkin_method: string | null;
      custom_answers: Record<string, unknown> | null;
      team_name: string | null;
      shortlisted_at: string | null;
      waitlist_position: number | null;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.student_name ?? "",
    roll: r.roll_no ?? "",
    department: r.department,
    year: r.year,
    email: r.email ?? "",
    phone: r.phone,
    confirmed: !!r.confirmed_at,
    attended: r.attended,
    method: r.checkin_method,
    customAnswers: r.custom_answers ?? null,
    teamName: r.team_name ?? null,
    shortlistedAt: r.shortlisted_at ?? null,
    waitlistPosition: r.waitlist_position ?? null,
  }));
}

/** The event's stored form schema + selection mode (falls back to the default form). */
export async function getEventFormSchema(
  eventId: string,
): Promise<{ schema: FormField[]; selectionMode: "seats" | "shortlist" }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("registration_form, selection_mode")
    .eq("id", eventId)
    .maybeSingle();
  const rf = (data as { registration_form?: unknown } | null)?.registration_form;
  const parsed = rf ? validateFormSchema(rf) : null;
  return {
    schema: parsed && parsed.ok ? parsed.fields : defaultFormFor(),
    selectionMode:
      ((data as { selection_mode?: "seats" | "shortlist" } | null)?.selection_mode) ?? "seats",
  };
}
