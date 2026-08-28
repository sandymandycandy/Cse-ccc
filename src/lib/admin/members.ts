import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/database.types";

export type MemberRole = Database["public"]["Enums"]["member_role"];

export interface AdminMemberRow {
  id: string;
  name: string;
  rollNo: string | null;
  role: MemberRole;
  isActive: boolean;
  sort: number;
  clubId: string;
  clubName: string | null;
  approvedAt: string | null;
}

export interface MemberForEdit {
  id: string;
  name: string;
  rollNo: string | null;
  email: string | null;
  phone: string | null;
  role: MemberRole;
  sort: number;
  isActive: boolean;
  clubId: string;
  photoPath: string | null;
  approvedAt: string | null;
}

/** Approved (onboarded) roster members only. Pending self-registrations are
 * surfaced separately via {@link listPendingMembers}. */
export async function listMembers(clubId: string): Promise<AdminMemberRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, role, is_active, sort, club_id, approved_at, clubs(name)")
    .eq("club_id", clubId)
    .not("approved_at", "is", null)
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    rollNo: m.roll_no,
    role: m.role,
    isActive: m.is_active,
    sort: m.sort,
    clubId: m.club_id,
    clubName: m.clubs?.name ?? null,
    approvedAt: m.approved_at,
  }));
}

/** Self-registrations awaiting a head's approval (approved_at IS NULL), oldest first. */
export async function listPendingMembers(clubId: string): Promise<AdminMemberRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, role, is_active, sort, club_id, approved_at, clubs(name)")
    .eq("club_id", clubId)
    .is("approved_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    rollNo: m.roll_no,
    role: m.role,
    isActive: m.is_active,
    sort: m.sort,
    clubId: m.club_id,
    clubName: m.clubs?.name ?? null,
    approvedAt: m.approved_at,
  }));
}

/** The reusable self-registration link token for a club. Service-role only. */
export async function getClubJoinToken(clubId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("clubs").select("join_token").eq("id", clubId).maybeSingle();
  return data?.join_token ?? null;
}

/** A short-lived signed URL for a member's photo in the private bucket (admin view only). */
export async function memberPhotoUrl(photoPath: string | null): Promise<string | null> {
  if (!photoPath) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from("member-photos").createSignedUrl(photoPath, 300);
  return data?.signedUrl ?? null;
}

export async function getMemberForEdit(id: string): Promise<MemberForEdit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("club_members")
    .select("id, name, roll_no, email, phone, role, sort, is_active, club_id, photo_path, approved_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    rollNo: data.roll_no,
    email: data.email,
    phone: data.phone,
    role: data.role,
    sort: data.sort,
    isActive: data.is_active,
    clubId: data.club_id,
    photoPath: data.photo_path,
    approvedAt: data.approved_at,
  };
}
