import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RegistrationForFields } from "@/lib/certificates/fields";

export type MarkingRow = RegistrationForFields & {
  attended: boolean;
  absent: number[];
  shortlistedAt: string | null;
};

/** One registration, scoped to its event, with what marking needs. */
export async function getRegistrationForMarking(eventId: string, registrationId: string): Promise<MarkingRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("registrations")
    .select("student_name, roll_no, department, year, email, phone, team_name, custom_answers, attended, absent_members, shortlisted_at")
    .eq("id", registrationId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    name: data.student_name ?? "",
    roll: data.roll_no ?? "",
    department: data.department,
    year: data.year,
    email: data.email ?? "",
    phone: data.phone,
    teamName: data.team_name ?? null,
    customAnswers: (data.custom_answers as Record<string, unknown> | null) ?? null,
    attended: data.attended,
    absent: data.absent_members ?? [],
    shortlistedAt: data.shortlisted_at ?? null,
  };
}

/**
 * Persist a team's attendance. Check-in stamps move only when `attended` flips.
 * `onlyShortlisted` (shortlist events) makes the write itself require a finalised
 * row, so a team moved off the shortlist mid-mark is not left attended. Returns
 * whether a row was written.
 */
export async function writeRegistrationAttendance(input: {
  eventId: string;
  registrationId: string;
  attended: boolean;
  absent: number[];
  actorId: string;
  stampCheckIn: boolean;
  onlyShortlisted?: boolean;
}): Promise<boolean> {
  const admin = createAdminClient();
  let q = admin
    .from("registrations")
    .update({
      attended: input.attended,
      absent_members: input.absent,
      ...(input.stampCheckIn
        ? {
            checked_in_at: input.attended ? new Date().toISOString() : null,
            checked_in_by: input.attended ? input.actorId : null,
            checkin_method: input.attended ? "manual" : null,
          }
        : {}),
    })
    .eq("id", input.registrationId)
    .eq("event_id", input.eventId);
  if (input.onlyShortlisted && input.attended) q = q.not("shortlisted_at", "is", null);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
