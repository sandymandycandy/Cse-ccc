import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

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
}

export async function listRegistrations(eventId: string): Promise<RegistrationRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select(
      "id, student_name, roll_no, department, year, email, phone, confirmed_at, attended, checkin_method",
    )
    .eq("event_id", eventId)
    .order("student_name", { ascending: true });
  if (error) throw error;
  return (
    (data ?? []) as {
      id: string;
      student_name: string;
      roll_no: string;
      department: string | null;
      year: number | null;
      email: string;
      phone: string | null;
      confirmed_at: string | null;
      attended: boolean;
      checkin_method: string | null;
    }[]
  ).map((r) => ({
    id: r.id,
    name: r.student_name,
    roll: r.roll_no,
    department: r.department,
    year: r.year,
    email: r.email,
    phone: r.phone,
    confirmed: !!r.confirmed_at,
    attended: r.attended,
    method: r.checkin_method,
  }));
}
